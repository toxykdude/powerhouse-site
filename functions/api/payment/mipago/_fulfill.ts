// Fulfillment relay for approved mipago payments → FaceGYM backend.
//
// Mirrors the legacy Wompi webhook relay (../webhook.ts) with one key
// difference: the hub assigns its own references (PH-01J…, no plan id
// encoded), so the plan linkage travels in the hub payment metadata
// (`plan_key`, set at creation time by create.ts).
//
// Idempotency: FaceGYM consumes the pending record on webhook-renew, so
// a replayed relay is a no-op there — same guard the legacy Wompi flow
// relies on. KV event-id dedup and the reconcile job's "fulfilled"
// marker reduce redundant relays on top of that.

import { PLANS } from "../signature";
import type { MipagoEnv } from "./_client";
import { facegymReferenceFromMetadata } from "./_reference";

export type { MipagoEnv };

export interface HubPaymentPayload {
  id: string;
  reference: string;
  amount: number; // COP pesos
  currency?: string;
  status: string;
  metadata?: Record<string, unknown>;
}

export interface FulfillOutcome {
  outcome: "fulfilled" | "manual" | "blocked" | "skipped" | "error";
  detail?: string;
}

function facegymBase(env: MipagoEnv): string {
  return (env.FACEGYM_API_URL || "https://faceapp.powerhousegym.co").replace(
    /\/$/,
    "",
  );
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

function formatPlanDescription(planKey: string | null): string {
  if (!planKey) return "Plan desconocido (pago sin plan_key en metadata)";
  const plan = PLANS[planKey];
  return plan ? plan.name : `Plan ${planKey}`;
}

/** Staff notification via MailChannels — same pattern as webhook.ts.
 *  Best-effort: failures are logged, never blocking. */
async function sendStaffEmail(subject: string, body: string): Promise<void> {
  try {
    await fetch("https://api.mailchannels.net/tx/v1/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: "gerencia@powerhousegym.co" }] }],
        from: {
          email: "noreply@powerhousegym.co",
          name: "PowerHouse Gym Pagos",
        },
        subject,
        content: [{ type: "text/plain", value: body }],
      }),
    });
  } catch (err) {
    console.error("mipago: failed to send staff email:", err);
  }
}

/** Relay an approved payment to FaceGYM webhook-renew (activates the
 *  membership). Returns a structured outcome for logging/reconcile. */
export async function fulfillApprovedPayment(
  env: MipagoEnv,
  payment: HubPaymentPayload,
  providerTransactionId: string | null,
): Promise<FulfillOutcome> {
  const planKey =
    typeof payment.metadata?.plan_key === "string"
      ? (payment.metadata.plan_key as string)
      : null;
  const plan = planKey ? PLANS[planKey] : undefined;
  const planDescription = formatPlanDescription(planKey);

  // Amount/currency gate (same policy as the legacy relay, design D8):
  // overpayment forwards, underpayment or non-COP is blocked.
  if (plan) {
    const amountOk =
      Number.isInteger(payment.amount) &&
      payment.amount * 100 >= plan.amountInCents;
    const currencyOk = payment.currency === plan.currency;
    if (!amountOk || !currencyOk) {
      console.error("mipago: amount/currency gate blocked the payment", {
        reference: payment.reference,
        planKey,
        receivedPesos: payment.amount,
        expectedPesos: plan.amountInCents / 100,
        currency: payment.currency,
      });
      await sendStaffEmail(
        `Pago BLOQUEADO (monto/moneda): ${planDescription} — ${payment.amount} ${payment.currency ?? "???"}`,
        [
          "Pago BLOQUEADO en PowerHouse Gym (mipago — monto o moneda no coincide con el plan)",
          "",
          `Plan esperado: ${planDescription}`,
          `Monto esperado: $${(plan.amountInCents / 100).toLocaleString("es-CO")} COP (o más)`,
          `Monto recibido: $${payment.amount.toLocaleString("es-CO")} ${payment.currency ?? "(moneda faltante)"}`,
          `Referencia: ${payment.reference}`,
          `Pago mipago: ${payment.id}`,
          "",
          "⚠ Este pago NO fue reenviado a FaceGYM: ninguna membresía fue activada.",
          "Verifica la transacción en el panel del hub y gestiona manualmente si procede.",
        ].join("\n"),
      );
      return { outcome: "blocked", detail: "amount_or_currency_mismatch" };
    }
  } else {
    // Unknown/missing plan_key — cannot gate, cannot bind. Manual path.
    console.error("mipago: approved payment without recognizable plan_key", {
      reference: payment.reference,
    });
  }

  // Pending lookup — dedicated internal key (design D2), fail closed.
  // Lookup + relay use the FaceGYM-facing correlation reference (legacy
  // format) that create.ts minted and stored in hub metadata.
  if (!env.FACEGYM_PORTAL_INTERNAL_KEY) {
    console.error(
      "mipago: FACEGYM_PORTAL_INTERNAL_KEY not set — failing closed (no pending lookup, no forward)",
    );
    return { outcome: "skipped", detail: "portal_key_unset" };
  }

  const facegymRef = facegymReferenceFromMetadata(
    payment.metadata,
    payment.reference,
  );

  let pendingData: {
    status: string;
    plan_id?: string;
    member_id?: string | null;
    amount?: string;
    wompi_reference?: string;
  };
  try {
    const lookupResponse = await fetch(
      `${facegymBase(env)}/api/portal/pending-payment/${encodeURIComponent(facegymRef)}`,
      { headers: { "X-API-Key": env.FACEGYM_PORTAL_INTERNAL_KEY } },
    );
    if (!lookupResponse.ok) {
      console.error("mipago: pending payment lookup failed", {
        reference: payment.reference,
        status: lookupResponse.status,
      });
      return {
        outcome: "error",
        detail: `lookup_status_${lookupResponse.status}`,
      };
    }
    pendingData = (await lookupResponse.json()) as typeof pendingData;
  } catch (err) {
    console.error("mipago: pending payment lookup threw", err);
    return { outcome: "error", detail: "lookup_fetch_error" };
  }

  if (pendingData.status !== "found" || !pendingData.plan_id) {
    // No pending record in FaceGYM → manual path (new membership, PT plan,
    // or a pending store that failed at creation time). Staff email.
    console.log("mipago: payment without pending record — staff notification", {
      reference: payment.reference,
    });
    await sendStaffEmail(
      `Pago confirmado: ${planDescription} — $${payment.amount.toLocaleString("es-CO")} COP`,
      [
        "Pago confirmado en PowerHouse Gym vía mipago.online (sin activación automática)",
        "",
        `Plan: ${planDescription}`,
        `Referencia: ${payment.reference}`,
        `Monto: $${payment.amount.toLocaleString("es-CO")} COP`,
        `Transacción proveedor: ${providerTransactionId ?? "(no informada)"}`,
        "",
        '⚠ Este pago no tiene registro de "pago pendiente" en FaceGYM.',
        "Posible plan nuevo o de entrenamiento personal — gestionar manualmente.",
      ].join("\n"),
    );
    return { outcome: "manual" };
  }

  // webhook-renew relay — FaceGYM verifies X-Signature =
  // HMAC-SHA256(WOMPI_INTEGRITY_SECRET, raw body). member_id travels
  // only when the pending record has one (guest provisioning is
  // FaceGYM-side, from its own Redis record).
  const renewPayload: Record<string, unknown> = {
    plan_id: pendingData.plan_id,
    wompi_reference: facegymRef,
    wompi_transaction_id: providerTransactionId ?? "",
    amount: pendingData.amount,
    amount_in_cents: payment.amount * 100,
  };
  if (pendingData.member_id) {
    renewPayload.member_id = pendingData.member_id;
  }
  const renewBody = JSON.stringify(renewPayload);

  const renewHeaders: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (env.WOMPI_INTEGRITY_SECRET) {
    renewHeaders["X-Signature"] = await hmacSha256Hex(
      env.WOMPI_INTEGRITY_SECRET,
      renewBody,
    );
  } else {
    console.error(
      "mipago: WOMPI_INTEGRITY_SECRET not set — webhook-renew will be rejected by FaceGYM",
    );
  }

  try {
    const renewResponse = await fetch(
      `${facegymBase(env)}/api/portal/webhook-renew`,
      {
        method: "POST",
        headers: renewHeaders,
        body: renewBody,
      },
    );
    if (renewResponse.ok) {
      console.log("mipago: membership activated via relay", {
        reference: payment.reference,
        memberId: pendingData.member_id ?? "(guest — provisioned by FaceGYM)",
      });
      return { outcome: "fulfilled" };
    }
    const result = await renewResponse.json().catch(() => ({}));
    console.error("mipago: FaceGYM webhook-renew failed", {
      status: renewResponse.status,
      result,
    });
    return { outcome: "error", detail: `renew_status_${renewResponse.status}` };
  } catch (err) {
    console.error("mipago: webhook-renew relay threw", err);
    return { outcome: "error", detail: "renew_fetch_error" };
  }
}
