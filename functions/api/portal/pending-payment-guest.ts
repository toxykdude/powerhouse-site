// Proxy: POST /api/portal/pending-payment-guest → FaceGYM guest endpoint
// (no auth — design D10: guests have no portal token; identity travels
// instead of a member binding and the backend enforces the reference
// format, canonical phone and rate limit).
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
  return proxyToFaceGYM(
    request,
    env,
    "/api/portal/pending-payment/guest",
  );
}
