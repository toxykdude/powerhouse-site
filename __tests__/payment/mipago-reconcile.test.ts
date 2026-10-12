import { describe, it, expect, vi, beforeEach } from "vitest";
import { onRequestPost } from "../../functions/api/payment/mipago/reconcile";
import type { MipagoKV } from "../../functions/api/payment/mipago/_registry";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MOCK_ENV = {
  MIPAGO_API_KEY: "ph_test_key_12345",
  MIPAGO_API_URL: "https://mipago.test",
  MIPAGO_RECONCILE_KEY: "reconcile_secret_98765",
  FACEGYM_API_URL: "https://facegym.test",
  FACEGYM_PORTAL_INTERNAL_KEY: "test_portal_internal_key",
  WOMPI_INTEGRITY_SECRET: "test_integrity_secret_67890",
};

function createMockKV(seed: Record<string, unknown> = {}): MipagoKV & {
  store: Map<string, string>;
} {
  const store = new Map<string, string>(
    Object.entries(seed).map(([k, v]) => [k, JSON.stringify(v)]),
  );
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

function openRecord(overrides: Record<string, unknown> = {}) {
  return {
    payment_id: "01JTEST",
    reference: "PH-01JTEST",
    facegym_reference: "PH-mensual-1719000000-abc123",
    plan_key: "mensual",
    amount_pesos: 69900,
    created_at: Math.floor(Date.now() / 1000) - 3600, // 1h old — past the window
    status: "open",
    ...overrides,
  };
}

function createRequest(): Request {
  return new Request("https://powerhousegym.co/api/payment/mipago/reconcile", {
    method: "POST",
    headers: { "X-Reconcile-Key": MOCK_ENV.MIPAGO_RECONCILE_KEY },
  });
}

type FetchSpy = { mock: { calls: unknown[][] } };

function callsTo(spy: FetchSpy, urlSubstring: string): unknown[][] {
  return spy.mock.calls.filter((call) =>
    String(call[0]).includes(urlSubstring),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("mipago reconcile endpoint", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fails closed with 401 when the reconcile key is not configured", async () => {
    const response = await onRequestPost({
      request: createRequest(),
      env: { ...MOCK_ENV, MIPAGO_RECONCILE_KEY: undefined },
    });
    expect(response.status).toBe(401);
  });

  it("returns 401 on a wrong key", async () => {
    const request = new Request(
      "https://powerhousegym.co/api/payment/mipago/reconcile",
      {
        method: "POST",
        headers: { "X-Reconcile-Key": "wrong" },
      },
    );
    const response = await onRequestPost({ request, env: MOCK_ENV });
    expect(response.status).toBe(401);
  });

  it("reports (200) when the KV binding is missing — nothing to reconcile", async () => {
    const response = await onRequestPost({
      request: createRequest(),
      env: { ...MOCK_ENV, MIPAGO_KV: undefined },
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.error).toContain("MIPAGO_KV");
  });

  it("skips records younger than the callback window", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const kv = createMockKV({
      "payment:01JRECENT": openRecord({
        payment_id: "01JRECENT",
        created_at: Math.floor(Date.now() / 1000) - 30, // 30s old
      }),
    });

    const response = await onRequestPost({
      request: createRequest(),
      env: { ...MOCK_ENV, MIPAGO_KV: kv },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.checked).toBe(0);
    expect(body.skipped).toBe(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fulfills an approved payment the callback never processed", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    // 1. hub status, 2. pending lookup, 3. webhook-renew
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "01JTEST", status: "APPROVED" }), {
        status: 200,
      }),
    );
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: "found",
          plan_id: "45d96de3-a086-427a-9a8a-44351abb6423",
          member_id: "member_123",
          amount: "69900.00",
        }),
        { status: 200 },
      ),
    );
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ status: "success" }), { status: 200 }),
    );

    const kv = createMockKV({ "payment:01JTEST": openRecord() });
    const response = await onRequestPost({
      request: createRequest(),
      env: { ...MOCK_ENV, MIPAGO_KV: kv },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ checked: 1, fulfilled: 1 });

    // Relay used the hub reference for lookup context + record plan
    const renewCalls = callsTo(fetchSpy, "/api/portal/webhook-renew");
    expect(renewCalls).toHaveLength(1);
    const renewBody = JSON.parse((renewCalls[0][1] as { body: string }).body);
    expect(renewBody.wompi_reference).toBe("PH-mensual-1719000000-abc123");
    expect(renewBody.amount_in_cents).toBe(6990000);

    // Record marked fulfilled — next run does not re-relay
    const record = JSON.parse(kv.store.get("payment:01JTEST") ?? "{}");
    expect(record.status).toBe("fulfilled");
  });

  it("finalizes declined payments without fulfillment", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "01JTEST", status: "DECLINED" }), {
        status: 200,
      }),
    );

    const kv = createMockKV({ "payment:01JTEST": openRecord() });
    const response = await onRequestPost({
      request: createRequest(),
      env: { ...MOCK_ENV, MIPAGO_KV: kv },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.finalized).toBe(1);
    expect(callsTo(fetchSpy, "/api/portal/webhook-renew")).toHaveLength(0);
    const record = JSON.parse(kv.store.get("payment:01JTEST") ?? "{}");
    expect(record.status).toBe("final");
    expect(record.final_status).toBe("DECLINED");
  });

  it("leaves still-pending payments open for the next run", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "01JTEST", status: "PENDING" }), {
        status: 200,
      }),
    );

    const kv = createMockKV({ "payment:01JTEST": openRecord() });
    const response = await onRequestPost({
      request: createRequest(),
      env: { ...MOCK_ENV, MIPAGO_KV: kv },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.skipped).toBe(1);
    const record = JSON.parse(kv.store.get("payment:01JTEST") ?? "{}");
    expect(record.status).toBe("open");
  });

  it("already-fulfilled and final records are never re-processed", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const kv = createMockKV({
      "payment:01JDONE": openRecord({
        payment_id: "01JDONE",
        status: "fulfilled",
      }),
      "payment:01JFINAL": openRecord({
        payment_id: "01JFINAL",
        status: "final",
        final_status: "EXPIRED",
      }),
    });

    const response = await onRequestPost({
      request: createRequest(),
      env: { ...MOCK_ENV, MIPAGO_KV: kv },
    });

    expect(response.status).toBe(200);
    expect(fetchSpy).not.toHaveBeenCalled();
    const body = await response.json();
    expect(body.checked).toBe(0);
  });

  it("counts hub status errors and leaves the record open", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockResolvedValueOnce(new Response("boom", { status: 500 }));

    const kv = createMockKV({ "payment:01JTEST": openRecord() });
    const response = await onRequestPost({
      request: createRequest(),
      env: { ...MOCK_ENV, MIPAGO_KV: kv },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.errors).toBe(1);
    const record = JSON.parse(kv.store.get("payment:01JTEST") ?? "{}");
    expect(record.status).toBe("open");
  });

  it("does nothing on an empty registry", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const kv = createMockKV();

    const response = await onRequestPost({
      request: createRequest(),
      env: { ...MOCK_ENV, MIPAGO_KV: kv },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.checked).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
