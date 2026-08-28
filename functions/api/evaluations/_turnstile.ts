// Cloudflare Turnstile verification (optional bot protection).
//
// When env.TURNSTILE_SECRET_KEY is unset the check passes (local/dev mode);
// in production a missing or unverifiable token blocks the submission.

import type { Env } from "./_types";

const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Verify a Turnstile token. Returns true when:
 *  - no secret is configured (dev mode), or
 *  - Cloudflare confirms the token with success=true.
 * Any failure (missing token, non-2xx, network error, success=false) → false.
 */
export async function verifyTurnstile(
  env: Env,
  token: string | undefined,
  ip: string,
): Promise<boolean> {
  if (!env.TURNSTILE_SECRET_KEY) {
    return true;
  }
  if (!token || token.trim().length === 0) {
    return false;
  }
  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: env.TURNSTILE_SECRET_KEY,
        response: token,
        remoteip: ip,
      }),
    });
    if (!response.ok) {
      return false;
    }
    const data: unknown = await response.json();
    if (typeof data === "object" && data !== null && "success" in data) {
      return (data as { success: unknown }).success === true;
    }
    return false;
  } catch {
    // Network/API failure: fail closed.
    return false;
  }
}
