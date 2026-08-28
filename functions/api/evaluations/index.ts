// Cloudflare Pages Function — POST /api/evaluations
//
// Persists an anonymous trainer evaluation to D1 with layered abuse controls:
// body size cap → CSRF origin check → JSON parse → honeypot → strict
// validation → Turnstile → hashed-IP rate limits (per trainer + hourly).
// Email notification is best-effort: a delivery failure never loses a
// stored evaluation.

import { CORS_HEADERS, jsonResponse } from "../_shared";
import { getEmailProvider, renderEvaluationEmail } from "./_email";
import { computeScores } from "./_score";
import {
  countRecentByIp,
  countRecentByIpAndTrainer,
  getTrainerBySlug,
  insertEvaluation,
} from "./_store";
import type { Env } from "./_types";
import { verifyTurnstile } from "./_turnstile";
import { validateEvaluationBody } from "./_validate";

const MAX_BODY_BYTES = 32768;
const PRODUCTION_ORIGIN = "https://powerhousegym.co";

/** Parse a positive integer env var with a fallback. */
function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Client IP: CF-Connecting-IP → first X-Forwarded-For entry → 'unknown'. */
function extractClientIp(request: Request): string {
  const connecting = request.headers.get("CF-Connecting-IP");
  if (connecting && connecting.trim().length > 0) {
    return connecting.trim();
  }
  const forwarded = request.headers.get("X-Forwarded-For");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return "unknown";
}

/** Hex SHA-256 of "ip|salt" via WebCrypto (never store raw IPs). */
async function hashIp(ip: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${ip}|${salt}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** CSRF: same host, the production origin, or any *.pages.dev preview. */
function isOriginAllowed(origin: string, requestUrl: URL): boolean {
  try {
    const originUrl = new URL(origin);
    return (
      originUrl.host === requestUrl.host ||
      origin === PRODUCTION_ORIGIN ||
      originUrl.host.endsWith(".pages.dev")
    );
  } catch {
    return false;
  }
}

export async function onRequest({
  request,
  env,
}: {
  request: Request;
  env: Env;
}): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Método no permitido" }, 405);
  }

  try {
    // --- Body size cap ------------------------------------------------------
    const declaredLength = Number(request.headers.get("Content-Length") ?? "0");
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      return jsonResponse({ error: "La evaluación es demasiado grande" }, 413);
    }
    const rawText = await request.text();
    if (rawText.length > MAX_BODY_BYTES) {
      return jsonResponse({ error: "La evaluación es demasiado grande" }, 413);
    }

    // --- CSRF origin check --------------------------------------------------
    const requestUrl = new URL(request.url);
    const origin = request.headers.get("Origin");
    if (origin && !isOriginAllowed(origin, requestUrl)) {
      return jsonResponse({ error: "Origen no permitido" }, 403);
    }

    // --- Parse JSON ---------------------------------------------------------
    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(rawText);
    } catch {
      return jsonResponse({ error: "La evaluación no es válida" }, 400);
    }
    if (
      typeof parsedBody !== "object" ||
      parsedBody === null ||
      Array.isArray(parsedBody)
    ) {
      return jsonResponse({ error: "La evaluación no es válida" }, 400);
    }
    const body = parsedBody as Record<string, unknown>;

    // --- Honeypot: silent spam drop (fake success, nothing stored) -----------
    if (typeof body.company === "string" && body.company.length > 0) {
      console.log("evaluation honeypot triggered");
      return jsonResponse({ ok: true }, 201);
    }

    // --- Strict validation --------------------------------------------------
    const validated = validateEvaluationBody(body);
    if (!validated.ok) {
      return jsonResponse(
        { error: "Revisa las respuestas marcadas", issues: validated.issues },
        400,
      );
    }

    // --- Turnstile (when configured) ----------------------------------------
    const clientIp = extractClientIp(request);
    const turnstileToken =
      typeof body.turnstileToken === "string" ? body.turnstileToken : undefined;
    const turnstileOk = await verifyTurnstile(env, turnstileToken, clientIp);
    if (!turnstileOk) {
      return jsonResponse(
        {
          error:
            "No pudimos verificar que eres humano. Recarga e intenta nuevamente.",
        },
        403,
      );
    }

    // --- Resolve trainer (unknown slug → 404) -------------------------------
    const trainer = await getTrainerBySlug(env.DB, validated.value.trainerSlug);
    if (!trainer) {
      return jsonResponse({ error: "Entrenador no encontrado" }, 404);
    }

    // --- Rate limits (hashed IP, D1-backed) ----------------------------------
    const ipHash = await hashIp(clientIp, env.RATE_LIMIT_SALT || "dev-salt");
    const duplicateWindowMin = parsePositiveInt(
      env.EVAL_DUPLICATE_WINDOW_MIN,
      15,
    );
    const hourlyLimit = parsePositiveInt(env.EVAL_RATE_LIMIT_PER_HOUR, 5);

    const recentForTrainer = await countRecentByIpAndTrainer(
      env.DB,
      ipHash,
      trainer.id,
      duplicateWindowMin,
    );
    if (recentForTrainer >= 1) {
      return jsonResponse(
        {
          error:
            "Ya recibimos una evaluación reciente para este entrenador. Gracias por tu opinión.",
        },
        429,
      );
    }
    const recentTotal = await countRecentByIp(env.DB, ipHash, 60);
    if (recentTotal >= hourlyLimit) {
      return jsonResponse(
        {
          error:
            "Has enviado varias evaluaciones en poco tiempo. Intenta más tarde.",
        },
        429,
      );
    }

    // --- Score + persist ----------------------------------------------------
    const scores = computeScores(validated.value.ratings);
    const evaluationId = await insertEvaluation(
      env.DB,
      trainer.id,
      validated.value,
      scores,
      ipHash,
    );

    // --- Best-effort email (never fail the request after a successful INSERT) -
    try {
      const provider = getEmailProvider(env);
      const message = renderEvaluationEmail({
        trainerName: trainer.name,
        payload: validated.value,
        scores,
        receivedAt: new Date(),
      });
      const result = await provider.send(message);
      if (!result.ok) {
        console.error(
          `evaluation ${evaluationId}: email delivery failed (${result.error ?? "unknown error"})`,
        );
      }
    } catch (error) {
      console.error(
        `evaluation ${evaluationId}: email delivery failed (${error instanceof Error ? error.message : "unknown error"})`,
      );
    }

    return jsonResponse({ ok: true }, 201);
  } catch (error) {
    // Bounded logging: error message only — never raw bodies or PII.
    console.error(
      `POST /api/evaluations failed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
    return jsonResponse(
      {
        error: "No pudimos enviar tu evaluación. Por favor intenta nuevamente.",
      },
      500,
    );
  }
}
