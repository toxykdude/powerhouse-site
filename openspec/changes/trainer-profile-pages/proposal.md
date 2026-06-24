# Proposal: Trainer Profile Pages

## Intent

Homepage trainer cards are dead-ends — visitors cannot learn more or see personal-training pricing. This adds individual profile pages for Harold Giraldo, Esteban Morales, and new hire Brayan Molina; wires homepage cards to them; and surfaces personal-training packages reusing the existing `planes.astro` card design via a shared component.

## Scope

### In Scope

- 3 new static pages: `/entrenadores/{harold-giraldo,esteban-morales,brayan-molina}`.
- `index.astro`: add Brayan (4th trainer); link Harold/Esteban/Brayan cards to their pages; Juan Manuel Cano stays static.
- Each page: hero (name/role/photo), extended bio (ES), specialties, personal-training pricing cards.
- Brayan placeholder photo branch (no image yet).
- Extract `src/components/PlanCard.astro` from `planes.astro`.
- Trainer pricing is **display-only** — CTA is WhatsApp/contact, **not** Wompi.

### Out of Scope

- Wompi checkout on trainer pricing (only `planes.astro`).
- Detail page for Juan Manuel Cano. Backend/API/workers changes. Brayan's real photo.
- Deep SEO/JSON-LD pass (sensible defaults only).

## Capabilities

> `openspec/specs/` is empty → all new; "Modified" = None.

### New Capabilities

- `trainer-profiles`: trainer detail pages (hero, bio, specialties, photo/placeholder), homepage card linking, shared trainer data model.
- `pricing-cards`: reusable pricing-card component extracted from `planes.astro`, reused on trainer pages as display-only packages.

### Modified Capabilities

None.

## Approach

**Shared data + shared component.**

1. Trainer data → `src/data/trainers.ts` (new; `src/data/` absent today). One source of truth for `index.astro` + detail pages: `slug`, `role`, `bio`, `extendedBio`, `specialties`, `photo?`, `pricing`.
2. Pricing card → `PlanCard.astro` extracted from `planes.astro` (L76–142 markup, L257–420 scoped CSS). CTA becomes a prop: `button` (Wompi) vs `link` (WhatsApp).

| PlanCard option | Tradeoff |
|---|---|
| **A (recommended)**: extract + refactor `planes.astro` to use it | Single source of truth; low visual risk (markup identical); touches live pricing |
| **B**: extract for trainer pages only; leave `planes.astro` untouched | Zero risk to live pricing; duplicates data shape |

Recommend **A**. Design phase finalizes component API.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `src/pages/entrenadores/*.astro` | New | 3 profile pages |
| `src/pages/index.astro` | Modified | Add Brayan; link 3 cards via `slug`/`link` |
| `src/components/PlanCard.astro` | New | Reusable pricing card |
| `src/pages/planes.astro` | Modified (Opt A) | Consume `PlanCard`; no visual change |
| `src/data/trainers.ts` | New | Shared trainer + pricing data |
| `src/components/TrainerCard.astro` | None | Dead code (different classes + nonexistent CSS vars). Flagged, untouched. |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Brayan has no photo | High | Placeholder branch; owner supplies image later |
| Featured tier + features unconfirmed | Medium | 16-class tier proposed "featured"; features assumed identical — **owner must confirm** |
| `planes.astro` refactor (Opt A) regresses pricing | Low-Med | Markup identical; verify via `npm run build` + visual diff; fall back to Opt B |
| `TrainerCard.astro` dead code confuses contributors | Low | Documented here; cleanup deferred |
| Breadcrumb falls back to raw slug | Low | `Base.astro` `pageNames` lacks `entrenadores`; minor follow-up |

## Rollback Plan

1. Revert PR — additive except `index.astro` + `planes.astro` (Opt A) edits, which are isolated.
2. Static SSG: no migration, no API changes — clean redeploy.
3. If Opt A regresses, switch to Opt B without losing trainer pages.

## Dependencies

- Owner confirms Brayan's role ("Entrenador Personal"), 16-class featured tier, identical included features.
- Owner supplies Brayan photo (deferred — placeholder ships first).

## Success Criteria

- [ ] `/entrenadores/{harold-giraldo,esteban-morales,brayan-molina}` render hero + bio + specialties + pricing
- [ ] Homepage shows 4 trainers; 3 link to detail pages; Juan Manuel stays static
- [ ] Brayan renders with placeholder (no broken `<img>`)
- [ ] Trainer pricing matches `planes.astro` design (display-only, WhatsApp CTA)
- [ ] `npm run build`, `lint`, `typecheck` pass

## Open Questions (Proposal Question Round)

> Non-interactive delegate — product assumptions needing owner review.

1. Brayan's role = **"Entrenador Personal"**? (proposed)
2. **16-class tier** = "featured" for all three? (proposed)
3. Are the four **included features** identical across trainers? (assumed yes)
4. **Brayan photo** ETA? (placeholder ships first)
5. **Juan Manuel Cano** intentionally has no detail page? (assumed yes)
