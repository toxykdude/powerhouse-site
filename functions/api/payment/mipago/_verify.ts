// Callback signature verification for the mipago.online hub.
//
// The hub signs every callback with:
//   X-Mipago-Signature: hex( HMAC-SHA256(MIPAGO_CALLBACK_SECRET,
//                                        timestamp + "." + raw_body) )
//   X-Mipago-Timestamp: unix seconds
//   X-Mipago-Event-Id:  unique id (dedup happens in _registry.ts)
//
// The signature is computed over the RAW request bytes — callers must
// pass the body exactly as received (request.text() before any JSON
// parsing). Comparison is timing-safe; timestamps outside a ±5 minute
// window are rejected (replay protection).

export const CALLBACK_MAX_SKEW_SECONDS = 300;

export interface CallbackHeaders {
  signature: string | null;
  timestamp: string | null;
}

export function readCallbackHeaders(request: Request): CallbackHeaders {
  return {
    signature: request.headers.get("X-Mipago-Signature"),
    timestamp: request.headers.get("X-Mipago-Timestamp"),
  };
}

/** Constant-time string equality. The early length return only leaks the
 *  length — irrelevant here because hex HMAC digests are always 64 chars. */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

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

export type VerifyResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "missing_secret"
        | "missing_headers"
        | "bad_timestamp"
        | "signature_mismatch";
    };

export async function verifyCallbackSignature(
  secret: string | undefined,
  rawBody: string,
  headers: CallbackHeaders,
): Promise<VerifyResult> {
  if (!secret) return { ok: false, reason: "missing_secret" };
  if (!headers.signature || !headers.timestamp) {
    return { ok: false, reason: "missing_headers" };
  }
  if (!/^\d+$/.test(headers.timestamp)) {
    return { ok: false, reason: "bad_timestamp" };
  }
  const now = Math.floor(Date.now() / 1000);
  const ts = parseInt(headers.timestamp, 10);
  if (Math.abs(now - ts) > CALLBACK_MAX_SKEW_SECONDS) {
    return { ok: false, reason: "bad_timestamp" };
  }
  const expected = await hmacSha256Hex(
    secret,
    `${headers.timestamp}.${rawBody}`,
  );
  if (!timingSafeEqualHex(expected, headers.signature)) {
    return { ok: false, reason: "signature_mismatch" };
  }
  return { ok: true };
}
