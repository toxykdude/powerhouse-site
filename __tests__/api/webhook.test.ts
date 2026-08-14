import { describe, it, expect, vi, beforeEach } from "vitest";
import { onRequestPost } from "../../functions/api/payment/webhook";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MOCK_EVENTS_SECRET = "test_events_secret_12345";

const MOCK_ENV = {
  WOMPI_EVENTS_SECRET: MOCK_EVENTS_SECRET,
  FACEGYM_API_URL: "https://test-api.example.com",
};

const MOCK_ENV_AUTH = {
  ...MOCK_ENV,
  WOMPI_INTEGRITY_SECRET: "test_integrity_secret_67890",
  FACEGYM_INTERNAL_API_KEY: "test_internal_key",
};

function createWebhookRequest(event: unknown): Request {
  return new Request("https://powerhousegym.co/api/payment/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
  });
}

async function sha256(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function buildValidEvent(overrides?: {
  txId?: string;
  txStatus?: string;
  amountInCents?: number;
  eventType?: string;
}) {
  const txId = overrides?.txId ?? "12345";
  const txStatus = overrides?.txStatus ?? "APPROVED";
  const amountInCents = overrides?.amountInCents ?? 6990000;
  const eventType = overrides?.eventType ?? "transaction.updated";

  const integrityString = `${txId}${txStatus}${amountInCents}${MOCK_EVENTS_SECRET}`;
  const checksum = await sha256(integrityString);

  return {
    id: "evt_001",
    type: eventType,
    timestamp: new Date().toISOString(),
    data: {
      transaction: {
        id: txId,
        status: txStatus,
        amount_in_cents: amountInCents,
        reference: "PH-1234567890-abc123",
      },
    },
    signature: { checksum },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Wompi webhook handler", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // --- Signature verification ---

  describe("signature verification", () => {
    it("accepts a webhook with a valid signature", async () => {
      const event = await buildValidEvent();
      const response = await onRequestPost({
        request: createWebhookRequest(event),
        env: MOCK_ENV,
      });

      expect(response.status).toBe(200);
    });

    it("rejects a webhook with an invalid signature (401)", async () => {
      const event = await buildValidEvent();
      // Tamper with the checksum
      event.signature.checksum = "0".repeat(64);

      const response = await onRequestPost({
        request: createWebhookRequest(event),
        env: MOCK_ENV,
      });

      expect(response.status).toBe(401);
    });

    it("rejects when the amount was tampered with", async () => {
      const event = await buildValidEvent({ amountInCents: 6990000 });
      // Change amount after signing
      event.data.transaction.amount_in_cents = 1;

      const response = await onRequestPost({
        request: createWebhookRequest(event),
        env: MOCK_ENV,
      });

      expect(response.status).toBe(401);
    });

    it("rejects when the transaction status was tampered with", async () => {
      const event = await buildValidEvent({ txStatus: "APPROVED" });
      event.data.transaction.status = "DECLINED";

      const response = await onRequestPost({
        request: createWebhookRequest(event),
        env: MOCK_ENV,
      });

      expect(response.status).toBe(401);
    });
  });

  // --- Missing data handling ---

  describe("missing transaction data", () => {
    it("returns 200 when transaction data is missing", async () => {
      const event = {
        id: "evt_002",
        type: "transaction.updated",
        timestamp: new Date().toISOString(),
        data: {},
        signature: { checksum: "abc" },
      };

      const response = await onRequestPost({
        request: createWebhookRequest(event),
        env: MOCK_ENV,
      });

      // Wompi spec: always return 200 to prevent retries
      expect(response.status).toBe(200);
    });
  });

  // --- Non-approved transactions ---

  describe("non-approved transactions", () => {
    it("returns 200 for DECLINED transactions without processing", async () => {
      const event = await buildValidEvent({
        txStatus: "DECLINED",
        eventType: "transaction.updated",
      });

      const fetchSpy = vi.spyOn(globalThis, "fetch");

      const response = await onRequestPost({
        request: createWebhookRequest(event),
        env: MOCK_ENV,
      });

      expect(response.status).toBe(200);
      // Should NOT call FaceGYM for declined transactions
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("returns 200 for VOIDED transactions", async () => {
      const event = await buildValidEvent({
        txStatus: "VOIDED",
        eventType: "transaction.updated",
      });

      const fetchSpy = vi.spyOn(globalThis, "fetch");

      const response = await onRequestPost({
        request: createWebhookRequest(event),
        env: MOCK_ENV,
      });

      expect(response.status).toBe(200);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  // --- Approved transaction processing ---

  describe("approved transaction processing", () => {
    it("calls FaceGYM to activate membership on APPROVED", async () => {
      const event = await buildValidEvent({
        txId: "tx_999",
        txStatus: "APPROVED",
        amountInCents: 6990000,
        eventType: "transaction.updated",
      });

      // Mock: pending payment lookup
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: "found",
            plan_id: "mensual",
            member_id: "member_123",
            amount: "6990000",
            wompi_reference: "PH-1234567890-abc123",
          }),
          { status: 200 },
        ),
      );

      // Mock: webhook-renew call
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({ success: true, member_id: "member_123" }),
          { status: 200 },
        ),
      );

      const response = await onRequestPost({
        request: createWebhookRequest(event),
        env: MOCK_ENV,
      });

      expect(response.status).toBe(200);

      // First call: lookup pending payment
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining(
          "/api/portal/pending-payment/PH-1234567890-abc123",
        ),
        expect.anything(),
      );

      // Second call: webhook-renew
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/portal/webhook-renew"),
        expect.objectContaining({
          method: "POST",
        }),
      );
    });

    it("handles pending payment not found gracefully", async () => {
      const event = await buildValidEvent();

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "not_found" }), { status: 404 }),
      );

      const response = await onRequestPost({
        request: createWebhookRequest(event),
        env: MOCK_ENV,
      });

      // Still returns 200 to Wompi
      expect(response.status).toBe(200);
    });

    it("authenticates FaceGYM calls with X-API-Key and X-Signature", async () => {
      const event = await buildValidEvent({ txId: "tx_auth" });

      const fetchSpy = vi.spyOn(globalThis, "fetch");
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: "found",
            plan_id: "mensual",
            member_id: "member_123",
            amount: "69900",
            wompi_reference: "PH-1234567890-abc123",
          }),
          { status: 200 },
        ),
      );
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "success" }), { status: 200 }),
      );

      await onRequestPost({
        request: createWebhookRequest(event),
        env: MOCK_ENV_AUTH,
      });

      expect(fetchSpy.mock.calls).toHaveLength(2);

      type FetchInit = { headers: Record<string, string>; body: string };
      const lookupInit = fetchSpy.mock.calls[0][1] as FetchInit;
      const renewUrl = fetchSpy.mock.calls[1][0];
      const renewInit = fetchSpy.mock.calls[1][1] as FetchInit;

      // Lookup carries the internal API key FaceGYM requires
      expect(lookupInit.headers["X-API-Key"]).toBe("test_internal_key");

      // webhook-renew carries HMAC-SHA256(integrity_secret, body) as X-Signature
      expect(String(renewUrl)).toContain("/api/portal/webhook-renew");
      const enc = new TextEncoder();
      const key = await crypto.subtle.importKey(
        "raw",
        enc.encode(MOCK_ENV_AUTH.WOMPI_INTEGRITY_SECRET),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const expected = Array.from(
        new Uint8Array(
          await crypto.subtle.sign("HMAC", key, enc.encode(renewInit.body)),
        ),
      )
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      expect(renewInit.headers["X-Signature"]).toBe(expected);
    });
  });

  // --- Error resilience ---

  describe("error resilience", () => {
    it("returns 200 even on malformed JSON (prevents Wompi retries)", async () => {
      const badRequest = new Request(
        "https://powerhousegym.co/api/payment/webhook",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "not json",
        },
      );

      const response = await onRequestPost({
        request: badRequest,
        env: MOCK_ENV,
      });

      // Wompi spec: always return 200
      expect(response.status).toBe(200);
    });
  });
});
