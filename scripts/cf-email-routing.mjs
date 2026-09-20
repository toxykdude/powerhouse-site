#!/usr/bin/env node
/**
 * cf-email-routing.mjs — create (idempotently) a Cloudflare Email Routing
 * rule that forwards one alias of powerhousegym.co to a verified
 * destination address.
 *
 * Usage (via workflow_dispatch inputs or env):
 *   ALIAS_EMAIL           alias on powerhousegym.co (default tvpowerhouse@)
 *   DESTINATION_EMAIL     verified destination inbox
 *   CLOUDFLARE_EMAIL / CLOUDFLARE_API_KEY  auth (global API key)
 *
 * Safety: read-only lookups first (zone, routing status, verified
 * destination, existing rules); the ONLY mutation is creating the rule if
 * an identical one does not already exist.
 */

const {
  CLOUDFLARE_EMAIL,
  CLOUDFLARE_API_KEY,
  ALIAS_EMAIL = "tvpowerhouse@powerhousegym.co",
  DESTINATION_EMAIL = "powerhousegymmanizales@gmail.com",
} = process.env;

for (const name of ["CLOUDFLARE_EMAIL", "CLOUDFLARE_API_KEY"]) {
  if (!process.env[name]) {
    console.error(`Missing required env: ${name}`);
    process.exit(1);
  }
}

const API = "https://api.cloudflare.com/client/v4";
const HEADERS = {
  "X-Auth-Email": CLOUDFLARE_EMAIL,
  "X-Auth-Key": CLOUDFLARE_API_KEY,
  "Content-Type": "application/json",
};

async function cf(path, init) {
  const res = await fetch(`${API}${path}`, {
    headers: HEADERS,
    ...init,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.success === false) {
    throw new Error(
      `${init?.method ?? "GET"} ${path}: HTTP ${res.status} ${JSON.stringify(body.errors ?? "")}`,
    );
  }
  return body.result;
}

// 1) Resolve the zone -------------------------------------------------------
const zones = await cf(`/zones?name=powerhousegym.co`);
if (!zones?.length)
  throw new Error("Zone powerhousegym.co not found for this account");
const zoneId = zones[0].id;
console.log(`zone: powerhousegym.co (${zoneId.slice(0, 8)}…)`);

// 2) Email Routing must be enabled ------------------------------------------
const routing = await cf(`/zones/${zoneId}/email/routing`);
console.log(
  `email routing: enabled=${routing.enabled} status=${routing.status}`,
);
if (!routing.enabled) {
  console.error("Email Routing is NOT enabled for this zone — aborting.");
  process.exit(2);
}

// 3) Destination must be a verified address ---------------------------------
const addresses = await cf(`/zones/${zoneId}/email/routing/addresses`);
const destination = (addresses ?? []).find(
  (a) => a.email.toLowerCase() === DESTINATION_EMAIL.toLowerCase(),
);
if (!destination) {
  console.error(
    `Destination ${DESTINATION_EMAIL} is not registered in Email Routing addresses. ` +
      "Add it in the dashboard (Email → Routing → Destination addresses) and verify it first.",
  );
  process.exit(3);
}
console.log(
  `destination: ${destination.email} verified=${destination.verified}`,
);
if (!destination.verified) {
  console.error(
    "Destination address is NOT verified — complete verification first.",
  );
  process.exit(4);
}

// 4) Idempotent rule creation ------------------------------------------------
const rules = await cf(`/zones/${zoneId}/email/routing/rules?per_page=50`);
const existing = (rules ?? []).find((rule) =>
  rule.matchers?.some(
    (matcher) =>
      matcher.field === "to" &&
      matcher.value?.toLowerCase() === ALIAS_EMAIL.toLowerCase(),
  ),
);
if (existing) {
  const forwards = existing.actions?.some(
    (action) =>
      action.type === "forward" &&
      (action.value ?? []).includes(destination.id),
  );
  console.log(
    `rule already exists: "${existing.name}" (enabled=${existing.enabled}) ` +
      `forwarding to this destination: ${forwards}`,
  );
  if (existing.enabled && forwards) {
    console.log("Nothing to do.");
    process.exit(0);
  }
  console.error(
    "Existing rule does not match the desired state — review in the dashboard.",
  );
  process.exit(5);
}

const created = await cf(`/zones/${zoneId}/email/routing/rules`, {
  method: "POST",
  body: JSON.stringify({
    name: `${ALIAS_EMAIL} → ${DESTINATION_EMAIL}`,
    enabled: true,
    matchers: [{ type: "literal", field: "to", value: ALIAS_EMAIL }],
    actions: [{ type: "forward", value: [destination.id] }],
  }),
});
console.log(
  `rule created: "${created.name}" enabled=${created.enabled} ` +
    `${ALIAS_EMAIL} → ${DESTINATION_EMAIL}`,
);

// 5) Verify by re-reading -----------------------------------------------------
const after = await cf(`/zones/${zoneId}/email/routing/rules?per_page=50`);
const verified = (after ?? []).find((rule) => rule.id === created.id);
console.log(
  `verify: rule present=${Boolean(verified)} enabled=${verified?.enabled ?? false}`,
);
if (!verified?.enabled) process.exit(6);
console.log("VERIFY OK");
