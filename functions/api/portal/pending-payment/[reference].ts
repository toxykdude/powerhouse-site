// Proxy: GET /api/portal/pending-payment/[reference] → FaceGYM (public, no auth)
import { proxyToFaceGYM, CORS_HEADERS } from '../../../api/_shared';

interface Env { FACEGYM_API_URL?: string }

export async function onRequest({ request, env }: { request: Request; env: Env }) {
	if (request.method === 'OPTIONS') {
		return new Response(null, { status: 204, headers: CORS_HEADERS });
	}

	const url = new URL(request.url);
	// Extract reference from the path: /api/portal/pending-payment/{reference}
	const parts = url.pathname.split('/');
	const reference = parts[parts.length - 1];

	if (!reference) {
		return new Response(JSON.stringify({ error: 'Missing reference' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
		});
	}

	return proxyToFaceGYM(request, env, `/api/portal/pending-payment/${reference}`);
}
