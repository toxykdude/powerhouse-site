# Pricing Cards Specification

## Purpose

A reusable pricing-card component extracted from `planes.astro`, reused by the membership page (Wompi) and by trainer pages (display-only WhatsApp CTA). It keeps the current `planes.astro` design and adds a "featured" variant plus two CTA modes.

**Non-goals:** no Wompi on trainer pages; no change to existing membership prices; the prop API is finalized in design (spec describes behavior, not prop names).

## Requirements

### Requirement: Reusable Card Matches Planes Visual Design

A single pricing-card component MUST render the current `planes.astro` design (card shell, name/price header, checkmark features, CTA). When `planes.astro` consumes it, cards MUST be visually identical to today's markup.

#### Scenario: Membership page unchanged

- GIVEN the current `planes.astro` markup as baseline
- WHEN it is refactored to consume the shared component
- THEN cards keep the same classes, structure, and prices
- AND the Wompi checkout still triggers from the CTA

### Requirement: CTA Mode (Button vs Link)

The card MUST support a CTA mode selected per usage: `button` renders a `<button>` for in-page checkout (`planes.astro`); `link` renders an anchor for WhatsApp (trainer pages). The mode MUST NOT be hard-coded.

#### Scenario: Button mode on planes

- GIVEN a membership card in button mode
- WHEN the CTA renders
- THEN it is a `<button>` that initiates Wompi checkout

#### Scenario: Link mode on a trainer page

- GIVEN a trainer pricing card in link mode
- WHEN the CTA renders
- THEN it is an `<a>` with a WhatsApp `href`

### Requirement: Trainer Cards Are Display-Only With WhatsApp CTA

On trainer pages the pricing cards MUST be display-only. The CTA MUST open `https://wa.me/573154711900` with a prefilled Spanish message, and MUST NOT trigger Wompi (no `data-plan-id`, no widget script, no `/api/payment/signature`).

#### Scenario: No Wompi on trainer pages

- GIVEN a built trainer detail page
- WHEN the pricing section renders
- THEN no element carries `data-plan-id`
- AND the Wompi widget script is absent from the page

#### Scenario: WhatsApp CTA opens a prefilled message

- GIVEN a trainer pricing card
- WHEN a visitor clicks the CTA
- THEN a WhatsApp link to `573154711900` opens
- AND it carries a URL-encoded Spanish message

### Requirement: Featured Variant Supported

The card MUST support a "featured" variant matching the existing `plan-card--featured` style (gold background, badge). For all three trainers the 16-class tier MUST be the featured card.

#### Scenario: Exactly the 16-class tier is featured

- GIVEN any trainer detail page
- WHEN the pricing section renders
- THEN exactly one card (the 16-class tier) is featured
- AND it displays a "RECOMENDADO" badge

### Requirement: Exact Prices And Identical Included Features

The card MUST render the COP prices below (Esteban = Harold; Brayan separate; 16-class tier featured). The four included features MUST be identical across every trainer and tier, exact wording:

1. Esquema de alimentación con conteo de macros
2. Estructura de plan de entrenamiento individual
3. Valoración antropométrica y acompañamiento
4. Resultados desde la 4ta semana

| Trainer | 12 clases/mes | 16 clases/mes | 20 clases/mes |
|---|---|---|---|
| Harold Giraldo | $270.000 COP | $350.000 COP | $400.000 COP |
| Esteban Morales | $270.000 COP | $350.000 COP | $400.000 COP |
| Brayan Molina | $300.000 COP | $380.000 COP | $420.000 COP |

#### Scenario: Harold renders correct prices

- GIVEN Harold Giraldo's detail page
- WHEN the pricing cards render
- THEN amounts are "$270.000", "$350.000", "$400.000" (COP)
- AND the 16-class card is the featured variant

#### Scenario: Brayan renders correct prices

- GIVEN Brayan Molina's detail page
- WHEN the pricing cards render
- THEN amounts are "$300.000", "$380.000", "$420.000" (COP)
- AND the 16-class card is the featured variant

#### Scenario: Included features identical across trainers

- GIVEN all three trainer detail pages built
- WHEN each tier's feature list is collected
- THEN every list equals the four features above
