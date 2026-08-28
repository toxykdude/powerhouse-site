// Cloudflare Pages Function — GET /api/admin/trainer-stats
//
// Private analytics foundation for the gym team (per-trainer aggregates from
// the evaluations table). Protected by a shared X-API-Key; never linked from
// the public site. Returns 404 (not 401) when the key is unset so the
// endpoint's existence is not advertised in environments without analytics.

import { CORS_HEADERS, jsonResponse } from "../_shared";
import { getTrainerStats } from "../evaluations/_store";
import type { D1Database } from "../evaluations/_types";

interface Env {
  DB: D1Database;
  ADMIN_API_KEY?: string;
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
  if (!env.ADMIN_API_KEY) {
    return jsonResponse({ error: "Not found" }, 404);
  }
  if (request.method !== "GET") {
    return jsonResponse({ error: "Método no permitido" }, 405);
  }
  if (request.headers.get("X-API-Key") !== env.ADMIN_API_KEY) {
    return jsonResponse({ error: "No autorizado" }, 401);
  }

  try {
    const trainers = await getTrainerStats(env.DB);
    return jsonResponse(
      { generatedAt: new Date().toISOString(), trainers },
      200,
    );
  } catch (error) {
    console.error(
      `GET /api/admin/trainer-stats failed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
    return jsonResponse({ error: "Error interno" }, 500);
  }
}
