# Design: Trainer Profile Pages

Add three personal-trainer profile pages (`/entrenadores/{harold-giraldo,esteban-morales,brayan-molina}`), wire the homepage grid to them (4 trainers in one row), and surface display-only personal-training pricing by extracting `PlanCard.astro` from `planes.astro` and reusing it with a WhatsApp CTA. One shared data module (`src/data/trainers.ts`) is the single source of truth for homepage + detail pages.

## Technical Approach

**Shared data + shared component.** A typed `trainers.ts` feeds both surfaces. `PlanCard.astro` is extracted from `planes.astro` (Option A — `planes.astro` is refactored to consume it, single source of truth, no visual change). Detail pages are ONE dynamic route (`[slug].astro`) using `getStaticPaths()` filtered to trainers with a `slug`. Owner decisions (4-in-a-row grid, Brayan role = "Entrenador Personal", 16-class featured, identical 4 features, Juan Manuel static, WhatsApp-not-Wompi) are baked in.

## Architecture Decisions

| # | Decision | Choice | Rejected alternative | Rationale |
|---|----------|--------|----------------------|-----------|
| D1 | Profile route shape | **Dynamic `src/pages/entrenadores/[slug].astro`** + `getStaticPaths()` | 3 static per-file pages | DRY — one template, one SEO pattern, one place to change layout. Static output preserved (SSG). |
| D2 | "Has detail page" marker | **Presence of optional `slug`** | Explicit `hasProfile: boolean` | One field, one meaning. Juan Manuel omits `slug` → not linkable, not path-generated. No redundant flag. |
| D3 | Juan Manuel record shape | **`slug?`, `extendedBio?`, `pricing?` OPTIONAL** on `Trainer` | Force every record to carry slug/bio/pricing | Owner decision #5 (no JM detail page) overrides the spec's literal "each record MUST carry…" wording. Intent (shared source of truth, photo optional) is preserved. Homepage branches on `slug`. |
| D4 | Tier label vs. `name` | **Fold class-count into `name`** (e.g. `"16 clases/mes"`); drop separate `classes` field; `period` optional | Separate `classes` + `name="Entrenamiento Personal"` | `PlanCard` renders `name` as the `<h3>`. Per spec table, the tier identity IS the class count. Section heading supplies "Entrenamiento Personal" context. Avoids `/mes` duplication (trainer tiers omit `period`). |
| D5 | PlanCard CTA | **Discriminated union** `{type:'button';planId;label} \| {type:'link';href;label}` | Two components / boolean prop | Type-safe, matches spec "mode MUST NOT be hard-coded". planes→button, trainers→link. |
| D6 | Featured vs. annual variant | **`featuredVariant?: 'featured'\|'annual'`** (default `'featured'`) | Hard-code | Reproduces planes.astro row2 annual exactly. **Trainers NEVER pass `'annual'`** → never emit `plan-card--annual`. |
| D7 | Card CSS ownership | **Move all `.plan-card*` rules into `PlanCard.astro` `<style>` (scoped)**; planes.astro drops them | Global stylesheet | Scoped styles hash to PlanCard's CID and apply to its own tree. planes.astro keeps only layout rules (`.plans-grid`, `.planes-page*`, `.signup-*`). |
| D8 | Brayan photo | **Placeholder `<div>` with monogram, NO `<img>`** | Broken/empty `<img>` | Spec R3: no unresolved `src`. Monogram "BM" in `--brand-gold` display font matches dark theme. |
| D9 | 4-in-a-row fit @80rem | **Gap 2rem→1.5rem; name `clamp(1.375rem,1.6vw,1.875rem)`** | Keep gap 2rem + 1.875rem name | 80rem−(3×1.5rem)/4 ≈ 308px/card. Bebas Neue is condensed, but "ESTEBAN MORALES"/"JUAN MANUEL CANO" risk wrap → name scales down. |

## Data Flow

```
src/data/trainers.ts (single source of truth)
   │
   ├──> index.astro ........atures.map → card; slug? → <a href=/entrenadores/slug>
   │
   └──> entrenadores/[slug].astro
            getStaticPaths() = trainers.filter(t => t.slug)
            │
            └──> PlanCard.astro  (cta.type='link' → wa.me/573154711900)

planes.astro ──> PlanCard.astro  (cta.type='button' → data-plan-id → Wompi)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/data/trainers.ts` | Create | `Trainer`, `PricingTier`, `Specialty` types + 4 trainer records in display order. |
| `src/components/PlanCard.astro` | Create | Reusable card: header, price, features, discriminated CTA. Owns all `.plan-card*` CSS (scoped). |
| `src/pages/entrenadores/[slug].astro` | Create | Dynamic route; `getStaticPaths()` over slugged trainers; hero+bio+specialties+pricing. |
| `src/pages/index.astro` | Modify | Import data; 4-col grid; conditional `<a>` wrap by `slug`; Brayan placeholder branch. |
| `src/pages/planes.astro` | Modify | Consume `PlanCard`; remove duplicated `.plan-card*` CSS + inline card markup. **No visual change.** |
| `src/layouts/Base.astro` | Modify | Add `'entrenadores'` + 3 slug keys to `pageNames` (breadcrumb friendly names). |
| `src/components/TrainerCard.astro` | Untouched | **Dead code — do NOT use.** Cleanup out of scope. |

## Interfaces / Contracts

### `src/data/trainers.ts`

```ts
export type Specialty = string;
export type Currency = "COP";

/** CTA carried per-tier; the page builds the href, PlanCard just renders it. */
export interface PricingTier {
  name: string;            // tier identity, e.g. "16 clases/mes"
  price: string;           // "350.000" (no $, no COP — PlanCard adds them)
  currency: Currency;      // "COP"
  period?: string;         // "/mes" — OMITTED for trainer tiers (name already says /mes)
  isFeatured: boolean;     // true ONLY on the 16-class tier
  features: string[];      // the 4 identical included features
  whatsappText: string;    // full raw ES message (incl. trainer name); page encodes it
}

export interface Trainer {
  name: string;
  role: string;
  bio: string;             // short, for homepage card (existing copy)
  specialties: Specialty[];
  photo?: string;          // OPTIONAL — Brayan omits (placeholder branch)
  alt?: string;
  slug?: string;           // OPTIONAL — presence == "has detail page". Juan Manuel omits.
  extendedBio?: string[];  // OPTIONAL — paragraphs for detail page. Required when slug present.
  pricing?: PricingTier[]; // OPTIONAL — required when slug present. Exactly 3 tiers.
}

export const WHATSAPP_NUMBER = "573154711900"; // matches index.astro / planes.astro / Base.astro footer

export const SHARED_FEATURES: string[] = [
  "Esquema de alimentación con conteo de macros",
  "Estructura de plan de entrenamiento individual",
  "Valoración antropométrica y acompañamiento",
  "Resultados desde la 4ta semana",
];

export const trainers: Trainer[] = [
  { /* Juan Manuel Cano  — NO slug, NO pricing */ },
  { /* Esteban Morales   — slug + pricing (270/350/400) */ },
  { /* Harold Giraldo    — slug + pricing (270/350/400) */ },
  { /* Brayan Molina     — slug + pricing (300/380/420), NO photo */ },
];
```

**Display order** (homepage + grid): Juan Manuel Cano, Esteban Morales, Harold Giraldo, Brayan Molina.

> Note: current `index.astro` order is Juan Manuel → Esteban → Harold. Brayan is appended 4th. The spec lists "Juan Manuel Cano, Esteban Morales, Harold Giraldo, Brayan Molina" — matches.

### `src/components/PlanCard.astro` Props

```ts
type PlanCardCta =
  | { type: "button"; planId: string; label: string }
  | { type: "link"; href: string; label: string };

interface Props {
  name: string;
  price: string;
  currency: string;
  period?: string;                       // rendered only when truthy
  features: string[];
  isFeatured?: boolean;                  // default false
  featuredVariant?: "featured" | "annual"; // default "featured". Trainers NEVER pass "annual".
  cta: PlanCardCta;
}
```

**Emitted classes (must match planes.astro exactly):**
- Root: `` `plan-card ${featuredVariant==='annual' ? 'plan-card--annual' : isFeatured ? 'plan-card--featured' : ''}` ``
- Badge: `annual` → `<div class="plan-card__badge plan-card__badge--gold">MEJOR VALOR</div>`; `featured` → `<div class="plan-card__badge">RECOMENDADO</div>`
- CTA class: `annual`→`plan-card__cta--gold`, `isFeatured`→`plan-card__cta--dark`, else `plan-card__cta--gold`
- CTA element: `cta.type==='button'` → `<button type="button" data-plan-id={cta.planId}>`; `cta.type==='link'` → `<a href={cta.href} target="_blank" rel="noopener noreferrer">`

**Constraint:** trainer pages pass `featuredVariant: "featured"` (or omit). `plan-card--annual` is unreachable on trainer pages → spec "no Wompi" holds (no `data-plan-id` ever emitted in link mode).

### `src/pages/entrenadores/[slug].astro`

```ts
import { trainers } from "../../data/trainers";
export async function getStaticPaths() {
  return trainers
    .filter((t) => t.slug)                       // exactly Harold, Esteban, Brayan
    .map((t) => ({ params: { slug: t.slug }, props: { trainer: t } }));
}
const { trainer } = Astro.props;
// WhatsApp href per tier:
const waHref = (tier: PricingTier) =>
  `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(tier.whatsappText)}`;
```

## Content (baked into data model)

### Pricing (COP) — 16-class tier featured

| Trainer | 12 clases/mes | **16 clases/mes (FEATURED)** | 20 clases/mes |
|---------|---------------|------------------------------|---------------|
| Harold Giraldo | 270.000 | **350.000** | 400.000 |
| Esteban Morales | 270.000 | **350.000** | 400.000 |
| Brayan Molina | 300.000 | **380.000** | 420.000 |

`whatsappText` template (ES, per trainer/tier — example for Harold 16-class):
`"Hola PowerHouse, me interesa el plan de 16 clases/mes de entrenamiento personal con Harold Giraldo. ¿Me das información sobre disponibilidad y inicio?"`

CTA label (trainer pages): **`"CONSULTAR AGENDAMIENTO"`** (concise, action-oriented, fits PlanCard CTA width better than "CONSULTAR / AGENDAR").

### Extended bios (ES, neutral/professional)

**Harold Giraldo** (`extendedBio`):
1. "Preparador Físico y Tecnólogo en Entrenamiento Deportivo. Su enfoque combina entrenamiento funcional y musculación con control técnico riguroso, diseñando programas que se ajustan al nivel y al objetivo de cada persona."
2. "Acompaña a cada cliente desde la valoración inicial hasta el seguimiento semanal, priorizando la ejecución correcta de cada movimiento para maximizar resultados y reducir el riesgo de lesión."

**Esteban Morales** (`extendedBio`):
1. "Especialista en Biomecánica Aplicada al Entrenamiento Personal y Pérdida de Peso. Analiza la postura y los patrones de movimiento de cada cliente para diseñar rutinas seguras, eficientes y orientadas a resultados sostenibles."
2. "Con más de 500 clientes transformados, su método integra fuerza, técnica y hábitos para que cada persona alcance su mejor versión y mantenga sus resultados en el tiempo."

**Brayan Molina** (`extendedBio`) — verbatim owner-provided text (split into 2 paragraphs at a natural break):
1. "Técnico Laboral en Preparación Física y Entrenamiento Deportivo con 7 años de trayectoria como entrenador de planta y personalizado, además de contar con más de 5 diplomados en nutrición, alimentación y métodos de periodización y dosificación de la carga."
2. "Impulsado por la filosofía del culturismo natural, se especializa con amplia experiencia en la modificación de la composición corporal (bajar grasa y ganar músculo) con un enfoque estricto en la salud, el bienestar y la longevidad. Su formación científica y versatilidad le permiten diseñar programas de alta precisión adaptados al entrenamiento de la mujer, el adulto mayor y el alto rendimiento deportivo, logrando resultados reales y sostenibles sin atajos perjudiciales."

**Brayan short bio** (`bio`, for homepage card): "Técnico Laboral en Preparación Física y Entrenamiento Deportivo con 7 años de trayectoria. Especialista en composición corporal, nutrición deportiva y culturismo natural."

**Brayan specialties** (derived from owner bio): `["Composición Corporal", "Nutrición Deportiva", "Culturismo Natural", "Alto Rendimiento", "Entrenamiento Femenino", "Adulto Mayor"]`

## Component design

### PlanCard.astro CSS relocation (Option A — recommended)
1. Create `PlanCard.astro` with the markup from planes.astro L76–107 (row1 card) generalized via Props.
2. **Move ALL `.plan-card*` CSS rules** (planes.astro L257–420: `.plan-card`, `--featured`, `--annual`, `__badge`, `__header`, `__price`, `__features`, `__cta`, CTA variants, the `@media (max-width:768px)` card rules) into `PlanCard.astro` `<style>` (scoped). Astro scopes them to PlanCard's CID — they apply to PlanCard's tree.
3. **planes.astro keeps**: `.planes-page*`, `.plans-sections`, `.plans-grid`, `.plans-grid--3/--2`, `.signup-*` (layout only).
4. planes.astro refactor: replace the two inline `{row1.map(...)}` / `{row2.map(...)}` card blocks with `{row1.map(p => <PlanCard {...} cta={{type:'button',planId:p.planId,label:p.cta_label}} />)}`. Map `is_featured`→`isFeatured`; row2 annual → `featuredVariant:"annual"`.
5. planes.astro KEEPS: `<Fragment slot="head">` Wompi widget script + bottom Wompi `<script>` handler (unchanged — still query `[data-plan-id]`).

### Verification (Option A — must be visually identical)
- `npm run build` + `npm run typecheck` + `npm run lint` pass.
- `npm run preview`: `/planes` cards emit identical classes (`plan-card`, `--featured`/`--annual`, `__cta--dark/--gold`, `data-plan-id` on buttons); Wompi widget `<script>` still in `<head>`; handler still bound.
- Eyeball/screenshot diff `/planes` before vs after — zero visual change is the exit criterion. Fallback if regression: revert to Option B (PlanCard for trainers only, planes.astro untouched).

## Homepage changes (`index.astro`)

- **Replace** inline `trainers` array (L4–29) with `import { trainers } from "../data/trainers";`.
- **Grid**: `.trainers__grid { grid-template-columns: repeat(4, 1fr); gap: 1.5rem; }` (was `repeat(3,1fr)` / `2rem`). Breakpoints: `@media(max-width:1024px)` → `repeat(2,1fr)` (unchanged); `@media(max-width:768px)` → `1fr` (unchanged).
- **Name font**: `.trainer-card__name { font-size: clamp(1.375rem, 1.6vw, 1.875rem); }` (was fixed `1.875rem`) — prevents "ESTEBAN MORALES" / "JUAN MANUEL CANO" wrap at 4-up.
- **Card linking** (conditional by `slug`):

```astro
{trainers.map((trainer, idx) => {
  const inner = (
    <article class="trainer-card" style={`animation-delay:${idx * 0.15}s`}>
      <div class="trainer-card__photo">
        {trainer.photo ? (
          <img src={trainer.photo} alt={trainer.alt || trainer.name} loading="lazy" />
        ) : (
          <div class="trainer-card__photo--placeholder" aria-label={`Foto de ${trainer.name} próximamente`}>
            <span>{trainer.name.split(" ").map(n => n[0]).join("").slice(0,2)}</span>
          </div>
        )}
        <div class="trainer-card__photo-gradient"></div>
      </div>
      <div class="trainer-card__info">…name/role/bio/tags…</div>
    </article>
  );
  return trainer.slug ? (
    <a href={`/entrenadores/${trainer.slug}`} class="trainer-card-link">{inner}</a>
  ) : inner;
})}
```

- Add `.trainer-card-link { display:block; color:inherit; text-decoration:none; height:100%; }`. The grid's direct children become the `<a>` (or `<article>` for JM) — both render as block, grid stays aligned.
- Juan Manuel (no `slug`) renders bare `<article>` → **not keyboard-focusable as a link**, **no navigation** (spec satisfied). Hover styles (`.trainer-card:hover`) still work because the `<article>` stays the styled element inside the anchor.
- **Placeholder** (Brayan): `.trainer-card__photo--placeholder { aspect-ratio:3/4; display:flex; align-items:center; justify-content:center; }` + `span { font-family:var(--font-display); font-size:4rem; color:var(--brand-gold); opacity:0.4; }`. NO `<img>` → spec R3 satisfied.

## Detail page structure (`[slug].astro`)

Sections (reuse existing site patterns — `.section-title`, gold tagline, `--brand-*` tokens — from index.astro / nosotros.astro):
1. **Hero**: tagline "Entrenadores", `<h1>` = trainer name, role subtitle, photo (or Brayan placeholder, larger).
2. **Extended bio**: `trainer.extendedBio.map(p => <p>…</p>)` in a max-width column (mirror nosotros `story-section__text`).
3. **Specialties**: `trainer.specialties.map(s => <span class="trainer-card__tag">{s}</span>)` (reuse tag style).
4. **Pricing**: `<h2 class="section-title">PLANES DE ENTRENAMIENTO PERSONAL</h2>` + 3-col grid of `<PlanCard>` with `cta={{type:"link", href:waHref(tier), label:"CONSULTAR AGENDAMIENTO"}}`, `featuredVariant:"featured"` (default), `isFeatured={tier.isFeatured}`. **No `<head>` Wompi script, no `data-plan-id`** → spec "no Wompi" satisfied.

**SEO per trainer** (Base.astro props):
- Harold: `title="Harold Giraldo · Preparador Físico"`, `description="Conoce a Harold Giraldo, preparador físico y tecnólogo en entrenamiento deportivo en PowerHouse Gym Manizales. Entrenamiento funcional y musculación con seguimiento personalizado."`
- Esteban: `title="Esteban Morales · Entrenador Personal"`, `description="Conoce a Esteban Morales, especialista en biomecánica y pérdida de peso en PowerHouse Gym Manizales. Más de 500 clientes transformados con técnica y resultados sostenibles."`
- Brayan: `title="Brayan Molina · Entrenador Personal"`, `description="Conoce a Brayan Molina, entrenador personal en PowerHouse Gym Manizales. Especialista en composición corporal, nutrición deportiva y culturismo natural con enfoque en salud y longevidad."`

OG/Twitter/canonical inherited from Base.astro.

## Layout / nav (`Base.astro`)

Add to `pageNames` (L45–52):
```ts
'entrenadores': 'Entrenadores',
'harold-giraldo': 'Harold Giraldo',
'esteban-morales': 'Esteban Morales',
'brayan-molina': 'Brayan Molina',
```
Breadcrumb for `/entrenadores/brayan-molina` → `Inicio › Entrenadores › Brayan Molina` (no raw slug). Minimal, self-contained in the layout (no `trainers.ts` import — avoids layout↔data coupling).

## Constraints / Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| 4-in-a-row overflow @80rem | Med | Gap 1.5rem + responsive name font (D9). Photo keeps 3/4 aspect. If QA shows cramping, reduce photo to 1/1 at this breakpoint only. |
| planes.astro refactor regresses live pricing | Med | Markup 1:1; verify build + visual diff (above). Fallback = Option B. |
| Brayan broken `<img>` | High (spec) | Placeholder div, no `<img>` (D8). |
| Featured tier emits `--annual` | Med (spec) | `featuredVariant` default `"featured"`; trainers never pass `"annual"` (D6). |
| `TrainerCard.astro` confusion | Low | Documented as dead code; untouched. |
| Brayan specialties unconfirmed | Low | Verbatim bio baked in; 6 specialty tags derived from bio for owner to confirm. |

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Build/typecheck | All pages emit; types check | `npm run build`, `npm run typecheck`, `npm run lint` (project has no Vitest usage for pages). |
| Visual — homepage | 4 cards, 3 link, JM static, Brayan placeholder | `npm run preview`; click Harold→/entrenadores/harold-giraldo; JM not focusable. |
| Visual — detail ×3 | hero+bio+specialties+pricing; 16-class featured; prices correct | Eyeball each slug; confirm "RECOMENDADO" badge on 16-class only. |
| Visual — `/planes` | Zero change after PlanCard refactor | Before/after screenshot diff; Wompi button still opens widget. |
| Spec assertions | No Wompi on trainer pages | View source: no `data-plan-id`, no `widget.js` script. WhatsApp href = `wa.me/573154711900?text=…`. |

## Migration / Rollout

No migration — pure additive static SSG (3 new pages, 1 new component, 1 new data module) + two isolated edits (`index.astro`, `planes.astro`). Rollback = revert PR; clean redeploy, no API/data changes. (Cloudflare Pages static output; no Workers/R2 touched.)

## Open Questions

- [ ] **Brayan extendedBio**: verbatim owner-provided text now baked in (2-paragraph split). Owner to review the paragraph break only.
- [ ] **Brayan specialties**: 6 tags derived from the bio; owner to confirm.
- [ ] **Brayan real photo**: ETA from owner (placeholder ships first).
- [ ] Confirm CTA label `"CONSULTAR AGENDAMIENTO"` is acceptable (proposed; alternative `"CONSULTAR / AGENDAR"`).

## Next step

Ready for `tasks` (sdd-tasks) — turn each File Change + Decision into a phased, checkbox task list.
