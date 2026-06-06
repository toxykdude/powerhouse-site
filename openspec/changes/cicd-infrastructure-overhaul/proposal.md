# Proposal: CI/CD Infrastructure Overhaul

## Intent

Replace the single unprotected deploy workflow with a complete CI/CD pipeline that makes GitHub the single source of truth. Currently: no quality gates, no preview deploys, no test framework, workers deployed manually, `.env` exposed in repo (not gitignored), and `package.json` version is frozen at `1.0.0`. This change establishes professional CI/CD before the codebase grows further.

## Scope

### In Scope
- 4 GitHub Actions workflows: `pr-validation`, `deploy-dev`, `deploy-production`, `rollback`
- Path-based worker deployment (only when `workers/` changes)
- Separate Cloudflare Pages dev project on `*.pages.dev`
- ESLint + Prettier + Vitest + `astro check` in CI
- Unit tests for Wompi payment signature logic (priority)
- `semantic-release` with conventional commits for auto semver + GitHub Releases
- Branch protection on `main` (PR reviews + status checks required)
- `.env` added to `.gitignore` immediately
- Audit logging on every deploy (commit, branch, author, environment, result)
- GitHub Environments: Development + Production with independent rules

### Out of Scope
- Secret rotation (deferred until after CI/CD is configured)
- E2E tests (future work)
- Dependabot/Renovate configuration (future work)
- FaceGYM dev instance or mocking (future work)
- Wrangler auth migration from global API key to scoped token

## Capabilities

### New Capabilities
- `pr-validation`: Lint, typecheck, unit tests, build verification, and security scan on every PR. Blocks merge on failure.
- `dev-deployment`: Preview deploys to `*.pages.dev` on every PR. Logs version, commit SHA, author.
- `production-deployment`: Deploy to `powerhousegym.co` on push to `main`. All validations must pass. Auto semver tag + GitHub Release.
- `worker-deployment`: Path-filtered deploy of `wrangler.toml` and `wrangler-media.toml` workers. Only triggers on `workers/` directory changes.
- `rollback`: Manual `workflow_dispatch` to restore a previous commit, tag, or release in production.
- `semantic-versioning`: Automatic semver via `semantic-release` with conventional commits. Creates GitHub Releases with changelog.

### Modified Capabilities
None — no existing specs to modify.

## Approach

Full GitHub Actions matrix (4 workflows + 1 worker workflow). Each workflow is a separate `.yml` file for separation of concerns and parallelizable execution. GitHub Actions handles all orchestration; Cloudflare only executes deploys via Wrangler. Dev environment is a separate Cloudflare Pages project. Workers get their own path-filtered workflow.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `.github/workflows/` | New | 4 new workflow files, 1 existing replaced |
| `package.json` | Modified | New scripts (lint, format, test, typecheck), new devDependencies |
| `.gitignore` | Modified | Add `.env` |
| `wrangler.toml` | Modified | Add `[env.dev]` / `[env.production]` |
| `wrangler-media.toml` | Modified | Add `[env.dev]` / `[env.production]` |
| `functions/api/**/*.ts` | None | Must work in both dev and prod environments |
| `src/` | None | No source changes, only build pipeline |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Payment signature logic break from env var changes | High | Unit tests for Wompi signature as first priority; env vars verified in dev before prod |
| `.env` already in git history | High | `.gitignore` added now; BFG or git-filter-repo cleanup after secret rotation |
| Cloudflare Pages Functions runtime differs from local | Medium | Type-check passes but edge may fail — dev preview catches this before merge |
| `semantic-release` misconfiguration creates wrong version | Low | Test on feature branch first; rollback workflow available |
| Worker R2 binding missing in dev environment | Medium | Document required bindings; dev deploy may fail until Cloudflare dev project is configured |

## Rollback Plan

1. Revert the commit that introduced the workflow changes — old `deploy.yml` is in git history.
2. Use the new `rollback.yml` workflow to restore any previous production state.
3. If `semantic-release` creates wrong tag, delete tag + release manually and re-run.

## Dependencies

- Cloudflare Pages dev project must be created before `deploy-dev` works
- GitHub Environments + branch protection must be configured in repo settings
- All secrets must exist in GitHub Secrets before workflows run
- `semantic-release` requires conventional commit format enforcement

## Success Criteria

- [ ] PR with failing lint/test/typecheck/build is blocked from merging
- [ ] Every PR gets a preview deploy on `*.pages.dev`
- [ ] Merge to `main` auto-deploys to production with semver tag + GitHub Release
- [ ] Worker changes trigger separate deploy only when `workers/` changes
- [ ] Rollback workflow restores a previous production version
- [ ] Every deploy logs commit, branch, author, environment, and result
- [ ] `.env` is in `.gitignore` and no secrets appear in workflow files
