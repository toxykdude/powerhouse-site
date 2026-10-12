// FaceGYM-facing correlation reference (legacy contract).
//
// FaceGYM's pending-payment endpoints validate `wompi_reference` as
// ^PH-[a-z0-9-]+-\d{10}-[a-f0-9]{6}$ — the format the legacy Wompi rail
// self-generated. The mipago hub assigns its OWN references (PH-01J…
// ULIDs), which FaceGYM rejects with 422. Rather than changing FaceGYM,
// this rail mints a legacy-format correlation reference at creation
// time, stores the FaceGYM pending under it, carries it in the hub
// payment's metadata (echoed back in callbacks), and relays with it.
//
// The hub's reference remains the customer-facing id (support, status
// page); the correlation reference is internal bookkeeping.

/** Same generator as the legacy rail (functions/api/payment/signature.ts). */
export function generateFacegymReference(planId: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const random = Array.from(crypto.getRandomValues(new Uint8Array(3)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `PH-${planId}-${timestamp}-${random}`;
}

/** Picks the FaceGYM-facing reference from a hub callback payment:
 *  metadata.facegym_reference when present (rail-created payments),
 *  falling back to the hub reference (pre-migration events). */
export function facegymReferenceFromMetadata(
  metadata: Record<string, unknown> | undefined,
  hubReference: string,
): string {
  const candidate = metadata?.facegym_reference;
  return typeof candidate === "string" && candidate ? candidate : hubReference;
}
