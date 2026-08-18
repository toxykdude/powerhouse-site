// Cloudflare Pages Function — Generate Wompi integrity signature
// Environment variables: WOMPI_PUBLIC_KEY, WOMPI_INTEGRITY_SECRET (set in Cloudflare dashboard)

interface Env {
  WOMPI_PUBLIC_KEY: string;
  WOMPI_INTEGRITY_SECRET: string;
}

export interface PlanConfig {
  name: string;
  amountInCents: number;
  currency: string;
  /** FaceGYM membership_plans.id for the 4 gym plans (design D7).
   *  Single Pages-side source of truth — renovar/comprar consume it from
   *  this endpoint's response instead of hardcoding UUIDs. PT plans have
   *  no facegymId: they are staff-managed, never guest-provisioned. */
  facegymId?: string;
}

// Plan data — must match planes.astro exactly
export const PLANS: Record<string, PlanConfig> = {
  mensual: {
    name: "Membresía Mensual",
    amountInCents: 6990000,
    currency: "COP",
    facegymId: "45d96de3-a086-427a-9a8a-44351abb6423",
  },
  trimestral: {
    name: "Plan Trimestral",
    amountInCents: 19500000,
    currency: "COP",
    facegymId: "dab31efd-aff9-4554-99d5-40f255af7734",
  },
  semestral: {
    name: "Plan Semestral",
    amountInCents: 37500000,
    currency: "COP",
    facegymId: "6ec2b4c7-1d89-4625-9402-d78cc22ff4b5",
  },
  anual: {
    name: "Plan Anual",
    amountInCents: 62000000,
    currency: "COP",
    facegymId: "dbf0f5a4-cabb-4c73-991e-3e8b694282bf",
  },

  // Trainer personal-training plans — amounts MUST match trainers.ts buildPricing totals exactly.
  // Each amountInCents is the displayed total (PT + $69.900 membership) × 100.
  "pt-esteban-morales-12": { name: "PT Esteban Morales · 12 clases/mes", amountInCents: 33990000, currency: "COP" },
  "pt-esteban-morales-16": { name: "PT Esteban Morales · 16 clases/mes", amountInCents: 41990000, currency: "COP" },
  "pt-esteban-morales-20": { name: "PT Esteban Morales · 20 clases/mes", amountInCents: 46990000, currency: "COP" },
  "pt-harold-giraldo-12": { name: "PT Harold Giraldo · 12 clases/mes", amountInCents: 33990000, currency: "COP" },
  "pt-harold-giraldo-16": { name: "PT Harold Giraldo · 16 clases/mes", amountInCents: 41990000, currency: "COP" },
  "pt-harold-giraldo-20": { name: "PT Harold Giraldo · 20 clases/mes", amountInCents: 46990000, currency: "COP" },
  "pt-brayan-molina-12": { name: "PT Brayan Molina · 12 clases/mes", amountInCents: 36990000, currency: "COP" },
  "pt-brayan-molina-16": { name: "PT Brayan Molina · 16 clases/mes", amountInCents: 44990000, currency: "COP" },
  "pt-brayan-molina-20": { name: "PT Brayan Molina · 20 clases/mes", amountInCents: 48990000, currency: "COP" },
};

function generateReference(planId: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const random = Array.from(crypto.getRandomValues(new Uint8Array(3)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `PH-${planId}-${timestamp}-${random}`;
}

async function sha256(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function generateSignature(
  reference: string,
  amountInCents: number,
  currency: string,
  secret: string,
): Promise<string> {
  // Wompi integrity signature: SHA256(reference + amount_in_cents + currency + integrity_secret)
  const concatenated = `${reference}${amountInCents}${currency}${secret}`;
  return sha256(concatenated);
}

export async function onRequestPost({
  request,
  env,
}: {
  request: Request;
  env: Env;
}) {
  try {
    const body = (await request.json()) as { plan?: string };
    const planId = body.plan;

    if (!planId || !PLANS[planId]) {
      return new Response(
        JSON.stringify({
          error: `Plan inválido. Planes disponibles: ${Object.keys(PLANS).join(", ")}`,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const plan = PLANS[planId];
    const reference = generateReference(planId);
    const signature = await generateSignature(
      reference,
      plan.amountInCents,
      plan.currency,
      env.WOMPI_INTEGRITY_SECRET,
    );

    return new Response(
      JSON.stringify({
        reference,
        signature,
        amountInCents: plan.amountInCents,
        currency: plan.currency,
        publicKey: env.WOMPI_PUBLIC_KEY,
        planName: plan.name,
        facegymPlanId: plan.facegymId,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch {
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
