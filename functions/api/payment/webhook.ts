// Cloudflare Pages Function — Wompi webhook receiver
// Environment variables: WOMPI_EVENTS_SECRET (set in Cloudflare dashboard)
// Wompi sends transaction events here when payment status changes

interface Env {
	WOMPI_EVENTS_SECRET: string;
}

interface WompiTransaction {
	id: string;
	status: string;
	amount_in_cents: number;
}

interface WompiEvent {
	id: string;
	type: string;
	timestamp: string;
	data: {
		transaction: WompiTransaction;
	};
	signature: {
		checksum: string;
	};
}

async function sha256(message: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(message);
	const hashBuffer = await crypto.subtle.digest('SHA-256', data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function onRequestPost({ request, env }: { request: Request; env: Env }) {
	try {
		const event: WompiEvent = await request.json();

		const tx = event.data?.transaction;
		if (!tx) {
			// Return 200 to prevent Wompi retries for malformed events
			return new Response('Missing transaction data', { status: 200 });
		}

		// Verify event signature: SHA256(transaction.id + transaction.status + amount_in_cents + events_secret)
		const integrityString = `${tx.id}${tx.status}${tx.amount_in_cents}${env.WOMPI_EVENTS_SECRET}`;
		const computedSignature = await sha256(integrityString);

		if (computedSignature !== event.signature?.checksum) {
			console.error('Webhook signature verification failed', {
				eventId: event.id,
				transactionId: tx.id,
				computed: computedSignature,
				received: event.signature?.checksum,
			});
			return new Response('Invalid signature', { status: 401 });
		}

		// Process approved transactions
		if (event.type === 'transaction.updated' && tx.status === 'APPROVED') {
			console.log('Payment approved', {
				eventId: event.id,
				transactionId: tx.id,
				amount: tx.amount_in_cents,
				timestamp: event.timestamp,
			});

			// Future enhancements:
			// - Send WhatsApp confirmation notification
			// - Update membership database
			// - Send email receipt
			// - Trigger CRM workflow
		}

		// Always return 200 OK to prevent Wompi retries
		return new Response('OK', { status: 200 });
	} catch (error) {
		console.error('Webhook processing error', error);
		// Return 200 to prevent Wompi retries for unexpected errors
		return new Response('OK', { status: 200 });
	}
}
