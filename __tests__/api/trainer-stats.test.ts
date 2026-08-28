import { describe, it, expect, vi, beforeEach } from "vitest";
import { onRequest } from "../../functions/api/admin/trainer-stats";
import type {
  D1Database,
  D1PreparedStatement,
  D1Result,
} from "../../functions/api/evaluations/_types";

// ---------------------------------------------------------------------------
// Fake D1 database — returns configured rows per SQL pattern
// ---------------------------------------------------------------------------

type Resolver = (sql: string) => Record<string, unknown>[] | undefined;

class FakeStatsStatement implements D1PreparedStatement {
  constructor(
    private readonly sql: string,
    private readonly resolve: Resolver,
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    void values;
    return this;
  }

  async first<T>(): Promise<T | null> {
    return null;
  }

  async all<T>(): Promise<D1Result<T>> {
    return {
      results: (this.resolve(this.sql) ?? []) as T[],
      success: true,
      meta: {},
    };
  }

  async run(): Promise<D1Result> {
    return { success: true, meta: {} };
  }
}

function makeStatsDb(resolver: Resolver): D1Database {
  return {
    prepare(query: string): D1PreparedStatement {
      return new FakeStatsStatement(query, resolver);
    },
  };
}

/** Aggregate rows shaped like getTrainerStats expects. */
function aggregateResolver(): Resolver {
  return (sql: string) => {
    if (/positive_feedback AS text/i.test(sql)) {
      return [{ trainer_id: 1, text: "Muy buen acompañamiento" }];
    }
    if (/improvement_feedback AS text/i.test(sql)) {
      return [];
    }
    if (/DATE\(created_at\)/i.test(sql)) {
      return [{ trainer_id: 1, date: "2026-08-27", count: 2 }];
    }
    if (/LEFT JOIN evaluations/i.test(sql)) {
      return [
        {
          trainer_id: 1,
          slug: "harold-giraldo",
          name: "Harold Giraldo",
          evaluation_count: 2,
          avg_empathy: 4.5,
          avg_respect: 5,
          avg_attention: 4,
          avg_availability: 4.5,
          avg_communication: 5,
          avg_motivation: 4,
          avg_technical_expertise: 4.5,
          avg_personalized_guidance: 4,
          avg_professionalism: 5,
          avg_overall_experience: 4.5,
          avg_overall_score: 4.55,
          avg_experience_score: 4.5,
          avg_professional_score: 4.25,
          recommendable_count: 1,
        },
      ];
    }
    return [];
  };
}

const API_URL = "https://powerhousegym.co/api/admin/trainer-stats";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/admin/trainer-stats", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 204 for OPTIONS preflight", async () => {
    const response = await onRequest({
      request: new Request(API_URL, { method: "OPTIONS" }),
      env: { DB: makeStatsDb(aggregateResolver()), ADMIN_API_KEY: "secret" },
    });

    expect(response.status).toBe(204);
  });

  it("returns 404 when ADMIN_API_KEY is not configured", async () => {
    const response = await onRequest({
      request: new Request(API_URL, { method: "GET" }),
      env: { DB: makeStatsDb(aggregateResolver()) },
    });

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("Not found");
  });

  it("returns 401 for a wrong X-API-Key", async () => {
    const response = await onRequest({
      request: new Request(API_URL, {
        method: "GET",
        headers: { "X-API-Key": "wrong-key" },
      }),
      env: { DB: makeStatsDb(aggregateResolver()), ADMIN_API_KEY: "secret" },
    });

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("No autorizado");
  });

  it("returns 401 when X-API-Key is missing", async () => {
    const response = await onRequest({
      request: new Request(API_URL, { method: "GET" }),
      env: { DB: makeStatsDb(aggregateResolver()), ADMIN_API_KEY: "secret" },
    });

    expect(response.status).toBe(401);
  });

  it("returns the aggregated trainer stats for a valid key", async () => {
    const response = await onRequest({
      request: new Request(API_URL, {
        method: "GET",
        headers: { "X-API-Key": "secret" },
      }),
      env: { DB: makeStatsDb(aggregateResolver()), ADMIN_API_KEY: "secret" },
    });

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(typeof body.generatedAt).toBe("string");
    expect(Array.isArray(body.trainers)).toBe(true);

    const trainer = body.trainers[0];
    expect(trainer.slug).toBe("harold-giraldo");
    expect(trainer.name).toBe("Harold Giraldo");
    expect(trainer.evaluationCount).toBe(2);
    expect(trainer.avgRatings.empathy).toBe(4.5);
    expect(trainer.avgRatings.technicalExpertise).toBe(4.5);
    expect(trainer.avgOverallScore).toBe(4.55);
    expect(trainer.avgExperienceScore).toBe(4.5);
    expect(trainer.avgProfessionalScore).toBe(4.25);
    expect(trainer.recommendationRate).toBe(0.5);
    expect(trainer.recentPositiveFeedback).toEqual(["Muy buen acompañamiento"]);
    expect(trainer.recentImprovementFeedback).toEqual([]);
    expect(trainer.dailyCountsLast30Days).toEqual([
      { date: "2026-08-27", count: 2 },
    ]);
  });
});
