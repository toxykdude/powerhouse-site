import { describe, it, expect, vi, beforeEach } from "vitest";
import { onRequest } from "../../functions/api/portal/pending-payment-guest";

const MOCK_ENV = {
  FACEGYM_API_URL: "https://test-api.example.com",
};

function createGuestRequest(body?: unknown): Request {
  return new Request(
    "https://powerhousegym.co/api/portal/pending-payment-guest",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        body ?? {
          wompi_reference: "PH-mensual-1719000000-abc123",
          guest_name: "Maria Perez",
          guest_phone: "3001234567",
          guest_email: "maria@example.com",
          plan_id: "45d96de3-a086-427a-9a8a-44351abb6423",
        },
      ),
    },
  );
}

describe("guest pending-payment proxy", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("forwards POST to the FaceGYM guest endpoint unchanged", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ status: "stored" }), { status: 200 }),
    );

    const response = await onRequest({
      request: createGuestRequest(),
      env: MOCK_ENV,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "stored" });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      "https://test-api.example.com/api/portal/pending-payment/guest",
    );
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    // No Authorization header — the guest endpoint is intentionally unauthenticated
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    const forwarded = JSON.parse(String(init.body));
    expect(forwarded.wompi_reference).toBe("PH-mensual-1719000000-abc123");
    expect(forwarded.guest_name).toBe("Maria Perez");
    expect(forwarded.guest_phone).toBe("3001234567");
    expect(forwarded.guest_email).toBe("maria@example.com");
    expect(forwarded.plan_id).toBe("45d96de3-a086-427a-9a8a-44351abb6423");
  });

  it("passes backend validation errors through to the browser", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ detail: "El teléfono debe ser un móvil colombiano" }),
        { status: 422 },
      ),
    );

    const response = await onRequest({
      request: createGuestRequest({ guest_phone: "123" }),
      env: MOCK_ENV,
    });

    expect(response.status).toBe(422);
  });

  it("returns 502 when FaceGYM is unreachable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new Error("network error"),
    );

    const response = await onRequest({
      request: createGuestRequest(),
      env: MOCK_ENV,
    });

    expect(response.status).toBe(502);
  });

  it("answers CORS preflight with 204", async () => {
    const request = new Request(
      "https://powerhousegym.co/api/portal/pending-payment-guest",
      { method: "OPTIONS" },
    );

    const response = await onRequest({ request, env: MOCK_ENV });

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://powerhousegym.co",
    );
  });
});
