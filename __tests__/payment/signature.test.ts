import { describe, it, expect } from "vitest";
import { onRequestPost } from "../../functions/api/payment/signature";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MOCK_ENV = {
  WOMPI_PUBLIC_KEY: "pub_test_xxxxxxxxxxxx",
  WOMPI_INTEGRITY_SECRET: "test_integrity_secret",
} as const;

function createRequest(body: unknown): Request {
  return new Request("https://powerhousegym.co/api/payment/signature", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function sha256(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------
// sha256 — tested indirectly through signature verification
// ---------------------------------------------------------------------------

describe("sha256 hashing (indirect)", () => {
  it("produces the correct SHA-256 hex digest for a known input", async () => {
    // Known test vector: SHA-256("hello") =
    // 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
    const hash = await sha256("hello");
    expect(hash).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });

  it("produces a 64-character lowercase hex string", async () => {
    const hash = await sha256("any input works");
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ---------------------------------------------------------------------------
// generateSignature — verified by recomputing from response data
// ---------------------------------------------------------------------------

describe("generateSignature (via onRequestPost)", () => {
  const validPlans = [
    "mensual",
    "power-pack",
    "trimestral",
    "semestral",
    "anual",
  ];

  it.each(validPlans)(
    'produces a verifiable integrity signature for plan "%s"',
    async (planId) => {
      const response = await onRequestPost({
        request: createRequest({ plan: planId }),
        env: MOCK_ENV,
      });

      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        reference: string;
        signature: string;
        amountInCents: number;
        currency: string;
      };

      // Recompute: SHA256(reference + amountInCents + currency + secret)
      const expected = await sha256(
        `${body.reference}${body.amountInCents}${body.currency}${MOCK_ENV.WOMPI_INTEGRITY_SECRET}`,
      );

      expect(body.signature).toBe(expected);
    },
  );
});

// ---------------------------------------------------------------------------
// generateReference — format validation
// ---------------------------------------------------------------------------

describe("generateReference (via onRequestPost)", () => {
  it("returns a reference matching PH-{planId}-{timestamp}-{hex6} format", async () => {
    const response = await onRequestPost({
      request: createRequest({ plan: "mensual" }),
      env: MOCK_ENV,
    });

    const body = (await response.json()) as { reference: string };

    expect(body.reference).toMatch(/^PH-mensual-\d{10}-[0-9a-f]{6}$/);
  });

  it("returns a unique reference on each call", async () => {
    const responses = await Promise.all([
      onRequestPost({
        request: createRequest({ plan: "mensual" }),
        env: MOCK_ENV,
      }),
      onRequestPost({
        request: createRequest({ plan: "mensual" }),
        env: MOCK_ENV,
      }),
    ]);

    const [bodyA, bodyB] = await Promise.all(
      responses.map((r) => r.json() as Promise<{ reference: string }>),
    );

    expect(bodyA.reference).not.toBe(bodyB.reference);
  });
});

// ---------------------------------------------------------------------------
// Plan validation — invalid/missing plan handling
// ---------------------------------------------------------------------------

describe("plan validation", () => {
  it("returns 400 for an invalid plan ID", async () => {
    const response = await onRequestPost({
      request: createRequest({ plan: "nonexistent" }),
      env: MOCK_ENV,
    });

    expect(response.status).toBe(400);

    const body = (await response.json()) as { error: string };
    expect(body.error).toContain("Plan inválido");
    expect(body.error).toContain("mensual");
  });

  it("returns 400 when plan is missing from body", async () => {
    const response = await onRequestPost({
      request: createRequest({}),
      env: MOCK_ENV,
    });

    expect(response.status).toBe(400);

    const body = (await response.json()) as { error: string };
    expect(body.error).toContain("Plan inválido");
  });

  it("returns 400 when plan is null", async () => {
    const response = await onRequestPost({
      request: createRequest({ plan: null }),
      env: MOCK_ENV,
    });

    expect(response.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// onRequestPost — full handler integration
// ---------------------------------------------------------------------------

describe("onRequestPost — handler integration", () => {
  it("returns correct response shape for a valid plan", async () => {
    const response = await onRequestPost({
      request: createRequest({ plan: "mensual" }),
      env: MOCK_ENV,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/json");

    const body = (await response.json()) as {
      reference: string;
      signature: string;
      amountInCents: number;
      currency: string;
      publicKey: string;
      planName: string;
    };

    expect(body.reference).toBeTruthy();
    expect(body.signature).toBeTruthy();
    expect(body.amountInCents).toBe(6990000);
    expect(body.currency).toBe("COP");
    expect(body.publicKey).toBe(MOCK_ENV.WOMPI_PUBLIC_KEY);
    expect(body.planName).toBe("Membresía Mensual");
  });

  it("returns correct amounts for all valid plans", async () => {
    const planAmounts: Record<string, number> = {
      mensual: 6990000,
      "power-pack": 14000000,
      trimestral: 18600000,
      semestral: 36000000,
      anual: 62000000,
    };

    for (const [planId, expectedAmount] of Object.entries(planAmounts)) {
      const response = await onRequestPost({
        request: createRequest({ plan: planId }),
        env: MOCK_ENV,
      });

      const body = (await response.json()) as { amountInCents: number };
      expect(body.amountInCents).toBe(expectedAmount);
    }
  });

  it("returns 500 when request body is not valid JSON", async () => {
    const badRequest = new Request(
      "https://powerhousegym.co/api/payment/signature",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json at all",
      },
    );

    const response = await onRequestPost({
      request: badRequest,
      env: MOCK_ENV,
    });

    expect(response.status).toBe(500);

    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("Error interno del servidor");
  });
});
