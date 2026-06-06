// Shared proxy utilities for FaceGYM API forwarding

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "https://powerhousegym.co",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export function jsonResponse(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
}

export async function proxyToFaceGYM(
  request: Request,
  env: { FACEGYM_API_URL?: string },
  targetPath: string,
): Promise<Response> {
  const facegymBase = (
    env.FACEGYM_API_URL || "https://faceapp.powerhousegym.co"
  ).replace(/\/$/, "");
  const url = new URL(request.url);
  const targetUrl = `${facegymBase}${targetPath}${url.search}`;

  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const headers: Record<string, string> = {};
    const contentType = request.headers.get("Content-Type");
    if (contentType) headers["Content-Type"] = contentType;
    const authHeader = request.headers.get("Authorization");
    if (authHeader) headers["Authorization"] = authHeader;

    const fetchOptions: RequestInit = {
      method: request.method,
      headers,
    };

    if (request.method !== "GET" && request.method !== "HEAD") {
      const body = await request.text();
      if (body) fetchOptions.body = body;
    }

    const response = await fetch(targetUrl, fetchOptions);

    const responseHeaders: Record<string, string> = { ...CORS_HEADERS };
    response.headers.forEach((value, key) => {
      if (!key.toLowerCase().startsWith("access-control-")) {
        responseHeaders[key] = value;
      }
    });

    const responseBody = await response.text();

    return new Response(responseBody, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("FaceGYM proxy error:", error);
    return jsonResponse({ error: "Error de conexión con el servicio" }, 502);
  }
}
