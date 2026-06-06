# PR Validation Specification

## Purpose

Quality gate that runs on every pull request. Blocks merge if any check fails.

## Requirements

### Requirement: PR Event Trigger

The system MUST trigger the validation workflow on `pull_request` events targeting any branch, including `opened`, `synchronize`, and `reopened` action types.

#### Scenario: PR opened against main

- GIVEN a contributor creates a pull request targeting `main`
- WHEN the pull request event fires
- THEN the validation workflow runs automatically

#### Scenario: PR updated with new commit

- GIVEN an open pull request exists
- WHEN a new commit is pushed to the PR branch
- THEN the validation workflow re-runs on the updated code

### Requirement: Lint Check

The system MUST run ESLint and block merge on any lint error.

#### Scenario: Code passes lint

- GIVEN the PR source code has no ESLint errors
- WHEN the lint step executes
- THEN the step succeeds and the workflow continues

#### Scenario: Code fails lint

- GIVEN the PR source code has one or more ESLint errors
- WHEN the lint step executes
- THEN the step fails and the PR status check reports failure

### Requirement: Type Check

The system MUST run `astro check` and block merge on any type error.

#### Scenario: TypeScript types are valid

- GIVEN all `.astro` and `.ts` files pass `astro check`
- WHEN the typecheck step executes
- THEN the step succeeds

#### Scenario: Type error in Pages Function

- GIVEN a file in `functions/api/` has a TypeScript type error
- WHEN `astro check` runs
- THEN the step fails and the PR is blocked

### Requirement: Unit Tests

The system MUST run Vitest and block merge on any test failure.

#### Scenario: All tests pass

- GIVEN all unit tests pass
- WHEN the Vitest step executes
- THEN the step succeeds

#### Scenario: Wompi signature test fails

- GIVEN a unit test for Wompi payment signature logic fails
- WHEN the Vitest step executes
- THEN the step fails and the PR is blocked from merging

### Requirement: Build Verification

The system MUST run `npm run build` and block merge on build failure.

#### Scenario: Build succeeds

- GIVEN the project builds without errors
- WHEN `npm run build` executes
- THEN the `dist/` directory is produced and the step succeeds

#### Scenario: Build fails due to broken import

- GIVEN a component imports a non-existent module
- WHEN `npm run build` executes
- THEN the step fails with a build error and the PR is blocked

### Requirement: Security Audit

The system MUST run a dependency security scan and SHOULD warn on high or critical vulnerabilities.

#### Scenario: No high/critical vulnerabilities

- GIVEN no high or critical CVEs are found in dependencies
- WHEN the security scan executes
- THEN the step succeeds

#### Scenario: Critical vulnerability detected

- GIVEN a critical CVE exists in a production dependency
- WHEN the security scan executes
- THEN the step reports the vulnerability and SHOULD block the PR

### Requirement: Performance Budget

The full validation pipeline SHOULD complete in under 5 minutes.

#### Scenario: Pipeline completes within budget

- GIVEN all steps are configured with dependency caching (npm cache)
- WHEN the workflow runs
- THEN total wall-clock time is under 5 minutes
