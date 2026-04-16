// Cloudflare Pages Function — Wompi webhook receiver
// When Wompi confirms a payment, this activates the membership in FaceGYM.

interface Env {
	WOMPI_EVENTS_SECRET: string;
	FACEGYM_API_URL?: string;
}

interface WompiTransaction {
	id: string;
	status: string;
	amount_in_cents: number;
	reference: string;
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
			return new Response('Missing transaction data', { status: 200 });
		}

		// Verify event signature: SHA256(transaction.id + transaction.status + amount_in_cents + events_secret)
		const integrityString = `${tx.id}${tx.status}${tx.amount_in_cents}${env.WOMPI_EVENTS_SECRET}`;
		const computedSignature = await sha256(integrityString);

		if (computedSignature !== event.signature?.checksum) {
			console.error('Webhook signature verification failed', {
				eventId: event.id,
				transactionId: tx.id,
			});
			return new Response('Invalid signature', { status: 401 });
		}

		// Process approved transactions
		if (event.type === 'transaction.updated' && tx.status === 'APPROVED') {
			console.log('Payment approved', {
				eventId: event.id,
				transactionId: tx.id,
				reference: tx.reference,
				amount: tx.amount_in_cents,
			});

			const facegymBase = (env.FACEGYM_API_URL || 'https://facegym.powerhousegym.co').replace(/\/$/, '');

			// Look up the pending payment by reference
			try {
				const lookupResponse = await fetch(`${facegymBase}/api/portal/pending-payment/${tx.reference}`);

				if (!lookupResponse.ok) {
					console.error('Failed to lookup pending payment', {
						reference: tx.reference,
						status: lookupResponse.status,
					});
					return new Response('OK', { status: 200 });
				}

				const pendingData = await lookupResponse.json() as {
					status: string;
					plan_id?: string;
					member_id?: string;
					amount?: string;
					wompi_reference?: string;
				};

				if (pendingData.status !== 'found' || !pendingData.plan_id || !pendingData.member_id) {
					console.error('Pending payment not found or incomplete', {
						reference: tx.reference,
						data: pendingData,
					});
					// This might be a non-portal payment (e.g., from planes.astro for new members)
					return new Response('OK', { status: 200 });
				}

				// Activate membership in FaceGYM
				const renewResponse = await fetch(`${facegymBase}/api/portal/webhook-renew`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						plan_id: pendingData.plan_id,
						member_id: pendingData.member_id,
						wompi_reference: tx.reference,
						wompi_transaction_id: tx.id,
						amount: pendingData.amount,
					}),
				});

				const renewResult = await renewResponse.json();

				if (renewResponse.ok) {
					console.log('Membership activated via webhook', {
						reference: tx.reference,
						memberId: pendingData.member_id,
						result: renewResult,
					});
				} else {
					console.error('FaceGYM webhook-renew failed', {
						status: renewResponse.status,
						result: renewResult,
					});
				}
			} catch (err) {
				console.error('Error processing webhook renewal:', err);
			}
		}

		// Always return 200 OK to prevent Wompi retries
		return new Response('OK', { status: 200 });
	} catch (error) {
		console.error('Webhook processing error', error);
		return new Response('OK', { status: 200 });
	}
}
