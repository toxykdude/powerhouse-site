# Rollback Specification

## Purpose

Manual workflow to restore a previous production version by deploying a selected commit, tag, or release.

## Requirements

### Requirement: Manual Trigger

The system MUST trigger rollback exclusively via `workflow_dispatch`. Automatic rollback MUST NOT occur.

#### Scenario: Operator triggers rollback

- GIVEN a production issue requires reverting
- WHEN an operator manually triggers the rollback workflow
- THEN the workflow begins execution with user-provided inputs

### Requirement: Version Selection Input

The system MUST accept a commit SHA, git tag, or GitHub Release name as input to identify the target version.

#### Scenario: Rollback to specific commit

- GIVEN the operator provides a valid commit SHA
- WHEN the workflow runs
- THEN the repository is checked out at that commit SHA
- AND the build and deploy proceed from that checkout

#### Scenario: Rollback to semver tag

- GIVEN the operator provides a valid semver tag (e.g., `v1.2.0`)
- WHEN the workflow runs
- THEN the repository is checked out at that tag
- AND the build and deploy proceed

#### Scenario: Rollback to GitHub Release

- GIVEN the operator provides a GitHub Release name
- WHEN the workflow runs
- THEN the corresponding tag is resolved
- AND the repository is checked out at that tag

#### Scenario: Invalid version reference

- GIVEN the operator provides a non-existent SHA, tag, or release name
- WHEN the checkout step runs
- THEN the workflow fails with a clear error indicating the reference was not found

### Requirement: Build and Deploy

The system MUST build the selected version and deploy it to production (`powerhousegym.co`).

#### Scenario: Rollback build and deploy succeeds

- GIVEN a valid version reference is checked out
- WHEN `npm ci`, `npm run build`, and the deploy step execute
- THEN the selected version is live on `powerhousegym.co`

#### Scenario: Rollback build fails

- GIVEN the selected version has a build error (e.g., dependency no longer resolves)
- WHEN `npm run build` executes
- THEN the workflow fails without deploying
- AND the current production version remains unchanged

### Requirement: Rollback Audit Log

The system MUST log who triggered the rollback, what version was restored, why (from input), and when.

#### Scenario: Audit metadata recorded

- GIVEN a rollback completes successfully
- WHEN the workflow finishes
- THEN the audit record includes operator username, target version, reason (from input field), timestamp, and result

### Requirement: No Automatic Worker Rollback

The rollback workflow MUST NOT automatically roll back workers. Workers MAY be rolled back manually as a separate operation.

#### Scenario: Only Pages site is rolled back

- GIVEN a rollback is executed
- WHEN the workflow completes
- THEN only the Cloudflare Pages site is redeployed
- AND workers remain at their current deployed version
