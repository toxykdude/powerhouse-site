import { describe, it, expect, vi } from "vitest";
import {
  escapeHtml,
  getEmailProvider,
  renderEvaluationEmail,
} from "../../functions/api/evaluations/_email";
import type {
  Env,
  ValidatedInput,
} from "../../functions/api/evaluations/_types";
import {
  evaluationCategories,
  recommendationLabel,
} from "../../src/data/evaluation";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const payload: ValidatedInput = {
  trainerSlug: "harold-giraldo",
  ratings: {
    empathy: 5,
    respect: 4,
    attention: 5,
    availability: 4,
    communication: 5,
    motivation: 4,
    technicalExpertise: 5,
    personalizedGuidance: 4,
    professionalism: 5,
    overallExperience: 5,
  },
  recommendation: "definitely_yes",
  membershipDuration: "more_1_year",
  positiveFeedback: "<script>alert(1)</script>",
  improvementFeedback: "Nada por ahora",
  additionalComments: null,
};

// overall mean = (5+4+5+4+5+4+5+4+5+5) / 10 = 4.6
const scores = { overall: 4.6, experience: 4.57, professional: 4.5 };

const message = renderEvaluationEmail({
  trainerName: "Harold Giraldo",
  payload,
  scores,
  receivedAt: new Date("2026-08-28T18:30:00Z"),
});

// ---------------------------------------------------------------------------
// escapeHtml
// ---------------------------------------------------------------------------

describe("escapeHtml", () => {
  it("neutralizes HTML special characters", () => {
    expect(escapeHtml("<script>\"a\" & 'b'</script>")).toBe(
      "&lt;script&gt;&quot;a&quot; &amp; &#39;b&#39;&lt;/script&gt;",
    );
  });
});

// ---------------------------------------------------------------------------
// renderEvaluationEmail
// ---------------------------------------------------------------------------

describe("renderEvaluationEmail", () => {
  it("formats the subject with trainer name and one-decimal overall score", () => {
    expect(message.subject).toBe(
      "Evaluación de Harold Giraldo — 4.6/5 · PowerHouse GYM",
    );
  });

  it("includes all 10 dimension labels with their values", () => {
    for (const category of evaluationCategories) {
      expect(message.html).toContain(category.label);
      expect(message.html).toContain(`${payload.ratings[category.key]}/5`);
    }
  });

  it("includes the Spanish rating-value label per dimension", () => {
    expect(message.html).toContain("Excelente");
    expect(message.html).toContain("Bueno");
  });

  it("includes the Spanish recommendation label", () => {
    expect(message.html).toContain(recommendationLabel("definitely_yes"));
    expect(message.html).toContain("Definitivamente sí");
    expect(message.text).toContain("Definitivamente sí");
  });

  it("includes the membership duration label", () => {
    expect(message.html).toContain("Más de 1 año");
  });

  it("escapes user feedback so injected HTML stays inert", () => {
    expect(message.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(message.html).not.toContain("<script>alert(1)</script>");
  });

  it("shows 'Sin comentarios' for empty feedback blocks", () => {
    expect(message.html).toContain("Sin comentarios");
    expect(message.text).toContain("Sin comentarios");
  });

  it("includes the summary line with all three scores", () => {
    expect(message.html).toContain("Puntaje global 4.60 / 5");
    expect(message.html).toContain("Experiencia del cliente 4.57");
    expect(message.html).toContain("Desempeño profesional 4.50");
  });

  it("includes brand header and anonymity footer", () => {
    expect(message.html).toContain("POWERHOUSE GYM MANIZALES");
    expect(message.html).toContain(
      "Evaluación anónima · Sistema de Experiencia PowerHouse",
    );
    expect(message.text).toContain(
      "Evaluación anónima · Sistema de Experiencia PowerHouse",
    );
  });

  it("plain-text version contains the trainer name and raw feedback", () => {
    expect(message.text).toContain("Harold Giraldo");
    expect(message.text).toContain("<script>alert(1)</script>");
    expect(message.text).toContain("Nada por ahora");
  });

  it("shows 'No respondió' when membership duration is missing", () => {
    const withoutMembership = renderEvaluationEmail({
      trainerName: "Brayan Molina",
      payload: { ...payload, membershipDuration: null },
      scores,
      receivedAt: new Date("2026-08-28T18:30:00Z"),
    });
    expect(withoutMembership.html).toContain("No respondió");
  });
});

// ---------------------------------------------------------------------------
// getEmailProvider
// ---------------------------------------------------------------------------

describe("getEmailProvider", () => {
  it("console provider logs and reports ok", async () => {
    const provider = getEmailProvider({} as Env);

    const result = await provider.send(message);

    expect(result.ok).toBe(true);
  });

  it("resend provider sends the expected payload to the Resend API", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));

    const env = {
      EMAIL_PROVIDER: "resend",
      RESEND_API_KEY: "re_test_key",
      EMAIL_FROM: "PowerHouse GYM <evaluaciones@powerhousegym.co>",
      EVALUATIONS_TO_EMAIL: "powerhousegymmanizales@gmail.com",
    } as unknown as Env;
    const provider = getEmailProvider(env);

    const result = await provider.send(message);

    expect(result.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer re_test_key",
        }),
      }),
    );
    const sentBody = JSON.parse(
      (fetchSpy.mock.calls[0]?.[1] as RequestInit).body as string,
    );
    expect(sentBody.subject).toBe(message.subject);
    expect(sentBody.from).toBe(
      "PowerHouse GYM <evaluaciones@powerhousegym.co>",
    );
    expect(sentBody.to).toEqual(["powerhousegymmanizales@gmail.com"]);

    fetchSpy.mockRestore();
  });

  it("resend provider reports failure on a non-2xx response", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("Unauthorized", { status: 401 }));

    const provider = getEmailProvider({
      EMAIL_PROVIDER: "resend",
      RESEND_API_KEY: "bad",
    } as Env);

    const result = await provider.send(message);

    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();

    fetchSpy.mockRestore();
  });

  it("resend provider reports failure when fetch rejects", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("network down"));

    const provider = getEmailProvider({
      EMAIL_PROVIDER: "resend",
      RESEND_API_KEY: "key",
    } as Env);

    const result = await provider.send(message);

    expect(result.ok).toBe(false);

    fetchSpy.mockRestore();
  });

  it("sendgrid provider sends the expected v3 payload (202 accepted)", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("", { status: 202 }));

    const env = {
      EMAIL_PROVIDER: "sendgrid",
      SENDGRID_API_KEY: "SG.test_key_1234567890",
      EMAIL_FROM: "PowerHouse GYM <evaluaciones@powerhousegym.co>",
      EVALUATIONS_TO_EMAIL: "support@powerhousegym.co",
    } as unknown as Env;
    const provider = getEmailProvider(env);

    const result = await provider.send(message);

    expect(result.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.sendgrid.com/v3/mail/send",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer SG.test_key_1234567890",
        }),
      }),
    );
    const sentBody = JSON.parse(
      (fetchSpy.mock.calls[0]?.[1] as RequestInit).body as string,
    );
    expect(sentBody.personalizations[0].to[0].email).toBe(
      "support@powerhousegym.co",
    );
    expect(sentBody.from).toEqual({
      email: "evaluaciones@powerhousegym.co",
      name: "PowerHouse GYM",
    });
    expect(sentBody.reply_to).toEqual({ email: "support@powerhousegym.co" });
    expect(sentBody.subject).toBe(message.subject);
    expect(sentBody.content).toEqual([
      { type: "text/plain", value: message.text },
      { type: "text/html", value: message.html },
    ]);

    fetchSpy.mockRestore();
  });

  it("sendgrid provider defaults sender and destination when unset", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("", { status: 202 }));

    const provider = getEmailProvider({
      EMAIL_PROVIDER: "sendgrid",
    } as Env);

    await provider.send(message);

    const sentBody = JSON.parse(
      (fetchSpy.mock.calls[0]?.[1] as RequestInit).body as string,
    );
    expect(sentBody.from).toEqual({
      email: "no-reply@powerhousegym.co",
      name: "PowerHouse GYM",
    });
    expect(sentBody.personalizations[0].to[0].email).toBe(
      "support@powerhousegym.co",
    );

    fetchSpy.mockRestore();
  });

  it("sendgrid provider reports failure on a non-2xx response", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("Forbidden", { status: 403 }));

    const provider = getEmailProvider({
      EMAIL_PROVIDER: "sendgrid",
      SENDGRID_API_KEY: "bad",
    } as Env);

    const result = await provider.send(message);

    expect(result.ok).toBe(false);
    expect(result.error).toBe("sendgrid responded 403");

    fetchSpy.mockRestore();
  });
});
