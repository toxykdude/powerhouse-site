// Cloudflare Pages Function — Wompi webhook receiver
// When Wompi confirms a payment, this activates the membership in FaceGYM.

interface Env {
  WOMPI_EVENTS_SECRET: string;
  // Same merchant integrity secret FaceGYM uses to verify X-Signature
  WOMPI_INTEGRITY_SECRET?: string;
  FACEGYM_API_URL?: string;
  // Backend SECRET_KEY — required by FaceGYM's internal endpoints
  FACEGYM_INTERNAL_API_KEY?: string;
}

interface WompiTransaction {
  id: string;
  status: string;
  amount_in_cents: number;
  reference: string;
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
        env.FACEGYM_API_URL || "https://facegym.powerhousegym.co"
      ).replace(/\/$/, "");

      // Look up the pending payment by reference
      try {
        const internalHeaders: Record<string, string> = {};
        if (env.FACEGYM_INTERNAL_API_KEY) {
          internalHeaders["X-API-Key"] = env.FACEGYM_INTERNAL_API_KEY;
        } else {
          console.error(
            "FACEGYM_INTERNAL_API_KEY not set — pending-payment lookup will be rejected by FaceGYM",
          );
        }

        const lookupResponse = await fetch(
          `${facegymBase}/api/portal/pending-payment/${tx.reference}`,
          { headers: internalHeaders },
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
          member_id?: string;
          amount?: string;
          wompi_reference?: string;
        };

        if (
          pendingData.status !== "found" ||
          !pendingData.plan_id ||
          !pendingData.member_id
        ) {
          // No pending payment in FaceGYM → likely a new membership or PT plan.
          // Send staff notification so they can handle it manually.
          console.log("Payment without pending record — sending notification", {
            reference: tx.reference,
          });
          const planId = parsePlanId(tx.reference);
          const planDescription = formatPlanDescription(planId);
          await sendPaymentNotification(tx, planDescription);
          return new Response("OK", { status: 200 });
        }

        // Activate membership in FaceGYM
        // FaceGYM verifies X-Signature = HMAC-SHA256(integrity_secret, raw body)
        const renewBody = JSON.stringify({
          plan_id: pendingData.plan_id,
          member_id: pendingData.member_id,
          wompi_reference: tx.reference,
          wompi_transaction_id: tx.id,
          amount: pendingData.amount,
        });

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
            memberId: pendingData.member_id,
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
