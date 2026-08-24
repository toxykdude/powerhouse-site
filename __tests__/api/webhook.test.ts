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

// Env with everything the relay needs after the D2/D8 rework: the
// dedicated pending-read key (FACEGYM_PORTAL_INTERNAL_KEY, must equal the
// backend PORTAL_INTERNAL_API_KEY) and the HMAC secret for webhook-renew.
const MOCK_ENV_AUTH = {
  ...MOCK_ENV,
  WOMPI_INTEGRITY_SECRET: "test_integrity_secret_67890",
  FACEGYM_PORTAL_INTERNAL_KEY: "test_portal_internal_key",
};

const GYM_REF = "PH-mensual-1719000000-abc123";
const PT_REF = "PH-pt-brayan-molina-16-1719000000-abc123";

const MEMBER_PENDING = {
  status: "found",
  plan_id: "45d96de3-a086-427a-9a8a-44351abb6423",
  member_id: "member_123",
  amount: "69900.00",
  wompi_reference: GYM_REF,
};

const GUEST_PENDING = {
  status: "found",
  plan_id: "45d96de3-a086-427a-9a8a-44351abb6423",
  member_id: null,
  guest_name: "Maria Perez",
  guest_phone: "573001234567",
  guest_email: "maria@example.com",
  amount: "69900.00",
  wompi_reference: GYM_REF,
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
  reference?: string;
  currency?: string;
}) {
  const txId = overrides?.txId ?? "12345";
  const txStatus = overrides?.txStatus ?? "APPROVED";
  const amountInCents = overrides?.amountInCents ?? 6990000;
  const eventType = overrides?.eventType ?? "transaction.updated";
  const reference = overrides?.reference ?? GYM_REF;
  const currency = overrides?.currency ?? "COP";

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
        reference,
        currency,
      },
    },
    signature: { checksum },
  };
}

/** Mock fetch for: [pending lookup, webhook-renew] — both OK. */
function mockHappyBackendPath(pending: unknown = MEMBER_PENDING) {
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  fetchSpy.mockResolvedValueOnce(
    new Response(JSON.stringify(pending), { status: 200 }),
  );
  fetchSpy.mockResolvedValueOnce(
    new Response(JSON.stringify({ status: "success" }), { status: 200 }),
  );
  return fetchSpy;
}

/** Structural view of a vi fetch spy — just what the helpers need. */
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

  // --- Relay amount and currency verification (payment-integrity, D8) ---

  describe("relay amount and currency gate (gym plans)", () => {
    it("matching amount is forwarded with amount_in_cents", async () => {
      const event = await buildValidEvent({
        txId: "tx_match",
        amountInCents: 6990000,
      });
      const fetchSpy = mockHappyBackendPath();

      const response = await onRequestPost({
        request: createWebhookRequest(event),
        env: MOCK_ENV_AUTH,
      });

      expect(response.status).toBe(200);
      expect(callsTo(fetchSpy, "/api/portal/webhook-renew")).toHaveLength(1);

      const body = renewBodies(fetchSpy)[0];
      expect(body.amount_in_cents).toBe(6990000);
      expect(body.wompi_reference).toBe(GYM_REF);
      expect(body.wompi_transaction_id).toBe("tx_match");
      expect(body.member_id).toBe("member_123");
    });

    it("overpayment is forwarded", async () => {
      const event = await buildValidEvent({
        txId: "tx_over",
        amountInCents: 7990000,
      });
      const fetchSpy = mockHappyBackendPath();

      const response = await onRequestPost({
        request: createWebhookRequest(event),
        env: MOCK_ENV_AUTH,
      });

      expect(response.status).toBe(200);
      const bodies = renewBodies(fetchSpy);
      expect(bodies).toHaveLength(1);
      expect(bodies[0].amount_in_cents).toBe(7990000);
    });

    it("underpayment is blocked before forwarding", async () => {
      const event = await buildValidEvent({
        amountInCents: 6989999, // 1 cent below the mensual plan price
      });
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      const response = await onRequestPost({
        request: createWebhookRequest(event),
        env: MOCK_ENV_AUTH,
      });

      // Wompi still gets its 200 — no retries
      expect(response.status).toBe(200);
      // But nothing reaches FaceGYM: no pending lookup, no renewal
      expect(callsTo(fetchSpy, "/api/portal/")).toHaveLength(0);
      // A staff alert IS emitted
      expect(callsTo(fetchSpy, "api.mailchannels.net")).toHaveLength(1);
    });

    it("currency mismatch is blocked", async () => {
      const event = await buildValidEvent({
        amountInCents: 6990000,
        currency: "USD",
      });
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      const response = await onRequestPost({
        request: createWebhookRequest(event),
        env: MOCK_ENV_AUTH,
      });

      expect(response.status).toBe(200);
      expect(callsTo(fetchSpy, "/api/portal/")).toHaveLength(0);
      expect(callsTo(fetchSpy, "api.mailchannels.net")).toHaveLength(1);
    });

    it("missing currency is treated as a mismatch and blocked", async () => {
      const event = await buildValidEvent({ amountInCents: 6990000 });
      delete (event.data.transaction as { currency?: string }).currency;
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      const response = await onRequestPost({
        request: createWebhookRequest(event),
        env: MOCK_ENV_AUTH,
      });

      expect(response.status).toBe(200);
      expect(callsTo(fetchSpy, "/api/portal/")).toHaveLength(0);
      expect(callsTo(fetchSpy, "api.mailchannels.net")).toHaveLength(1);
    });
  });

  // --- Guest pending records (D8: identity never travels in the body) ---

  describe("guest pending payment", () => {
    it("forwards a guest pending without member_id or identity fields", async () => {
      const event = await buildValidEvent({ txId: "tx_guest" });
      const fetchSpy = mockHappyBackendPath(GUEST_PENDING);

      const response = await onRequestPost({
        request: createWebhookRequest(event),
        env: MOCK_ENV_AUTH,
      });

      expect(response.status).toBe(200);
      const bodies = renewBodies(fetchSpy);
      expect(bodies).toHaveLength(1);

      const body = bodies[0];
      // The renewal carries the payment facts…
      expect(body.amount_in_cents).toBe(6990000);
      expect(body.wompi_reference).toBe(GYM_REF);
      expect(body.wompi_transaction_id).toBe("tx_guest");
      expect(body.plan_id).toBe(GUEST_PENDING.plan_id);
      // …but guest identity NEVER travels in the body (backend reads Redis)
      expect("member_id" in body).toBe(false);
      expect("guest_name" in body).toBe(false);
      expect("guest_phone" in body).toBe(false);
      expect("guest_email" in body).toBe(false);
      // Raw body must not leak identity either
      const rawBody = String(
        callsTo(fetchSpy, "/api/portal/webhook-renew")[0][1],
      );
      expect(rawBody).not.toContain("Maria");
      expect(rawBody).not.toContain("573001234567");
      expect(rawBody).not.toContain("maria@example.com");
    });
  });

  // --- Internal pending key (D2) ---

  describe("internal pending key", () => {
    it("authenticates the pending lookup with FACEGYM_PORTAL_INTERNAL_KEY", async () => {
      const event = await buildValidEvent({ txId: "tx_key" });
      const fetchSpy = mockHappyBackendPath();

      await onRequestPost({
        request: createWebhookRequest(event),
        env: MOCK_ENV_AUTH,
      });

      expect(fetchSpy.mock.calls).toHaveLength(2);

      type FetchInit = { headers: Record<string, string> };
      const lookupInit = fetchSpy.mock.calls[0][1] as FetchInit;
      expect(String(fetchSpy.mock.calls[0][0])).toContain(
        "/api/portal/pending-payment/",
      );
      expect(lookupInit.headers["X-API-Key"]).toBe("test_portal_internal_key");
    });

    it("fails closed (200, no forward) when the key is not configured", async () => {
      const event = await buildValidEvent();
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      const response = await onRequestPost({
        request: createWebhookRequest(event),
        env: MOCK_ENV, // no FACEGYM_PORTAL_INTERNAL_KEY
      });

      expect(response.status).toBe(200);
      // Fail-closed: no lookup, no renewal, no alert email — nothing
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  // --- PT plans stay on the manual staff path ---

  describe("PT plans (manual staff path)", () => {
    it("sends the staff notification and does not forward", async () => {
      const event = await buildValidEvent({
        txId: "tx_pt",
        reference: PT_REF,
        amountInCents: 44990000,
      });
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      // Backend has no pending record for PT purchases → 200 not_found
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ status: "not_found", reference: PT_REF }),
          { status: 200 },
        ),
      );

      const response = await onRequestPost({
        request: createWebhookRequest(event),
        env: MOCK_ENV_AUTH,
      });

      expect(response.status).toBe(200);
      expect(callsTo(fetchSpy, "/api/portal/pending-payment/")).toHaveLength(1);
      expect(callsTo(fetchSpy, "/api/portal/webhook-renew")).toHaveLength(0);
      expect(callsTo(fetchSpy, "api.mailchannels.net")).toHaveLength(1);
    });
  });

  // --- Approved transaction processing ---

  describe("approved transaction processing", () => {
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
