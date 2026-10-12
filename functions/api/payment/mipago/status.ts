// Cloudflare Pages Function — GET /api/payment/mipago/status?id=<payment_id>
//
// Proxies the hub's authoritative status endpoint (it re-checks with
// Wompi server-side while a payment is in flight) for the confirmation
// page's polling. The response is sanitized: any top-level `customer`
// object is stripped (this endpoint is unauthenticated and ids can leak
// via URLs, logs and referrers — same PII policy as ../status.ts).
//
// Environment: MIPAGO_API_KEY (required), MIPAGO_API_URL (optional).

import { getHubPaymentStatus, type MipagoEnv } from "./_client";

type Env = MipagoEnv;

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function onRequestGet({
  request,
  env,
}: {
  request: Request;
  env: Env;
}): Promise<Response> {
  try {
    const url = new URL(request.url);
    const paymentId = url.searchParams.get("id");

    if (!paymentId) {
      return json({ error: 'Se requiere el parámetro "id" del pago' }, 400);
    }
    // Payment ids are hub-assigned ULIDs (alphanumeric); reject anything
    // that could smuggle path segments or query syntax into the hub URL.
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(paymentId)) {
      return json({ error: "ID de pago inválido" }, 400);
    }
    if (!env.MIPAGO_API_KEY) {
      return json({ error: "Pasarela no configurada" }, 503);
    }

    const result = await getHubPaymentStatus(env, paymentId);
    if (!result.ok) {
      console.error("mipago: status check failed", {
        status: result.status,
        error: result.json.error,
      });
      if (result.status === 404) {
        return json({ error: "Pago no encontrado" }, 404);
      }
      return json(
        { error: "Error consultando el pago con el procesador" },
        502,
      );
    }

    // Shallow sanitize: drop PII keys, keep the hub's own shape.
    const sanitized: Record<string, unknown> = { ...result.json };
    delete sanitized.customer;
    return json(sanitized, 200);
  } catch (error) {
    console.error("mipago: status endpoint error", error);
    return json({ error: "Error interno del servidor" }, 500);
  }
}
