# Semantic Versioning Specification

## Purpose

Automatic semver management via `semantic-release` with conventional commits. Creates version tags and GitHub Releases with auto-generated changelogs.

## Requirements

### Requirement: Semantic Release Configuration

`semantic-release` MUST be configured in `package.json` with the conventional commits plugin and GitHub release plugin.

#### Scenario: Configuration present in package.json

- GIVEN the project is set up
- WHEN inspecting `package.json`
- THEN `semantic-release` is listed in devDependencies
- AND the release configuration specifies conventional changelog and GitHub plugins

### Requirement: Conventional Commits Enforcement

All commits merged to `main` MUST use conventional commit format (`feat:`, `fix:`, `chore:`, `docs:`, etc.).

#### Scenario: Valid conventional commit

- GIVEN a commit message starts with a valid type prefix (e.g., `feat: add pricing comparison`)
- WHEN `semantic-release` analyzes commit history
- THEN the commit is correctly categorized for version bump calculation

#### Scenario: Non-conventional commit

- GIVEN a commit message lacks a conventional prefix (e.g., `updated stuff`)
- WHEN `semantic-release` analyzes commit history
- THEN the commit is treated as a chore (no version bump)

### Requirement: Automatic Version Tagging

`semantic-release` MUST create a git tag with the new version number after each production deployment.

#### Scenario: Feature release bumps minor version

- GIVEN commits since last release include at least one `feat:` commit
- WHEN `semantic-release` runs
- THEN a new minor version tag is created (e.g., `1.1.0`)

#### Scenario: Bugfix release bumps patch version

- GIVEN commits since last release include only `fix:` commits (no `feat:`)
- WHEN `semantic-release` runs
- THEN a new patch version tag is created (e.g., `1.0.1`)

#### Scenario: Breaking change bumps major version

- GIVEN commits include a `feat!:` or `BREAKING CHANGE:` footer
- WHEN `semantic-release` runs
- THEN a new major version tag is created (e.g., `2.0.0`)

#### Scenario: No relevant changes

- GIVEN all commits since last release are `chore:`, `docs:`, or non-conventional
- WHEN `semantic-release` runs
- THEN no new version or tag is created

### Requirement: GitHub Release Creation

`semantic-release` MUST create a GitHub Release for each new version with an auto-generated changelog.

#### Scenario: Release with changelog

- GIVEN `semantic-release` determines a new version is needed
- WHEN the release step executes
- THEN a GitHub Release is created with the version tag
- AND the release body contains a categorized changelog (Features, Bug Fixes, Breaking Changes)

### Requirement: Package Version Update

`semantic-release` MUST update the `version` field in `package.json` to match the new tag.

#### Scenario: Version field updated

- GIVEN `semantic-release` creates tag `v1.2.0`
- WHEN the release process completes
- THEN `package.json` `version` field reads `1.2.0`

### Requirement: Integration with Production Workflow

`semantic-release` MUST run only after a successful production deployment, not in dev or PR workflows.

#### Scenario: Release runs after production deploy

- GIVEN the production deployment succeeds
- WHEN the post-deploy step executes
- THEN `semantic-release` runs and evaluates commits

#### Scenario: Release does not run on dev deploys

- GIVEN a dev deployment completes
- WHEN the workflow finishes
- THEN `semantic-release` is NOT invoked
