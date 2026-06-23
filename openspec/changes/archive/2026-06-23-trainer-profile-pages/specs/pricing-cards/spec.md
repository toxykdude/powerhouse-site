# Pricing Cards Specification

## Purpose

A reusable pricing-card component extracted from `planes.astro`, reused by the membership page and by trainer pages. Both surfaces render the identical card shell (name/price header, checkmark features, CTA) and both support direct Wompi checkout via `button` CTA mode. The component also retains a `link` CTA mode (WhatsApp anchor) for reuse on future surfaces. It keeps the current `planes.astro` design and adds a "featured" variant plus the two CTA modes.

**Non-goals:** no change to existing membership prices on `/planes`; the prop API is finalized in design (spec describes behavior, not prop names). Wompi **webhook / automatic PT-plan activation** is a known open item (see Open Items) — checkout + redirect to `/pago/confirmacion` works end-to-end, but back-office activation for the 9 personal-training plans is not yet automated.

## Requirements

### Requirement: Reusable Card Matches Planes Visual Design

A single pricing-card component MUST render the current `planes.astro` design (card shell, name/price header, checkmark features, CTA). When `planes.astro` consumes it, cards MUST be visually identical to the original inline markup.

#### Scenario: Membership page unchanged

- GIVEN the original `planes.astro` inline markup as baseline
- WHEN it is refactored to consume the shared component
- THEN cards keep the same classes, structure, and prices
- AND the Wompi checkout still triggers from the CTA

### Requirement: CTA Mode (Button vs Link)

The card MUST support a CTA mode selected per usage: `button` renders a `<button>` that initiates Wompi in-page checkout; `link` renders an anchor (e.g. a WhatsApp `href`) for surfaces that only need an external link. The mode MUST NOT be hard-coded — the consuming page selects it via the CTA prop.

#### Scenario: Button mode on planes

- GIVEN a membership card rendered in button mode
- WHEN the CTA renders
- THEN it is a `<button>` carrying a `data-plan-id` that initiates Wompi checkout

#### Scenario: Button mode on a trainer page

- GIVEN a personal-training pricing card rendered in button mode
- WHEN the CTA renders
- THEN it is a `<button>` carrying a `data-plan-id` bound to a personal-training plan
- AND clicking it opens the Wompi widget (no navigation away on click)

#### Scenario: Link mode available

- GIVEN a card rendered in link mode (e.g. a future WhatsApp-only surface)
- WHEN the CTA renders
- THEN it is an `<a>` whose `href` is the supplied URL

### Requirement: Trainer Cards Support Direct Wompi Payment

On trainer pages the pricing cards MUST offer direct Wompi payment at the plan's displayed total. The CTA MUST be a `<button>` in `button` mode carrying a `data-plan-id`; clicking it MUST request an integrity signature from `/api/payment/signature`, load the Wompi widget (`widget.js` in the page `<head>`), and redirect to `/pago/confirmacion` on a successful transaction. The trainer pages therefore MUST include the Wompi `widget.js` script and the signature/widget client handler (mirroring `planes.astro`).

> Historical note: an earlier version of this capability specified trainer cards as "display-only with a WhatsApp CTA, no Wompi". The owner subsequently requested direct Wompi payment on trainer pages; the shipped reality reflects that change. The `link`/WhatsApp CTA mode remains supported by the component for other surfaces, and the per-trainer `whatsappText` message is retained in the data model for that purpose, but the trainer detail pages ship in `button` mode.

#### Scenario: Wompi checkout wired on trainer pages

- GIVEN a built trainer detail page
- WHEN the pricing section renders
- THEN each pricing card CTA is a `<button>` with a `data-plan-id` matching a personal-training plan
- AND the Wompi `widget.js` script is present in the page `<head>`
- AND the client handler fetches `/api/payment/signature` and opens `WidgetCheckout` on click

#### Scenario: Successful payment redirects to confirmation

- GIVEN a trainer pricing card CTA
- WHEN a visitor completes a Wompi transaction
- THEN the browser redirects to `/pago/confirmacion` carrying the transaction id

### Requirement: Nine Personal-Training Plan IDs

The signature API MUST recognize exactly nine personal-training plan IDs, one per trainer per tier, of the form `pt-{slug}-{12|16|20}`. Each plan's `amountInCents` MUST equal the tier's displayed total (personal-training base + bundled monthly membership) multiplied by 100, and MUST match the amount rendered by the card.

| Trainer | slug | 12 clases/mes | 16 clases/mes | 20 clases/mes |
|---|---|---|---|---|
| Harold Giraldo | `harold-giraldo` | `pt-harold-giraldo-12` | `pt-harold-giraldo-16` | `pt-harold-giraldo-20` |
| Esteban Morales | `esteban-morales` | `pt-esteban-morales-12` | `pt-esteban-morales-16` | `pt-esteban-morales-20` |
| Brayan Molina | `brayan-molina` | `pt-brayan-molina-12` | `pt-brayan-molina-16` | `pt-brayan-molina-20` |

#### Scenario: Plan IDs resolve to correct amounts

- GIVEN the signature API plan registry
- WHEN `plan: "pt-harold-giraldo-16"` is submitted
- THEN the returned `amountInCents` equals 41990000 (i.e. $419.900 COP × 100)
- AND `planName` is a human-readable Spanish label

#### Scenario: Unknown plan id rejected

- GIVEN the signature API
- WHEN a `plan` not in the registry is submitted
- THEN the API responds with HTTP 400 and lists the available plan IDs

### Requirement: Featured Variant Supported

The card MUST support a "featured" variant matching the existing `plan-card--featured` style (gold background, badge). For all three trainers the 16-class tier MUST be the featured card.

#### Scenario: Exactly the 16-class tier is featured

- GIVEN any trainer detail page
- WHEN the pricing section renders
- THEN exactly one card (the 16-class tier) is featured
- AND it displays a "RECOMENDADO" badge

### Requirement: Bundled Pricing And Shared Included Features

Each personal-training tier total MUST bundle the monthly gym membership ($69.900 COP) on top of the personal-training base price; the displayed amount is the combined total. The included feature list MUST be identical across every trainer and tier, exact wording, with the bundled membership as the first item:

1. Incluida Membresía Mensual PowerHouse
2. Esquema de alimentación con conteo de macros
3. Estructura de plan de entrenamiento individual
4. Valoración antropométrica y acompañamiento
5. Resultados desde la 4ta semana

The COP totals (base + $69.900 membership) per trainer and tier are:

| Trainer | 12 clases/mes | 16 clases/mes (FEATURED) | 20 clases/mes |
|---|---|---|---|
| Harold Giraldo | $339.900 COP | $419.900 COP | $469.900 COP |
| Esteban Morales | $339.900 COP | $419.900 COP | $469.900 COP |
| Brayan Molina | $369.900 COP | $449.900 COP | $489.900 COP |

#### Scenario: Harold renders correct totals

- GIVEN Harold Giraldo's detail page
- WHEN the pricing cards render
- THEN amounts are "$339.900", "$419.900", "$469.900" (COP)
- AND the 16-class card is the featured variant

#### Scenario: Brayan renders correct totals

- GIVEN Brayan Molina's detail page
- WHEN the pricing cards render
- THEN amounts are "$369.900", "$449.900", "$489.900" (COP)
- AND the 16-class card is the featured variant

#### Scenario: Included features identical across trainers and tiers

- GIVEN all three trainer detail pages built
- WHEN each tier's feature list is collected
- THEN every list equals the five features above, in the same order, membership first

#### Scenario: Signature amount matches displayed total

- GIVEN a trainer tier card and the signature API
- WHEN the card's `data-plan-id` is submitted to `/api/payment/signature`
- THEN the returned `amountInCents` equals the displayed total × 100

## Open Items

- **PT-plan webhook / activation:** Wompi checkout → redirect works for the 9 personal-training plans, but automatic back-office activation (membership + PT sessions provisioning) on a successful transaction is not yet wired. Manual confirmation may be required until the webhook handler covers `pt-*` plan IDs.
- **Real end-to-end payment test:** the PT plan amounts and signature path are unit-level consistent, but a real Wompi transaction against a PT plan id has not been exercised in production yet.
- **`whatsappText` vestigial on detail page:** the per-tier `whatsappText` is retained in the data model (used by the `link` CTA mode) but the shipped trainer detail pages use `button` mode, so `whatsappText` is currently unused there. Retain until a WhatsApp fallback surface is needed.
