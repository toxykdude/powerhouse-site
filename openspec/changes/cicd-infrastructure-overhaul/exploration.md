## Exploration: CI/CD Infrastructure Overhaul

### Current State

#### Build & Deploy Pipeline

A single GitHub Actions workflow (`.github/workflows/deploy.yml`) handles production deployment:

- **Trigger**: Push to `main` + manual `workflow_dispatch`
- **Steps**: checkout → Node 20 setup → `npm ci` → `npm run build` → `npx wrangler pages deploy dist --project-name powerhouse-site --branch main`
- **Auth**: Uses `CLOUDFLARE_EMAIL`, `CLOUDFLARE_API_KEY`, `CLOUDFLARE_ACCOUNT_ID` from GitHub Secrets
- **Quality gates**: NONE — no lint, no type-check, no test, no preview deploy
- **Worker deployments**: NOT in CI — `wrangler.toml` and `wrangler-media.toml` workers are deployed manually outside the pipeline

#### Wrangler Configuration

Two standalone Workers defined in separate config files:

- `wrangler.toml` → `powerhouse-contact` (contact form email via MailChannels)
- `wrangler-media.toml` → `powerhouse-media-proxy` (R2 bucket proxy for media.powerhousegym.co)
- Neither defines environments (`[env.dev]`, `[env.production]`) — single config only
- Workers use Cloudflare-specific bindings (R2 bucket `MEDIA_BUCKET`)

#### Astro Site

- Astro 5.7 static SSG, output: `static`, site: `https://powerhousegym.co`
- Build: Vite via `npm run build` → `dist/`
- Integrations: `@astrojs/sitemap` only
- Content collections: blog (glob loader, markdown)
- Pages: landing, planes, contacto, blog/_, portal/_ (dashboard, renovar, salir), pago/confirmacion, privacidad, terminos, 404
- No UI framework — custom Astro components + custom CSS

#### Cloudflare Pages Functions (`functions/api/`)

Serverless API functions that run on Cloudflare Pages runtime:

- **Auth** (3 endpoints): `member-login`, `member-verify`, `member-resend` → proxy to FaceGYM API
- **Payment** (3 endpoints): `signature` (Wompi integrity hash), `status` (Wompi transaction query), `webhook` (Wompi event receiver → FaceGYM activation)
- **Portal** (6 endpoints): `me`, `plans`, `renew`, `webhook-renew`, `pending-payment`, `pending-payment/[reference]` → proxy to FaceGYM API
- Shared utility: `_shared.ts` provides CORS headers and `proxyToFaceGYM()` helper

#### Environment Variables (required at runtime)

| Variable                 | Used By                                   | Required                                          |
| ------------------------ | ----------------------------------------- | ------------------------------------------------- |
| `WOMPI_PUBLIC_KEY`       | `payment/signature.ts`                    | Yes                                               |
| `WOMPI_INTEGRITY_SECRET` | `payment/signature.ts`                    | Yes                                               |
| `WOMPI_PRIVATE_KEY`      | `payment/status.ts`                       | Yes                                               |
| `WOMPI_API_URL`          | `payment/status.ts`, `payment/webhook.ts` | Optional (defaults to production)                 |
| `WOMPI_EVENTS_SECRET`    | `payment/webhook.ts`                      | Yes                                               |
| `FACEGYM_API_URL`        | `_shared.ts`, various proxies             | Optional (defaults to `faceapp.powerhousegym.co`) |

#### Environment Variables (required by CI)

| Variable                | Purpose                      |
| ----------------------- | ---------------------------- |
| `CLOUDFLARE_EMAIL`      | Wrangler auth (legacy)       |
| `CLOUDFLARE_API_KEY`    | Wrangler auth (legacy)       |
| `CLOUDFLARE_ACCOUNT_ID` | Wrangler pages deploy target |

#### Security Headers & Static Config

- `public/_headers`: Cloudflare Pages headers — security headers on `/*`, immutable cache on `/_astro/*`, 24h cache on `/uploads/*`
- `public/robots.txt`: Allows all bots, sitemap at `https://powerhousegym.co/sitemap.xml`

### Affected Areas

- `.github/workflows/deploy.yml` — current workflow, will be replaced/expanded into 4 workflows
- `wrangler.toml` — needs environment definitions for dev/prod
- `wrangler-media.toml` — needs environment definitions for dev/prod
- `package.json` — needs new scripts (lint, format, type-check, test), new devDependencies (ESLint, Prettier, Vitest, etc.)
- `astro.config.mjs` — may need preview/deploy integration changes
- `functions/api/**/*.ts` — all Pages Functions need to work in both dev and prod environments
- `workers/*.js` — both Workers need CI deployment
- `.gitignore` — needs `.env` added (CRITICAL: `.env` contains real tokens and is NOT gitignored)
- `.env` — contains exposed secrets that must be rotated
- `tsconfig.json` — may need strictness adjustments for CI type-check

### Approaches

1. **Full GitHub Actions Matrix (4-workflow target)**
   - Workflow 1: CI (lint + type-check + build) on all PRs and pushes
   - Workflow 2: Preview Deploy on PRs to Cloudflare Pages dev project
   - Workflow 3: Production Deploy on merge to main (with semver tagging)
   - Workflow 4: Worker Deploy (separate trigger for worker changes)
   - Pros: Complete separation of concerns, parallelizable, preview deploys for review
   - Cons: More files to maintain, requires Cloudflare Pages project for dev
   - Effort: Medium

2. **Monorepo Single Workflow with Jobs**
   - One workflow with conditional jobs based on changed paths
   - Pros: Single file, easier to see full pipeline
   - Cons: Harder to maintain, no preview deploy separation, complex conditionals
   - Effort: Medium

3. **Cloudflare-native CI/CD (Wrangler + GitHub)**
   - Use Cloudflare's native CI/CD integration (connect Cloudflare to GitHub directly)
   - Pros: Simpler deploy config, automatic previews
   - Cons: Less control over pipeline, harder to add quality gates, GitHub not single source of truth
   - Effort: Low

### Recommendation

**Approach 1 — Full GitHub Actions Matrix** is the right choice. It makes GitHub the single source of truth (explicit requirement), enables preview deploys for PR review, and separates deployment of Pages vs Workers. The 4-workflow model maps cleanly to the project's two deployment targets (Pages + Workers) and two environments (dev + prod).

### Gaps vs Target State

| Gap                                      | Severity     | Notes                                 |
| ---------------------------------------- | ------------ | ------------------------------------- |
| No linter (ESLint)                       | High         | Zero code quality enforcement         |
| No formatter (Prettier)                  | Medium       | Inconsistent code style               |
| No type-checking in CI                   | High         | TypeScript errors can ship to prod    |
| No test framework                        | High         | No automated regression safety        |
| No preview deployments                   | High         | No way to review changes before merge |
| No dev environment                       | High         | Only production exists                |
| Workers not in CI                        | High         | Manual deployment, drift risk         |
| `.env` not in `.gitignore`               | **CRITICAL** | Real secrets exposed in repo          |
| No semantic versioning                   | Medium       | No release tracking                   |
| No dependabot/renovate                   | Medium       | Dependency drift and security risk    |
| No branch protection                     | Medium       | Anyone can push to main               |
| `package.json` version is `1.0.0` static | Low          | Never updated, no versioning tool     |

### Risks

1. **CRITICAL: `.env` file contains real secrets** — `CLOUDFLARE_TOKEN`, `CLOUDFLARE_ZONES_TOKEN`, and a GitHub PAT are in `.env` which is NOT in `.gitignore`. If this repo is pushed to GitHub (even private), these secrets are in git history. They MUST be rotated immediately and `.env` must be added to `.gitignore`.

2. **Payment flow sensitivity** — The Wompi payment integration (`payment/signature.ts`, `payment/webhook.ts`) handles real money. Any CI/CD change that touches environment variable handling could break payment verification. The webhook verifies cryptographic signatures using `WOMPI_EVENTS_SECRET` — if this env var is missing or wrong in a new environment, payments will silently fail.

3. **FaceGYM API dependency** — All auth and portal functions proxy to FaceGYM. Dev environment will need either a FaceGYM dev instance or mock responses. Without this, the portal is untestable in dev.

4. **Workers deploy separately** — The two Workers (contact, media-proxy) have their own wrangler configs and are NOT deployed by the current CI. Adding them to CI requires either a combined workflow or a separate one. The media worker has an R2 binding that must exist in the target environment.

5. **Cloudflare Pages Functions runtime differences** — Functions in `functions/` run on Cloudflare's runtime (not Node.js). Local dev with `astro dev` won't exercise the real Pages Functions runtime. Type-checking may pass locally but fail at Cloudflare's edge.

6. **Wrangler auth migration** — Current CI uses `CLOUDFLARE_EMAIL` + `CLOUDFLARE_API_KEY` (global API key). Best practice is to use `CLOUDFLARE_API_TOKEN` (scoped token) instead. This requires creating a new scoped token.

### Key Decisions Needed

1. **Dev environment strategy**: Should preview deploys go to `*.pages.dev` (separate Cloudflare Pages project) or to `*.workers.dev`? The site uses Pages Functions, so a separate Pages project for previews is the natural fit.

2. **Workers deployment trigger**: Should worker deploys happen on every push to main (like Pages), or only when `workers/` directory changes? Path-based filtering is cleaner but requires careful config.

3. **Test strategy**: What level of testing is needed? Unit tests for payment signature logic (critical) + smoke test for build? Or full E2E with Playwright against preview deploys?

4. **Semantic versioning tool**: `semantic-release` (fully automated, conventional commits required), `standard-version` (changelog + tag, manual release), or `changesets` (multi-package, more manual)? Given this is a single-package static site, `semantic-release` with conventional commits is the cleanest.

5. **Secret rotation plan**: The `.env` file has real tokens. The user needs to decide when to rotate these (immediately vs after CI/CD is set up) and whether to use Cloudflare API tokens (scoped) instead of global API keys.

6. **Branch protection level**: Require PR reviews? Require status checks to pass? Who can merge to main?

### Ready for Proposal

Yes — the codebase is fully mapped, gaps are identified, and the key decisions are enumerated. The orchestrator should present these decisions to the user before proceeding to `sdd-propose`. The CRITICAL `.env` exposure should be flagged to the user immediately, before waiting for the full proposal phase.
