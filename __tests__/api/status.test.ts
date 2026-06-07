import { describe, it, expect, vi, beforeEach } from "vitest";
import { onRequestGet } from "../../functions/api/payment/status";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MOCK_ENV = {
  WOMPI_PRIVATE_KEY: "priv_test_xxxx",
  WOMPI_API_URL: "https://production.wompi.co/v1",
};

function createStatusRequest(id: string): Request {
  return new Request(
    `https://powerhousegym.co/api/payment/status?id=${encodeURIComponent(id)}`,
    { method: "GET" },
  );
}

function createWompiTransactionResponse(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      id: "tx_12345",
      status: "APPROVED",
      amount_in_cents: 6990000,
      currency: "COP",
      reference: "PH-1234567890-abc123",
      customer_email: "test@example.com",
      customer_data: { full_name: "John Doe" },
      payment_method: { type: "CARD", detail: "VISA ****1234" },
      created_at: "2025-01-01T00:00:00Z",
      ...overrides,
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Wompi transaction status endpoint", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // --- Input validation ---

  describe("input validation", () => {
    it("returns 400 when id parameter is missing", async () => {
      const request = new Request(
        "https://powerhousegym.co/api/payment/status",
        { method: "GET" },
      );

      const response = await onRequestGet({ request, env: MOCK_ENV });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("id");
    });

    it("returns 400 for invalid transaction ID characters", async () => {
      const response = await onRequestGet({
        request: createStatusRequest("tx;DROP TABLE"),
        env: MOCK_ENV,
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("inv");
    });

    it("accepts valid transaction IDs with dashes and underscores", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify(createWompiTransactionResponse()), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const response = await onRequestGet({
        request: createStatusRequest("tx_12345-abc_def"),
        env: MOCK_ENV,
      });

      expect(response.status).toBe(200);
    });
  });

  // --- Successful lookup ---

  describe("successful transaction lookup", () => {
    it("returns formatted transaction data", async () => {
      const wompiResponse = createWompiTransactionResponse();
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify(wompiResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const response = await onRequestGet({
        request: createStatusRequest("tx_12345"),
        env: MOCK_ENV,
      });

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.id).toBe("tx_12345");
      expect(body.status).toBe("APPROVED");
      expect(body.amount_in_cents).toBe(6990000);
      expect(body.currency).toBe("COP");
      expect(body.customer_email).toBe("test@example.com");
      expect(body.customer_name).toBe("John Doe");
      expect(body.payment_method_type).toBe("CARD");
    });

    it("sends Bearer token to Wompi API", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify(createWompiTransactionResponse()), {
          status: 200,
        }),
      );

      await onRequestGet({
        request: createStatusRequest("tx_12345"),
        env: MOCK_ENV,
      });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/transactions/tx_12345"),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer priv_test_xxxx",
          }),
        }),
      );
    });

    it("handles missing customer_data gracefully", async () => {
      const wompiResponse = createWompiTransactionResponse({
        customer_data: null,
        payment_method: null,
      });

      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify(wompiResponse), { status: 200 }),
      );

      const response = await onRequestGet({
        request: createStatusRequest("tx_12345"),
        env: MOCK_ENV,
      });

      const body = await response.json();
      expect(body.customer_name).toBeNull();
      expect(body.payment_method_type).toBeNull();
    });
  });

  // --- Error handling ---

  describe("error handling", () => {
    it("returns 502 when Wompi API returns an error", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("Internal Server Error", { status: 500 }),
      );

      const response = await onRequestGet({
        request: createStatusRequest("tx_12345"),
        env: MOCK_ENV,
      });

      expect(response.status).toBe(502);
    });

    it("returns 404 when Wompi returns no data", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({}), { status: 200 }),
      );

      const response = await onRequestGet({
        request: createStatusRequest("tx_nonexistent"),
        env: MOCK_ENV,
      });

      expect(response.status).toBe(404);
    });

    it("returns 500 on unexpected errors", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValue(
        new Error("Network failure"),
      );

      const response = await onRequestGet({
        request: createStatusRequest("tx_12345"),
        env: MOCK_ENV,
      });

      expect(response.status).toBe(500);
    });
  });
});
