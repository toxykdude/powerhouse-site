import { describe, it, expect, vi, beforeEach } from "vitest";
import { onRequestPost } from "../../functions/api/payment/mipago/callback";
import type { MipagoKV } from "../../functions/api/payment/mipago/_registry";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SECRET = "test_callback_secret_12345";
const PORTAL_KEY = "test_portal_internal_key";
const INTEGRITY_SECRET = "test_integrity_secret_67890";

const MOCK_ENV = {
  MIPAGO_CALLBACK_SECRET: SECRET,
  FACEGYM_API_URL: "https://facegym.test",
  FACEGYM_PORTAL_INTERNAL_KEY: PORTAL_KEY,
  WOMPI_INTEGRITY_SECRET: INTEGRITY_SECRET,
};

const GYM_PENDING = {
  status: "found",
  plan_id: "45d96de3-a086-427a-9a8a-44351abb6423",
  member_id: "member_123",
  amount: "69900.00",
  wompi_reference: "PH-01JTEST",
};

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(message),
  );
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface BuildEventOptions {
  type?: string;
  eventId?: string;
  timestamp?: number;
  payment?: Record<string, unknown>;
  signWithSecret?: string;
}

async function buildSignedRequest(options: BuildEventOptions = {}): Promise<{
  request: Request;
  eventId: string;
}> {
  const type = options.type ?? "payment.approved";
  const eventId = options.eventId ?? "evt_001";
  const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);
  const payment = options.payment ?? {
    id: "01JTEST",
    reference: "PH-01JTEST",
    amount: 69900,
    currency: "COP",
    status: "APPROVED",
    metadata: {
      plan_key: "mensual",
      plan_id: "45d96de3-a086-427a-9a8a-44351abb6423",
      scope: "member",
    },
  };
  const rawBody = JSON.stringify({
    type,
    payment,
    provider: { name: "wompi", transaction_id: "wompi-tx-999" },
  });
  const secret = options.signWithSecret ?? SECRET;
  const signature = await hmacSha256Hex(secret, `${timestamp}.${rawBody}`);
  const request = new Request(
    "https://powerhousegym.co/api/payment/mipago/callback",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Mipago-Signature": signature,
        "X-Mipago-Timestamp": String(timestamp),
        "X-Mipago-Event-Id": eventId,
      },
      body: rawBody,
    },
  );
  return { request, eventId };
}

/** Map-based KV stub implementing the structural MipagoKV interface. */
function createMockKV(): MipagoKV & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
    async list(options?: { prefix?: string }) {
      const prefix = options?.prefix ?? "";
      return {
        keys: [...store.keys()]
          .filter((k) => k.startsWith(prefix))
          .map((name) => ({ name })),
      };
    },
    async delete(key: string) {
      store.delete(key);
    },
  };
}

type FetchSpy = { mock: { calls: unknown[][] } };

function callsTo(spy: FetchSpy, urlSubstring: string): unknown[][] {
  return spy.mock.calls.filter((call) =>
    String(call[0]).includes(urlSubstring),
  );
}

function renewBodies(spy: FetchSpy): Record<string, unknown>[] {
  return callsTo(spy, "/api/portal/webhook-renew").map(
    (call) =>
      JSON.parse((call[1] as { body: string }).body) as Record<string, unknown>,
  );
}

/** Mock fetch for: [pending lookup, webhook-renew] — both OK. */
function mockHappyBackendPath(pending: unknown = GYM_PENDING) {
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  fetchSpy.mockResolvedValueOnce(
    new Response(JSON.stringify(pending), { status: 200 }),
  );
  fetchSpy.mockResolvedValueOnce(
    new Response(JSON.stringify({ status: "success" }), { status: 200 }),
  );
  return fetchSpy;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("mipago callback handler", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fulfills an approved payment through the FaceGYM relay", async () => {
    const fetchSpy = mockHappyBackendPath();
    const { request } = await buildSignedRequest();

    const response = await onRequestPost({ request, env: MOCK_ENV });

    expect(response.status).toBe(200);
    const bodies = renewBodies(fetchSpy);
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({
      plan_id: "45d96de3-a086-427a-9a8a-44351abb6423",
      wompi_reference: "PH-01JTEST",
      wompi_transaction_id: "wompi-tx-999",
      member_id: "member_123",
      amount: "69900.00",
      // hub pesos → FaceGYM cents contract
      amount_in_cents: 6990000,
    });
    // Relay carries the FaceGYM HMAC signature header
    const renewCall = callsTo(fetchSpy, "/api/portal/webhook-renew")[0];
    const headers = (renewCall[1] as { headers: Record<string, string> })
      .headers;
    expect(headers["X-Signature"]).toMatch(/^[a-f0-9]{64}$/);
  });

  it("returns 401 and does nothing on a tampered signature", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { request } = await buildSignedRequest({
      signWithSecret: "wrong_secret",
    });

    const response = await onRequestPost({ request, env: MOCK_ENV });

    expect(response.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns 401 on a stale timestamp (replay protection)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { request } = await buildSignedRequest({
      timestamp: Math.floor(Date.now() / 1000) - 3600,
    });

    const response = await onRequestPost({ request, env: MOCK_ENV });

    expect(response.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns 401 when the callback secret is not configured", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { request } = await buildSignedRequest();

    const response = await onRequestPost({
      request,
      env: { ...MOCK_ENV, MIPAGO_CALLBACK_SECRET: undefined },
    });

    expect(response.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not fulfill declined payments", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { request } = await buildSignedRequest({
      type: "payment.declined",
      payment: {
        id: "01JTEST",
        reference: "PH-01JTEST",
        amount: 69900,
        currency: "COP",
        status: "DECLINED",
        metadata: { plan_key: "mensual" },
      },
    });

    const response = await onRequestPost({ request, env: MOCK_ENV });

    expect(response.status).toBe(200);
    expect(callsTo(fetchSpy, "/api/portal/webhook-renew")).toHaveLength(0);
  });

  it("does not fulfill error payments", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { request } = await buildSignedRequest({
      type: "payment.error",
      payment: {
        id: "01JTEST",
        reference: "PH-01JTEST",
        amount: 69900,
        currency: "COP",
        status: "ERROR",
        metadata: { plan_key: "mensual" },
      },
    });

    const response = await onRequestPost({ request, env: MOCK_ENV });

    expect(response.status).toBe(200);
    expect(callsTo(fetchSpy, "/api/portal/webhook-renew")).toHaveLength(0);
  });

  it("blocks underpaid approved payments (amount gate)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { request } = await buildSignedRequest({
      payment: {
        id: "01JTEST",
        reference: "PH-01JTEST",
        amount: 100, // 100 pesos << 69900 expected
        currency: "COP",
        status: "APPROVED",
        metadata: { plan_key: "mensual" },
      },
    });

    const response = await onRequestPost({ request, env: MOCK_ENV });

    expect(response.status).toBe(200);
    expect(callsTo(fetchSpy, "/api/portal/webhook-renew")).toHaveLength(0);
  });

  it("processes a repeated event id exactly once (dedup)", async () => {
    const fetchSpy = mockHappyBackendPath();
    const kv = createMockKV();
    // A fresh Request per delivery: a body can only be read once.
    const firstDelivery = await buildSignedRequest({ eventId: "evt_dedup" });
    const secondDelivery = await buildSignedRequest({ eventId: "evt_dedup" });

    const first = await onRequestPost({
      request: firstDelivery.request,
      env: { ...MOCK_ENV, MIPAGO_KV: kv },
    });
    const second = await onRequestPost({
      request: secondDelivery.request,
      env: { ...MOCK_ENV, MIPAGO_KV: kv },
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(renewBodies(fetchSpy)).toHaveLength(1);
    expect(kv.store.has("event:evt_dedup")).toBe(true);
  });

  it("answers 200 but leaves the event unmarked when fulfillment errors, so hub retries re-attempt it", async () => {
    // First delivery: lookup OK, webhook-renew FAILS.
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(GYM_PENDING), { status: 200 }),
    );
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "boom" }), { status: 500 }),
    );

    const kv = createMockKV();
    const firstDelivery = await buildSignedRequest({ eventId: "evt_err" });

    const first = await onRequestPost({
      request: firstDelivery.request,
      env: { ...MOCK_ENV, MIPAGO_KV: kv },
    });
    expect(first.status).toBe(200);
    expect(kv.store.has("event:evt_err")).toBe(false);

    // Hub retry: pending record already consumed server-side would be the
    // real-world case; here it is served again and the relay succeeds.
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(GYM_PENDING), { status: 200 }),
    );
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ status: "success" }), { status: 200 }),
    );
    const retryDelivery = await buildSignedRequest({ eventId: "evt_err" });
    const second = await onRequestPost({
      request: retryDelivery.request,
      env: { ...MOCK_ENV, MIPAGO_KV: kv },
    });
    expect(second.status).toBe(200);
    expect(renewBodies(fetchSpy)).toHaveLength(2);
    expect(kv.store.has("event:evt_err")).toBe(true);
  });

  it("answers 200 when the payload has no payment object", async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const rawBody = JSON.stringify({ type: "payment.approved" });
    const signature = await hmacSha256Hex(SECRET, `${timestamp}.${rawBody}`);
    const request = new Request(
      "https://powerhousegym.co/api/payment/mipago/callback",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Mipago-Signature": signature,
          "X-Mipago-Timestamp": String(timestamp),
          "X-Mipago-Event-Id": "evt_nopayment",
        },
        body: rawBody,
      },
    );

    const response = await onRequestPost({ request, env: MOCK_ENV });
    expect(response.status).toBe(200);
  });

  it("returns 400 for a validly signed but malformed JSON body", async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const rawBody = "not json at all";
    const signature = await hmacSha256Hex(SECRET, `${timestamp}.${rawBody}`);
    const request = new Request(
      "https://powerhousegym.co/api/payment/mipago/callback",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Mipago-Signature": signature,
          "X-Mipago-Timestamp": String(timestamp),
          "X-Mipago-Event-Id": "evt_malformed",
        },
        body: rawBody,
      },
    );

    const response = await onRequestPost({ request, env: MOCK_ENV });
    expect(response.status).toBe(400);
  });
});
