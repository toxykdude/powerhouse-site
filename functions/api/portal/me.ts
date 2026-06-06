// Proxy: GET /api/portal/me → FaceGYM (requires member JWT)
import { proxyToFaceGYM, CORS_HEADERS } from "../../api/_shared";

interface Env {
  FACEGYM_API_URL?: string;
}

export async function onRequest({
  request,
  env,
}: {
  request: Request;
  env: Env;
}) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  return proxyToFaceGYM(request, env, "/api/portal/me");
}
