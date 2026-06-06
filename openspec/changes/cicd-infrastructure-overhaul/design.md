# Design: CI/CD Infrastructure Overhaul

## Technical Approach

Replace the single unprotected `deploy.yml` with a 4-workflow GitHub Actions pipeline plus path-filtered worker deployment. A reusable composite action (`ci-validate`) eliminates duplication between PR validation and production deploy validation. New tooling (ESLint, Prettier, Vitest, semantic-release) is added as devDependencies with npm scripts. Wrangler configs get environment-specific sections for dev/prod isolation.

## Architecture Decisions

| Decision                    | Choice                                                     | Rejected                          | Rationale                                                                                                                                       |
| --------------------------- | ---------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Validation reuse            | Composite action (`.github/actions/ci-validate/`)          | `workflow_call` reusable workflow | Composite action is simpler — no artifact passing, runs in same job context, shares the npm cache directly                                      |
| Lint config                 | `eslint.config.js` (flat config)                           | `.eslintrc.json`                  | ESLint 9+ defaults to flat config; future-proof                                                                                                 |
| Test runner                 | Vitest                                                     | Jest                              | Native ESM support (project is `"type": "module"`), Vite-native, zero config for Astro/TS                                                       |
| Security scan               | `npm audit --audit-level=high`                             | Snyk / CodeQL                     | Zero additional config; sufficient for project size; can upgrade later                                                                          |
| semantic-release config     | `.releaserc.json`                                          | `package.json` `"release"` key    | Separate file is clearer; avoids bloating package.json                                                                                          |
| Worker path filter          | `dorny/paths-filter` action                                | Manual `git diff` in script       | Battle-tested, declarative, handles renames correctly                                                                                           |
| Dev deploy project name     | `powerhouse-site-dev`                                      | `powerhouse-dev`                  | Keeps naming consistent with existing `powerhouse-site` production project                                                                      |
| PR comment with preview URL | `actions/github-script` step                               | Third-party PR comment action     | No additional dependencies; one step to post URL                                                                                                |
| semantic-release plugins    | commit-analyzer, release-notes-generator, npm, github, git | With exec plugin                  | Standard 5-plugin set covers version bump, changelog, npm publish (dry-run for monorepo safety), GitHub Release, and git push of version commit |

### Decision: Parallel vs Sequential Jobs in PR Validation

**Choice**: Parallel jobs — lint, typecheck, and test run as separate parallel jobs; build runs after all pass.
**Rationale**: Parallel execution hits the 5-minute performance budget (spec: PR-PERFORMANCE). Each job gets its own runner with shared npm cache via `actions/cache`. Build depends on all three because a build failure with unknown type errors wastes runner minutes.

### Decision: semantic-release Runs in Deploy Job, Not Separate Job

**Choice**: semantic-release runs as the last step in the production deploy job (after Pages deploy succeeds).
**Rationale**: Avoids a separate job needing `contents: write` permission and checkout. If the Pages deploy fails, release is automatically skipped. The git tag + package.json version bump happen atomically with the deploy.

### Decision: Workers Use Inline Path Check, Not Separate Workflow

**Choice**: Worker deploy steps are jobs within `deploy-dev.yml` and `deploy-production.yml`, gated by `dorny/paths-filter` output.
**Rationale**: A separate `deploy-workers.yml` would require `workflow_run` triggers that add latency and complexity. Inline jobs are evaluated immediately from the same checkout and can run in parallel with Pages deploy.

## Data Flow

```
PR to main ──→ pr-validation.yml ──→ Status checks (blocks merge)
         │
         └──→ deploy-dev.yml ──→ Preview on *.pages.dev
                                │
                                └── (if workers/ changed) ──→ Worker dev deploy


Push to main ──→ deploy-production.yml
                    │
                    ├── Job 1: validate (ci-validate composite)
                    │
                    ├── Job 2: deploy-pages (depends: validate)
                    │         └── semantic-release (after deploy success)
                    │
                    └── Job 3: deploy-workers (depends: validate)
                              └── dorny/paths-filter → wrangler deploy


Manual ──→ rollback.yml ──→ checkout target → build → deploy to production
```

## File Changes

| File                                      | Action | Description                                                      |
| ----------------------------------------- | ------ | ---------------------------------------------------------------- |
| `.github/workflows/deploy.yml`            | Delete | Replaced by 4 new workflows                                      |
| `.github/workflows/pr-validation.yml`     | Create | PR quality gate — lint, typecheck, test, build, security         |
| `.github/workflows/deploy-dev.yml`        | Create | Preview deploy on PR to main                                     |
| `.github/workflows/deploy-production.yml` | Create | Production deploy on push to main + semantic-release             |
| `.github/workflows/rollback.yml`          | Create | Manual rollback to commit/tag/release                            |
| `.github/actions/ci-validate/action.yml`  | Create | Composite action: shared validation steps                        |
| `package.json`                            | Modify | Add scripts (lint, format, typecheck, test), add devDependencies |
| `.releaserc.json`                         | Create | semantic-release plugin configuration                            |
| `eslint.config.js`                        | Create | ESLint flat config with Astro + Prettier integration             |
| `vitest.config.ts`                        | Create | Vitest configuration for Astro/Cloudflare Pages Functions        |
| `wrangler.toml`                           | Modify | Add `[env.dev]` and `[env.production]` sections                  |
| `wrangler-media.toml`                     | Modify | Add `[env.dev]` and `[env.production]` with R2 bindings          |
| `.gitignore`                              | Modify | Add `.env`                                                       |
| `__tests__/payment/signature.test.ts`     | Create | Wompi payment signature unit tests (priority)                    |

## Interfaces / Contracts

### Composite Action: `.github/actions/ci-validate/action.yml`

```yaml
# Inputs: none (uses caller's checkout)
# Outputs: none (steps fail on error)
# Runs: lint → typecheck → test → build → security audit
# Expects: Node 20 + npm cache already set up
```

### package.json — New Scripts

```json
{
  "scripts": {
    "lint": "eslint . --ext .js,.ts,.astro",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "typecheck": "astro check",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  },
  "devDependencies": {
    "@astrojs/eslint-config": "^1.2.0",
    "eslint": "^9.16.0",
    "eslint-plugin-astro": "^1.3.1",
    "prettier": "^3.4.2",
    "prettier-plugin-astro": "^0.14.1",
    "vitest": "^2.1.8",
    "@vitest/coverage-v8": "^2.1.8",
    "semantic-release": "^24.2.0",
    "@semantic-release/commit-analyzer": "^13.0.0",
    "@semantic-release/release-notes-generator": "^14.0.0",
    "@semantic-release/npm": "^12.0.0",
    "@semantic-release/github": "^11.0.0",
    "@semantic-release/git": "^10.0.0"
  }
}
```

### Wrangler Environment Definitions

```toml
# wrangler.toml — contact worker
name = "powerhouse-contact"
main = "workers/contact.js"
compatibility_date = "2026-04-01"

[env.dev]
name = "powerhouse-contact-dev"

[env.production]
name = "powerhouse-contact"
```

```toml
# wrangler-media.toml — media proxy worker
name = "powerhouse-media-proxy"
main = "workers/media-proxy.js"
compatibility_date = "2026-04-01"

[[r2_buckets]]
binding = "MEDIA_BUCKET"
bucket_name = "powerhouse-media"

[env.dev]
name = "powerhouse-media-proxy-dev"
[[env.dev.r2_buckets]]
binding = "MEDIA_BUCKET"
bucket_name = "powerhouse-media-dev"

[env.production]
name = "powerhouse-media-proxy"
[[env.production.r2_buckets]]
binding = "MEDIA_BUCKET"
bucket_name = "powerhouse-media"
```

### `.releaserc.json`

```json
{
  "branches": ["main"],
  "plugins": [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    ["@semantic-release/npm", { "npmPublish": false }],
    "@semantic-release/github",
    [
      "@semantic-release/git",
      {
        "assets": ["package.json"],
        "message": "chore(release): ${nextRelease.version}"
      }
    ]
  ]
}
```

### GitHub Environments & Secrets

**Environment: `development`**

- No protection rules (auto-deploy on PR)
- Secrets: `CLOUDFLARE_EMAIL`, `CLOUDFLARE_API_KEY`, `CLOUDFLARE_ACCOUNT_ID`

**Environment: `production`**

- Protection: required reviewers (1), wait timer 0s
- Secrets: `CLOUDFLARE_EMAIL`, `CLOUDFLARE_API_KEY`, `CLOUDFLARE_ACCOUNT_ID`
- Branch protection on `main`: require PR review (1 approval), require status checks (pr-validation), require up-to-date branch

## Testing Strategy

| Layer       | What to Test                                                                 | Approach                                                     |
| ----------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Unit        | Wompi payment signature (`sha256`, `generateSignature`, `generateReference`) | Vitest — pure functions, crypto.subtle available in Node 20+ |
| Unit        | Plan validation (invalid plan ID)                                            | Vitest — test `onRequestPost` with mock Request/Env          |
| Integration | ESLint catches errors                                                        | CI step — `npm run lint` exits non-zero                      |
| Integration | Build produces `dist/`                                                       | CI step — `npm run build` exits non-zero on failure          |
| E2E         | (Future)                                                                     | Not in scope                                                 |

## Migration / Rollout

1. Add `.env` to `.gitignore` **first** (immediate, prevents further leaks)
2. Add all devDependencies and scripts to `package.json`
3. Create config files (eslint, vitest, releaserc)
4. Create composite action
5. Create 4 workflow files
6. Delete old `deploy.yml`
7. Update wrangler configs with env sections
8. Create `powerhouse-site-dev` Cloudflare Pages project in Cloudflare dashboard
9. Create `powerhouse-media-dev` R2 bucket in Cloudflare dashboard
10. Configure GitHub Environments + secrets in repo settings
11. Enable branch protection on `main`

No data migration required. Existing production remains unchanged until first merge to `main` with new workflows.

## Open Questions

- [ ] Will `@astrojs/eslint-config` work with ESLint 9 flat config, or does it need the legacy format? Verify at implementation time.
- [ ] Does the `powerhouse-media-dev` R2 bucket need to be pre-populated with test media, or is an empty bucket acceptable for dev?
- [ ] Should semantic-release create a `CHANGELOG.md` file in the repo, or rely solely on GitHub Releases for the changelog?
