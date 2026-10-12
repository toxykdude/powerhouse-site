// KV-backed registry for the mipago rail.
//
// Bindings (Cloudflare Pages dashboard → Settings → Bindings → KV):
//   MIPAGO_KV — KV namespace
//
// Two uses:
//   1. "Persist a local record now" (runbook step 1): every created hub
//      payment is recorded so the reconcile job can find orders whose
//      callback never arrived.
//   2. Event-id dedup (runbook step 4): the hub retries callbacks; each
//      X-Mipago-Event-Id must be processed exactly once.
//
// The binding is OPTIONAL by design (side-by-side rollout): when absent,
// every helper degrades to a no-op and the endpoint still works — the
// FaceGYM pending-record consumption remains the final fulfillment
// idempotency guard, exactly as it is for the legacy Wompi webhook.

export interface MipagoKV {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void>;
  list(options?: { prefix?: string }): Promise<{
    keys: { name: string; metadata?: unknown }[];
  }>;
  delete(key: string): Promise<void>;
}

export interface PaymentRecord {
  payment_id: string;
  reference: string;
  /** FaceGYM-facing legacy-format correlation reference (pending store
   *  + relay payload). FaceGYM validates the reference shape, and hub
   *  references (PH-01J…) do not match it. */
  facegym_reference: string;
  plan_key: string;
  amount_pesos: number;
  created_at: number; // unix seconds
  /** open = awaiting outcome; fulfilled = relayed to FaceGYM (or manual
   *  path resolved); final = reached a non-approved final state. */
  status: "open" | "fulfilled" | "final";
  final_status?: string;
}

const PAYMENT_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const EVENT_TTL_SECONDS = 48 * 60 * 60; // 48 hours

const paymentKey = (paymentId: string) => `payment:${paymentId}`;

export async function recordCreatedPayment(
  kv: MipagoKV | undefined,
  record: PaymentRecord,
): Promise<void> {
  if (!kv) return;
  await kv.put(paymentKey(record.payment_id), JSON.stringify(record), {
    expirationTtl: PAYMENT_TTL_SECONDS,
  });
}

export async function getPaymentRecord(
  kv: MipagoKV | undefined,
  paymentId: string,
): Promise<PaymentRecord | null> {
  if (!kv) return null;
  const raw = await kv.get(paymentKey(paymentId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PaymentRecord;
  } catch {
    return null;
  }
}

export async function updatePaymentRecord(
  kv: MipagoKV | undefined,
  record: PaymentRecord,
): Promise<void> {
  if (!kv) return;
  await kv.put(paymentKey(record.payment_id), JSON.stringify(record), {
    expirationTtl: PAYMENT_TTL_SECONDS,
  });
}

export async function listOpenPayments(
  kv: MipagoKV | undefined,
): Promise<PaymentRecord[]> {
  if (!kv) return [];
  const listed = await kv.list({ prefix: "payment:" });
  const records: PaymentRecord[] = [];
  for (const key of listed.keys) {
    const raw = await kv.get(key.name);
    if (!raw) continue;
    try {
      records.push(JSON.parse(raw) as PaymentRecord);
    } catch {
      // Corrupt entry — skip rather than break reconciliation.
    }
  }
  return records;
}

/** Returns true when this event id was already processed. */
export async function isEventProcessed(
  kv: MipagoKV | undefined,
  eventId: string,
): Promise<boolean> {
  if (!kv || !eventId) return false;
  return (await kv.get(`event:${eventId}`)) !== null;
}

/** Marks an event id as processed. Call ONLY after the event's side
 *  effects succeeded, so hub retries can re-attempt failed fulfillment. */
export async function markEventProcessed(
  kv: MipagoKV | undefined,
  eventId: string,
): Promise<void> {
  if (!kv || !eventId) return;
  await kv.put(`event:${eventId}`, "1", { expirationTtl: EVENT_TTL_SECONDS });
}
