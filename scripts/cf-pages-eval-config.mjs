#!/usr/bin/env node
/**
 * cf-pages-eval-config.mjs — configure the evaluation system on the
 * Cloudflare Pages project(s): D1 binding `DB` + evaluation env vars.
 *
 * Safety model (this script MUST NOT break existing WOMPI/FACEGYM config):
 *  1. GET the target Pages project.
 *  2. PROBE merge-vs-replace PATCH semantics on the DEV project with a
 *     throwaway canary variable (never touching production first).
 *  3. Only apply the proven-safe pattern to the production project:
 *     merge-by-key when the probe proves it, or verbatim-echo otherwise.
 *     If neither pattern preserves existing config, exit non-zero WITHOUT
 *     touching production (dashboard remains the fallback).
 *
 * All output is masked: variable NAMES and types only, never values.
 *
 * Required env:
 *   CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_EMAIL, CLOUDFLARE_API_KEY,
 *   PAGES_PROJECT (prod project name), DEV_PAGES_PROJECT (canary target),
 *   RATE_LIMIT_SALT, ADMIN_API_KEY (values pushed as plain_text vars).
 * Optional env: D1_DATABASE_ID (binds d1_databases.DB on production),
 * GMAIL_SMTP_USER/GMAIL_SMTP_PASSWORD (enables the gmail SMTP provider).
 */

const {
  CLOUDFLARE_ACCOUNT_ID,
  CLOUDFLARE_EMAIL,
  CLOUDFLARE_API_KEY,
  PAGES_PROJECT,
  DEV_PAGES_PROJECT,
  RATE_LIMIT_SALT,
  ADMIN_API_KEY,
  SENDGRID_API_KEY,
  D1_DATABASE_ID,
} = process.env;

const REQUIRED = [
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_EMAIL",
  "CLOUDFLARE_API_KEY",
  "PAGES_PROJECT",
  "DEV_PAGES_PROJECT",
  "RATE_LIMIT_SALT",
  "ADMIN_API_KEY",
];
for (const name of REQUIRED) {
  if (!process.env[name]) {
    console.error(`Missing required env: ${name}`);
    process.exit(1);
  }
}

const API = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/pages/projects`;
const HEADERS = {
  "X-Auth-Email": CLOUDFLARE_EMAIL,
  "X-Auth-Key": CLOUDFLARE_API_KEY,
  "Content-Type": "application/json",
};

/**
 * The evaluation env vars this script manages (nothing else).
 * Provider precedence: gmail (SMTP app password — existing pipeline) when
 * its secret exists, then sendgrid, else console so evaluations keep
 * persisting while email is not yet configured.
 */
const evalEnvVars = {
  EMAIL_PROVIDER: GMAIL_SMTP_PASSWORD
    ? "gmail"
    : SENDGRID_API_KEY
      ? "sendgrid"
      : "console",
  SMTP_HOST: "smtp.gmail.com",
  // 465 implicit TLS — avoids the Workers startTls() stream-lock edge
  // (verified end-to-end against real Gmail with an app password).
  SMTP_PORT: "465",
  SMTP_USER: GMAIL_SMTP_USER || "powerhousegymmanizales@gmail.com",
  EVALUATIONS_TO_EMAIL: "support@powerhousegym.co",
  EMAIL_FROM: "PowerHouse GYM Evaluaciones",
  RATE_LIMIT_SALT: RATE_LIMIT_SALT,
  ADMIN_API_KEY: ADMIN_API_KEY,
  EVAL_RATE_LIMIT_PER_HOUR: "5",
  EVAL_DUPLICATE_WINDOW_MIN: "15",
};
if (GMAIL_SMTP_PASSWORD) {
  evalEnvVars.SMTP_PASSWORD = GMAIL_SMTP_PASSWORD;
} else {
  console.warn(
    "[config] GMAIL_SMTP_PASSWORD not provided — SMTP not configured.",
  );
}
if (SENDGRID_API_KEY) {
  evalEnvVars.SENDGRID_API_KEY = SENDGRID_API_KEY;
}

function maskVars(envVars) {
  return Object.fromEntries(
    Object.entries(envVars ?? {}).map(([k, v]) => [k, v?.type ?? "?"]),
  );
}

async function getProject(name) {
  const res = await fetch(`${API}/${name}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`GET ${name}: HTTP ${res.status}`);
  const body = await res.json();
  if (!body.success)
    throw new Error(`GET ${name}: ${JSON.stringify(body.errors)}`);
  return body.result;
}

async function patchProject(name, deploymentConfigs) {
  const res = await fetch(`${API}/${name}`, {
    method: "PATCH",
    headers: HEADERS,
    body: JSON.stringify({ deployment_configs: deploymentConfigs }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.success) {
    throw new Error(
      `PATCH ${name}: HTTP ${res.status} ${JSON.stringify(body.errors ?? "")}`,
    );
  }
  return body.result;
}

function prodEnv(project) {
  return project.deployment_configs?.production ?? {};
}

function varKeys(envVars) {
  return Object.keys(envVars ?? {}).sort();
}

// ---------------------------------------------------------------------------
// Step 1 — probe PATCH semantics on the DEV project with a canary var.
// ---------------------------------------------------------------------------
console.log(
  `[probe] target: ${DEV_PAGES_PROJECT} (dev only, never production)`,
);
const devBefore = await getProject(DEV_PAGES_PROJECT);
const devEnvBefore = prodEnv(devBefore).env_vars;
console.log(`[probe] existing vars:`, maskVars(devEnvBefore));

await patchProject(DEV_PAGES_PROJECT, {
  production: {
    env_vars: { PH_EVAL_PROBE: { type: "plain_text", value: "1" } },
  },
});

const devAfter = await getProject(DEV_PAGES_PROJECT);
const devEnvAfter = prodEnv(devAfter).env_vars;
console.log(`[probe] after canary-only PATCH:`, maskVars(devEnvAfter));

const probePresent = devEnvAfter?.PH_EVAL_PROBE?.value === "1";
const existingPreserved = varKeys(devEnvBefore).every(
  (k) => devEnvAfter?.[k]?.type === devEnvBefore?.[k]?.type,
);
const mergeSemantics = probePresent && existingPreserved;

// Cleanup the canary in both semantics (replace-with-original, which is
// safe on dev even under merge semantics).
if (Object.keys(devEnvBefore ?? {}).length > 0) {
  await patchProject(DEV_PAGES_PROJECT, {
    production: { env_vars: devEnvBefore },
  });
} else if (devEnvAfter?.PH_EVAL_PROBE) {
  await patchProject(DEV_PAGES_PROJECT, {
    production: {
      env_vars: { PH_EVAL_PROBE: { type: "plain_text", value: "" } },
    },
  });
}
console.log(`[probe] canary cleaned up`);

if (!probePresent) {
  console.error(
    "[probe] PATCH did not apply the canary — aborting, production untouched.",
  );
  process.exit(2);
}
console.log(
  `[probe] semantics: ${mergeSemantics ? "MERGE-BY-KEY (safe)" : "REPLACE (needs verbatim echo)"}`,
);

// ---------------------------------------------------------------------------
// Step 2 — apply to PRODUCTION using the proven-safe pattern.
// ---------------------------------------------------------------------------
console.log(`[prod] target: ${PAGES_PROJECT}`);
const prod = await getProject(PAGES_PROJECT);
const env = prodEnv(prod);
const existingVars = env.env_vars ?? {};
const existingD1 = env.d1_databases ?? {};
console.log(`[prod] existing vars:`, maskVars(existingVars));
console.log(`[prod] existing d1 bindings:`, Object.keys(existingD1));

// Build the PATCH payload.
let envVarsPayload;
if (mergeSemantics) {
  // Merge-by-key: send ONLY our vars — nothing else can be affected.
  envVarsPayload = Object.fromEntries(
    Object.entries(evalEnvVars).map(([k, v]) => [
      k,
      { type: "plain_text", value: v },
    ]),
  );
} else {
  // Replace semantics: echo every existing entry VERBATIM, then overlay ours.
  envVarsPayload = { ...existingVars };
  for (const [k, v] of Object.entries(evalEnvVars)) {
    envVarsPayload[k] = { type: "plain_text", value: v };
  }
}

const deploymentConfigs = { production: { env_vars: envVarsPayload } };

if (D1_DATABASE_ID) {
  const d1Payload = mergeSemantics
    ? { DB: { id: D1_DATABASE_ID } }
    : { ...existingD1, DB: { id: D1_DATABASE_ID } };
  deploymentConfigs.production.d1_databases = d1Payload;
} else {
  console.warn(
    "[prod] D1_DATABASE_ID not provided — binding skipped (migrations only).",
  );
}

// Final safety gate: under replace semantics, assert the payload still
// contains EVERY pre-existing var key with its original type.
if (!mergeSemantics) {
  for (const [k, v] of Object.entries(existingVars)) {
    if (envVarsPayload[k]?.type !== v?.type) {
      console.error(
        `[prod] safety gate failed for ${k} — aborting BEFORE any PATCH.`,
      );
      process.exit(3);
    }
  }
}

await patchProject(PAGES_PROJECT, deploymentConfigs);
console.log("[prod] PATCH applied.");

// ---------------------------------------------------------------------------
// Step 3 — verify by re-reading production.
// ---------------------------------------------------------------------------
const verified = await getProject(PAGES_PROJECT);
const vEnv = prodEnv(verified);
const vVars = vEnv.env_vars ?? {};
const missing = Object.keys(evalEnvVars).filter((k) => !vVars[k]);
const lostExisting = Object.entries(existingVars).filter(
  ([k, v]) => !vVars[k] || vVars[k]?.type !== v?.type,
);
console.log(
  "[prod] verify — managed vars present:",
  Object.keys(evalEnvVars)
    .filter((k) => vVars[k])
    .join(", "),
);
console.log(
  "[prod] verify — d1 bindings now:",
  Object.keys(vEnv.d1_databases ?? {}),
);

if (missing.length > 0 || lostExisting.length > 0) {
  console.error(
    `[prod] VERIFY FAILED — missing: ${missing.join(",")} / changed-existing: ${lostExisting.map(([k]) => k).join(",")}`,
  );
  process.exit(4);
}
console.log(
  "[prod] VERIFY OK — all managed vars set, all pre-existing vars intact.",
);
