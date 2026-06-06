# Production Deployment Specification

## Purpose

Deploys to `powerhousegym.co` on merge to `main`. Requires all quality gates to pass. Integrates semantic versioning and path-filtered worker deployment.

## Requirements

### Requirement: Main Branch Trigger

The system MUST trigger production deployment on push to `main`.

#### Scenario: Commit pushed to main

- GIVEN a commit is pushed to `main` (via merge or direct push)
- WHEN the push event fires
- THEN the production deployment workflow runs

#### Scenario: Push to feature branch

- GIVEN a commit is pushed to a non-main branch
- WHEN the push event fires
- THEN the production deployment workflow does NOT run

### Requirement: Validation Gate

The system MUST run all validation checks (lint, typecheck, unit tests, build, security scan) before deployment. The deployment MUST be cancelled if any validation fails.

#### Scenario: All validations pass

- GIVEN lint, typecheck, tests, and build all succeed
- WHEN the validation job completes
- THEN the deployment job proceeds

#### Scenario: Any validation fails

- GIVEN at least one validation step fails
- WHEN the validation job completes
- THEN the deployment job is cancelled
- AND no changes are pushed to production

### Requirement: Production Deploy Target

The system MUST deploy the built site to `powerhousegym.co` via Cloudflare Pages.

#### Scenario: Successful production deploy

- GIVEN all validations pass and the build succeeds
- WHEN the deploy step executes
- THEN the `dist/` directory is deployed to the `powerhouse-site` Cloudflare Pages project
- AND the live site at `powerhousegym.co` reflects the new code

### Requirement: Deploy Audit Log

The system MUST log commit SHA, author, environment, and result for every production deployment.

#### Scenario: Audit metadata recorded

- GIVEN a production deployment completes
- WHEN the workflow finishes
- THEN the deployment record includes commit SHA, tag (if created), author, environment (`production`), and result (`success` or `failure`)

### Requirement: Worker Deploy on Path Change

The system MUST deploy workers when the `workers/` directory has changed relative to the previous commit. Workers MUST deploy independently from the Pages site.

#### Scenario: Workers changed on merge to main

- GIVEN the merged commit includes changes under `workers/`
- WHEN the production deployment workflow runs
- THEN the worker deployment job triggers for the changed workers

#### Scenario: Workers unchanged on merge to main

- GIVEN the merged commit has no changes under `workers/`
- WHEN the production deployment workflow runs
- THEN the worker deployment job is skipped

### Requirement: Semantic Release Integration

The system MUST invoke `semantic-release` after a successful production deployment to generate version tags and GitHub Releases.

#### Scenario: Conventional commit triggers minor version

- GIVEN the merged commits include a `feat:` conventional commit
- WHEN `semantic-release` runs
- THEN a new minor version tag is created and a GitHub Release is published with an auto-generated changelog

#### Scenario: Only fixes in merged commits

- GIVEN the merged commits include only `fix:` conventional commits
- WHEN `semantic-release` runs
- THEN a new patch version tag is created with a corresponding GitHub Release

### Requirement: Failed Deploy Notification

The system SHOULD report deployment failures visibly in the GitHub Actions run log.

#### Scenario: Deploy fails with Cloudflare error

- GIVEN the Wrangler deploy step returns a non-zero exit code
- WHEN the workflow completes
- THEN the GitHub Actions run is marked as failed with the error output visible
