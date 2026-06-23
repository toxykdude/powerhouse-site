# Trainer Profiles Specification

## Purpose

Individual profile pages for PowerHouse personal trainers, plus homepage card wiring. Each detail page renders a hero (name, role, photo or placeholder), extended Spanish bio, specialties, a data-driven "Resultados de Clientes" results infographic, and a personal-training pricing section — all sourced from one shared data module.

**Non-goals:** no Juan Manuel Cano detail page; no backend/worker changes beyond the shared signature API used for payment; no deep SEO/JSON-LD pass beyond sensible per-page defaults.

## Requirements

### Requirement: Three Detail Pages Render A Full Profile

The system MUST publish three static pages at `/entrenadores/harold-giraldo`, `/entrenadores/esteban-morales`, and `/entrenadores/brayan-molina`. Each MUST render, in order: hero (name, role, photo or placeholder), extended Spanish bio, specialties, a "Resultados de Clientes" results infographic, and a pricing section. None of these sections MAY be empty.

#### Scenario: Detail page renders all sections

- GIVEN the built site
- WHEN a visitor opens `/entrenadores/harold-giraldo`
- THEN the page renders hero, extended bio, specialties, results infographic, and a pricing section
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

### Requirement: Photo Or Placeholder, Never A Broken Image

Each trainer record MAY carry an optional `photo`. When a photo asset is present it MUST be rendered. When no photo asset is present the system MUST render a visible placeholder (initials monogram) instead, wherever the trainer's photo appears (homepage card and detail hero). No `<img>` element MAY reference an empty or unresolved `src`.

> Historical note: an earlier version required a placeholder specifically for Brayan Molina (no asset existed yet). Brayan now ships with a real photo (`/uploads/brayan-molina.webp`), so his surfaces render the photo. The placeholder mechanism is retained as a general capability for any trainer without an asset.

#### Scenario: Photo renders when present

- GIVEN Brayan Molina's homepage card and detail hero
- WHEN the photo area renders
- THEN an `<img>` with a resolved `src` is shown

#### Scenario: Placeholder shown when no asset

- GIVEN a trainer record without a `photo`
- WHEN the card/hero renders
- THEN a placeholder element with the trainer's initials is visible
- AND no `<img>` element has an empty or missing `src`

### Requirement: Client Results Infographic Section

Each detail page MUST render a "Resultados de Clientes" results section between the Specialties section and the Pricing section. The section MUST be driven by a per-trainer results data model (`TrainerResults`) sourced from the shared data module and rendered through a dedicated infographic component (`TrainerStats.astro`). The infographic MUST present at least: a satisfaction breakdown (donut), key satisfaction factors (horizontal bars), a satisfaction/results correlation (grouped bar chart), a preferred modality split (pie), and key takeaways (big stats + bullet points). Charts MUST be rendered via Chart.js (loaded via CDN, deferred) and the section MUST respect `prefers-reduced-motion`.

#### Scenario: Results section renders between specialties and pricing

- GIVEN a built trainer detail page
- WHEN the page is inspected in document order
- THEN the Specialties section precedes the Results section
- AND the Results section precedes the Pricing section

#### Scenario: Infographic is data-driven per trainer

- GIVEN the shared trainer data module
- WHEN two different trainer detail pages render
- THEN each Results section reflects that trainer's own `TrainerResults` values (sample size, segments, factors, series, modality, takeaways)

#### Scenario: Chart.js loaded and charts present

- GIVEN a built trainer detail page
- WHEN the Results section renders
- THEN the Chart.js library script is included
- AND donut, grouped-bar, and pie canvases are present
- AND horizontal bars and takeaway stats are rendered from data

### Requirement: Base Layout And ES SEO Defaults

Every detail page MUST use `src/layouts/Base.astro` and pass Spanish (Colombia) SEO defaults: a non-empty `<title>`, a `description` meta, a canonical URL, and Open Graph/Twitter tags inherited from the layout.

#### Scenario: SEO metadata is present and Spanish

- GIVEN a built detail page
- WHEN the HTML `<head>` and visible body copy are inspected
- THEN it contains a non-empty Spanish `<title>`, a description meta, and a canonical link

### Requirement: Shared Trainer Data Is The Single Source Of Truth

The system MUST source homepage cards and detail pages from one shared module (e.g. `src/data/trainers.ts`). Each slugged record MUST carry at least: `slug`, `name`, `role`, `bio`, `extendedBio`, `specialties`, `pricing`, and `results`. `photo` MUST be optional so any trainer can omit it.

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

## Open Items

- **Real per-trainer results data:** the `TrainerResults` values are derived estimates for Harold and Brayan (the Esteban set is the owner-provided template). Replace the derived estimates with real survey numbers when collected.
