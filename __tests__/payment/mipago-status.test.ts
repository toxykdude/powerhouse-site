import { describe, it, expect, vi, beforeEach } from "vitest";
import { onRequestGet as statusHandler } from "../../functions/api/payment/mipago/status";
import { onRequestPost as cancelHandler } from "../../functions/api/payment/mipago/cancel";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MOCK_ENV = {
  MIPAGO_API_KEY: "ph_test_key_12345",
  MIPAGO_API_URL: "https://mipago.test",
};

// ---------------------------------------------------------------------------
// Status endpoint
// ---------------------------------------------------------------------------

describe("mipago status endpoint", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 400 when the id parameter is missing", async () => {
    const request = new Request(
      "https://powerhousegym.co/api/payment/mipago/status",
    );
    const response = await statusHandler({ request, env: MOCK_ENV });
    expect(response.status).toBe(400);
  });

  it("returns 400 for an id that could smuggle path segments", async () => {
    for (const bad of ["../secrets", "a b", "id/other", "x".repeat(65)]) {
      const request = new Request(
        `https://powerhousegym.co/api/payment/mipago/status?id=${encodeURIComponent(bad)}`,
      );
      const response = await statusHandler({ request, env: MOCK_ENV });
      expect(response.status).toBe(400);
    }
  });

  it("returns 503 when the API key is not configured", async () => {
    const request = new Request(
      "https://powerhousegym.co/api/payment/mipago/status?id=01JTEST",
    );
    const response = await statusHandler({
      request,
      env: { ...MOCK_ENV, MIPAGO_API_KEY: undefined },
    });
    expect(response.status).toBe(503);
  });

  it("proxies the hub status and strips customer PII", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "01JTEST",
          reference: "PH-01JTEST",
          status: "APPROVED",
          amount: 69900,
          currency: "COP",
          customer: { email: "ana@example.com", name: "Ana Ríos" },
        }),
        { status: 200 },
      ),
    );

    const request = new Request(
      "https://powerhousegym.co/api/payment/mipago/status?id=01JTEST",
    );
    const response = await statusHandler({ request, env: MOCK_ENV });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("APPROVED");
    expect(body.amount).toBe(69900);
    expect(body.customer).toBeUndefined();

    // Bearer auth on the hub subrequest
    const init = fetchSpy.mock.calls[0][1] as {
      headers: Record<string, string>;
    };
    expect(init.headers.Authorization).toBe("Bearer ph_test_key_12345");
    expect(String(fetchSpy.mock.calls[0][0])).toBe(
      "https://mipago.test/api/v1/payments/01JTEST/status",
    );
  });

  it("maps a hub 404 to 404", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "not found" }), { status: 404 }),
    );

    const request = new Request(
      "https://powerhousegym.co/api/payment/mipago/status?id=01JMISSING",
    );
    const response = await statusHandler({ request, env: MOCK_ENV });
    expect(response.status).toBe(404);
  });

  it("maps a hub error to 502", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockResolvedValueOnce(new Response("boom", { status: 500 }));

    const request = new Request(
      "https://powerhousegym.co/api/payment/mipago/status?id=01JTEST",
    );
    const response = await statusHandler({ request, env: MOCK_ENV });
    expect(response.status).toBe(502);
  });
});

// ---------------------------------------------------------------------------
// Cancel endpoint
// ---------------------------------------------------------------------------

describe("mipago cancel endpoint", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 400 for a missing or malformed id", async () => {
    for (const bad of [undefined, "", "../x"]) {
      const request = new Request(
        "https://powerhousegym.co/api/payment/mipago/cancel",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bad === undefined ? {} : { id: bad }),
        },
      );
      const response = await cancelHandler({ request, env: MOCK_ENV });
      expect(response.status).toBe(400);
    }
  });

  it("cancels the payment on the hub and marks the local record final", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "01JTEST", status: "CANCELLED" }), {
        status: 200,
      }),
    );

    const request = new Request(
      "https://powerhousegym.co/api/payment/mipago/cancel",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "01JTEST" }),
      },
    );

    // Seed the KV registry with an open record
    const store = new Map<string, string>([
      [
        "payment:01JTEST",
        JSON.stringify({
          payment_id: "01JTEST",
          reference: "PH-01JTEST",
          plan_key: "mensual",
          amount_pesos: 69900,
          created_at: Math.floor(Date.now() / 1000),
          status: "open",
        }),
      ],
    ]);
    const kv = {
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

    const response = await cancelHandler({
      request,
      env: { ...MOCK_ENV, MIPAGO_KV: kv },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(String(fetchSpy.mock.calls[0][0])).toBe(
      "https://mipago.test/api/v1/payments/01JTEST/cancel",
    );
    const record = JSON.parse(store.get("payment:01JTEST") ?? "{}");
    expect(record.status).toBe("final");
    expect(record.final_status).toBe("CANCELLED");
  });

  it("maps a hub cancel failure to 502", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "already paid" }), { status: 409 }),
    );

    const request = new Request(
      "https://powerhousegym.co/api/payment/mipago/cancel",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "01JTEST" }),
      },
    );

    const response = await cancelHandler({ request, env: MOCK_ENV });
    expect(response.status).toBe(502);
  });
});
