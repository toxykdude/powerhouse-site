/**
 * evaluation.ts — single source of truth for the trainer evaluation
 * questionnaire.
 *
 * Consumed by:
 *  - src/components/evaluation/EvaluationForm.astro (UI rendering)
 *  - src/pages/evaluacion/* (SEO copy)
 *  - functions/api/evaluations/* (server-side validation + scoring + email)
 *
 * IMPORTANT: keep this file framework-free plain TypeScript (no Astro
 * imports). It is bundled both by Astro (UI) and by the Cloudflare Pages
 * Functions esbuild pipeline (API).
 *
 * Editing questions here updates the UI, the API validation, the scoring
 * model and the email report without touching any component.
 */

// ---------------------------------------------------------------------------
// Rating scale
// ---------------------------------------------------------------------------

export interface RatingScaleOption {
  value: 1 | 2 | 3 | 4 | 5;
  label: string;
}

/** 1–5 scale labels, per the business specification. */
export const RATING_SCALE: readonly RatingScaleOption[] = [
  { value: 1, label: "Muy deficiente" },
  { value: 2, label: "Deficiente" },
  { value: 3, label: "Aceptable" },
  { value: 4, label: "Bueno" },
  { value: 5, label: "Excelente" },
] as const;

/** Map a raw rating value (1–5) to its Spanish label. */
export function ratingValueLabel(value: number): string {
  const found = RATING_SCALE.find((option) => option.value === value);
  return found ? found.label : String(value);
}

// ---------------------------------------------------------------------------
// Evaluation dimensions (the 10 scored questions)
// ---------------------------------------------------------------------------

/**
 * scoreGroup drives the analytics model (business principle: customer
 * experience vs professional/technical performance must be distinguishable):
 *  - 'experience'  → Empatía, Respeto, Atención, Disponibilidad,
 *                    Comunicación, Motivación, Profesionalismo
 *  - 'professional'→ Conocimiento técnico, Orientación personalizada
 *  - 'overall'     → Experiencia general (only feeds the overall score)
 */
export type ScoreGroup = "experience" | "professional" | "overall";

/** The 10 rating keys, exactly matching the specification naming. */
export type RatingKey =
  | "empathy"
  | "respect"
  | "attention"
  | "availability"
  | "communication"
  | "motivation"
  | "technicalExpertise"
  | "personalizedGuidance"
  | "professionalism"
  | "overallExperience";

export interface RatingQuestionDef {
  /** Stable machine key — also the DB column name and the radio group name. */
  key: RatingKey;
  /** Short Spanish label (email report, analytics, summaries). */
  label: string;
  /** Full Spanish question text shown to the customer. */
  question: string;
  /** Analytics grouping (see ScoreGroup). */
  scoreGroup: ScoreGroup;
  /** Multi-step UI: step 1 = customer experience, step 2 = professional. */
  step: 1 | 2;
}

/** All scored dimensions, in questionnaire order. */
export const evaluationCategories: readonly RatingQuestionDef[] = [
  {
    key: "empathy",
    label: "Empatía",
    question:
      "¿El entrenador demuestra empatía y comprende tus necesidades como usuario?",
    scoreGroup: "experience",
    step: 1,
  },
  {
    key: "respect",
    label: "Respeto",
    question: "¿El entrenador te trata con respeto y profesionalismo?",
    scoreGroup: "experience",
    step: 1,
  },
  {
    key: "attention",
    label: "Atención",
    question:
      "¿El entrenador presta atención a tus preguntas, necesidades y objetivos?",
    scoreGroup: "experience",
    step: 1,
  },
  {
    key: "availability",
    label: "Disponibilidad",
    question:
      "¿El entrenador está disponible y dispuesto a ayudarte cuando lo necesitas?",
    scoreGroup: "experience",
    step: 1,
  },
  {
    key: "communication",
    label: "Comunicación",
    question:
      "¿El entrenador explica los ejercicios y recomendaciones de manera clara?",
    scoreGroup: "experience",
    step: 1,
  },
  {
    key: "motivation",
    label: "Motivación",
    question:
      "¿El entrenador te motiva y genera una experiencia positiva durante tu entrenamiento?",
    scoreGroup: "experience",
    step: 1,
  },
  {
    key: "technicalExpertise",
    label: "Conocimiento técnico",
    question:
      "¿Consideras que el entrenador demuestra conocimiento técnico y experiencia en entrenamiento?",
    scoreGroup: "professional",
    step: 2,
  },
  {
    key: "personalizedGuidance",
    label: "Orientación personalizada",
    question:
      "¿El entrenador adapta sus recomendaciones a tus objetivos y necesidades?",
    scoreGroup: "professional",
    step: 2,
  },
  {
    key: "professionalism",
    label: "Profesionalismo",
    question:
      "¿El entrenador mantiene una actitud profesional durante su trabajo?",
    scoreGroup: "experience",
    step: 1,
  },
  {
    key: "overallExperience",
    label: "Experiencia general",
    question: "En general, ¿cómo calificas tu experiencia con este entrenador?",
    scoreGroup: "overall",
    step: 2,
  },
] as const;

const RATING_KEYS: readonly RatingKey[] = evaluationCategories.map(
  (category) => category.key,
);

/** Type guard for a valid rating key. */
export function isRatingKey(key: string): key is RatingKey {
  return (RATING_KEYS as readonly string[]).includes(key);
}

/** All rating keys in questionnaire order. */
export function getRatingKeys(): readonly RatingKey[] {
  return RATING_KEYS;
}

/** Short Spanish label for a rating key (email + analytics). */
export function ratingKeyLabel(key: RatingKey): string {
  const found = evaluationCategories.find((category) => category.key === key);
  return found ? found.label : key;
}

/** Full question text for a rating key. */
export function ratingQuestion(key: RatingKey): string {
  const found = evaluationCategories.find((category) => category.key === key);
  return found ? found.question : key;
}

// ---------------------------------------------------------------------------
// Steps (multi-step UX)
// ---------------------------------------------------------------------------

export interface EvaluationStepDef {
  id: 1 | 2 | 3 | 4;
  /** Short step title shown in the sticky progress header. */
  short: string;
  /** Step heading shown at the top of the step body. */
  title: string;
  description: string;
}

export const EVALUATION_STEPS: readonly EvaluationStepDef[] = [
  {
    id: 1,
    short: "Experiencia",
    title: "Tu experiencia con el entrenador",
    description:
      "Cómo ha sido tu interacción y trato durante tus entrenamientos.",
  },
  {
    id: 2,
    short: "Desempeño profesional",
    title: "Desempeño profesional",
    description:
      "Conocimiento técnico y capacidad de adaptar el entrenamiento a ti.",
  },
  {
    id: 3,
    short: "Recomendación",
    title: "¿Lo recomendarías?",
    description: "Tu recomendación nos ayuda a reconocer al equipo.",
  },
  {
    id: 4,
    short: "Comentarios",
    title: "Comentarios adicionales",
    description:
      "Cuéntanos qué valoras y qué se puede mejorar (todos opcionales).",
  },
] as const;

// ---------------------------------------------------------------------------
// Recommendation (single-choice)
// ---------------------------------------------------------------------------

export type Recommendation =
  | "definitely_yes"
  | "probably_yes"
  | "not_sure"
  | "probably_no"
  | "definitely_no";

export interface RecommendationOption {
  value: Recommendation;
  label: string;
}

export const RECOMMENDATION_OPTIONS: readonly RecommendationOption[] = [
  { value: "definitely_yes", label: "Definitivamente sí" },
  { value: "probably_yes", label: "Probablemente sí" },
  { value: "not_sure", label: "No estoy seguro/a" },
  { value: "probably_no", label: "Probablemente no" },
  { value: "definitely_no", label: "Definitivamente no" },
] as const;

/** Spanish label for a recommendation value. */
export function recommendationLabel(value: string): string {
  const found = RECOMMENDATION_OPTIONS.find((option) => option.value === value);
  return found ? found.label : value;
}

// ---------------------------------------------------------------------------
// Membership duration (optional single-choice)
// ---------------------------------------------------------------------------

export type MembershipDuration =
  | "less_1_month"
  | "1_3_months"
  | "3_6_months"
  | "6_12_months"
  | "more_1_year";

export interface MembershipDurationOption {
  value: MembershipDuration;
  label: string;
}

export const MEMBERSHIP_DURATION_OPTIONS: readonly MembershipDurationOption[] =
  [
    { value: "less_1_month", label: "Menos de 1 mes" },
    { value: "1_3_months", label: "1–3 meses" },
    { value: "3_6_months", label: "3–6 meses" },
    { value: "6_12_months", label: "6–12 meses" },
    { value: "more_1_year", label: "Más de 1 año" },
  ] as const;

/** Spanish label for a membership duration value. */
export function membershipDurationLabel(value: string): string {
  const found = MEMBERSHIP_DURATION_OPTIONS.find(
    (option) => option.value === value,
  );
  return found ? found.label : value;
}

// ---------------------------------------------------------------------------
// Limits + progress math
// ---------------------------------------------------------------------------

/** Max characters for each open-feedback textarea (server enforces too). */
export const MAX_COMMENT_LENGTH = 2000;

/** Required items that drive the progress indicator: 10 ratings + 1 recommendation. */
export const TOTAL_REQUIRED_ITEMS = evaluationCategories.length + 1; // 11

// ---------------------------------------------------------------------------
// API payload contract (POST /api/evaluations)
// ---------------------------------------------------------------------------

export type Rating1to5 = 1 | 2 | 3 | 4 | 5;

/** Ratings map — every key of RatingKey with an integer 1–5. */
export type RatingsMap = Record<RatingKey, Rating1to5>;

export interface EvaluationPayload {
  trainerSlug: string;
  ratings: RatingsMap;
  recommendation: Recommendation;
  membershipDuration?: MembershipDuration | null;
  positiveFeedback?: string | null;
  improvementFeedback?: string | null;
  additionalComments?: string | null;
  /** Honeypot field — must stay empty (spam trap, visually hidden). */
  company?: string;
  /** Cloudflare Turnstile token, required when the site has it configured. */
  turnstileToken?: string | null;
}
