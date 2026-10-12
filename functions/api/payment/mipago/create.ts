// Cloudflare Pages Function — POST /api/payment/mipago/create
//
// Creates a payment on the mipago.online hub (server-to-server), stores
// the matching pending record in FaceGYM, and returns the hosted
// checkout_url for the browser to redirect to. The hub owns the entire
// Wompi/PCI scope — no payment widget is embedded on our side.
//
// Environment (Cloudflare Pages dashboard):
//   MIPAGO_ENABLED            — "true"/"1" turns the rail on; anything
//                               else returns 503 so the frontend falls
//                               back to the legacy Wompi widget.
//   MIPAGO_API_KEY            — hub tenant key (required when enabled)
//   MIPAGO_API_URL            — optional staging override
//   MIPAGO_KV                 — optional KV binding (payment registry)
//   FACEGYM_API_URL           — backend base (defaults to production)
//
// Amounts are computed HERE from the PLANS table (cents → pesos). The
// client only ever sends a plan key — never an amount.

import { PLANS } from "../signature";
import { createHubPayment, planAmountPesos, type MipagoEnv } from "./_client";
import { generateFacegymReference } from "./_reference";
import { recordCreatedPayment, type MipagoKV } from "./_registry";

type Env = MipagoEnv;

interface CreateBody {
  plan?: string;
  name?: string;
  email?: string;
  phone?: string;
}

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function facegymBase(env: Env): string {
  return (env.FACEGYM_API_URL || "https://faceapp.powerhousegym.co").replace(
    /\/$/,
    "",
  );
}

/** Best-effort member profile lookup for the hub buyer-form prefill.
 *  Parses FaceGYM's /api/portal/me defensively (email/name field names
 *  vary); on any failure returns nulls — the hub's buyer form simply
 *  asks the customer for what is missing. We never invent an email:
 *  the hub sends receipts to this address. */
async function lookupMemberProfile(
  env: Env,
  authorization: string,
): Promise<{ email: string | null; name: string | null }> {
  try {
    const res = await fetch(`${facegymBase(env)}/api/portal/me`, {
      headers: { Authorization: authorization },
    });
    if (!res.ok) return { email: null, name: null };
    const data = (await res.json()) as Record<string, unknown>;
    const email =
      typeof data.email === "string" && data.email.includes("@")
        ? data.email
        : null;
    const rawName = data.name ?? data.full_name ?? data.nombre;
    const name =
      typeof rawName === "string" && rawName.trim() ? rawName.trim() : null;
    return { email, name };
  } catch (err) {
    console.warn("mipago: member profile lookup failed (prefill skipped)", err);
    return { email: null, name: null };
  }
}

/** Colombian mobile → E.164-ish digit string for the hub buyer form
 *  (10 local digits get the 57 country prefix; 57+10 passes through). */
function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (/^\d{10}$/.test(digits)) return `57${digits}`;
  if (/^57\d{10}$/.test(digits)) return digits;
  return null;
}

function isEnabled(env: Env): boolean {
  return env.MIPAGO_ENABLED === "true" || env.MIPAGO_ENABLED === "1";
}

export async function onRequestPost({
  request,
  env,
}: {
  request: Request;
  env: Env;
}): Promise<Response> {
  try {
    if (!isEnabled(env)) {
      // Frontend treats this as "keep the legacy rail" — not an error.
      return json({ error: "mipago_disabled" }, 503);
    }
    if (!env.MIPAGO_API_KEY) {
      console.error("mipago: MIPAGO_API_KEY not configured — failing closed");
      return json({ error: "Pasarela no disponible. Intenta más tarde." }, 503);
    }

    const body = (await request.json().catch(() => ({}))) as CreateBody;
    const planId = body.plan;
    if (!planId || !PLANS[planId]) {
      return json(
        {
          error: `Plan inválido. Planes disponibles: ${Object.keys(PLANS).join(", ")}`,
        },
        400,
      );
    }
    const plan = PLANS[planId];

    const authorization = request.headers.get("Authorization");
    const isMember = Boolean(authorization);

    // Guests must identify themselves (the pending record needs a name,
    // phone and email to provision the member in FaceGYM). Members are
    // identified by their JWT; their profile (for the hub buyer-form
    // prefill) comes from FaceGYM — never fabricated.
    let customerEmail = "";
    let customerName = "";
    let customerPhone: string | null = null;
    let guestName = "";
    let guestPhone = "";

    if (authorization) {
      const profile = await lookupMemberProfile(env, authorization);
      if (profile.email) customerEmail = profile.email;
      if (profile.name) customerName = profile.name;
    }

    if (!isMember) {
      // Site policy (guest-purchase spec): PT plans are not guest-purchasable.
      if (!plan.facegymId) {
        return json(
          {
            error:
              "Este plan no está disponible para compra en línea. Contáctanos por WhatsApp.",
          },
          400,
        );
      }
      guestName = (body.name ?? "").trim();
      guestPhone = (body.phone ?? "").trim();
      customerEmail = (body.email ?? "").trim();
      customerName = guestName;
      if (guestName.length < 2) {
        return json({ error: "Escribe tu nombre completo." }, 400);
      }
      const normalized = normalizePhone(guestPhone);
      if (!normalized) {
        return json(
          {
            error:
              "El celular debe ser un móvil colombiano (10 dígitos, o 57 + 10).",
          },
          400,
        );
      }
      customerPhone = normalized;
      // FaceGYM guest pending keeps the digit string it receives today.
      guestPhone = normalized;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
        return json({ error: "Escribe un email válido." }, 400);
      }
    }

    const amountPesos = planAmountPesos(plan.amountInCents);

    // FaceGYM-facing correlation reference: FaceGYM validates
    // wompi_reference against the legacy format, so pending records are
    // stored under this id and mapped back via hub metadata.
    const facegymRef = generateFacegymReference(planId);

    // 1. Create the payment on the hub. The hub assigns the reference
    //    (PH-01J…) — we never generate references on this rail. The
    //    customer object prefills the hub's buyer form; when we have no
    //    member email the form collects it (never fabricate one — the
    //    hub sends receipts there). return_url must be https + on the
    //    tenant's allowed origins or the hub rejects the create; the
    //    hub appends ?mipago=<payment_id>, which confirmacion.astro
    //    polls via the status API — the redirect itself proves nothing.
    const created = await createHubPayment(env, {
      amount: amountPesos,
      description: `${plan.name} — PowerHouse Gym`,
      customer: {
        ...(customerEmail ? { email: customerEmail } : {}),
        name: customerName || "Miembro PowerHouse Gym",
        ...(customerPhone ? { phone: customerPhone } : {}),
      },
      return_url:
        env.MIPAGO_RETURN_URL || "https://powerhousegym.co/pago/confirmacion",
      metadata: {
        plan_key: planId,
        plan_id: plan.facegymId ?? null,
        facegym_reference: facegymRef,
        scope: isMember ? "member" : "guest",
        origin: "powerhouse-web",
      },
    });
    if (!created.ok) {
      return json({ error: created.error }, created.status);
    }
    const { payment } = created;

    // 2. Store the pending record in FaceGYM BEFORE handing out the
    //    checkout URL, so the callback can provision/renew even if this
    //    browser never comes back. Mirrors the legacy flow's ordering.
    if (plan.facegymId) {
      if (isMember) {
        // Legacy member flow tolerates a failed pending store (webhook
        // falls back to the manual staff path) — keep that behavior.
        try {
          const res = await fetch(
            `${facegymBase(env)}/api/portal/pending-payment`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(authorization ? { Authorization: authorization } : {}),
              },
              body: JSON.stringify({
                plan_id: plan.facegymId,
                member_id: "", // FaceGYM fills this from the JWT
                wompi_reference: facegymRef,
                wompi_transaction_id: "",
                amount: amountPesos,
              }),
            },
          );
          if (!res.ok) {
            console.warn(
              "mipago: member pending store failed (continuing — manual path covers it)",
              {
                status: res.status,
                reference: payment.reference,
              },
            );
          }
        } catch (err) {
          console.warn("mipago: member pending store threw (continuing)", err);
        }
      } else {
        // Guest flow fails closed (legacy comprar behavior): without the
        // pending record an approved guest payment cannot provision a
        // member automatically — refuse instead of paying blind.
        try {
          const res = await fetch(
            `${facegymBase(env)}/api/portal/pending-payment/guest`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                wompi_reference: facegymRef,
                guest_name: guestName,
                guest_phone: guestPhone,
                guest_email: customerEmail,
                plan_id: plan.facegymId,
              }),
            },
          );
          if (!res.ok) {
            console.error(
              "mipago: guest pending store failed — refusing to continue",
              {
                status: res.status,
                reference: payment.reference,
              },
            );
            // The hub payment is left CREATED and will simply expire.
            return json(
              {
                error:
                  "No pudimos registrar tus datos. Verifícalos e intenta de nuevo.",
              },
              502,
            );
          }
        } catch (err) {
          console.error(
            "mipago: guest pending store threw — refusing to continue",
            err,
          );
          return json(
            {
              error:
                "No pudimos registrar tus datos. Verifícalos e intenta de nuevo.",
            },
            502,
          );
        }
      }
    }

    // 3. Local record for the reconcile job (runbook step 1 + step 5).
    const kv = (env.MIPAGO_KV as MipagoKV | undefined) ?? undefined;
    await recordCreatedPayment(kv, {
      payment_id: payment.id,
      reference: payment.reference,
      facegym_reference: facegymRef,
      plan_key: planId,
      amount_pesos: amountPesos,
      created_at: Math.floor(Date.now() / 1000),
      status: "open",
    });

    // 4. Hand the hosted checkout URL to the browser.
    return json(
      {
        checkout_url: payment.checkout_url,
        reference: payment.reference,
        payment_id: payment.id,
        expires_at: payment.expires_at ?? null,
      },
      200,
    );
  } catch (error) {
    console.error("mipago: create endpoint error", error);
    return json({ error: "Error interno del servidor" }, 500);
  }
}
