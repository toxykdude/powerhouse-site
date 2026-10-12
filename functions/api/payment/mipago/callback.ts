// Cloudflare Pages Function — POST /api/payment/mipago/callback
//
// Signed callback receiver for the mipago.online hub (runbook step 4).
// The hub POSTs here when a payment reaches a final state:
//   payment.approved | payment.declined | payment.error
//
// Verification order (all before any side effects):
//   1. raw body bytes (request.text() BEFORE JSON parsing)
//   2. HMAC-SHA256(MIPAGO_CALLBACK_SECRET, timestamp + "." + rawBody),
//      timing-safe compared against X-Mipago-Signature
//   3. X-Mipago-Timestamp within ±5 minutes (replay protection)
//   4. X-Mipago-Event-Id dedup (KV when bound)
//
// APPROVED is the only success signal, and only from here or the hub
// status API — never from the browser. Declined/error events never
// fulfill. After successful verification the endpoint always answers
// 200 quickly; a failed fulfillment is NOT marked processed, so hub
// retries re-attempt it, and the reconcile job is the final safety net.

import { verifyCallbackSignature, readCallbackHeaders } from "./_verify";
import {
  isEventProcessed,
  markEventProcessed,
  updatePaymentRecord,
  getPaymentRecord,
  type MipagoKV,
} from "./_registry";
import {
  fulfillApprovedPayment,
  type MipagoEnv,
  type HubPaymentPayload,
} from "./_fulfill";

type Env = MipagoEnv;

interface CallbackBody {
  type?: string;
  payment?: HubPaymentPayload;
  provider?: { name?: string; transaction_id?: string | null };
}

export async function onRequestPost({
  request,
  env,
}: {
  request: Request;
  env: Env;
}): Promise<Response> {
  // 1. Raw body first — the signature is over these exact bytes.
  const rawBody = await request.text();

  // 2.+3. Signature + timestamp verification. Mismatch → 401, nothing else.
  const verification = await verifyCallbackSignature(
    env.MIPAGO_CALLBACK_SECRET,
    rawBody,
    readCallbackHeaders(request),
  );
  if (!verification.ok) {
    console.error("mipago: callback verification failed", {
      reason: verification.reason,
    });
    return new Response("Invalid signature", { status: 401 });
  }

  const eventId = request.headers.get("X-Mipago-Event-Id") ?? "";
  const kv = (env.MIPAGO_KV as MipagoKV | undefined) ?? undefined;

  // 4. Event-id dedup — each event is processed exactly once.
  if (await isEventProcessed(kv, eventId)) {
    return new Response("OK", { status: 200 });
  }

  let event: CallbackBody;
  try {
    event = JSON.parse(rawBody) as CallbackBody;
  } catch {
    // Valid signature but malformed JSON is a hub-side bug — 400 so it
    // surfaces in the hub's delivery logs rather than being swallowed.
    return new Response("Malformed payload", { status: 400 });
  }

  const payment = event.payment;
  if (!payment?.id || !payment.reference) {
    return new Response("Missing payment data", { status: 200 });
  }

  const providerTxId = event.provider?.transaction_id ?? null;

  try {
    if (event.type === "payment.approved" && payment.status === "APPROVED") {
      const outcome = await fulfillApprovedPayment(env, payment, providerTxId);

      // Mark the event processed only when fulfillment reached a
      // terminal resolution (fulfilled / manual / blocked). Errors stay
      // unmarked so hub retries re-attempt them; the reconcile job
      // catches anything the retries miss.
      if (outcome.outcome !== "error" && outcome.outcome !== "skipped") {
        await markEventProcessed(kv, eventId);
      }

      const record = await getPaymentRecord(kv, payment.id);
      if (record) {
        await updatePaymentRecord(kv, {
          ...record,
          status: outcome.outcome === "fulfilled" ? "fulfilled" : record.status,
        });
      }
    } else if (
      event.type === "payment.declined" ||
      event.type === "payment.error"
    ) {
      // No fulfillment on declined/error. There is no local order to
      // "fail" (FaceGYM owns the records; its pending entry simply
      // expires) — the customer retries with a NEW payment.
      console.log("mipago: payment not approved", {
        type: event.type,
        status: payment.status,
        reference: payment.reference,
      });
      await markEventProcessed(kv, eventId);

      const record = await getPaymentRecord(kv, payment.id);
      if (record && record.status === "open") {
        await updatePaymentRecord(kv, {
          ...record,
          status: "final",
          final_status: payment.status,
        });
      }
    } else {
      // Unknown event type or non-final status echo — acknowledge.
      console.log("mipago: ignored callback", {
        type: event.type,
        status: payment.status,
      });
      await markEventProcessed(kv, eventId);
    }
  } catch (error) {
    console.error("mipago: callback processing error", error);
    // Still 200 (runbook): the event stays unmarked for hub retries,
    // and reconciliation covers the rest.
  }

  return new Response("OK", { status: 200 });
}
