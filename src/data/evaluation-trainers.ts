/**
 * evaluation-trainers.ts — trainers selectable in the customer evaluation
 * flow (/evaluacion), in display order.
 *
 * This list is intentionally SEPARATE from src/data/trainers.ts so the
 * marketing homepage keeps its own curation. Every entry reuses its
 * official trainer profile (name, role, bio, photo) — all three current
 * trainers (Harold, Esteban, Brayan) have site profiles with photos.
 *
 * Consumed by:
 *  - src/pages/evaluacion/index.astro (trainer selection cards)
 *  - src/pages/evaluacion/[slug].astro (getStaticPaths + SEO)
 *
 * The database seed (migrations/0002_seed_trainers.sql) must stay in sync
 * with the slugs in this file — the API resolves trainers by slug.
 */

import { trainers, type Trainer } from "./trainers";

/** Minimal shape the evaluation UI needs for a trainer. */
export interface EvaluationTrainer {
  slug: string;
  name: string;
  role: string;
  bio: string;
  photo?: string;
  alt?: string;
}

/** Slugs accepted by POST /api/evaluations (also the DB seed set). */
export const EVALUATION_TRAINER_SLUGS: readonly string[] = [
  "harold-giraldo",
  "esteban-morales",
  "brayan-molina",
];

/** Reuse an official trainer record from trainers.ts, trimmed to the eval shape. */
function fromTrainerProfile(slug: string): EvaluationTrainer {
  const profile = trainers.find(
    (trainer): trainer is Trainer & { slug: string } =>
      trainer.slug !== undefined && trainer.slug === slug,
  );
  if (!profile) {
    throw new Error(`evaluation-trainers: trainer profile not found: ${slug}`);
  }
  return {
    slug: profile.slug,
    name: profile.name,
    role: profile.role,
    bio: profile.bio,
    photo: profile.photo,
    alt: profile.alt,
  };
}

const harold = fromTrainerProfile("harold-giraldo");
const esteban = fromTrainerProfile("esteban-morales");
const brayan = fromTrainerProfile("brayan-molina");

/**
 * Trainers available for evaluation, in display order.
 *
 * NOTE: keep this aligned with the current PowerHouse staff. If a trainer
 * leaves or joins, update this list + migrations/0002_seed_trainers.sql
 * (or the trainers table directly in production D1).
 */
export const evaluationTrainers: readonly EvaluationTrainer[] = [
  harold,
  esteban,
  brayan,
];

/** Resolve an evaluation trainer by slug (used by getStaticPaths). */
export function getEvaluationTrainer(
  slug: string,
): EvaluationTrainer | undefined {
  return evaluationTrainers.find((trainer) => trainer.slug === slug);
}
