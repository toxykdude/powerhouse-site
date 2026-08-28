import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  evaluationCategories,
  RECOMMENDATION_OPTIONS,
  MEMBERSHIP_DURATION_OPTIONS,
  MAX_COMMENT_LENGTH,
  TOTAL_REQUIRED_ITEMS,
} from "../../src/data/evaluation";
import { evaluationTrainers } from "../../src/data/evaluation-trainers";

/**
 * Page-source tests for the trainer evaluation frontend (/evaluacion),
 * following the existing page-test style (guest-checkout.test.ts):
 * read the SSG source and assert on copy, config wiring and contracts.
 */

/**
 * Read a source file with collapsed whitespace: HTML/Astro collapses it at
 * render time, and Prettier re-wraps long prose lines, so copy assertions
 * must be layout-independent.
 */
function pageSource(relativePath: string): string {
  return readFileSync(resolve(__dirname, relativePath), "utf-8").replace(
    /\s+/g,
    " ",
  );
}

/** Trainer data lives in the data modules the pages map over (config-driven). */
const trainerSources =
  pageSource("../../src/data/evaluation-trainers.ts") +
  pageSource("../../src/data/trainers.ts");

/** Questionnaire copy lives in evaluation.ts, mapped by the component. */
const evaluationConfig = pageSource("../../src/data/evaluation.ts");

// ---------------------------------------------------------------------------
// /evaluacion — landing: hero copy, trainer cards, SEO props
// ---------------------------------------------------------------------------

describe("evaluacion/index.astro — evaluation landing", () => {
  const source = pageSource("../../src/pages/evaluacion/index.astro");

  it("passes the exact SEO title and description to Base", () => {
    expect(source).toContain(
      'seoTitle="Evaluación de Entrenadores | PowerHouse GYM Manizales"',
    );
    expect(source).toContain(
      'description="Ayúdanos a mejorar tu experiencia en PowerHouse GYM evaluando el servicio, profesionalismo y atención de nuestros entrenadores."',
    );
    expect(source).not.toContain("noindex");
  });

  it("renders the exact hero copy", () => {
    expect(source).toContain("POWERHOUSE GYM MANIZALES");
    expect(source).toContain("AYÚDANOS A MEJORAR LA EXPERIENCIA POWERHOUSE");
    expect(source).toContain(
      "¿Cómo ha sido tu experiencia con nuestros entrenadores?",
    );
    expect(source).toContain(
      "Tu opinión nos ayuda a mejorar continuamente la experiencia de nuestros miembros y a reconocer el excelente trabajo de nuestro equipo.",
    );
  });

  it("renders the three trust bullets", () => {
    expect(source).toContain("Anónima");
    expect(source).toContain("2–4 minutos");
    expect(source).toContain("10 calificaciones + comentarios");
  });

  it("lists every evaluation trainer with a link to their evaluation page", () => {
    // The page maps evaluationTrainers; names/slugs/roles come from the data modules.
    expect(source).toContain("evaluationTrainers.map");
    expect(source).toContain("/evaluacion/${trainer.slug}");
    for (const trainer of evaluationTrainers) {
      expect(trainerSources).toContain(trainer.name);
      expect(trainerSources).toContain(trainer.slug);
      expect(trainerSources).toContain(trainer.role);
    }
    expect(source).toContain("Selecciona el entrenador que deseas evaluar");
    expect(source).toContain("EVALUAR ENTRENADOR");
  });

  it("every evaluation trainer ships an official profile photo (cards + form header)", () => {
    // Business rule: the evaluable roster must always have real photos.
    const photos = evaluationTrainers.map((t) => t.photo);
    for (const [i, trainer] of evaluationTrainers.entries()) {
      expect(photos[i], `${trainer.slug} must have a photo`).toBeTruthy();
    }
    expect(photos).toContain("/uploads/harold-giraldo.png");
    expect(photos).toContain("/uploads/esteban-morales.png");
    expect(photos).toContain("/uploads/brayan-molina.webp");
    // Monogram placeholder stays only as a future-proof fallback branch.
    expect(source).toContain("ev-card__monogram");
  });

  it("includes the exact privacy band copy", () => {
    expect(source).toContain(
      "Tu evaluación es anónima. PowerHouse GYM la usa únicamente para mejorar el servicio y acompañar a su equipo. No publicamos comentarios individuales ni rankings públicos.",
    );
  });
});

// ---------------------------------------------------------------------------
// /evaluacion/[slug] — per-trainer questionnaire page
// ---------------------------------------------------------------------------

describe("evaluacion/[slug].astro — trainer questionnaire page", () => {
  const source = pageSource("../../src/pages/evaluacion/[slug].astro");

  it("builds static paths from evaluationTrainers", () => {
    expect(source).toContain("getStaticPaths");
    expect(source).toContain("evaluationTrainers.map");
    expect(source).toContain("params: { slug: trainer.slug }");
  });

  it("passes per-trainer SEO title and description", () => {
    expect(source).toContain(
      "`Evalúa a ${trainer.name} | PowerHouse GYM Manizales`",
    );
    expect(source).toContain("`Califica tu experiencia con ${trainer.name}");
  });

  it("renders the EvaluationForm with the trainer and a back link", () => {
    expect(source).toContain("<EvaluationForm trainer={trainer} />");
    expect(source).toContain('href="/evaluacion/"');
    expect(source).toContain("← Cambiar de entrenador");
  });
});

// ---------------------------------------------------------------------------
// /evaluacion/gracias — thank-you page
// ---------------------------------------------------------------------------

describe("evaluacion/gracias.astro — thank-you page", () => {
  const source = pageSource("../../src/pages/evaluacion/gracias.astro");

  it("is excluded from search engines", () => {
    expect(source).toContain("noindex");
  });

  it("shows the exact thank-you copy and a home CTA", () => {
    expect(source).toContain("¡GRACIAS POR TU OPINIÓN!");
    expect(source).toContain(
      "Tu evaluación ha sido recibida correctamente. Tus comentarios nos ayudan a seguir mejorando la experiencia PowerHouse.",
    );
    expect(source).toContain("VOLVER AL INICIO");
    expect(source).toMatch(/href="\//);
  });
});

// ---------------------------------------------------------------------------
// EvaluationForm.astro — the reusable questionnaire component
// ---------------------------------------------------------------------------

describe("EvaluationForm.astro — questionnaire component", () => {
  const source = pageSource(
    "../../src/components/evaluation/EvaluationForm.astro",
  );

  it("renders all 10 rating questions from the config", () => {
    expect(evaluationCategories).toHaveLength(10);
    // The component maps the config; every question string must exist in it.
    expect(source).toContain("evaluationCategories");
    expect(source).toContain("{question.question}");
    for (const question of evaluationCategories) {
      expect(evaluationConfig).toContain(question.question);
    }
  });

  it("renders the 5 recommendation and 5 membership duration labels from the config", () => {
    expect(source).toContain("RECOMMENDATION_OPTIONS.map");
    expect(source).toContain("MEMBERSHIP_DURATION_OPTIONS.map");
    expect(source).toContain("{option.label}");
    for (const option of RECOMMENDATION_OPTIONS) {
      expect(evaluationConfig).toContain(option.label);
    }
    for (const option of MEMBERSHIP_DURATION_OPTIONS) {
      expect(evaluationConfig).toContain(option.label);
    }
  });

  it("uses the three exact open-feedback labels with the config max length", () => {
    expect(source).toContain("¿Qué es lo que más valoras de este entrenador?");
    expect(source).toContain(
      "¿Qué podría mejorar este entrenador para ofrecerte mejor experiencia?",
    );
    expect(source).toContain("¿Quieres compartir algún comentario adicional?");
    expect(source).toContain(`maxlength={MAX_COMMENT_LENGTH}`);
    expect(source).toContain(`0/{MAX_COMMENT_LENGTH}`); // char counters
    expect(String(MAX_COMMENT_LENGTH)).toBe("2000");
  });

  it("includes a honeypot input named company", () => {
    expect(source).toContain('name="company"');
    expect(source).toContain('tabindex="-1"');
    expect(source).toContain('autocomplete="off"');
  });

  it("drives progress from TOTAL_REQUIRED_ITEMS and announces it live", () => {
    expect(source).toContain("TOTAL_REQUIRED_ITEMS");
    expect(String(TOTAL_REQUIRED_ITEMS)).toBe("11");
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain("Evaluación — 0%");
  });

  it("respects prefers-reduced-motion", () => {
    expect(source).toContain("(prefers-reduced-motion: reduce)");
    expect(source).toContain("prefersReducedMotion");
  });

  it("announces errors and shows the exact error/success copy", () => {
    expect(source).toContain('role="alert"');
    expect(source).toContain(
      "No pudimos enviar tu evaluación. Por favor intenta nuevamente.",
    );
    expect(source).toContain("Selecciona una calificación para continuar");
    expect(source).toContain("¡GRACIAS POR TU OPINIÓN!");
    expect(source).toContain(
      "Tu evaluación ha sido recibida correctamente. Tus comentarios nos ayudan a seguir mejorando la experiencia PowerHouse.",
    );
    expect(source).toContain("VOLVER AL INICIO");
  });

  it("POSTs the evaluation payload to the API endpoint", () => {
    expect(source).toContain("/api/evaluations");
    expect(source).toContain('method: "POST"');
    expect(source).toContain('"Content-Type": "application/json"');
    expect(source).toContain("trainerSlug");
    expect(source).toContain('company: ""'); // honeypot always empty
  });

  it("renders the Turnstile widget only when a site key is configured", () => {
    expect(source).toContain("PUBLIC_TURNSTILE_SITE_KEY");
    expect(source).toContain("cf-turnstile");
    expect(source).toContain("cf-turnstile-response");
    expect(source).toContain(
      "https://challenges.cloudflare.com/turnstile/v0/api.js",
    );
  });

  it("keeps completed-step semantics accessible (check + sr-only text)", () => {
    expect(source).toContain("(completado)");
    expect(source).toContain("sr-only");
  });
});
