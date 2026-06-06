export default {
  async fetch(request, _env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    try {
      const data = await request.json();
      const { name, phone, email, message, plan } = data;

      // Validate required fields
      if (!name || !phone || !message) {
        return new Response(
          JSON.stringify({ error: "Faltan campos requeridos" }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          },
        );
      }

      // Send email via MailChannels (free on Cloudflare Workers)
      const emailBody = `
Nuevo mensaje de PowerHouse Gym:

Nombre: ${name}
Teléfono: ${phone}
Email: ${email || "No proporcionado"}
Plan: ${plan || "No especificado"}

Mensaje:
${message}

---
Enviado desde powerhousegym.co
      `.trim();

      const send_request = new Request(
        "https://api.mailchannels.net/tx/v1/send",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            personalizations: [
              { to: [{ email: "gerencia@powerhousegym.co" }] },
            ],
            from: {
              email: "noreply@powerhousegym.co",
              name: "PowerHouse Gym Contacto",
            },
            subject: `Nuevo contacto: ${name}${plan ? ` — ${plan}` : ""}`,
            content: [{ type: "text/plain", value: emailBody }],
          }),
        },
      );

      const resp = await fetch(send_request);

      if (resp.status === 200 || resp.status === 202) {
        // Also send to WhatsApp as fallback
        const waText = encodeURIComponent(
          `Hola PowerHouse!\n\nNombre: ${name}\nTeléfono: ${phone}\n${plan ? `Plan: ${plan}\n` : ""}\nMensaje:\n${message}`,
        );

        return new Response(
          JSON.stringify({
            success: true,
            whatsappUrl: `https://wa.me/573154711900?text=${waText}`,
          }),
          {
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          whatsappUrl: `https://wa.me/573154711900?text=${encodeURIComponent(`Hola PowerHouse! Soy ${name}. ${message}`)}`,
        }),
        {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        },
      );
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  },
};
