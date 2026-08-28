import { describe, it, expect, vi, beforeEach } from "vitest";
import { onRequest } from "../../functions/api/evaluations/index";
import type {
  D1Database,
  D1PreparedStatement,
  D1Result,
  Env,
} from "../../functions/api/evaluations/_types";
import { getRatingKeys } from "../../src/data/evaluation";

// ---------------------------------------------------------------------------
// Fake D1 database — records SQL + bound params, returns configured rows
// ---------------------------------------------------------------------------

interface RecordedStatement {
  sql: string;
  params: unknown[];
}

type ResolverResult = {
  first?: Record<string, unknown> | null;
  rows?: Record<string, unknown>[];
};
type Resolver = (sql: string) => ResolverResult | undefined;

class FakePreparedStatement implements D1PreparedStatement {
  constructor(
    private readonly db: FakeD1,
    private readonly sql: string,
    private readonly params: unknown[],
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    return new FakePreparedStatement(this.db, this.sql, values);
  }

  async first<T>(col?: string): Promise<T | null> {
    this.db.recorded.push({ sql: this.sql, params: this.params });
    const resolved = this.db.resolve(this.sql);
    const row =
      resolved?.first ??
      (resolved?.rows && resolved.rows.length > 0 ? resolved.rows[0] : null);
    if (row === null || row === undefined) return null;
    if (col) return (row as Record<string, unknown>)[col] as T;
    return row as T;
  }

  async all<T>(): Promise<D1Result<T>> {
    this.db.recorded.push({ sql: this.sql, params: this.params });
    const resolved = this.db.resolve(this.sql);
    return { results: (resolved?.rows ?? []) as T[], success: true, meta: {} };
  }

  async run(): Promise<D1Result> {
    this.db.recorded.push({ sql: this.sql, params: this.params });
    return { success: true, meta: {} };
  }
}

class FakeD1 implements D1Database {
  readonly recorded: RecordedStatement[] = [];

  constructor(private readonly resolver: Resolver) {}

  prepare(query: string): D1PreparedStatement {
    return new FakePreparedStatement(this, query, []);
  }

  resolve(sql: string) {
    return this.resolver(sql);
  }

  get insertStatements(): RecordedStatement[] {
    return this.recorded.filter((statement) =>
      /INSERT INTO evaluations/i.test(statement.sql),
    );
  }
}

// ---------------------------------------------------------------------------
// Request/env helpers
// ---------------------------------------------------------------------------

const API_URL = "https://powerhousegym.co/api/evaluations";

/** Default happy-path resolver: known trainer, no rate-limit hits, insert ok. */
function happyResolver(overrides: Resolver = () => undefined): Resolver {
  return (sql: string) => {
    const override = overrides(sql);
    if (override) return override;
    if (/FROM trainers WHERE slug/i.test(sql)) {
      return {
        first: {
          id: 7,
          slug: "harold-giraldo",
          name: "Harold Giraldo",
          active: 1,
        },
      };
    }
    if (/COUNT\(\*\)/i.test(sql)) {
      return { first: { count: 0 } };
    }
    if (/INSERT INTO evaluations/i.test(sql)) {
      return { first: { id: 42 } };
    }
    return { rows: [] };
  };
}

function makeEnv(db: FakeD1, overrides: Partial<Env> = {}): Env {
  return {
    DB: db,
    RATE_LIMIT_SALT: "test-salt",
    ...overrides,
  };
}

function validPayload(): Record<string, unknown> {
  const ratings: Record<string, number> = {};
  for (const key of getRatingKeys()) ratings[key] = 5;
  return {
    trainerSlug: "harold-giraldo",
    ratings,
    recommendation: "definitely_yes",
    membershipDuration: "more_1_year",
    positiveFeedback: "Excelente entrenador",
    improvementFeedback: null,
    additionalComments: null,
    company: "",
  };
}

function postRequest(
  body: unknown | string,
  headers: Record<string, string> = {},
): Request {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  return new Request(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: raw,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/evaluations", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 204 with CORS headers for OPTIONS preflight", async () => {
    const response = await onRequest({
      request: new Request(API_URL, { method: "OPTIONS" }),
      env: makeEnv(new FakeD1(happyResolver())),
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://powerhousegym.co",
    );
  });

  it("returns 405 for non-POST methods", async () => {
    const response = await onRequest({
      request: new Request(API_URL, { method: "GET" }),
      env: makeEnv(new FakeD1(happyResolver())),
    });

    expect(response.status).toBe(405);
    const body = await response.json();
    expect(body.error).toBe("Método no permitido");
  });

  it("persists the evaluation and sends the Resend email on the happy path", async () => {
    const db = new FakeD1(happyResolver());
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));

    const response = await onRequest({
      request: postRequest(validPayload()),
      env: makeEnv(db, {
        EMAIL_PROVIDER: "resend",
        RESEND_API_KEY: "re_test_key",
      }),
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toEqual({ ok: true });

    // INSERT ran with the resolved trainer id bound
    expect(db.insertStatements.length).toBe(1);
    expect(db.insertStatements[0].params[0]).toBe(7);

    // Resend was called with the expected body
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://api.resend.com/emails");
    const sentBody = JSON.parse(String(init.body));
    expect(sentBody.subject).toBe(
      "Evaluación de Harold Giraldo — 5.0/5 · PowerHouse GYM",
    );
    expect(sentBody.from).toBe("PowerHouse GYM <onboarding@resend.dev>");
    expect(sentBody.to).toEqual(["powerhousegymmanizales@gmail.com"]);
    expect(sentBody.html).toContain("Harold Giraldo");
  });

  it("still returns 201 when the email fetch rejects", async () => {
    const db = new FakeD1(happyResolver());
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("SMTP down"));

    const response = await onRequest({
      request: postRequest(validPayload()),
      env: makeEnv(db, {
        EMAIL_PROVIDER: "resend",
        RESEND_API_KEY: "re_test_key",
      }),
    });

    expect(response.status).toBe(201);
    expect(db.insertStatements.length).toBe(1);
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  it("returns 400 with issues for invalid ratings", async () => {
    const payload = validPayload();
    (payload.ratings as Record<string, number>).empathy = 9;

    const response = await onRequest({
      request: postRequest(payload),
      env: makeEnv(new FakeD1(happyResolver())),
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Revisa las respuestas marcadas");
    expect(Array.isArray(body.issues)).toBe(true);
    expect(body.issues.length).toBeGreaterThan(0);
  });

  it("returns 400 for a malformed JSON body", async () => {
    const response = await onRequest({
      request: postRequest("{ this is not json"),
      env: makeEnv(new FakeD1(happyResolver())),
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("La evaluación no es válida");
  });

  it("returns 403 for a disallowed Origin", async () => {
    const response = await onRequest({
      request: postRequest(validPayload(), {
        Origin: "https://evil.example.com",
      }),
      env: makeEnv(new FakeD1(happyResolver())),
    });

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("Origen no permitido");
  });

  it("allows the production origin and *.pages.dev previews", async () => {
    const dbProd = new FakeD1(happyResolver());
    const responseProd = await onRequest({
      request: postRequest(validPayload(), {
        Origin: "https://powerhousegym.co",
      }),
      env: makeEnv(dbProd),
    });
    expect(responseProd.status).toBe(201);

    const dbPreview = new FakeD1(happyResolver());
    const responsePreview = await onRequest({
      request: postRequest(validPayload(), {
        Origin: "https://abc123.powerhouse-site-dev.pages.dev",
      }),
      env: makeEnv(dbPreview),
    });
    expect(responsePreview.status).toBe(201);
  });

  it("returns 413 for an oversized body", async () => {
    const response = await onRequest({
      request: postRequest("x".repeat(32769)),
      env: makeEnv(new FakeD1(happyResolver())),
    });

    expect(response.status).toBe(413);
    const body = await response.json();
    expect(body.error).toBe("La evaluación es demasiado grande");
  });

  it("silently drops honeypot submissions with a fake 201", async () => {
    const db = new FakeD1(happyResolver());
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const response = await onRequest({
      request: postRequest({ ...validPayload(), company: "Spam Inc." }),
      env: makeEnv(db),
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toEqual({ ok: true });
    expect(db.recorded.length).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith("evaluation honeypot triggered");

    logSpy.mockRestore();
    fetchSpy.mockRestore();
  });

  it("returns 429 inside the per-trainer duplicate window", async () => {
    const db = new FakeD1(
      happyResolver((sql) => {
        if (/COUNT\(\*\)/i.test(sql) && /trainer_id/i.test(sql)) {
          return { first: { count: 1 } };
        }
        return undefined;
      }),
    );

    const response = await onRequest({
      request: postRequest(validPayload()),
      env: makeEnv(db),
    });

    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.error).toBe(
      "Ya recibimos una evaluación reciente para este entrenador. Gracias por tu opinión.",
    );
    expect(db.insertStatements.length).toBe(0);
  });

  it("returns 429 when the hourly cap is reached", async () => {
    const db = new FakeD1(
      happyResolver((sql) => {
        if (/COUNT\(\*\)/i.test(sql) && !/trainer_id/i.test(sql)) {
          return { first: { count: 5 } };
        }
        return undefined;
      }),
    );

    const response = await onRequest({
      request: postRequest(validPayload()),
      env: makeEnv(db),
    });

    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.error).toBe(
      "Has enviado varias evaluaciones en poco tiempo. Intenta más tarde.",
    );
    expect(db.insertStatements.length).toBe(0);
  });

  it("returns 404 for an unknown trainer slug", async () => {
    const db = new FakeD1(
      happyResolver((sql) => {
        if (/FROM trainers WHERE slug/i.test(sql)) {
          return { first: null };
        }
        return undefined;
      }),
    );

    const response = await onRequest({
      request: postRequest({
        ...validPayload(),
        trainerSlug: "nadie-por-aqui",
      }),
      env: makeEnv(db),
    });

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("Entrenador no encontrado");
  });

  describe("turnstile enforcement (secret configured)", () => {
    const turnstileEnv = (db: FakeD1): Env =>
      makeEnv(db, { TURNSTILE_SECRET_KEY: "ts_secret" });

    it("returns 403 when the token is missing", async () => {
      const response = await onRequest({
        request: postRequest({ ...validPayload(), turnstileToken: undefined }),
        env: turnstileEnv(new FakeD1(happyResolver())),
      });

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error).toContain("No pudimos verificar que eres humano");
    });

    it("returns 403 when Cloudflare rejects the token", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(
          new Response(JSON.stringify({ success: false }), { status: 200 }),
        );

      const response = await onRequest({
        request: postRequest({
          ...validPayload(),
          turnstileToken: "bad-token",
        }),
        env: turnstileEnv(new FakeD1(happyResolver())),
      });

      expect(response.status).toBe(403);
      const [siteverifyUrl] = fetchSpy.mock.calls[0] as unknown as [
        string,
        RequestInit,
      ];
      expect(siteverifyUrl).toBe(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      );

      fetchSpy.mockRestore();
    });

    it("proceeds to 201 when the token verifies", async () => {
      const db = new FakeD1(happyResolver());
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(
          new Response(JSON.stringify({ success: true }), { status: 200 }),
        );

      const response = await onRequest({
        request: postRequest({
          ...validPayload(),
          turnstileToken: "good-token",
        }),
        env: turnstileEnv(db),
      });

      expect(response.status).toBe(201);
      expect(db.insertStatements.length).toBe(1);

      fetchSpy.mockRestore();
    });
  });

  it("hashes the IP with the configured salt for rate-limit queries", async () => {
    const db = new FakeD1(happyResolver());

    await onRequest({
      request: postRequest(validPayload(), {
        "CF-Connecting-IP": "203.0.113.9",
      }),
      env: makeEnv(db, { RATE_LIMIT_SALT: "pepper" }),
    });

    const insert = db.insertStatements[0];
    expect(insert).toBeDefined();
    // ip_hash is the last bound parameter: 64 hex chars, not the raw IP
    const ipHash = insert.params[insert.params.length - 1];
    expect(typeof ipHash).toBe("string");
    expect(ipHash).toMatch(/^[a-f0-9]{64}$/);
    expect(ipHash).not.toContain("203.0.113.9");
  });

  it("returns 500 with a bounded message on an unexpected store error", async () => {
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const db = new FakeD1(() => {
      throw new Error("D1 exploded");
    });

    const response = await onRequest({
      request: postRequest(validPayload()),
      env: makeEnv(db),
    });

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe(
      "No pudimos enviar tu evaluación. Por favor intenta nuevamente.",
    );
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });
});
