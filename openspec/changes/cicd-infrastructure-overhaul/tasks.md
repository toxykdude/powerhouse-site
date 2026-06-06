# Tasks: CI/CD Infrastructure Overhaul

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 550–700 (excl. lockfile) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1: Foundation + Tests → PR 2: Workflows + Wrangler |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | PR | Notes |
|------|------|----|-------|
| 1 | Configs + Wompi tests | PR 1 | Base: main |
| 2 | Workflows + wrangler envs | PR 2 | Base: main; needs PR 1 |

## Phase 1: Foundation Configs

- [x] 1.1 Append `.env` to `.gitignore`
- [x] 1.2 Add scripts to `package.json`: lint, format, format:check, typecheck, test, test:watch, test:coverage
- [x] 1.3 Add devDeps: eslint@^9, eslint-plugin-astro@^1.3, prettier@^3.4, prettier-plugin-astro@^0.14, vitest@^2.1, @vitest/coverage-v8@^2.1, semantic-release@^24, @semantic-release/{commit-analyzer,release-notes-generator,npm,github,git}
- [x] 1.4 `npm install` to update lockfile
- [x] 1.5 Create `eslint.config.js` — flat config, astro plugin, ignore dist/.astro/.wrangler
- [x] 1.6 Create `vitest.config.ts` — include functions/**, __tests__/**
- [x] 1.7 Create `.releaserc.json` — branches ["main"], 5 plugins (npmPublish:false)

## Phase 2: Wompi Payment Tests

- [x] 2.1 Create `__tests__/payment/signature.test.ts` — sha256 I/O, generateSignature, generateReference format, plan validation, onRequestPost mock
- [x] 2.2 Verify: `npx vitest run` exits 0

## Phase 3: Composite Action + PR Validation

- [x] 3.1 Create `.github/actions/ci-validate/action.yml` — npm ci→lint→typecheck→test→build→audit
- [x] 3.2 Create `.github/workflows/pr-validation.yml` — pull_request, parallel lint/typecheck/test, build depends all, security audit
- [x] 3.3 Delete `.github/workflows/deploy.yml`

## Phase 4: Dev Deploy + Wrangler Dev Envs

- [x] 4.1 Create `.github/workflows/deploy-dev.yml` — pull_request on main, depends pr-validation, deploy powerhouse-site-dev, post preview URL
- [x] 4.2 Add worker deploy job — dorny/paths-filter on workers/**, wrangler deploy --env dev
- [x] 4.3 Update `wrangler.toml` — [env.dev] name="powerhouse-contact-dev"
- [x] 4.4 Update `wrangler-media.toml` — [env.dev] name="powerhouse-media-proxy-dev", [[env.dev.r2_buckets]] MEDIA_BUCKET→powerhouse-media-dev

## Phase 5: Production Deploy + Semver

- [x] 5.1 Create `.github/workflows/deploy-production.yml` — push main, 3 jobs: validate, deploy-pages(+semantic-release), deploy-workers(paths-filter --env production)
- [x] 5.2 Update `wrangler.toml` — [env.production] name="powerhouse-contact"
- [x] 5.3 Update `wrangler-media.toml` — [env.production] name="powerhouse-media-proxy", [[env.production.r2_buckets]] MEDIA_BUCKET→powerhouse-media

## Phase 6: Rollback Workflow

- [x] 6.1 Create `.github/workflows/rollback.yml` — workflow_dispatch inputs: version, reason. Checkout ref→build→deploy powerhouse-site. No worker rollback.

## Phase 7: Cloudflare Dashboard (Manual)

- [ ] 7.1 Create powerhouse-site-dev Pages project
- [ ] 7.2 Create powerhouse-media-dev R2 bucket (separate from prod)
- [ ] 7.3 Set dev env vars in Pages dashboard: WOMPI_*(test), WOMPI_API_URL(sandbox), FACEGYM_API_URL
- [ ] 7.4 Bind MEDIA_BUCKET→powerhouse-media-dev on dev worker

## Phase 8: GitHub Settings (Manual)

- [ ] 8.1 Environment `development` — no protection, secrets: CLOUDFLARE_EMAIL/API_KEY/ACCOUNT_ID
- [ ] 8.2 Environment `production` — 1 reviewer, same secrets
- [ ] 8.3 Branch protection on main — PR review + status checks + up-to-date branch
