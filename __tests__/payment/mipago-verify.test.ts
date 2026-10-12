import { describe, it, expect } from "vitest";
import {
  verifyCallbackSignature,
  timingSafeEqualHex,
  readCallbackHeaders,
} from "../../functions/api/payment/mipago/_verify";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SECRET = "test_callback_secret_12345";

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

async function sign(
  secret: string,
  timestamp: number | string,
  rawBody: string,
): Promise<string> {
  return hmacSha256Hex(secret, `${timestamp}.${rawBody}`);
}

const RAW_BODY = JSON.stringify({
  type: "payment.approved",
  payment: { id: "01JTEST", reference: "PH-01JTEST", amount: 69900 },
});

function headers(signature: string | null, timestamp: string | null) {
  const request = new Request(
    "https://powerhousegym.co/api/payment/mipago/callback",
    {
      method: "POST",
      headers: {
        ...(signature ? { "X-Mipago-Signature": signature } : {}),
        ...(timestamp ? { "X-Mipago-Timestamp": timestamp } : {}),
      },
      body: RAW_BODY,
    },
  );
  return readCallbackHeaders(request);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("timingSafeEqualHex", () => {
  it("matches identical strings", () => {
    expect(timingSafeEqualHex("aabbcc", "aabbcc")).toBe(true);
  });

  it("rejects different strings of equal length", () => {
    expect(timingSafeEqualHex("aabbcc", "aabcdc")).toBe(false);
  });

  it("rejects different lengths", () => {
    expect(timingSafeEqualHex("aabbcc", "aabb")).toBe(false);
  });
});

describe("verifyCallbackSignature", () => {
  it("accepts a correctly signed fresh callback", async () => {
    const ts = Math.floor(Date.now() / 1000);
    const signature = await sign(SECRET, ts, RAW_BODY);
    const result = await verifyCallbackSignature(
      SECRET,
      RAW_BODY,
      headers(signature, String(ts)),
    );
    expect(result.ok).toBe(true);
  });

  it("rejects a tampered body", async () => {
    const ts = Math.floor(Date.now() / 1000);
    const signature = await sign(SECRET, ts, RAW_BODY);
    const result = await verifyCallbackSignature(
      SECRET,
      RAW_BODY + "x",
      headers(signature, String(ts)),
    );
    expect(result).toEqual({ ok: false, reason: "signature_mismatch" });
  });

  it("rejects a signature made with the wrong secret", async () => {
    const ts = Math.floor(Date.now() / 1000);
    const signature = await sign("other_secret", ts, RAW_BODY);
    const result = await verifyCallbackSignature(
      SECRET,
      RAW_BODY,
      headers(signature, String(ts)),
    );
    expect(result).toEqual({ ok: false, reason: "signature_mismatch" });
  });

  it("accepts millisecond timestamps (hub sends Date.now(), runbook documents seconds)", async () => {
    const tsMs = Date.now();
    const signature = await sign(SECRET, String(tsMs), RAW_BODY);
    const result = await verifyCallbackSignature(
      SECRET,
      RAW_BODY,
      headers(signature, String(tsMs)),
    );
    expect(result.ok).toBe(true);
  });

  it("rejects stale millisecond timestamps (replay protection holds in both units)", async () => {
    const tsMs = Date.now() - 301_000;
    const signature = await sign(SECRET, String(tsMs), RAW_BODY);
    const result = await verifyCallbackSignature(
      SECRET,
      RAW_BODY,
      headers(signature, String(tsMs)),
    );
    expect(result).toEqual({ ok: false, reason: "bad_timestamp" });
  });

  it("rejects timestamps older than 5 minutes", async () => {
    const ts = Math.floor(Date.now() / 1000) - 301;
    const signature = await sign(SECRET, ts, RAW_BODY);
    const result = await verifyCallbackSignature(
      SECRET,
      RAW_BODY,
      headers(signature, String(ts)),
    );
    expect(result).toEqual({ ok: false, reason: "bad_timestamp" });
  });

  it("rejects timestamps more than 5 minutes in the future", async () => {
    const ts = Math.floor(Date.now() / 1000) + 301;
    const signature = await sign(SECRET, ts, RAW_BODY);
    const result = await verifyCallbackSignature(
      SECRET,
      RAW_BODY,
      headers(signature, String(ts)),
    );
    expect(result).toEqual({ ok: false, reason: "bad_timestamp" });
  });

  it("accepts timestamps within the skew window", async () => {
    const ts = Math.floor(Date.now() / 1000) - 290;
    const signature = await sign(SECRET, ts, RAW_BODY);
    const result = await verifyCallbackSignature(
      SECRET,
      RAW_BODY,
      headers(signature, String(ts)),
    );
    expect(result.ok).toBe(true);
  });

  it("rejects non-numeric timestamps even with a matching signature", async () => {
    const signature = await sign(SECRET, "not-a-number", RAW_BODY);
    const result = await verifyCallbackSignature(
      SECRET,
      RAW_BODY,
      headers(signature, "not-a-number"),
    );
    expect(result).toEqual({ ok: false, reason: "bad_timestamp" });
  });

  it("rejects when headers are missing", async () => {
    const result = await verifyCallbackSignature(
      SECRET,
      RAW_BODY,
      headers(null, null),
    );
    expect(result).toEqual({ ok: false, reason: "missing_headers" });
  });

  it("rejects when the secret is not configured", async () => {
    const ts = Math.floor(Date.now() / 1000);
    const signature = await sign(SECRET, ts, RAW_BODY);
    const result = await verifyCallbackSignature(
      undefined,
      RAW_BODY,
      headers(signature, String(ts)),
    );
    expect(result).toEqual({ ok: false, reason: "missing_secret" });
  });
});
