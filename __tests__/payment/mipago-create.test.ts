import { describe, it, expect, vi, beforeEach } from "vitest";
import { onRequestPost } from "../../functions/api/payment/mipago/create";
import type { MipagoKV } from "../../functions/api/payment/mipago/_registry";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MOCK_ENV = {
  MIPAGO_ENABLED: "true",
  MIPAGO_API_KEY: "ph_test_key_12345",
  FACEGYM_API_URL: "https://facegym.test",
  MIPAGO_API_URL: "https://mipago.test",
};

const HUB_PAYMENT = {
  id: "01JTESTPAYMENT",
  reference: "PH-01JTESTPAYMENT",
  status: "CREATED",
  checkout_url: "https://mipago.test/checkout/01JTESTPAYMENT",
  expires_at: "2026-10-12T12:00:00Z",
};

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

function createGuestRequest(body: unknown): Request {
  return new Request("https://powerhousegym.co/api/payment/mipago/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createMemberRequest(body: unknown): Request {
  return new Request("https://powerhousegym.co/api/payment/mipago/create", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer member.jwt.token",
    },
    body: JSON.stringify(body),
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

describe("mipago create endpoint", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 503 (mipago_disabled) when the rail is disabled — frontend falls back", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const response = await onRequestPost({
      request: createGuestRequest({ plan: "mensual" }),
      env: { ...MOCK_ENV, MIPAGO_ENABLED: "" },
    });

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error).toBe("mipago_disabled");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fails closed with 503 when enabled but the API key is missing", async () => {
    const response = await onRequestPost({
      request: createGuestRequest({ plan: "mensual" }),
      env: { ...MOCK_ENV, MIPAGO_API_KEY: undefined },
    });

    expect(response.status).toBe(503);
  });

  it("rejects an unknown plan", async () => {
    const response = await onRequestPost({
      request: createGuestRequest({ plan: "does-not-exist" }),
      env: MOCK_ENV,
    });

    expect(response.status).toBe(400);
  });

  it("rejects a guest PT plan (site policy: not guest-purchasable)", async () => {
    const response = await onRequestPost({
      request: createGuestRequest({
        plan: "pt-esteban-morales-12",
        name: "Ana Ríos",
        email: "ana@example.com",
        phone: "3001234567",
      }),
      env: MOCK_ENV,
    });

    expect(response.status).toBe(400);
  });

  it("rejects a guest with missing contact fields", async () => {
    for (const bad of [
      {
        plan: "mensual",
        name: "A",
        email: "ana@example.com",
        phone: "3001234567",
      },
      {
        plan: "mensual",
        name: "Ana Ríos",
        email: "not-an-email",
        phone: "3001234567",
      },
      {
        plan: "mensual",
        name: "Ana Ríos",
        email: "ana@example.com",
        phone: "123",
      },
    ]) {
      const response = await onRequestPost({
        request: createGuestRequest(bad),
        env: MOCK_ENV,
      });
      expect(response.status).toBe(400);
    }
  });

  it("guest happy path: creates the hub payment in PESOS, stores the guest pending record, returns checkout_url", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    // 1. hub create, 2. guest pending store
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(HUB_PAYMENT), { status: 201 }),
    );
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    const kv = createMockKV();
    const response = await onRequestPost({
      request: createGuestRequest({
        plan: "mensual",
        name: "Ana Ríos",
        email: "ana@example.com",
        phone: "3001234567",
      }),
      env: { ...MOCK_ENV, MIPAGO_KV: kv },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.checkout_url).toBe(HUB_PAYMENT.checkout_url);
    expect(body.reference).toBe("PH-01JTESTPAYMENT");
    expect(body.payment_id).toBe("01JTESTPAYMENT");

    // Hub call: Bearer key, pesos amount, metadata linkage
    const hubCalls = callsTo(fetchSpy, "https://mipago.test/api/v1/payments");
    expect(hubCalls).toHaveLength(1);
    const hubInit = hubCalls[0][1] as {
      headers: Record<string, string>;
      body: string;
    };
    expect(hubInit.headers.Authorization).toBe("Bearer ph_test_key_12345");
    const hubBody = JSON.parse(hubInit.body);
    expect(hubBody.amount).toBe(69900); // pesos, NOT 6990000 cents
    expect(hubBody.currency).toBe("COP");
    expect(hubBody.customer.email).toBe("ana@example.com");
    expect(hubBody.customer.phone).toBe("573001234567");
    expect(hubBody.metadata.plan_key).toBe("mensual");
    expect(hubBody.metadata.plan_id).toBe(
      "45d96de3-a086-427a-9a8a-44351abb6423",
    );

    // Guest pending store: FaceGYM contract shape with the HUB reference
    const pendingCalls = callsTo(fetchSpy, "/api/portal/pending-payment/guest");
    expect(pendingCalls).toHaveLength(1);
    const pendingBody = JSON.parse(
      (pendingCalls[0][1] as { body: string }).body,
    );
    expect(pendingBody).toMatchObject({
      wompi_reference: "PH-01JTESTPAYMENT",
      guest_name: "Ana Ríos",
      guest_phone: "573001234567",
      guest_email: "ana@example.com",
      plan_id: "45d96de3-a086-427a-9a8a-44351abb6423",
    });

    // KV registry record
    expect(kv.store.has("payment:01JTESTPAYMENT")).toBe(true);
  });

  it("guest flow fails closed when the pending store fails — no checkout_url", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(HUB_PAYMENT), { status: 201 }),
    );
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "nope" }), { status: 422 }),
    );

    const response = await onRequestPost({
      request: createGuestRequest({
        plan: "mensual",
        name: "Ana Ríos",
        email: "ana@example.com",
        phone: "3001234567",
      }),
      env: MOCK_ENV,
    });

    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.checkout_url).toBeUndefined();
  });

  it("member happy path: prefills from the profile, forwards the JWT to the pending store", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    // 1. /api/portal/me, 2. hub create, 3. member pending store
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ email: "miembro@example.com", name: "Carlos Pérez" }),
        { status: 200 },
      ),
    );
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(HUB_PAYMENT), { status: 201 }),
    );
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    const response = await onRequestPost({
      request: createMemberRequest({ plan: "anual" }),
      env: MOCK_ENV,
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.checkout_url).toBe(HUB_PAYMENT.checkout_url);

    // Profile prefill reached the hub (real email, never fabricated)
    const hubInit = callsTo(
      fetchSpy,
      "https://mipago.test/api/v1/payments",
    )[0][1] as {
      body: string;
    };
    expect(JSON.parse(hubInit.body).customer.email).toBe("miembro@example.com");

    // JWT forwarded to the pending store
    const pendingCalls = callsTo(fetchSpy, "/api/portal/pending-payment");
    const pendingInit = pendingCalls[0][1] as {
      headers: Record<string, string>;
      body: string;
    };
    expect(pendingInit.headers.Authorization).toBe("Bearer member.jwt.token");
    const pendingBody = JSON.parse(pendingInit.body);
    expect(pendingBody).toMatchObject({
      plan_id: "dbf0f5a4-cabb-4c73-991e-3e8b694282bf", // anual
      wompi_reference: "PH-01JTESTPAYMENT",
      amount: 620000, // anual pesos
    });
  });

  it("member flow tolerates a failed pending store (manual path covers it)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    // 1. me lookup fails, 2. hub create, 3. pending store fails
    fetchSpy.mockResolvedValueOnce(
      new Response("unauthorized", { status: 401 }),
    );
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(HUB_PAYMENT), { status: 201 }),
    );
    fetchSpy.mockResolvedValueOnce(new Response("nope", { status: 500 }));

    const response = await onRequestPost({
      request: createMemberRequest({ plan: "mensual" }),
      env: MOCK_ENV,
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.checkout_url).toBe(HUB_PAYMENT.checkout_url);
    // No fabricated email in the hub payload
    const hubInit = callsTo(
      fetchSpy,
      "https://mipago.test/api/v1/payments",
    )[0][1] as {
      body: string;
    };
    expect(JSON.parse(hubInit.body).customer.email).toBeUndefined();
  });

  it("propagates a hub creation failure as 502 without a checkout_url", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "boom" }), { status: 500 }),
    );

    const response = await onRequestPost({
      request: createGuestRequest({
        plan: "mensual",
        name: "Ana Ríos",
        email: "ana@example.com",
        phone: "3001234567",
      }),
      env: MOCK_ENV,
    });

    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.checkout_url).toBeUndefined();
    expect(callsTo(fetchSpy, "/api/portal/pending-payment")).toHaveLength(0);
  });
});
