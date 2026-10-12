// Cloudflare Pages Function — POST /api/payment/mipago/cancel
//
// Cancels a hub payment that has not been paid yet (runbook sandbox
// checklist: cancel flow → CANCELLED). Body: { "id": "<payment_id>" }.
// One payment = one attempt: after a decline/cancel the customer always
// starts a NEW payment — this endpoint never reopens one.
//
// Environment: MIPAGO_API_KEY (required), MIPAGO_API_URL (optional).

import { cancelHubPayment, type MipagoEnv } from "./_client";
import {
  updatePaymentRecord,
  getPaymentRecord,
  type MipagoKV,
} from "./_registry";

type Env = MipagoEnv;

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function onRequestPost({
  request,
  env,
}: {
  request: Request;
  env: Env;
}): Promise<Response> {
  try {
    const body = (await request.json().catch(() => ({}))) as { id?: string };
    const paymentId = body.id;

    if (!paymentId || !/^[A-Za-z0-9_-]{1,64}$/.test(paymentId)) {
      return json({ error: "ID de pago inválido" }, 400);
    }
    if (!env.MIPAGO_API_KEY) {
      return json({ error: "Pasarela no configurada" }, 503);
    }

    const result = await cancelHubPayment(env, paymentId);
    if (!result.ok) {
      console.error("mipago: cancel failed", {
        status: result.status,
        error: result.json.error,
      });
      return json({ error: "No pudimos cancelar el pago" }, 502);
    }

    const kv = (env.MIPAGO_KV as MipagoKV | undefined) ?? undefined;
    const record = await getPaymentRecord(kv, paymentId);
    if (record && record.status === "open") {
      await updatePaymentRecord(kv, {
        ...record,
        status: "final",
        final_status: "CANCELLED",
      });
    }

    const sanitized: Record<string, unknown> = { ...result.json };
    delete sanitized.customer;
    return json({ ok: true, ...sanitized }, 200);
  } catch (error) {
    console.error("mipago: cancel endpoint error", error);
    return json({ error: "Error interno del servidor" }, 500);
  }
}
