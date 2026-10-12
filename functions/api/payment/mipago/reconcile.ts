// Cloudflare Pages Function — POST /api/payment/mipago/reconcile
//
// Reconciliation safety net (runbook step 5): finds hub payments whose
// callback never arrived (or whose fulfillment errored) and resolves
// them against the hub's authoritative status API.
//
// Trigger: GitHub Actions cron (.github/workflows/mipago-reconcile.yml)
// calling POST with header `X-Reconcile-Key: <MIPAGO_RECONCILE_KEY>`.
// The key is compared timing-safe; unset or wrong → 401, fail closed.
//
// Requires the MIPAGO_KV binding (the payment registry). Without it
// there is nothing to reconcile — the endpoint reports that and exits.
//
// Idempotent by construction: records are marked fulfilled/final in KV,
// approved payments only relay once per record state, and FaceGYM's
// pending-record consumption is the final guard.

import { getHubPaymentStatus, type MipagoEnv } from "./_client";
import {
  listOpenPayments,
  updatePaymentRecord,
  type MipagoKV,
} from "./_registry";
import { timingSafeEqualHex } from "./_verify";
import { fulfillApprovedPayment, type HubPaymentPayload } from "./_fulfill";

type Env = MipagoEnv;

/** Give callbacks a 5-minute head start before reconciling a record. */
const RECONCILE_MIN_AGE_SECONDS = 300;

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isAuthorized(env: Env, request: Request): boolean {
  const expected = env.MIPAGO_RECONCILE_KEY;
  if (!expected) return false;
  const provided = request.headers.get("X-Reconcile-Key");
  if (!provided) return false;
  return timingSafeEqualHex(expected, provided);
}

function readStatus(json: Record<string, unknown>): string | null {
  const candidate =
    json.status ??
    (json.payment as Record<string, unknown> | undefined)?.status;
  return typeof candidate === "string" ? candidate : null;
}

export async function onRequestPost({
  request,
  env,
}: {
  request: Request;
  env: Env;
}): Promise<Response> {
  try {
    if (!isAuthorized(env, request)) {
      if (!env.MIPAGO_RECONCILE_KEY) {
        console.error(
          "mipago: MIPAGO_RECONCILE_KEY not set — reconcile fails closed",
        );
      }
      return json({ error: "Unauthorized" }, 401);
    }

    const kv = (env.MIPAGO_KV as MipagoKV | undefined) ?? undefined;
    if (!kv) {
      return json(
        { error: "MIPAGO_KV binding missing — nothing to reconcile" },
        200,
      );
    }

    const now = Math.floor(Date.now() / 1000);
    const records = await listOpenPayments(kv);
    const summary = {
      checked: 0,
      fulfilled: 0,
      finalized: 0,
      skipped: 0,
      errors: 0,
    };

    for (const record of records) {
      if (record.status !== "open") continue;
      // Too recent — the callback may simply be in flight.
      if (now - record.created_at < RECONCILE_MIN_AGE_SECONDS) {
        summary.skipped++;
        continue;
      }

      summary.checked++;

      const result = await getHubPaymentStatus(env, record.payment_id);
      if (!result.ok) {
        console.error("mipago: reconcile status check failed", {
          payment_id: record.payment_id,
          status: result.status,
        });
        summary.errors++;
        continue;
      }

      const status = readStatus(result.json);
      if (!status) {
        console.error("mipago: reconcile could not read status", {
          payment_id: record.payment_id,
        });
        summary.errors++;
        continue;
      }

      if (status === "APPROVED") {
        const payment: HubPaymentPayload = {
          id: record.payment_id,
          reference: record.reference,
          amount: record.amount_pesos,
          currency: "COP",
          status,
          metadata: { plan_key: record.plan_key },
        };
        const outcome = await fulfillApprovedPayment(env, payment, null);
        if (outcome.outcome === "fulfilled" || outcome.outcome === "manual") {
          await updatePaymentRecord(kv, { ...record, status: "fulfilled" });
          summary.fulfilled++;
        } else if (outcome.outcome === "blocked") {
          await updatePaymentRecord(kv, {
            ...record,
            status: "final",
            final_status: "BLOCKED_AMOUNT_GATE",
          });
          summary.finalized++;
        } else {
          // error / skipped — leave open for the next run.
          summary.errors++;
        }
      } else if (
        ["DECLINED", "ERROR", "CANCELLED", "EXPIRED"].includes(status)
      ) {
        await updatePaymentRecord(kv, {
          ...record,
          status: "final",
          final_status: status,
        });
        summary.finalized++;
      } else {
        // CREATED / PENDING — still in flight, next run picks it up.
        summary.skipped++;
      }
    }

    console.log("mipago: reconcile summary", summary);
    return json(summary, 200);
  } catch (error) {
    console.error("mipago: reconcile endpoint error", error);
    return json({ error: "Error interno del servidor" }, 500);
  }
}
