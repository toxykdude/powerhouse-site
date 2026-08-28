// Shared types for the trainer evaluation API (functions/api/evaluations).
//
// Minimal structural D1 types are declared locally so the repo does NOT need
// @cloudflare/workers-types as a dependency — they cover exactly the surface
// used by _store.ts and stay compatible with the real runtime bindings.

import type {
  MembershipDuration,
  Rating1to5,
  RatingKey,
  Recommendation,
  RatingsMap,
} from "../../../src/data/evaluation";

// ---------------------------------------------------------------------------
// Environment (Cloudflare Pages Functions bindings + vars)
// ---------------------------------------------------------------------------

export interface Env {
  /** Cloudflare D1 database binding (evaluations + trainers tables). */
  DB: D1Database;
  /** Email delivery mode: 'resend' uses the Resend API, anything else logs. */
  EMAIL_PROVIDER?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  EVALUATIONS_TO_EMAIL?: string;
  /** Salt for hashing visitor IPs (rate limiting + duplicate detection). */
  RATE_LIMIT_SALT?: string;
  /** Cloudflare Turnstile secret — when unset, verification is skipped (dev). */
  TURNSTILE_SECRET_KEY?: string;
  /** Shared secret for GET /api/admin/trainer-stats. */
  ADMIN_API_KEY?: string;
  /** Max evaluations per hashed IP per hour (string env var, parsed as int). */
  EVAL_RATE_LIMIT_PER_HOUR?: string;
  /** Duplicate window per trainer per hashed IP, in minutes. */
  EVAL_DUPLICATE_WINDOW_MIN?: string;
}

// ---------------------------------------------------------------------------
// Minimal structural D1 types (no @cloudflare/workers-types dependency)
// ---------------------------------------------------------------------------

export interface D1Result<T = unknown> {
  results?: T[];
  success: boolean;
  meta?: unknown;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T>(col?: string): Promise<T | null>;
  all<T>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

/** Fully validated evaluation payload, ready to score and persist. */
export interface ValidatedInput {
  trainerSlug: string;
  ratings: RatingsMap;
  recommendation: Recommendation;
  membershipDuration: MembershipDuration | null;
  positiveFeedback: string | null;
  improvementFeedback: string | null;
  additionalComments: string | null;
}

/** A single field-scoped validation problem (Spanish message, es-CO). */
export interface ValidationIssue {
  field: string;
  message: string;
}

/** Convenience alias used while validating rating maps. */
export type RatingsInput = Record<RatingKey, Rating1to5>;
