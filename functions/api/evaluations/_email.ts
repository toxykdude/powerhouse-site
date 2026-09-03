// Email report for submitted evaluations + pluggable delivery provider.
//
// renderEvaluationEmail builds a professional HTML report (table layout,
// inline styles ONLY — email clients strip <style> blocks) with the brand
// palette, plus a plain-text twin. getEmailProvider resolves the delivery
// backend from env so providers can be swapped without touching callers.

import {
  evaluationCategories,
  membershipDurationLabel,
  ratingValueLabel,
  recommendationLabel,
} from "../../../src/data/evaluation";
import type { EvaluationScores } from "./_score";
import type { Env, ValidatedInput } from "./_types";

export interface EmailMessage {
  subject: string;
  html: string;
  text: string;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<{ ok: boolean; error?: string }>;
}

// Brand palette (see src/styles/theme.css design tokens).
const COLORS = {
  dark: "#0D0D0D",
  gold: "#E8C832",
  red: "#C0392B",
  text: "#1A1A1A",
  muted: "#666666",
  line: "#E5E5E5",
  pageBg: "#F4F4F4",
};

/** Escape every user-derived string before it lands in HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Format the received date for Colombia; fall back to ISO on failure. */
function formatBogotaDate(date: Date): string {
  try {
    return date.toLocaleDateString("es-CO", {
      timeZone: "America/Bogota",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return date.toISOString();
  }
}

function sectionHeading(title: string): string {
  return `<tr><td style="padding:20px 24px 10px 24px;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:bold;letter-spacing:2px;color:${COLORS.red};border-bottom:2px solid ${COLORS.gold};">${escapeHtml(title)}</td></tr>`;
}

function feedbackHtml(heading: string, content: string | null): string {
  const bodyHtml =
    content && content.length > 0
      ? escapeHtml(content).replace(/\n/g, "<br />")
      : `<span style="color:#999999;">Sin comentarios</span>`;
  return `<tr><td style="padding:16px 24px;font-family:Arial,Helvetica,sans-serif;">
      <div style="font-size:14px;font-weight:bold;color:${COLORS.dark};padding-bottom:6px;">${escapeHtml(heading)}</div>
      <div style="font-size:14px;line-height:1.6;color:#333333;">${bodyHtml}</div>
    </td></tr>`;
}

function feedbackText(content: string | null): string {
  return content && content.length > 0 ? content : "Sin comentarios";
}

/**
 * Build the evaluation report email (HTML + plain text) for the gym team.
 * All user-derived strings are escaped; layout uses tables + inline styles.
 */
export function renderEvaluationEmail(input: {
  trainerName: string;
  payload: ValidatedInput;
  scores: EvaluationScores;
  receivedAt: Date;
}): EmailMessage {
  const { trainerName, payload, scores, receivedAt } = input;
  const escapedTrainer = escapeHtml(trainerName);
  const dateLabel = formatBogotaDate(receivedAt);

  const summaryLine = `Puntaje global ${scores.overall.toFixed(2)} / 5 · Experiencia del cliente ${scores.experience.toFixed(2)} · Desempeño profesional ${scores.professional.toFixed(2)}`;
  const recommendation = recommendationLabel(payload.recommendation);
  const membership = payload.membershipDuration
    ? membershipDurationLabel(payload.membershipDuration)
    : "No respondió";

  // One row per dimension, in questionnaire order.
  const ratingRows = evaluationCategories
    .map((category) => {
      const value = payload.ratings[category.key];
      return `<tr>
          <td style="padding:10px 24px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:${COLORS.text};border-bottom:1px solid ${COLORS.line};">${escapeHtml(category.label)}</td>
          <td align="right" style="padding:10px 24px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:${COLORS.text};border-bottom:1px solid ${COLORS.line};white-space:nowrap;"><strong>${value}/5</strong> <span style="color:${COLORS.muted};">· ${escapeHtml(ratingValueLabel(value))}</span></td>
        </tr>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html lang="es">
  <body style="margin:0;padding:0;background-color:${COLORS.pageBg};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLORS.pageBg};">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#FFFFFF;font-family:Arial,Helvetica,sans-serif;">
            <tr>
              <td style="background-color:${COLORS.dark};padding:32px 24px;text-align:center;">
                <div style="color:${COLORS.gold};font-size:20px;font-weight:bold;letter-spacing:3px;">POWERHOUSE GYM MANIZALES</div>
                <div style="width:56px;height:3px;background-color:${COLORS.gold};margin:14px auto 10px auto;">&nbsp;</div>
                <div style="color:${COLORS.red};font-size:11px;font-weight:bold;letter-spacing:4px;">EVALUACIÓN DE ENTRENADOR</div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 24px 4px 24px;font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:bold;color:${COLORS.dark};">Evaluación de ${escapedTrainer}</td>
            </tr>
            ${sectionHeading("RESUMEN")}
            <tr>
              <td style="padding:12px 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:${COLORS.text};"><strong>Puntaje global ${scores.overall.toFixed(2)} / 5</strong> <span style="color:${COLORS.muted};">· Experiencia del cliente ${scores.experience.toFixed(2)} · Desempeño profesional ${scores.professional.toFixed(2)}</span></td>
            </tr>
            ${sectionHeading("EVALUACIÓN DEL CLIENTE")}
            ${ratingRows}
            ${sectionHeading("RECOMENDACIÓN")}
            <tr>
              <td style="padding:12px 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:${COLORS.dark};">${escapeHtml(recommendation)}</td>
            </tr>
            ${sectionHeading("TIEMPO EN POWERHOUSE")}
            <tr>
              <td style="padding:12px 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:${COLORS.text};">${escapeHtml(membership)}</td>
            </tr>
            ${feedbackHtml("¿Qué es lo que más valoras?", payload.positiveFeedback)}
            ${feedbackHtml("¿Qué podría mejorar?", payload.improvementFeedback)}
            ${feedbackHtml("Comentarios adicionales", payload.additionalComments)}
            <tr>
              <td style="padding:24px;background-color:${COLORS.dark};text-align:center;">
                <div style="color:${COLORS.gold};font-size:12px;font-weight:bold;letter-spacing:1px;">POWERHOUSE GYM MANIZALES</div>
                <div style="color:#999999;font-size:11px;margin-top:6px;">Recibida el ${escapeHtml(dateLabel)}</div>
                <div style="color:#999999;font-size:11px;margin-top:4px;">Evaluación anónima · Sistema de Experiencia PowerHouse</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    "POWERHOUSE GYM MANIZALES",
    "EVALUACIÓN DE ENTRENADOR",
    "",
    `Evaluación de ${trainerName}`,
    "",
    "RESUMEN",
    summaryLine,
    "",
    "EVALUACIÓN DEL CLIENTE",
    ...evaluationCategories.map(
      (category) =>
        `${category.label}: ${payload.ratings[category.key]}/5 · ${ratingValueLabel(payload.ratings[category.key])}`,
    ),
    "",
    "RECOMENDACIÓN",
    recommendation,
    "",
    "TIEMPO EN POWERHOUSE",
    membership,
    "",
    "¿Qué es lo que más valoras?",
    feedbackText(payload.positiveFeedback),
    "",
    "¿Qué podría mejorar?",
    feedbackText(payload.improvementFeedback),
    "",
    "Comentarios adicionales",
    feedbackText(payload.additionalComments),
    "",
    `Recibida el ${dateLabel}`,
    "Evaluación anónima · Sistema de Experiencia PowerHouse",
  ].join("\n");

  return {
    subject: `Evaluación de ${trainerName} — ${scores.overall.toFixed(1)}/5 · PowerHouse GYM`,
    html,
    text,
  };
}

/**
 * Resolve the email delivery provider from env.
 *  - 'gmail' | 'smtp' → Gmail SMTP with app password (existing pipeline;
 *    STARTTLS 587 or implicit TLS 465 via cloudflare:sockets)
 *  - 'sendgrid' → SendGrid v3 HTTP API (legacy alternative)
 *  - 'resend'   → Resend HTTP API (legacy alternative)
 *  - anything else → console provider (dev): logs the message, reports ok
 */

/** Default destination for evaluation reports: the support inbox. */
const DEFAULT_TO_EMAIL = "support@powerhousegym.co";

/** Display name used for the Gmail envelope/header sender. */
const GMAIL_FROM_NAME = "PowerHouse GYM Evaluaciones";

/** Default SendGrid sender (must match a verified SendGrid sender identity). */
const DEFAULT_SENDGRID_FROM = "PowerHouse GYM <no-reply@powerhousegym.co>";

/** Parse "Name <email@example.com>" into structured {email, name} fields. */
function parseFromHeader(raw: string): { email: string; name?: string } {
  const match = raw.match(/^(.*?)\s*<([^>]+)>$/);
  if (match) {
    const name = match[1].trim().replace(/^"|"$/g, "");
    return name ? { email: match[2].trim(), name } : { email: match[2].trim() };
  }
  return { email: raw.trim() };
}

export function getEmailProvider(env: Env): EmailProvider {
  if (env.EMAIL_PROVIDER === "gmail" || env.EMAIL_PROVIDER === "smtp") {
    return {
      async send(message) {
        const to = env.EVALUATIONS_TO_EMAIL || DEFAULT_TO_EMAIL;
        const user = env.SMTP_USER || "powerhousegymmanizales@gmail.com";
        // A branded EMAIL_FROM name wins; otherwise the default brand name.
        // Gmail forces `user` as the actual sender regardless.
        const displayName =
          parseFromHeader(env.EMAIL_FROM || GMAIL_FROM_NAME).name ??
          GMAIL_FROM_NAME;
        const { sendViaSmtp } = await import("./_gmail-smtp");
        return sendViaSmtp(
          {
            host: env.SMTP_HOST || "smtp.gmail.com",
            port: Number(env.SMTP_PORT || 587),
            user,
            password: env.SMTP_PASSWORD ?? "",
          },
          {
            from: user,
            fromName: displayName,
            to,
            replyTo: to,
            subject: message.subject,
            text: message.text,
            html: message.html,
          },
        );
      },
    };
  }
  if (env.EMAIL_PROVIDER === "sendgrid") {
    return {
      async send(message) {
        const to = env.EVALUATIONS_TO_EMAIL || DEFAULT_TO_EMAIL;
        const from = parseFromHeader(env.EMAIL_FROM || DEFAULT_SENDGRID_FROM);
        try {
          const response = await fetch(
            "https://api.sendgrid.com/v3/mail/send",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${env.SENDGRID_API_KEY ?? ""}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                personalizations: [{ to: [{ email: to }] }],
                from,
                // Replies to the report land in the same support inbox.
                reply_to: { email: to },
                subject: message.subject,
                content: [
                  { type: "text/plain", value: message.text },
                  { type: "text/html", value: message.html },
                ],
              }),
            },
          );
          if (!response.ok) {
            return {
              ok: false,
              error: `sendgrid responded ${response.status}`,
            };
          }
          return { ok: true };
        } catch (error) {
          return {
            ok: false,
            error:
              error instanceof Error ? error.message : "sendgrid fetch failed",
          };
        }
      },
    };
  }
  if (env.EMAIL_PROVIDER === "resend") {
    return {
      async send(message) {
        try {
          const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${env.RESEND_API_KEY ?? ""}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: env.EMAIL_FROM || "PowerHouse GYM <onboarding@resend.dev>",
              to: [env.EVALUATIONS_TO_EMAIL || DEFAULT_TO_EMAIL],
              subject: message.subject,
              html: message.html,
              text: message.text,
            }),
          });
          if (!response.ok) {
            return {
              ok: false,
              error: `resend responded ${response.status}`,
            };
          }
          return { ok: true };
        } catch (error) {
          return {
            ok: false,
            error:
              error instanceof Error ? error.message : "resend fetch failed",
          };
        }
      },
    };
  }
  return {
    async send(message) {
      console.log(`[email:console] ${message.subject}\n${message.text}`);
      return { ok: true };
    },
  };
}
