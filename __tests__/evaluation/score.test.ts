import { describe, it, expect } from "vitest";
import { computeScores } from "../../functions/api/evaluations/_score";
import type { RatingsMap } from "../../src/data/evaluation";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRatings(overrides: Partial<RatingsMap> = {}): RatingsMap {
  const base: RatingsMap = {
    empathy: 5,
    respect: 5,
    attention: 5,
    availability: 5,
    communication: 5,
    motivation: 5,
    technicalExpertise: 5,
    personalizedGuidance: 5,
    professionalism: 5,
    overallExperience: 5,
  };
  return { ...base, ...overrides };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("computeScores", () => {
  it("returns 5.00 for every score when all ratings are 5", () => {
    const scores = computeScores(makeRatings());

    expect(scores.overall).toBe(5);
    expect(scores.experience).toBe(5);
    expect(scores.professional).toBe(5);
  });

  it("computes exact 2-decimal rounding on a mixed fixture", () => {
    // experience dims: 4+5+3+4+5+4+4 = 29 → 29/7 = 4.142857… → 4.14
    // professional dims: 5+3 = 8 → 4
    // overall: (29 + 8 + 2) / 10 = 3.9
    const scores = computeScores(
      makeRatings({
        empathy: 4,
        respect: 5,
        attention: 3,
        availability: 4,
        communication: 5,
        motivation: 4,
        professionalism: 4,
        technicalExpertise: 5,
        personalizedGuidance: 3,
        overallExperience: 2,
      }),
    );

    expect(scores.overall).toBe(3.9);
    expect(scores.experience).toBe(4.14);
    expect(scores.professional).toBe(4);
  });

  it("uses exactly the 7 experience dimensions for the experience mean", () => {
    const low = computeScores(makeRatings({ overallExperience: 1 }));
    const high = computeScores(makeRatings({ overallExperience: 5 }));

    // overallExperience feeds ONLY the overall score
    expect(low.experience).toBe(high.experience);
    expect(low.experience).toBe(5);
    expect(low.overall).toBeLessThan(high.overall);

    // technical/professional dims must not leak into experience either
    const withProLow = computeScores(
      makeRatings({ technicalExpertise: 1, personalizedGuidance: 1 }),
    );
    expect(withProLow.experience).toBe(5);
  });

  it("uses exactly technicalExpertise + personalizedGuidance for professional", () => {
    const base = computeScores(
      makeRatings({ technicalExpertise: 2, personalizedGuidance: 5 }),
    );
    expect(base.professional).toBe(3.5);

    // Changing an experience dim must not move the professional score
    const changedExperience = computeScores(
      makeRatings({
        empathy: 1,
        respect: 1,
        attention: 1,
        availability: 1,
        communication: 1,
        motivation: 1,
        professionalism: 1,
        technicalExpertise: 2,
        personalizedGuidance: 5,
      }),
    );
    expect(changedExperience.professional).toBe(3.5);

    // Changing the overall question must not move it either
    const changedOverall = computeScores(
      makeRatings({
        technicalExpertise: 2,
        personalizedGuidance: 5,
        overallExperience: 1,
      }),
    );
    expect(changedOverall.professional).toBe(3.5);
  });

  it("includes the overallExperience question only in the overall mean", () => {
    const scores = computeScores(
      makeRatings({
        overallExperience: 1,
        technicalExpertise: 1,
        personalizedGuidance: 1,
      }),
    );
    // overall = (7*5 + 1 + 1 + 1) / 10 = 38/10 = 3.8
    expect(scores.overall).toBe(3.8);
    expect(scores.experience).toBe(5);
    expect(scores.professional).toBe(1);
  });
});
