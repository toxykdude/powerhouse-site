// Scoring model for trainer evaluations.
//
// Pure functions — no I/O. Grouping comes from the shared questionnaire
// config (src/data/evaluation.ts) so the analytics model can be re-tuned by
// editing scoreGroup flags there, not here.

import {
  evaluationCategories,
  type RatingsMap,
} from "../../../src/data/evaluation";

export interface EvaluationScores {
  /** Mean of all 10 rated dimensions (includes the overallExperience question). */
  overall: number;
  /** Mean of the 7 customer-experience dimensions. */
  experience: number;
  /** Mean of technicalExpertise + personalizedGuidance only. */
  professional: number;
}

/** Round a mean to 2 decimal places. */
function meanRounded(values: number[]): number {
  const sum = values.reduce((acc, value) => acc + value, 0);
  return Math.round((sum / values.length) * 100) / 100;
}

/**
 * Compute the three scores from a validated ratings map.
 *
 * Business rule: the overallExperience question contributes ONLY to the
 * overall score — experience/professional stay comparable across trainers.
 */
export function computeScores(ratings: RatingsMap): EvaluationScores {
  const experience = meanRounded(
    evaluationCategories
      .filter((category) => category.scoreGroup === "experience")
      .map((category) => ratings[category.key]),
  );
  const professional = meanRounded(
    evaluationCategories
      .filter((category) => category.scoreGroup === "professional")
      .map((category) => ratings[category.key]),
  );
  const overall = meanRounded(
    evaluationCategories.map((category) => ratings[category.key]),
  );
  return { overall, experience, professional };
}
