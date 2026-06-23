# Tasks: Trainer Profile Pages

Add 3 trainer detail pages (`/entrenadores/{harold-giraldo,esteban-morales,brayan-molina}`), wire the homepage grid (4 trainers, 3 linked, JM static, Brayan placeholder), and surface display-only personal-training pricing by extracting a shared `PlanCard.astro` from `planes.astro`. One data module (`src/data/trainers.ts`) is the single source of truth.

> **Highest-risk task:** 2.2 (planes.astro refactor). Exit criterion = zero visual change on `/planes` + Wompi still bound. **Fallback = Option B** (revert planes.astro to current markup; use `PlanCard` for trainer pages only). See Phase 2 note.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~850–950 (additions + deletions) |
| 400-line budget risk | High |
| Chained PRs recommended | No |
| Suggested split | Single PR, 4 work-unit commits (WU1→WU4) |
| Delivery strategy | single-pr-default |
| Chain strategy | size-exception (pending owner confirmation) |

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: High

> **⚠ Budget flag (action required):** Forecast (~850–950 changed lines) **exceeds the 800-line review budget** for `single-pr-default`. The bulk is the PlanCard CSS *move* (planes.astro `−165` / PlanCard.astro `+165` ≈ 330 changed lines for zero net code). The change is cohesive and artificial slicing around shared data would hurt review clarity — so chaining is **not** recommended. **Before apply, the orchestrator must confirm `size:exception` with the owner** (accept one slightly-over-budget PR), per `single-pr-default` rules.

### Suggested Work Units

| Unit | Goal (one commit each) | Files | Verify |
|------|------------------------|-------|--------|
| WU1 | Shared data foundation (builds green, nothing imports yet) | `src/data/trainers.ts` | typecheck |
| WU2 | PlanCard + planes refactor (highest risk; `/planes` unchanged) | `src/components/PlanCard.astro`, `src/pages/planes.astro` | build + visual diff |
| WU3 | Homepage 4-up grid + linking | `src/pages/index.astro` | build + visual |
| WU4 | Detail route + breadcrumb names | `src/pages/entrenadores/[slug].astro`, `src/layouts/Base.astro` | build + manual ×3 |

Each work unit keeps the project building. Commit per `work-unit-commits` skill (behavior, not file-type). Verification (Phase 5) is the final PR gate, not a separate commit.

---

## Phase 1: Foundation — Data Module

- [x] **1.1** Create `src/data/trainers.ts`: export types (`Specialty`, `Currency`, `PricingTier`, `Trainer`), `WHATSAPP_NUMBER`, `SHARED_FEATURES`, and `trainers` array — **4 records in display order** (Juan Manuel → Esteban → Harold → Brayan). Use **Content Reference §A–§F** verbatim. Add optional `seoTitle?: string` / `seoDescription?: string` to `Trainer` (interface extension to satisfy spec R4 per-trainer SEO from one dynamic template); set them on the 3 slugged records per §E.
  - **Acceptance (automated: `npm run typecheck`):** passes. `trainers.length === 4`; exactly 3 records have `slug`+`pricing`(3 tiers)+`extendedBio`+`seoTitle`+`seoDescription`; Juan Manuel has **none** of those; Brayan omits `photo`. Refs: D2, D3, D4, spec R5.

## Phase 2: Shared Component + Planes Refactor (HIGHEST RISK)

- [ ] **2.1** Create `src/components/PlanCard.astro`: Props per Content Reference §G (discriminated CTA union D5; `featuredVariant` default `"featured"`, D6). Generalize the planes.astro L76–107 card markup. **Move ALL `.plan-card*` CSS rules** (planes.astro L257–420 + the card rules inside the L532 `@media`) into PlanCard's scoped `<style>`. Emit root/badge/CTA classes exactly per §H.
  - **Acceptance (automated: `npm run build`):** component compiles. Manual: rendered card carries `plan-card` + variant, badge, CTA element by `cta.type`.
- [ ] **2.2** Refactor `src/pages/planes.astro`: `import PlanCard`; replace the `row1.map` (L78–107) and `row2.map` (L111–140) inline card blocks with `<PlanCard>` calls — `cta={{type:"button", planId: plan.planId, label: plan.cta_label}}`, `isFeatured={plan.is_featured}`, row2 annual → `featuredVariant:"annual"`. **Delete** the moved `.plan-card*` CSS. **KEEP** the `<Fragment slot="head">` Wompi `widget.js` script, the signup WhatsApp `<script>` (L551), and the Wompi `<script>` handler (L565, queries `[data-plan-id]`) — **unchanged**. planes.astro keeps only layout rules (`.planes-page*`, `.plans-sections`, `.plans-grid*`, `.signup-*`).
  - **Acceptance (manual/visual — `/planes` parity §H):** zero visual change; cards emit identical classes; `data-plan-id` present on buttons; Wompi widget still opens. **If visual diff fails → revert this task to Option B** (restore planes.astro; PlanCard used only by trainer pages). Refs: D7, spec pricing-cards R1.

## Phase 3: Homepage Wiring

- [ ] **3.1** Modify `src/pages/index.astro`: `import { trainers } from "../data/trainers"`; delete inline `trainers` array (L4–29). Wrap each card conditionally — `trainer.slug ? <a class="trainer-card-link" href={`/entrenadores/${trainer.slug}`}>{card}</a> : {card}`. Add Brayan placeholder branch (no `<img>` when `!trainer.photo` — see §D). Add `.trainer-card-link{display:block;color:inherit;text-decoration:none;height:100%}`.
  - **Acceptance (automated: build; manual):** 4 cards render; 3 are anchors to detail pages; Juan Manuel is a bare `<article>` (not focusable, no nav); Brayan shows placeholder, no empty `src`. Refs: D2, D8, spec trainer-profiles R2/R3.
- [ ] **3.2** Homepage CSS tweaks (D9): `.trainers__grid` → `grid-template-columns: repeat(4,1fr); gap:1.5rem;` (was `repeat(3,1fr)`/`2rem`); keep `@media(max-width:1024px)`→`repeat(2,1fr)` and `768px`→`1fr`. `.trainer-card__name` → `font-size: clamp(1.375rem,1.6vw,1.875rem);` (was fixed `1.875rem`). Add placeholder styles §D.
  - **Acceptance (visual):** 4 cards fit @80rem without name wrap; responsive collapses 4→2→1.

## Phase 4: Detail Route + Layout

- [ ] **4.1** Create `src/pages/entrenadores/[slug].astro`: `getStaticPaths()` = `trainers.filter(t => t.slug).map(...)` (exactly Harold, Esteban, Brayan). Sections: hero (name/role/photo or Brayan placeholder §D), extended bio (`trainer.extendedBio.map(p => <p>)`), specialties (`trainer.specialties.map(s => <span class="trainer-card__tag">)`), pricing grid (3× `<PlanCard cta={{type:"link", href:waHref(tier), label:"CONSULTAR AGENDAMIENTO"}} isFeatured={tier.isFeatured}>`, `featuredVariant` omitted). `waHref(tier) = https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(tier.whatsappText)}`. Pass `title={trainer.seoTitle}` + `description={trainer.seoDescription}` to Base. **No** `<head>` Wompi script, **no** `data-plan-id`.
  - **Acceptance (automated: build emits `dist/entrenadores/{3 slugs}/index.html`; manual):** each page shows hero+bio+specialties+pricing; exactly one "RECOMENDADO" badge (16-class); prices per §B; CTA opens `wa.me/573154711900?text=…`; **no** `data-plan-id`, **no** `widget.js`. Refs: D1, spec trainer-profiles R1/R4, spec pricing-cards R3/R4/R5.
- [ ] **4.2** Modify `src/layouts/Base.astro`: add to `pageNames` (L45–52): `'entrenadores':'Entrenadores'`, `'harold-giraldo':'Harold Giraldo'`, `'esteban-morales':'Esteban Morales'`, `'brayan-molina':'Brayan Molina'`.
  - **Acceptance (manual):** `/entrenadores/brayan-molina` breadcrumb JSON-LD `name` values are friendly labels, no raw slug. Refs: spec trainer-profiles R6.

## Phase 5: Verification (PR gate — no commit)

- [ ] **5.1** Run **automated** gate: `npm run lint` && `npm run typecheck` && `npm run build` — all pass.
- [ ] **5.2** Run **manual preview** checklist (`npm run preview`) — Content Reference §I.

---

## Content Reference (verbatim — Spanish strings exactly as shown)

### §A Shared exports
```ts
export const WHATSAPP_NUMBER = "573154711900";
export const SHARED_FEATURES: string[] = [
  "Esquema de alimentación con conteo de macros",
  "Estructura de plan de entrenamiento individual",
  "Valoración antropométrica y acompañamiento",
  "Resultados desde la 4ta semana",
];
```

### §B Pricing (COP) — 16-class tier FEATURED. Trainer tiers OMIT `period` (name already says /mes). `features = SHARED_FEATURES`.
| Trainer | slug | 12 clases/mes | **16 clases/mes (FEATURED)** | 20 clases/mes |
|---|---|---|---|---|
| Harold Giraldo | `harold-giraldo` | 270.000 | **350.000** | 400.000 |
| Esteban Morales | `esteban-morales` | 270.000 | **350.000** | 400.000 |
| Brayan Molina | `brayan-molina` | 300.000 | **380.000** | 420.000 |

`PricingTier.name` = the tier identity (`"12 clases/mes"` / `"16 clases/mes"` / `"20 clases/mes"`); `price` = digits only, no `$`/COP (`"350.000"`); `currency` = `"COP"`; `isFeatured` true ONLY on 16-class.

### §C whatsappText (per trainer + tier — full raw ES message; page URL-encodes it)
Template: `"Hola PowerHouse, me interesa el plan de {tier.name} de entrenamiento personal con {trainer.name}. ¿Me das información sobre disponibilidad y inicio?"`
Examples (apply same substitution to all 9 tiers):
- Harold 16-class: `"Hola PowerHouse, me interesa el plan de 16 clases/mes de entrenamiento personal con Harold Giraldo. ¿Me das información sobre disponibilidad y inicio?"`
- Brayan 12-class: `"Hola PowerHouse, me interesa el plan de 12 clases/mes de entrenamiento personal con Brayan Molina. ¿Me das información sobre disponibilidad y inicio?"`
- **CTA label (trainer pages):** `"CONSULTAR AGENDAMIENTO"`

### §D Brayan placeholder (NO `<img>` — D8, spec R3)
Homepage: `.trainer-card__photo--placeholder{aspect-ratio:3/4;display:flex;align-items:center;justify-content:center}` + inner `span{font-family:var(--font-display);font-size:4rem;color:var(--brand-gold);opacity:.4}` showing initials (`name.split(" ").map(n=>n[0]).join("").slice(0,2)` → `"BM"`), `aria-label="Foto de {name} próximamente"`. Detail hero: same monogram, larger.

### §E Trainer records (verbatim copy)
**Order** (data array = homepage/grid order): Juan Manuel Cano, Esteban Morales, Harold Giraldo, Brayan Molina.

| Field | Juan Manuel | Esteban | Harold | Brayan |
|---|---|---|---|---|
| `name` | "Juan Manuel Cano" | "Esteban Morales" | "Harold Giraldo" | "Brayan Molina" |
| `role` | "Founder & CEO de PowerHouse" | "Entrenador Personal PowerHouse" | "Preparador Físico" | "Entrenador Personal" |
| `slug` | — | "esteban-morales" | "harold-giraldo" | "brayan-molina" |
| `photo` | "/uploads/juan-manoel-cano.png" | "/uploads/esteban-morales.png" | "/uploads/harold-giraldo.png" | — (omit) |
| `bio` (homepage) | §E-bios | §E-bios | §E-bios | §E-bios |
| `specialties` | ["Fisiculturismo","Hipertrofia","Nutrición Deportiva","Transformación Corporal"] | ["Biomecánica","Pérdida de Peso","Fuerza","Prevención de Lesiones"] | ["Funcional","Musculación","Wellness","Core"] | ["Composición Corporal","Nutrición Deportiva","Culturismo Natural","Alto Rendimiento","Entrenamiento Femenino","Adulto Mayor"] |

`alt` (keep rich descriptive text, existing): Juan Manuel = "Juan Manuel Cano, fundador y entrenador personal de PowerHouse Gym Manizales, especialista en fisiculturismo e hipertrofia"; Esteban = "Esteban Morales Sánchez, entrenador personal certificado en PowerHouse Gym Manizales, especialista en biomecánica y pérdida de peso"; Harold = "Harold Giraldo, preparador físico en PowerHouse Gym Manizales, especialista en entrenamiento funcional y musculación".

**§E-bios (homepage `bio`, short):**
- Juan Manuel: "Fisiculturista con 16 años de experiencia en el gremio. Fundador de PowerHouse Gym Manizales."
- Esteban: "Especialista en Biomecánica Aplicada al Entrenamiento Personal y Pérdida de Peso. 500+ clientes transformados."
- Harold: "Preparador Físico y Tecnólogo en Entrenamiento Deportivo con amplio conocimiento en funcional y musculación."
- Brayan: "Técnico Laboral en Preparación Física y Entrenamiento Deportivo con 7 años de trayectoria. Especialista en composición corporal, nutrición deportiva y culturismo natural."

**§E-extendedBio (`extendedBio: string[]`, detail page):**
- Harold:
  1. "Preparador Físico y Tecnólogo en Entrenamiento Deportivo. Su enfoque combina entrenamiento funcional y musculación con control técnico riguroso, diseñando programas que se ajustan al nivel y al objetivo de cada persona."
  2. "Acompaña a cada cliente desde la valoración inicial hasta el seguimiento semanal, priorizando la ejecución correcta de cada movimiento para maximizar resultados y reducir el riesgo de lesión."
- Esteban:
  1. "Especialista en Biomecánica Aplicada al Entrenamiento Personal y Pérdida de Peso. Analiza la postura y los patrones de movimiento de cada cliente para diseñar rutinas seguras, eficientes y orientadas a resultados sostenibles."
  2. "Con más de 500 clientes transformados, su método integra fuerza, técnica y hábitos para que cada persona alcance su mejor versión y mantenga sus resultados en el tiempo."
- Brayan (verbatim owner text, split into 2 paragraphs):
  1. "Técnico Laboral en Preparación Física y Entrenamiento Deportivo con 7 años de trayectoria como entrenador de planta y personalizado, además de contar con más de 5 diplomados en nutrición, alimentación y métodos de periodización y dosificación de la carga."
  2. "Impulsado por la filosofía del culturismo natural, se especializa con amplia experiencia en la modificación de la composición corporal (bajar grasa y ganar músculo) con un enfoque estricto en la salud, el bienestar y la longevidad. Su formación científica y versatilidad le permiten diseñar programas de alta precisión adaptados al entrenamiento de la mujer, el adulto mayor y el alto rendimiento deportivo, logrando resultados reales y sostenibles sin atajos perjudiciales."

**§E-SEO (`seoTitle` / `seoDescription`):**
- Harold: `seoTitle="Harold Giraldo · Preparador Físico"`, `seoDescription="Conoce a Harold Giraldo, preparador físico y tecnólogo en entrenamiento deportivo en PowerHouse Gym Manizales. Entrenamiento funcional y musculación con seguimiento personalizado."`
- Esteban: `seoTitle="Esteban Morales · Entrenador Personal"`, `seoDescription="Conoce a Esteban Morales, especialista en biomecánica y pérdida de peso en PowerHouse Gym Manizales. Más de 500 clientes transformados con técnica y resultados sostenibles."`
- Brayan: `seoTitle="Brayan Molina · Entrenador Personal"`, `seoDescription="Conoce a Brayan Molina, entrenador personal en PowerHouse Gym Manizales. Especialista en composición corporal, nutrición deportiva y culturismo natural con enfoque en salud y longevidad."`

### §F PricingTier helper (recommended to avoid 9 hand-typed blocks)
For each slugged trainer, build the 3 tiers programmatically from §B + SHARED_FEATURES + §C template — only `name`/`price`/`isFeatured`/`whatsappText` vary per tier.

### §G PlanCard Props (D5, D6)
```ts
type PlanCardCts =
  | { type: "button"; planId: string; label: string }
  | { type: "link"; href: string; label: string };
interface Props {
  name: string; price: string; currency: string; period?: string;
  features: string[]; isFeatured?: boolean;            // default false
  featuredVariant?: "featured" | "annual";             // default "featured"; trainers NEVER pass "annual"
  cta: PlanCardCts;
}
```

### §H PlanCard emitted classes (must match planes.astro exactly)
- Root: `` `plan-card ${featuredVariant==='annual' ? 'plan-card--annual' : isFeatured ? 'plan-card--featured' : ''}` ``
- Badge: `annual` → `<div class="plan-card__badge plan-card__badge--gold">MEJOR VALOR</div>`; `isFeatured` → `<div class="plan-card__badge">RECOMENDADO</div>`; else none.
- CTA class: `annual`→`plan-card__cta--gold`, `isFeatured`→`plan-card__cta--dark`, else `plan-card__cta--gold`.
- CTA element: `cta.type==='button'` → `<button type="button" data-plan-id={cta.planId}>`; `cta.type==='link'` → `<a href={cta.href} target="_blank" rel="noopener noreferrer">`.
- **Planes parity proof:** row1 Power Pack (is_featured) → `plan-card--featured` + RECOMENDADO ✓; row2 Plan Anual (featured_variant annual) → `plan-card--annual` + MEJOR VALOR ✓; row2 Plan Semestral (plain) → no modifier ✓.

### §I Manual preview checklist (task 5.2)
- [ ] Homepage: 4 cards in one row @80rem; Harold/Esteban/Brayan navigate to detail pages; Juan Manuel not focusable/no nav.
- [ ] Brayan: visible "BM" placeholder on homepage + detail hero; **no** `<img>` with empty `src` anywhere.
- [ ] `/planes`: zero visual change vs pre-refactor; Wompi "PAGAR AHORA" still opens widget; badges correct.
- [ ] Each detail page: prices per §B; exactly one "RECOMENDADO" badge (16-class); CTA opens `wa.me/573154711900?text=…` with prefilled ES message; **no** `data-plan-id`, **no** `widget.js`.
- [ ] Breadcrumbs: `/entrenadores/brayan-molina` → `Inicio › Entrenadores › Brayan Molina` (no raw slug).
- [ ] Responsive: grid collapses 4 → 2 (@1024px) → 1 (@768px); names don't wrap at 4-up.

---

## Notes & Open Items
- **Interface extension (flagged):** `seoTitle?`/`seoDescription?` added to `Trainer` — not in the design's interface block, but required to deliver per-trainer SEO (spec R4) from a single `[slug].astro` template while keeping data as single source of truth (spec R5). Grounded in design "SEO per trainer" section.
- **Name normalization:** `Esteban` `name` = "Esteban Morales" (drops "Sánchez") to match slug/SEO/whatsappText per design; rich `alt` text preserved separately.
- `TrainerCard.astro` is dead code — **do NOT touch** (out of scope).
- Open (owner, non-blocking): confirm CTA label "CONSULTAR AGENDAMIENTO"; Brayan specialties (6 tags derived); Brayan real photo ETA; Brayan extendedBio paragraph break.
