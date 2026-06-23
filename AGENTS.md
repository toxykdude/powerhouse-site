# AGENTS.md — PowerHouse Gym Site

## Context

- **Repository**: https://github.com/toxykdude/powerhouse-site
- **Working directory**: run `git rev-parse --show-toplevel 2>/dev/null || pwd` before doing anything else. Use the returned path as the authoritative workspace root.
- **Project name**: `powerhouse-site`
- **Production URL**: https://powerhousegym.co
- **Platform**: Cloudflare Pages (static site) + Cloudflare Workers (API/contact/media proxy)

## Stack

| Layer | Tool | Notes |
|---|---|---|
| Framework | Astro 5.x | Static output (`output: "static"`) |
| Language | TypeScript (strict) | `astro/tsconfigs/strict` |
| Styling | CSS (theme.css) | No CSS framework; custom properties in `src/styles/theme.css` |
| Content | Astro Content Collections | Blog posts in `src/content/blog/*.md`, schema in `src/content.config.ts` |
| Workers | Vanilla JS | `workers/contact.js`, `workers/media-proxy.js` |
| Storage | Cloudflare R2 | Media bucket via `wrangler-media.toml` |
| Testing | Vitest | Config in `vitest.config.ts`, tests in `__tests__/` |
| Linting | ESLint 9 flat config | `eslint.config.js` — Astro plugin + TypeScript |
| Formatting | Prettier | With `prettier-plugin-astro` |
| Versioning | Semantic Release | `.releaserc.json` — conventional commits → auto version + GitHub Release |
| CI/CD | GitHub Actions | 4 workflows, see below |
| Package manager | npm | Node 20 |

## Project Structure

```
powerhouseweb/
├── .github/
│   ├── actions/ci-validate/    # Composite action: lint + typecheck + test + build + audit
│   └── workflows/
│       ├── pr-validation.yml   # Gate: blocks merge if any check fails
│       ├── deploy-dev.yml      # PR → Cloudflare Pages dev + Workers dev (conditional)
│       ├── deploy-production.yml # Push main → Cloudflare Pages prod + Workers prod + semantic-release
│       └── rollback.yml        # Manual dispatch: redeploy from commit/tag
├── __tests__/                  # Vitest test files
├── functions/api/              # Cloudflare Functions (API routes)
├── workers/
│   ├── contact.js              # Contact form worker
│   └── media-proxy.js          # R2 media proxy worker
├── src/
│   ├── components/             # Astro components
│   ├── content/blog/           # Markdown blog posts
│   ├── layouts/Base.astro      # Base HTML layout
│   ├── pages/                  # File-based routing
│   │   ├── index.astro         # Homepage
│   │   ├── planes.astro        # Pricing plans
│   │   ├── nosotros.astro      # About us
│   │   ├── contacto.astro      # Contact
│   │   ├── blog/               # Blog index + posts
│   │   ├── pago/               # Payment flow
│   │   ├── portal/             # Member portal
│   │   ├── privacidad.astro    # Privacy policy
│   │   └── terminos.astro      # Terms of service
│   ├── styles/theme.css        # Global styles & CSS custom properties
│   └── content.config.ts       # Content collection schema (blog)
├── public/                     # Static assets served as-is
├── astro.config.mjs            # Astro config: sitemap, site URL, CSS minify
├── wrangler.toml               # Contact worker config (dev + production envs)
├── wrangler-media.toml         # Media proxy + R2 config (dev + production envs)
├── vitest.config.ts            # Vitest config
├── eslint.config.js            # ESLint flat config
├── .releaserc.json             # Semantic Release config
└── tsconfig.json               # Extends astro/tsconfigs/strict
```

## Commands

```bash
npm run dev             # Astro dev server
npm run build           # Production build → dist/
npm run preview         # Preview production build locally
npm run lint            # ESLint
npm run format          # Prettier write
npm run format:check    # Prettier check (CI uses this)
npm run typecheck       # astro check
npm run test            # Vitest single run
npm run test:watch      # Vitest watch mode
npm run test:coverage   # Vitest with V8 coverage
```

## CI/CD — Single Source of Truth

**GitHub is the ONLY source of truth.** Cloudflare only executes deployments.

### Rules

- **NEVER** run `wrangler deploy` from a local machine.
- **NEVER** modify production from the Cloudflare Dashboard.
- **ALL** changes must originate from GitHub via PR → merge.
- **ALL** secrets must live in GitHub Secrets or Cloudflare Secrets — never in source code, `.env` files, or hardcoded in workflows.

### Workflow 1: `pr-validation.yml`

- **Trigger**: `pull_request` to any branch
- **Jobs**: lint, typecheck, test, build, security audit — all in parallel (build depends on the first three)
- **Purpose**: Block merge if any check fails

### Workflow 2: `deploy-dev.yml`

- **Trigger**: `pull_request` to `main`
- **Jobs**: validate → deploy-pages + deploy-workers (parallel)
- **Output**: Posts preview URL as a PR comment
- **Deploys**: Cloudflare Pages (`powerhouse-site-dev`) + Workers (dev env, only if `workers/` changed)

### Workflow 3: `deploy-production.yml`

- **Trigger**: `push` to `main`
- **Jobs**: validate → deploy-pages + deploy-workers (parallel)
- **After deploy**: Runs `semantic-release` → auto version bump + GitHub Release
- **Deploys**: Cloudflare Pages (`powerhouse-site`) + Workers (production env, only if `workers/` changed)

### Workflow 4: `rollback.yml`

- **Trigger**: `workflow_dispatch` (manual)
- **Inputs**: version (commit SHA / tag / release) + reason (required)
- **Action**: Checks out the target version, builds, redeploys to production

### Semantic Versioning

- Uses **Semantic Release** with conventional commits
- Config in `.releaserc.json`: commit-analyzer → release-notes-generator → npm (no publish) → GitHub release
- Only runs on `main` branch
- Commit conventions: `feat:`, `fix:`, `perf:`, `docs:`, `chore:`, `refactor:`, `test:`, `ci:`
- `feat:` → minor bump, `fix:` → patch bump, `feat!:` or `BREAKING CHANGE` → major bump

### GitHub Environments

- `development` — used by deploy-dev
- `production` — used by deploy-production and rollback

### Branch Protection (main)

- Pull request required
- Status checks required (lint, typecheck, test, build)
- Direct merge prohibited
- Force push prohibited
- Branch deletion prohibited

### Deployment Audit Trail

Every deployment logs: date, commit SHA, branch, author, environment, result.

## Conventions

### Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/) — required by semantic-release:

```
feat: add membership renewal flow
fix: correct contact form validation
feat!: redesign pricing page (BREAKING)
docs: update README with deploy instructions
ci: add rollback workflow
```

### Code Style

- Prettier handles formatting; don't format manually.
- ESLint flat config with Astro plugin — Astro files have relaxed TS rules in `<script>` blocks.
- TypeScript strict mode is enabled.

### Component Pattern

- Astro components in `src/components/` — descriptive PascalCase names (e.g., `TrainerCard.astro`).
- Pages in `src/pages/` — Astro file-based routing.
- Content collections use Zod schemas (`src/content.config.ts`).

### Workers

- Vanilla JS files in `workers/`.
- Two Wrangler configs: `wrangler.toml` (contact) and `wrangler-media.toml` (media proxy + R2).
- Each config defines `[env.dev]` and `[env.production]`.

### Testing

- Vitest with V8 coverage.
- Tests live in `__tests__/` — mirror source structure.
- Run `npm test` before pushing; CI will catch failures anyway but local is faster.

## Secrets

These secrets must be configured in GitHub repository settings:

- `CLOUDFLARE_EMAIL`
- `CLOUDFLARE_API_KEY`
- `CLOUDFLARE_ACCOUNT_ID`
- `GH_PAT` (for semantic-release to create GitHub Releases)

**Never** commit secrets. The `.env` file is gitignored and should stay that way.

## Key Files to Know

| File | Purpose |
|---|---|
| `astro.config.mjs` | Site URL, sitemap config, build options |
| `wrangler.toml` | Contact worker deployment config |
| `wrangler-media.toml` | Media proxy + R2 config |
| `.releaserc.json` | Semantic release pipeline |
| `src/content.config.ts` | Blog content collection schema |
| `.github/actions/ci-validate/action.yml` | Shared CI validation composite action |
| `src/layouts/Base.astro` | Base HTML layout for all pages |
| `src/styles/theme.css` | CSS custom properties / design tokens |
