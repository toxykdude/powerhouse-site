# Dev Deployment Specification

## Purpose

Deploys every pull request to a preview environment on a separate Cloudflare Pages project. Enables visual and functional review before merge without affecting production.

## Requirements

### Requirement: PR Trigger

The system MUST trigger dev deployment on `pull_request` events targeting `main`.

#### Scenario: PR targets main

- GIVEN a pull request is opened or updated targeting `main`
- WHEN the event fires
- THEN the dev deployment workflow runs

#### Scenario: PR targets non-main branch

- GIVEN a pull request targets a feature branch (not `main`)
- WHEN the event fires
- THEN the dev deployment workflow does NOT run

### Requirement: Preview Deploy Target

The system MUST deploy to a separate Cloudflare Pages project on `*.pages.dev`. The production site (`powerhousegym.co`) MUST NOT be modified.

#### Scenario: Successful preview deploy

- GIVEN the build succeeds
- WHEN the deploy step executes
- THEN the built site is deployed to the dev Cloudflare Pages project
- AND a preview URL is available on `*.pages.dev`

#### Scenario: Preview deploy does not touch production

- GIVEN a dev deployment is in progress
- WHEN the deploy completes
- THEN the production site (`powerhousegym.co`) remains unchanged

### Requirement: Deploy Audit Log

The system MUST log version, commit SHA, and author for every dev deployment.

#### Scenario: Audit metadata recorded

- GIVEN a dev deployment completes
- WHEN the workflow finishes
- THEN the deployment record includes commit SHA, branch name, author, and deploy result

### Requirement: Worker Deploy on Path Change

The system SHOULD deploy workers to the dev environment when the `workers/` directory has changes in the PR.

#### Scenario: Workers directory changed in PR

- GIVEN the PR includes changes to files under `workers/`
- WHEN the dev deployment workflow runs
- THEN the worker deployment step is triggered for both `powerhouse-contact` and `powerhouse-media-proxy`

#### Scenario: Workers directory unchanged in PR

- GIVEN the PR has no changes under `workers/`
- WHEN the dev deployment workflow runs
- THEN the worker deployment step is skipped

### Requirement: PR Validation Dependency

The dev deployment MUST depend on the PR validation workflow passing. A failing validation MUST prevent dev deployment.

#### Scenario: Validation passes, deploy proceeds

- GIVEN the PR validation workflow succeeds
- WHEN the dev deployment workflow evaluates conditions
- THEN the deployment proceeds

#### Scenario: Validation fails, deploy blocked

- GIVEN the PR validation workflow fails
- WHEN the dev deployment workflow evaluates conditions
- THEN the deployment is skipped
