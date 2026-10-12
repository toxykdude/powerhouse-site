// Shared server-side client for the mipago.online payment hub.
// Environment (Cloudflare Pages dashboard, NEVER in git):
//   MIPAGO_API_KEY  — tenant API key (Bearer); required, fail closed
//   MIPAGO_API_URL  — optional override (staging deploy); defaults to
//                     the production hub. A malformed value logs and
//                     falls back to production instead of killing the
//                     edge invocation (same guard as WOMPI_API_URL in
//                     ../status.ts).
//
// Amounts: the hub takes COP PESOS (major units, e.g. 69900). The Pages
// PLANS table stores cents — use planAmountPesos() to convert.

/** Canonical env surface for every mipago endpoint. Endpoints declare
 *  `type Env = MipagoEnv` — never extend with a second interface. */
export interface MipagoEnv {
  // Hub rail
  MIPAGO_API_KEY?: string;
  MIPAGO_API_URL?: string;
  MIPAGO_ENABLED?: string;
  MIPAGO_CALLBACK_SECRET?: string;
  MIPAGO_RECONCILE_KEY?: string;
  /** KV binding (structural — see MipagoKV in _registry.ts). */
  MIPAGO_KV?: unknown;
  // FaceGYM relay (existing backend contract, unchanged)
  FACEGYM_API_URL?: string;
  FACEGYM_PORTAL_INTERNAL_KEY?: string;
  WOMPI_INTEGRITY_SECRET?: string;
}

export interface HubCustomer {
  /** Optional by design: the hub's buyer form collects it when we have
   *  none on file (member JWT has no profile email here). We never
   *  fabricate one — the hub sends receipts to this address. */
  email?: string;
  name: string;
  phone?: string;
}

export interface CreateHubPaymentInput {
  amount: number; // COP pesos (major units)
  description: string;
  customer: HubCustomer;
  metadata: Record<string, unknown>;
}

export interface HubPaymentCreated {
  id: string;
  reference: string;
  status: string;
  checkout_url: string;
  expires_at?: string;
}

const DEFAULT_BASE_URL = "https://mipago.online";

export function resolveHubBaseUrl(env: MipagoEnv): string {
  if (!env.MIPAGO_API_URL) return DEFAULT_BASE_URL;
  try {
    const parsed = new URL(env.MIPAGO_API_URL);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return parsed.toString().replace(/\/+$/, "");
    }
    console.error(`Invalid MIPAGO_API_URL protocol: ${parsed.protocol}`);
  } catch {
    console.error("Invalid MIPAGO_API_URL — falling back to production hub");
  }
  return DEFAULT_BASE_URL;
}

/** PLANS amounts are cents; the hub takes pesos. Fails loud on fractional
 *  pesos (every plan price is a whole-peso amount by construction). */
export function planAmountPesos(amountInCents: number): number {
  const pesos = amountInCents / 100;
  if (!Number.isInteger(pesos)) {
    throw new Error(`Plan amount ${amountInCents} is not a whole-peso value`);
  }
  return pesos;
}

async function hubFetch(
  env: MipagoEnv,
  path: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  if (!env.MIPAGO_API_KEY) {
    return {
      ok: false,
      status: 500,
      json: { error: "MIPAGO_API_KEY not configured" },
    };
  }
  const response = await fetch(`${resolveHubBaseUrl(env)}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.MIPAGO_API_KEY}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  let json: Record<string, unknown> = {};
  try {
    json = (await response.json()) as Record<string, unknown>;
  } catch {
    json = {};
  }
  return { ok: response.ok, status: response.status, json };
}

export async function createHubPayment(
  env: MipagoEnv,
  input: CreateHubPaymentInput,
): Promise<
  | { ok: true; payment: HubPaymentCreated }
  | { ok: false; status: number; error: string }
> {
  const result = await hubFetch(env, "/api/v1/payments", {
    method: "POST",
    body: JSON.stringify({
      amount: input.amount,
      currency: "COP",
      description: input.description,
      customer: input.customer,
      metadata: input.metadata,
    }),
  });
  if (!result.ok) {
    console.error("mipago: payment creation failed", {
      status: result.status,
      error: result.json.error,
    });
    return {
      ok: false,
      status: result.status >= 500 ? 502 : result.status,
      error: "No pudimos iniciar el pago con el procesador.",
    };
  }
  const payment = result.json as unknown as HubPaymentCreated;
  if (!payment.id || !payment.reference || !payment.checkout_url) {
    console.error("mipago: creation response missing required fields");
    return {
      ok: false,
      status: 502,
      error: "Respuesta inválida del procesador de pagos.",
    };
  }
  return { ok: true, payment };
}

/** GET /api/v1/payments/:id/status — authoritative status (hub re-checks
 *  with Wompi server-side while a payment is in flight). */
export async function getHubPaymentStatus(
  env: MipagoEnv,
  paymentId: string,
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  return hubFetch(
    env,
    `/api/v1/payments/${encodeURIComponent(paymentId)}/status`,
  );
}

/** POST /api/v1/payments/:id/cancel — customer aborts before paying. */
export async function cancelHubPayment(
  env: MipagoEnv,
  paymentId: string,
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  return hubFetch(
    env,
    `/api/v1/payments/${encodeURIComponent(paymentId)}/cancel`,
    {
      method: "POST",
    },
  );
}
