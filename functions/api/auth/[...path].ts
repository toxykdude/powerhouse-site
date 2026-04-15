// Cloudflare Pages Function — Proxy member auth endpoints to FaceGYM
// Forwards /api/auth/* to https://facegym.powerhousegym.co/api/auth/*
// Used for: member-login, member-verify, member-resend
// Environment variable: FACEGYM_API_URL (fallback: https://facegym.powerhousegym.co)

interface Env {
	FACEGYM_API_URL: string;
}

const CORS_HEADERS: Record<string, string> = {
	'Access-Control-Allow-Origin': 'https://powerhousegym.co',
	'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function jsonResponse(data: unknown, status: number): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			'Content-Type': 'application/json',
			...CORS_HEADERS,
		},
	});
}

export async function onRequest({ request, env }: { request: Request; env: Env }) {
	const url = new URL(request.url);
	const facegymBase = (env.FACEGYM_API_URL || 'https://facegym.powerhousegym.co').replace(/\/$/, '');

	// Extract the path after /api/auth/
	const pathSegments = url.pathname.replace(/^\/api\/auth\/?/, '');
	const targetUrl = `${facegymBase}/api/auth/${pathSegments}${url.search}`;

	// Handle CORS preflight
	if (request.method === 'OPTIONS') {
		return new Response(null, { status: 204, headers: CORS_HEADERS });
	}

	try {
		// Forward headers
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
		};
		const authHeader = request.headers.get('Authorization');
		if (authHeader) {
			headers['Authorization'] = authHeader;
		}

		const fetchOptions: RequestInit = {
			method: request.method,
			headers,
		};

		// Forward body for methods that support it
		if (request.method !== 'GET' && request.method !== 'HEAD') {
			const body = await request.text();
			if (body) {
				fetchOptions.body = body;
			}
		}

		const response = await fetch(targetUrl, fetchOptions);

		// Build response with CORS headers
		const responseHeaders: Record<string, string> = { ...CORS_HEADERS };
		response.headers.forEach((value, key) => {
			const lowerKey = key.toLowerCase();
			if (!lowerKey.startsWith('access-control-')) {
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
		console.error('FaceGYM auth proxy error:', error);
		return jsonResponse({ error: 'Error de conexión con el servicio de autenticación' }, 502);
	}
}
