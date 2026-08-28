import { describe, it, expect } from "vitest";
import { validateEvaluationBody } from "../../functions/api/evaluations/_validate";
import {
  MAX_COMMENT_LENGTH,
  getRatingKeys,
  ratingKeyLabel,
} from "../../src/data/evaluation";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validRatings(): Record<string, number> {
  const ratings: Record<string, number> = {};
  for (const key of getRatingKeys()) {
    ratings[key] = 4;
  }
  return ratings;
}

function validBody(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    trainerSlug: "harold-giraldo",
    ratings: validRatings(),
    recommendation: "probably_yes",
    membershipDuration: "3_6_months",
    positiveFeedback: "Gran entrenador",
    improvementFeedback: null,
    additionalComments: undefined,
    ...overrides,
  };
}

function hasIssue(
  result: ReturnType<typeof validateEvaluationBody>,
  field: string,
) {
  if (!result.ok) {
    return result.issues.some((issue) => issue.field === field);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("validateEvaluationBody", () => {
  it("accepts a fully valid payload", () => {
    const result = validateEvaluationBody(validBody());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.trainerSlug).toBe("harold-giraldo");
    expect(result.value.recommendation).toBe("probably_yes");
    expect(result.value.membershipDuration).toBe("3_6_months");
    expect(result.value.positiveFeedback).toBe("Gran entrenador");
    expect(result.value.improvementFeedback).toBeNull();
    expect(result.value.additionalComments).toBeNull();
    for (const key of getRatingKeys()) {
      expect(result.value.ratings[key]).toBe(4);
    }
  });

  it("rejects a non-object body", () => {
    expect(validateEvaluationBody(null).ok).toBe(false);
    expect(validateEvaluationBody("nope").ok).toBe(false);
    expect(validateEvaluationBody([1, 2, 3]).ok).toBe(false);
  });

  it("rejects an invalid trainer slug", () => {
    const result = validateEvaluationBody(
      validBody({ trainerSlug: "Harold Giraldo!" }),
    );
    expect(hasIssue(result, "trainerSlug")).toBe(true);
  });

  it("rejects an over-long trainer slug", () => {
    const result = validateEvaluationBody({
      ...validBody(),
      trainerSlug: "a".repeat(101),
    });
    expect(hasIssue(result, "trainerSlug")).toBe(true);
  });

  it("rejects a missing rating key with a field-scoped issue", () => {
    const body = validBody();
    delete (body.ratings as Record<string, number>).respect;

    const result = validateEvaluationBody(body);

    expect(result.ok).toBe(false);
    expect(hasIssue(result, "ratings.respect")).toBe(true);
    if (result.ok) return;
    expect(result.issues[0].message).toContain(ratingKeyLabel("respect"));
  });

  it("rejects a rating of 0", () => {
    const result = validateEvaluationBody(
      validBody({ ratings: { ...validRatings(), empathy: 0 } }),
    );
    expect(hasIssue(result, "ratings.empathy")).toBe(true);
  });

  it("rejects a rating of 6", () => {
    const result = validateEvaluationBody(
      validBody({ ratings: { ...validRatings(), empathy: 6 } }),
    );
    expect(hasIssue(result, "ratings.empathy")).toBe(true);
  });

  it("rejects string ratings like '4'", () => {
    const result = validateEvaluationBody(
      validBody({ ratings: { ...validRatings(), empathy: "4" } }),
    );
    expect(hasIssue(result, "ratings.empathy")).toBe(true);
  });

  it("rejects boolean ratings", () => {
    const result = validateEvaluationBody(
      validBody({ ratings: { ...validRatings(), empathy: true } }),
    );
    expect(hasIssue(result, "ratings.empathy")).toBe(true);
  });

  it("rejects NaN ratings", () => {
    const result = validateEvaluationBody(
      validBody({ ratings: { ...validRatings(), empathy: Number.NaN } }),
    );
    expect(hasIssue(result, "ratings.empathy")).toBe(true);
  });

  it("rejects non-integer ratings like 4.5", () => {
    const result = validateEvaluationBody(
      validBody({ ratings: { ...validRatings(), empathy: 4.5 } }),
    );
    expect(hasIssue(result, "ratings.empathy")).toBe(true);
  });

  it("rejects unknown extra rating keys", () => {
    const result = validateEvaluationBody(
      validBody({ ratings: { ...validRatings(), patience: 5 } }),
    );
    expect(hasIssue(result, "ratings.patience")).toBe(true);
  });

  it("rejects a rating value outside the 1-5 range with the spec message", () => {
    const result = validateEvaluationBody(
      validBody({ ratings: { ...validRatings(), empathy: 9 } }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const issue = result.issues.find(
      (item) => item.field === "ratings.empathy",
    );
    expect(issue?.message).toBe(
      `La calificación de ${ratingKeyLabel("empathy")} debe estar entre 1 y 5`,
    );
  });

  it("rejects an invalid recommendation", () => {
    const result = validateEvaluationBody(
      validBody({ recommendation: "maybe" }),
    );
    expect(hasIssue(result, "recommendation")).toBe(true);
  });

  it("rejects an invalid membership duration", () => {
    const result = validateEvaluationBody(
      validBody({ membershipDuration: "2_months" }),
    );
    expect(hasIssue(result, "membershipDuration")).toBe(true);
  });

  it("allows membership duration to be null or undefined", () => {
    expect(
      validateEvaluationBody(validBody({ membershipDuration: null })).ok,
    ).toBe(true);
    expect(
      validateEvaluationBody(validBody({ membershipDuration: undefined })).ok,
    ).toBe(true);
  });

  it(`rejects comments longer than ${MAX_COMMENT_LENGTH} characters`, () => {
    const result = validateEvaluationBody(
      validBody({ positiveFeedback: "a".repeat(MAX_COMMENT_LENGTH + 1) }),
    );
    expect(hasIssue(result, "positiveFeedback")).toBe(true);
  });

  it("accepts a comment at exactly the max length", () => {
    const result = validateEvaluationBody(
      validBody({ improvementFeedback: "b".repeat(MAX_COMMENT_LENGTH) }),
    );
    expect(result.ok).toBe(true);
  });

  it("strips control characters but keeps newlines and tabs", () => {
    const result = validateEvaluationBody(
      validBody({
        additionalComments: "Hola\u0000Mundo\u0007!\nSigue\taquí",
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.additionalComments).toBe("HolaMundo!\nSigue\taquí");
  });

  it("trims surrounding whitespace from comments", () => {
    const result = validateEvaluationBody(
      validBody({ positiveFeedback: "   Excelente   " }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.positiveFeedback).toBe("Excelente");
  });

  it("collects multiple issues at once", () => {
    const body = validBody({
      trainerSlug: "",
      recommendation: "whatever",
    });
    delete (body.ratings as Record<string, number>).empathy;

    const result = validateEvaluationBody(body);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.length).toBeGreaterThanOrEqual(3);
  });
});
