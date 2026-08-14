// Cloudflare Pages Function — Query Wompi transaction status
// Environment variables: WOMPI_PRIVATE_KEY (set in Cloudflare dashboard)
// Usage: GET /api/payment/status?id=<transaction_id>

interface Env {
  WOMPI_PRIVATE_KEY: string;
  WOMPI_API_URL: string;
}

export async function onRequestGet({
  request,
  env,
}: {
  request: Request;
  env: Env;
}) {
  try {
    const url = new URL(request.url);
    const transactionId = url.searchParams.get("id");

    if (!transactionId) {
      return new Response(
        JSON.stringify({
          error: 'Se requiere el parámetro "id" de la transacción',
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Validate transaction ID format (alphanumeric with dashes)
    if (!/^[a-zA-Z0-9_-]+$/.test(transactionId)) {
      return new Response(
        JSON.stringify({ error: "ID de transacción inválido" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const wompiApiUrl = (
      env.WOMPI_API_URL || "https://production.wompi.co/v1"
    ).replace(/\/$/, "");

    const response = await fetch(
      `${wompiApiUrl}/transactions/${transactionId}`,
      {
        headers: {
          Authorization: `Bearer ${env.WOMPI_PRIVATE_KEY}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (!response.ok) {
      console.error(
        `Wompi API error: ${response.status} ${response.statusText}`,
      );
      return new Response(
        JSON.stringify({ error: "Error consultando la transacción con Wompi" }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }

    const json = await response.json();
    const data = json.data;

    if (!data) {
      return new Response(
        JSON.stringify({ error: "Transacción no encontrada" }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    // Deliberately excludes customer PII (email, name, payment method
    // details): this endpoint is unauthenticated and transaction IDs can
    // leak via URLs, logs and referrers.
    return new Response(
      JSON.stringify({
        id: data.id,
        status: data.status,
        amount_in_cents: data.amount_in_cents,
        currency: data.currency,
        reference: data.reference,
        payment_method_type: data.payment_method?.type || null,
        created_at: data.created_at,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Status check error", error);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
