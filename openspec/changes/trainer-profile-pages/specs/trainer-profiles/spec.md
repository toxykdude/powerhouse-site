# Trainer Profiles Specification

## Purpose

Individual profile pages for PowerHouse personal trainers, plus homepage card wiring. Each detail page renders a hero (name, role, photo or placeholder), extended Spanish bio, specialties, and a personal-training pricing section, all sourced from one shared data module.

**Non-goals:** no Juan Manuel Cano detail page; no Wompi on trainer pricing; no backend/worker changes; no Brayan photo yet; no deep SEO/JSON-LD pass.

## Requirements

### Requirement: Three Detail Pages Render A Full Profile

The system MUST publish three static pages at `/entrenadores/harold-giraldo`, `/entrenadores/esteban-morales`, and `/entrenadores/brayan-molina`. Each MUST render hero (name, role, photo or placeholder), extended Spanish bio, specialties, and a pricing section.

#### Scenario: Detail page renders all sections

- GIVEN the built site
- WHEN a visitor opens `/entrenadores/harold-giraldo`
- THEN the page renders hero, extended bio, specialties, and a pricing section
- AND none is empty

#### Scenario: Brayan uses the Entrenador Personal role

- GIVEN the Brayan Molina detail page
- WHEN the hero renders
- THEN the role text equals "Entrenador Personal"

### Requirement: Homepage Cards Link Only To Existing Pages

The homepage grid MUST render four trainers (Juan Manuel Cano, Esteban Morales, Harold Giraldo, Brayan Molina). Harold, Esteban, and Brayan cards MUST link to their detail pages by slug. Juan Manuel Cano's card MUST NOT be a link and MUST NOT navigate.

#### Scenario: Linked trainers navigate

- GIVEN the homepage grid
- WHEN a visitor clicks the Harold Giraldo card
- THEN the browser navigates to `/entrenadores/harold-giraldo`

#### Scenario: Juan Manuel Cano stays static

- GIVEN the homepage grid
- WHEN the Juan Manuel Cano card renders
- THEN the card is not an anchor and not keyboard-focusable as a link
- AND activating it does not navigate

### Requirement: Brayan Placeholder Photo, No Broken Image

Because no photo asset exists yet, the system MUST render a visible placeholder for Brayan Molina wherever his photo appears (homepage card and detail hero). No `<img>` element MAY reference an empty or unresolved `src`.

#### Scenario: Placeholder shown on homepage

- GIVEN the homepage grid
- WHEN Brayan's card renders
- THEN a placeholder element is visible
- AND no `<img>` element has an empty or missing `src`

#### Scenario: Placeholder shown on detail hero

- GIVEN Brayan's detail page
- WHEN the hero renders
- THEN a placeholder is shown in place of a photo
- AND no `<img>` element has an unresolved `src`

### Requirement: Base Layout And ES SEO Defaults

Every detail page MUST use `src/layouts/Base.astro` and pass Spanish (Colombia) SEO defaults: a non-empty `<title>`, a `description` meta, a canonical URL, and Open Graph/Twitter tags inherited from the layout.

#### Scenario: SEO metadata is present and Spanish

- GIVEN a built detail page
- WHEN the HTML `<head>` and visible body copy are inspected
- THEN it contains a non-empty Spanish `<title>`, a description meta, and a canonical link

### Requirement: Shared Trainer Data Is The Single Source Of Truth

The system MUST source homepage cards and detail pages from one shared module (e.g. `src/data/trainers.ts`). Each record MUST carry at least: `slug`, `name`, `role`, `bio`, `extendedBio`, `specialties`, `pricing`. `photo` MUST be optional so Brayan can omit it.

#### Scenario: Homepage and detail share one record

- GIVEN the shared trainer data module
- WHEN both the homepage grid and a detail page render the same slug
- THEN both consume the same record
- AND editing the shared bio updates both surfaces after rebuild

### Requirement: Reachable Navigation And Breadcrumb

Detail pages MUST be reachable from the homepage. The breadcrumb for `/entrenadores/[slug]` SHOULD resolve `entrenadores` and the slug to friendly Spanish names instead of raw URL segments.

#### Scenario: Breadcrumb uses friendly names

- GIVEN the Base layout breadcrumb JSON-LD
- WHEN `/entrenadores/brayan-molina` is rendered
- THEN the `name` values are friendly labels (e.g. "Entrenadores", "Brayan Molina")
- AND no raw slug appears as a `name`
