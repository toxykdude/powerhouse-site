// Cloudflare Pages Function — Wompi webhook receiver
// When Wompi confirms a payment, this activates the membership in FaceGYM.

import { PLANS } from "./signature";

interface Env {
  WOMPI_EVENTS_SECRET: string;
  // Same merchant integrity secret FaceGYM uses to verify X-Signature
  WOMPI_INTEGRITY_SECRET?: string;
  FACEGYM_API_URL?: string;
  // Dedicated pending-read key (design D2) — must equal the backend's
  // PORTAL_INTERNAL_API_KEY. Fail closed when unset: no lookup, no forward.
  // The former FACEGYM_INTERNAL_API_KEY (backend SECRET_KEY) was removed —
  // FaceGYM no longer accepts it for pending-payment reads.
  FACEGYM_PORTAL_INTERNAL_KEY?: string;
}

interface WompiTransaction {
  id: string;
  status: string;
  amount_in_cents: number;
  reference: string;
  /** Wompi transaction currency (e.g. "COP"). Missing → the gym-plan
   *  amount gate treats it as a mismatch (fail closed). */
  currency?: string;
}

interface WompiEvent {
  id: string;
  type: string;
  timestamp: string;
  data: {
    transaction: WompiTransaction;
  };
  signature: {
    checksum: string;
  };
}

async function sha256(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** HMAC-SHA256 of `message` keyed with `secret`, hex-encoded.
 *  FaceGYM's /api/portal/webhook-renew requires this as the X-Signature
 *  header, computed over the exact raw request body sent. */
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

/** Parse the planId from a reference like PH-pt-brayan-molina-16-1719000000-abc123 */
function parsePlanId(reference: string): string | null {
  const match = reference.match(/^PH-(.+)-\d{10}-[a-f0-9]{6}$/);
  return match ? match[1] : null;
}

/** Convert a planId into a human-readable description for the notification email */
function formatPlanDescription(planId: string | null): string {
  if (!planId) return "Plan desconocido (referencia sin planId)";
  if (planId.startsWith("pt-")) {
    const parts = planId.split("-");
    const classes = parts[parts.length - 1];
    const slug = parts.slice(1, -1).join(" ").replace(/-/g, " ");
    const name = slug.replace(/\b\w/g, (c) => c.toUpperCase());
    return `Entrenamiento personal — ${classes} clases con ${name}`;
  }
  const gymPlans: Record<string, string> = {
    mensual: "Membresía Mensual",
    "power-pack": "Power Pack",
    trimestral: "Plan Trimestral",
    semestral: "Plan Semestral",
    anual: "Plan Anual",
  };
  return gymPlans[planId] || `Plan ${planId}`;
}

/** Send a payment notification email to gym staff via MailChannels */
async function sendPaymentNotification(
  tx: WompiTransaction,
  planDescription: string,
): Promise<void> {
  const amountFormatted = (tx.amount_in_cents / 100).toLocaleString("es-CO");
  const body = `
Pago confirmado en PowerHouse Gym (sin activación automática)

Plan: ${planDescription}
Referencia: ${tx.reference}
Monto: $${amountFormatted} COP
Transacción Wompi: ${tx.id}

⚠ Este pago no tiene registro de "pago pendiente" en FaceGYM.
Posible plan nuevo o de entrenamiento personal — gestionar manualmente.

---
Notificación automática desde el webhook de Wompi
  `.trim();

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
        subject: `Pago confirmado: ${planDescription} — $${amountFormatted} COP`,
        content: [{ type: "text/plain", value: body }],
      }),
    });
    console.log("Payment notification email sent", {
      reference: tx.reference,
      plan: planDescription,
    });
    } catch (err) {
      console.error("Failed to send payment notification email:", err);
    }
}

/** Alert gym staff that an approved gym-plan payment was BLOCKED by the
 *  relay amount/currency gate (design D8) — same MailChannels pattern as
 *  sendPaymentNotification. The event is never forwarded to webhook-renew. */
async function sendAmountMismatchAlert(
  tx: WompiTransaction,
  planDescription: string,
  plan: { name: string; amountInCents: number; currency: string },
): Promise<void> {
  const receivedFormatted = (
    Number(tx.amount_in_cents ?? 0) / 100
  ).toLocaleString("es-CO");
  const expectedFormatted = (plan.amountInCents / 100).toLocaleString("es-CO");
  const body = `
Pago BLOQUEADO en PowerHouse Gym (monto o moneda no coincide con el plan)

Plan esperado: ${planDescription}
Monto esperado: $${expectedFormatted} COP (o más)
Monto recibido: $${receivedFormatted} ${tx.currency ?? "(moneda faltante)"}
Referencia: ${tx.reference}
Transacción Wompi: ${tx.id}

⚠ Este pago NO fue reenviado a FaceGYM: ninguna membresía fue activada.
Verifica la transacción en el panel de Wompi y gestionar manualmente si procede.

---
Notificación automática desde el webhook de Wompi (relay amount gate)
  `.trim();

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
        subject: `Pago BLOQUEADO (monto/moneda): ${planDescription} — $${receivedFormatted} ${tx.currency ?? "???"}`,
        content: [{ type: "text/plain", value: body }],
      }),
    });
    console.log("Amount mismatch alert email sent", {
      reference: tx.reference,
      plan: planDescription,
      receivedAmountInCents: tx.amount_in_cents,
      currency: tx.currency,
    });
  } catch (err) {
    console.error("Failed to send amount mismatch alert email:", err);
  }
}

export async function onRequestPost({
  request,
  env,
}: {
  request: Request;
  env: Env;
}) {
  try {
    const event: WompiEvent = await request.json();

    const tx = event.data?.transaction;
    if (!tx) {
      return new Response("Missing transaction data", { status: 200 });
    }

    // Verify event signature: SHA256(transaction.id + transaction.status + amount_in_cents + events_secret)
    const integrityString = `${tx.id}${tx.status}${tx.amount_in_cents}${env.WOMPI_EVENTS_SECRET}`;
    const computedSignature = await sha256(integrityString);

    if (computedSignature !== event.signature?.checksum) {
      console.error("Webhook signature verification failed", {
        eventId: event.id,
        transactionId: tx.id,
      });
      return new Response("Invalid signature", { status: 401 });
    }

    // Process approved transactions
    if (event.type === "transaction.updated" && tx.status === "APPROVED") {
      console.log("Payment approved", {
        eventId: event.id,
        transactionId: tx.id,
        reference: tx.reference,
        amount: tx.amount_in_cents,
      });

      const facegymBase = (
        env.FACEGYM_API_URL || "https://faceapp.powerhousegym.co"
      ).replace(/\/$/, "");

      // Relay amount/currency gate (design D8): for gym plans, verify the
      // Wompi amount against the Pages plan table BEFORE any backend call.
      // Overpayment forwards; underpayment or a non-COP/missing currency is
      // blocked: staff alert, NO forward, still 200 to Wompi.
      const planId = parsePlanId(tx.reference);
      const plan = planId ? PLANS[planId] : undefined;

      if (plan?.facegymId) {
        const amountOk =
          Number.isInteger(tx.amount_in_cents) &&
          tx.amount_in_cents >= plan.amountInCents;
        const currencyOk = tx.currency === plan.currency;
        if (!amountOk || !currencyOk) {
          console.error("Gym-plan amount/currency gate blocked the event", {
            reference: tx.reference,
            planId,
            receivedAmountInCents: tx.amount_in_cents,
            expectedAmountInCents: plan.amountInCents,
            currency: tx.currency,
          });
          await sendAmountMismatchAlert(
            tx,
            formatPlanDescription(planId),
            plan,
          );
          return new Response("OK", { status: 200 });
        }
      }

      // Look up the pending payment by reference
      try {
        // Dedicated internal key (design D2) — strict: when it is not
        // configured the relay fails closed (no lookup, no forward).
        if (!env.FACEGYM_PORTAL_INTERNAL_KEY) {
          console.error(
            "FACEGYM_PORTAL_INTERNAL_KEY not set — failing closed (no pending lookup, no forward)",
          );
          return new Response("OK", { status: 200 });
        }

        const lookupResponse = await fetch(
          `${facegymBase}/api/portal/pending-payment/${tx.reference}`,
          { headers: { "X-API-Key": env.FACEGYM_PORTAL_INTERNAL_KEY } },
        );

        if (!lookupResponse.ok) {
          console.error("Failed to lookup pending payment", {
            reference: tx.reference,
            status: lookupResponse.status,
          });
          return new Response("OK", { status: 200 });
        }

        const pendingData = (await lookupResponse.json()) as {
          status: string;
          plan_id?: string;
          member_id?: string | null;
          amount?: string;
          wompi_reference?: string;
        };

        if (pendingData.status !== "found" || !pendingData.plan_id) {
          // No pending payment in FaceGYM → likely a new membership or PT plan.
          // Send staff notification so they can handle it manually.
          console.log("Payment without pending record — sending notification", {
            reference: tx.reference,
          });
          const planIdForEmail = parsePlanId(tx.reference);
          const planDescription = formatPlanDescription(planIdForEmail);
          await sendPaymentNotification(tx, planDescription);
          return new Response("OK", { status: 200 });
        }

        // Activate membership in FaceGYM
        // FaceGYM verifies X-Signature = HMAC-SHA256(integrity_secret, raw body)
        // Forward = current shape + amount_in_cents (design D8). member_id
        // travels only when the pending record has one — guest pendings
        // (member_id null) forward without it, and guest identity NEVER
        // travels in the body: FaceGYM reads it from its own Redis record.
        const renewPayload: Record<string, unknown> = {
          plan_id: pendingData.plan_id,
          wompi_reference: tx.reference,
          wompi_transaction_id: tx.id,
          amount: pendingData.amount,
          amount_in_cents: tx.amount_in_cents,
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
            "WOMPI_INTEGRITY_SECRET not set — webhook-renew will be rejected by FaceGYM",
          );
        }

        const renewResponse = await fetch(
          `${facegymBase}/api/portal/webhook-renew`,
          {
            method: "POST",
            headers: renewHeaders,
            body: renewBody,
          },
        );

        const renewResult = await renewResponse.json();

        if (renewResponse.ok) {
          console.log("Membership activated via webhook", {
            reference: tx.reference,
            memberId: pendingData.member_id ?? "(guest — provisioned by FaceGYM)",
            result: renewResult,
          });
        } else {
          console.error("FaceGYM webhook-renew failed", {
            status: renewResponse.status,
            result: renewResult,
          });
        }
      } catch (err) {
        console.error("Error processing webhook renewal:", err);
      }
    }

    // Always return 200 OK to prevent Wompi retries
    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("Webhook processing error", error);
    return new Response("OK", { status: 200 });
  }
}
