// Strict hand-rolled validation for POST /api/evaluations bodies.
//
// NO schema library (zero-dependency repo): every rule is checked explicitly
// and produces field-scoped Spanish (es-CO) messages suitable for the UI.
// The questionnaire shape (keys, enums, limits) comes from the shared
// src/data/evaluation.ts config — never duplicated here.

import {
  MAX_COMMENT_LENGTH,
  MEMBERSHIP_DURATION_OPTIONS,
  RECOMMENDATION_OPTIONS,
  getRatingKeys,
  ratingKeyLabel,
  type MembershipDuration,
  type Rating1to5,
  type RatingKey,
  type Recommendation,
} from "../../../src/data/evaluation";
import type { ValidatedInput, ValidationIssue } from "./_types";

const SLUG_PATTERN = /^[a-z0-9-]+$/;
const MAX_SLUG_LENGTH = 100;

// Control characters except \n (0x0A) and \t (0x09): C0 range minus tab/LF,
// plus DEL (0x7F). Stripped before length-checking comments.
const CONTROL_CHARS_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export type ValidationResult =
  | { ok: true; value: ValidatedInput }
  | { ok: false; issues: ValidationIssue[] };

/**
 * Validate a parsed JSON body (unknown) against the questionnaire contract.
 * Collects ALL issues instead of failing on the first one so the UI can mark
 * every wrong answer at once.
 */
export function validateEvaluationBody(raw: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return {
      ok: false,
      issues: [{ field: "body", message: "La evaluación no es válida" }],
    };
  }
  const body = raw as Record<string, unknown>;

  // --- trainerSlug ---------------------------------------------------------
  const trainerSlug = body.trainerSlug;
  if (
    typeof trainerSlug !== "string" ||
    trainerSlug.length === 0 ||
    trainerSlug.length > MAX_SLUG_LENGTH ||
    !SLUG_PATTERN.test(trainerSlug)
  ) {
    issues.push({
      field: "trainerSlug",
      message: "Debes seleccionar un entrenador válido",
    });
  }

  // --- ratings (exactly the 10 configured keys, integer 1-5 each) ----------
  const ratingKeys = getRatingKeys();
  const ratings = {} as Record<RatingKey, Rating1to5>;
  const rawRatings = body.ratings;

  if (
    typeof rawRatings !== "object" ||
    rawRatings === null ||
    Array.isArray(rawRatings)
  ) {
    issues.push({
      field: "ratings",
      message: "Faltan las calificaciones del entrenador",
    });
  } else {
    const ratingsObject = rawRatings as Record<string, unknown>;

    for (const key of ratingKeys) {
      const value = ratingsObject[key];
      if (value === undefined || value === null) {
        issues.push({
          field: `ratings.${key}`,
          message: `La calificación de ${ratingKeyLabel(key)} es obligatoria`,
        });
        continue;
      }
      // typeof + Number.isInteger rejects '4' (string), 4.5, true and NaN.
      if (
        typeof value !== "number" ||
        !Number.isInteger(value) ||
        value < 1 ||
        value > 5
      ) {
        issues.push({
          field: `ratings.${key}`,
          message: `La calificación de ${ratingKeyLabel(key)} debe estar entre 1 y 5`,
        });
        continue;
      }
      ratings[key] = value as Rating1to5;
    }

    for (const key of Object.keys(ratingsObject)) {
      if (!(ratingKeys as readonly string[]).includes(key)) {
        issues.push({
          field: `ratings.${key}`,
          message: "Esta calificación no existe en el cuestionario",
        });
      }
    }
  }

  // --- recommendation ------------------------------------------------------
  const recommendationValues = RECOMMENDATION_OPTIONS.map(
    (option) => option.value,
  ) as readonly string[];
  const recommendation = body.recommendation;
  if (
    typeof recommendation !== "string" ||
    !recommendationValues.includes(recommendation)
  ) {
    issues.push({
      field: "recommendation",
      message: "Debes seleccionar una recomendación válida",
    });
  }

  // --- membershipDuration (optional enum) ----------------------------------
  const membershipValues = MEMBERSHIP_DURATION_OPTIONS.map(
    (option) => option.value,
  ) as readonly string[];
  const rawMembership = body.membershipDuration;
  let membershipDuration: MembershipDuration | null = null;
  if (rawMembership === undefined || rawMembership === null) {
    membershipDuration = null;
  } else if (
    typeof rawMembership === "string" &&
    membershipValues.includes(rawMembership)
  ) {
    membershipDuration = rawMembership as MembershipDuration;
  } else {
    issues.push({
      field: "membershipDuration",
      message: "El tiempo en PowerHouse no es válido",
    });
  }

  // --- open feedback (optional, sanitized) ---------------------------------
  const positiveFeedback = sanitizeOptionalComment(
    body.positiveFeedback,
    "positiveFeedback",
    issues,
  );
  const improvementFeedback = sanitizeOptionalComment(
    body.improvementFeedback,
    "improvementFeedback",
    issues,
  );
  const additionalComments = sanitizeOptionalComment(
    body.additionalComments,
    "additionalComments",
    issues,
  );

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    value: {
      trainerSlug: trainerSlug as string,
      ratings,
      recommendation: recommendation as Recommendation,
      membershipDuration,
      positiveFeedback,
      improvementFeedback,
      additionalComments,
    },
  };
}

/**
 * Normalize an optional comment: trim + strip control characters (keeping
 * \n and \t), then enforce MAX_COMMENT_LENGTH. Pushes a Spanish issue and
 * returns null when invalid.
 */
function sanitizeOptionalComment(
  value: unknown,
  field: string,
  issues: ValidationIssue[],
): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    issues.push({ field, message: "El comentario debe ser un texto" });
    return null;
  }
  const sanitized = value.replace(CONTROL_CHARS_PATTERN, "").trim();
  if (sanitized.length > MAX_COMMENT_LENGTH) {
    issues.push({
      field,
      message: `El comentario no puede superar ${MAX_COMMENT_LENGTH} caracteres`,
    });
    return null;
  }
  return sanitized;
}
