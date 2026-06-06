# Worker Deployment Specification

## Purpose

Deploys Cloudflare Workers (`powerhouse-contact` and `powerhouse-media-proxy`) only when the `workers/` directory changes. Integrated into dev and production deployment workflows via path-based filtering.

## Requirements

### Requirement: Path-Based Trigger

The worker deployment step MUST only execute when files under `workers/` have changed in the triggering commit or pull request.

#### Scenario: Worker file modified

- GIVEN a commit modifies `workers/contact.js` or `workers/media-proxy.js`
- WHEN the deployment workflow evaluates changed paths
- THEN the worker deployment step is triggered

#### Scenario: No worker changes

- GIVEN a commit modifies only `src/` or `functions/` files
- WHEN the deployment workflow evaluates changed paths
- THEN the worker deployment step is skipped

### Requirement: Contact Worker Deploy

The system MUST deploy the `powerhouse-contact` worker using `wrangler.toml` when `workers/contact.js` changes.

#### Scenario: Contact worker deploy to production

- GIVEN `workers/contact.js` has changed and the target is production
- WHEN the worker deploy step runs
- THEN `npx wrangler deploy --config wrangler.toml` executes
- AND the `powerhouse-contact` worker is updated in production

### Requirement: Media Proxy Worker Deploy

The system MUST deploy the `powerhouse-media-proxy` worker using `wrangler-media.toml` when `workers/media-proxy.js` changes. The R2 binding `MEDIA_BUCKET` MUST be correctly configured in the target environment.

#### Scenario: Media proxy deploy with R2 binding

- GIVEN `workers/media-proxy.js` has changed
- WHEN the worker deploy step runs
- THEN `npx wrangler deploy --config wrangler-media.toml` executes
- AND the deployed worker has the `MEDIA_BUCKET` R2 binding available

#### Scenario: R2 binding missing in target environment

- GIVEN the target Cloudflare environment does not have the `powerhouse-media` R2 bucket bound
- WHEN the worker deploy step runs
- THEN the deploy SHOULD fail with a binding error
- AND the failure is reported in the workflow log

### Requirement: Environment-Aware Deploy

Workers MUST deploy to the correct environment (dev or production) matching the parent workflow.

#### Scenario: Dev environment worker deploy

- GIVEN the dev deployment workflow triggers worker deployment
- WHEN workers deploy to the dev environment
- THEN they use dev-specific configuration (if `[env.dev]` is defined in wrangler configs)

#### Scenario: Production environment worker deploy

- GIVEN the production deployment workflow triggers worker deployment
- WHEN workers deploy to production
- THEN they use production configuration (if `[env.production]` is defined in wrangler configs)

### Requirement: Independent Worker Failure

A worker deployment failure MUST NOT roll back the Pages site deployment. The two are independent deploy targets.

#### Scenario: Worker deploy fails after Pages succeeds

- GIVEN the Pages site deploy succeeded
- WHEN the worker deploy step fails
- THEN the Pages site remains deployed
- AND the workflow reports a partial failure
