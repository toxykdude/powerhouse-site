// Thin typed D1 data-access layer for the evaluation system.
//
// Every query binds parameters (never string-concatenates user input) and
// datetime windows use `datetime('now', '-' || CAST(? AS TEXT) || ' minutes')`
// with an integer bind parameter.

import type { RatingKey } from "../../../src/data/evaluation";
import type { EvaluationScores } from "./_score";
import type { D1Database, ValidatedInput } from "./_types";

/** Rating keys → snake_case DB columns, in insertion order. */
const RATING_COLUMNS: readonly { key: RatingKey; column: string }[] = [
  { key: "empathy", column: "empathy" },
  { key: "respect", column: "respect" },
  { key: "attention", column: "attention" },
  { key: "availability", column: "availability" },
  { key: "communication", column: "communication" },
  { key: "motivation", column: "motivation" },
  { key: "technicalExpertise", column: "technical_expertise" },
  { key: "personalizedGuidance", column: "personalized_guidance" },
  { key: "professionalism", column: "professionalism" },
  { key: "overallExperience", column: "overall_experience" },
];

export interface TrainerRow {
  id: number;
  slug: string;
  name: string;
  description: string;
  photo_url: string | null;
  active: number;
  created_at: string;
}

/** Per-trainer aggregate for the private admin analytics endpoint. */
export interface TrainerStatsEntry {
  trainerId: number;
  slug: string;
  name: string;
  evaluationCount: number;
  avgRatings: Record<RatingKey, number>;
  avgOverallScore: number;
  avgExperienceScore: number;
  avgProfessionalScore: number;
  /** (definitely_yes + probably_yes) / count, 0-1. */
  recommendationRate: number;
  recentPositiveFeedback: string[];
  recentImprovementFeedback: string[];
  dailyCountsLast30Days: { date: string; count: number }[];
}

function safeWindowMinutes(windowMinutes: number): number {
  return Math.max(1, Math.trunc(windowMinutes));
}

function round2(value: number | null): number {
  return Math.round((value ?? 0) * 100) / 100;
}

/** Resolve an active trainer by its public slug. */
export async function getTrainerBySlug(
  db: D1Database,
  slug: string,
): Promise<TrainerRow | null> {
  return db
    .prepare(
      "SELECT id, slug, name, description, photo_url, active, created_at FROM trainers WHERE slug = ? AND active = 1",
    )
    .bind(slug)
    .first<TrainerRow>();
}

/** Count evaluations from one hashed IP inside a time window (minutes). */
export async function countRecentByIp(
  db: D1Database,
  ipHash: string,
  windowMinutes: number,
): Promise<number> {
  const row = await db
    .prepare(
      "SELECT COUNT(*) AS count FROM evaluations WHERE ip_hash = ? AND created_at >= datetime('now', '-' || CAST(? AS TEXT) || ' minutes')",
    )
    .bind(ipHash, safeWindowMinutes(windowMinutes))
    .first<{ count: number }>();
  return row?.count ?? 0;
}

/** Count evaluations from one hashed IP for one trainer inside a window. */
export async function countRecentByIpAndTrainer(
  db: D1Database,
  ipHash: string,
  trainerId: number,
  windowMinutes: number,
): Promise<number> {
  const row = await db
    .prepare(
      "SELECT COUNT(*) AS count FROM evaluations WHERE ip_hash = ? AND trainer_id = ? AND created_at >= datetime('now', '-' || CAST(? AS TEXT) || ' minutes')",
    )
    .bind(ipHash, trainerId, safeWindowMinutes(windowMinutes))
    .first<{ count: number }>();
  return row?.count ?? 0;
}

/** Persist a validated evaluation and return the inserted row id. */
export async function insertEvaluation(
  db: D1Database,
  trainerId: number,
  validated: ValidatedInput,
  scores: EvaluationScores,
  ipHash: string,
): Promise<number> {
  const columns = [
    "trainer_id",
    ...RATING_COLUMNS.map((entry) => entry.column),
    "recommendation",
    "membership_duration",
    "positive_feedback",
    "improvement_feedback",
    "additional_comments",
    "overall_score",
    "experience_score",
    "professional_score",
    "ip_hash",
  ];
  const placeholders = columns.map(() => "?").join(", ");
  const values: unknown[] = [
    trainerId,
    ...RATING_COLUMNS.map((entry) => validated.ratings[entry.key]),
    validated.recommendation,
    validated.membershipDuration,
    validated.positiveFeedback,
    validated.improvementFeedback,
    validated.additionalComments,
    scores.overall,
    scores.experience,
    scores.professional,
    ipHash,
  ];

  const row = await db
    .prepare(
      `INSERT INTO evaluations (${columns.join(", ")}) VALUES (${placeholders}) RETURNING id`,
    )
    .bind(...values)
    .first<{ id: number }>();
  if (!row || typeof row.id !== "number") {
    throw new Error("insertEvaluation: D1 did not return an id");
  }
  return row.id;
}

interface TrainerAggregateRow {
  trainer_id: number;
  slug: string;
  name: string;
  evaluation_count: number;
  recommendable_count: number;
  avg_overall_score: number | null;
  avg_experience_score: number | null;
  avg_professional_score: number | null;
}

interface FeedbackRow {
  trainer_id: number;
  text: string;
}

interface DailyCountRow {
  trainer_id: number;
  date: string;
  count: number;
}

function groupByTrainer<T extends { trainer_id: number }>(
  rows: T[],
): Map<number, T[]> {
  const map = new Map<number, T[]>();
  for (const row of rows) {
    const list = map.get(row.trainer_id) ?? [];
    list.push(row);
    map.set(row.trainer_id, list);
  }
  return map;
}

/**
 * Aggregate per-trainer analytics for GET /api/admin/trainer-stats:
 * counts, per-dimension averages, score averages, recommendation rate,
 * the 10 latest feedback texts per type, and last-30-days daily counts.
 */
export async function getTrainerStats(
  db: D1Database,
): Promise<TrainerStatsEntry[]> {
  const aggregateRows = await db
    .prepare(
      `SELECT
        t.id AS trainer_id, t.slug, t.name,
        COUNT(e.id) AS evaluation_count,
        AVG(e.empathy) AS avg_empathy,
        AVG(e.respect) AS avg_respect,
        AVG(e.attention) AS avg_attention,
        AVG(e.availability) AS avg_availability,
        AVG(e.communication) AS avg_communication,
        AVG(e.motivation) AS avg_motivation,
        AVG(e.technical_expertise) AS avg_technical_expertise,
        AVG(e.personalized_guidance) AS avg_personalized_guidance,
        AVG(e.professionalism) AS avg_professionalism,
        AVG(e.overall_experience) AS avg_overall_experience,
        AVG(e.overall_score) AS avg_overall_score,
        AVG(e.experience_score) AS avg_experience_score,
        AVG(e.professional_score) AS avg_professional_score,
        COALESCE(SUM(CASE WHEN e.recommendation IN ('definitely_yes', 'probably_yes') THEN 1 ELSE 0 END), 0) AS recommendable_count
      FROM trainers t
      LEFT JOIN evaluations e ON e.trainer_id = t.id
      GROUP BY t.id, t.slug, t.name
      ORDER BY t.id`,
    )
    .all<TrainerAggregateRow>();

  const positiveRows = await db
    .prepare(
      "SELECT trainer_id, positive_feedback AS text FROM evaluations WHERE positive_feedback IS NOT NULL AND TRIM(positive_feedback) <> '' ORDER BY created_at DESC, id DESC LIMIT 10",
    )
    .all<FeedbackRow>();

  const improvementRows = await db
    .prepare(
      "SELECT trainer_id, improvement_feedback AS text FROM evaluations WHERE improvement_feedback IS NOT NULL AND TRIM(improvement_feedback) <> '' ORDER BY created_at DESC, id DESC LIMIT 10",
    )
    .all<FeedbackRow>();

  const dailyRows = await db
    .prepare(
      "SELECT trainer_id, DATE(created_at) AS date, COUNT(*) AS count FROM evaluations WHERE created_at >= datetime('now', '-30 days') GROUP BY trainer_id, DATE(created_at) ORDER BY date ASC",
    )
    .all<DailyCountRow>();

  const positivesByTrainer = groupByTrainer(positiveRows.results ?? []);
  const improvementsByTrainer = groupByTrainer(improvementRows.results ?? []);
  const dailyByTrainer = groupByTrainer(dailyRows.results ?? []);

  return (aggregateRows.results ?? []).map((row) => {
    const rowRecord = row as unknown as Record<string, unknown>;
    const avgRatings = {} as Record<RatingKey, number>;
    for (const entry of RATING_COLUMNS) {
      avgRatings[entry.key] = round2(
        rowRecord[`avg_${entry.column}`] as number | null,
      );
    }
    return {
      trainerId: row.trainer_id,
      slug: row.slug,
      name: row.name,
      evaluationCount: row.evaluation_count,
      avgRatings,
      avgOverallScore: round2(row.avg_overall_score),
      avgExperienceScore: round2(row.avg_experience_score),
      avgProfessionalScore: round2(row.avg_professional_score),
      recommendationRate:
        row.evaluation_count > 0
          ? row.recommendable_count / row.evaluation_count
          : 0,
      recentPositiveFeedback: (
        positivesByTrainer.get(row.trainer_id) ?? []
      ).map((feedback) => feedback.text),
      recentImprovementFeedback: (
        improvementsByTrainer.get(row.trainer_id) ?? []
      ).map((feedback) => feedback.text),
      dailyCountsLast30Days: (dailyByTrainer.get(row.trainer_id) ?? []).map(
        (daily) => ({ date: daily.date, count: daily.count }),
      ),
    };
  });
}
