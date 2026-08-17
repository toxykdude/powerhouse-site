#!/usr/bin/env node
// GSC query tool for powerhousegym.co
// Usage: GSC_SA_KEY_JSON='<key json>' node scripts/gsc-query.mjs [days]
// The key is the service-account JSON (gsc-api@powerhouse-seo.iam.gserviceaccount.com),
// added as a restricted user on the https://powerhousegym.co/ property.
import crypto from "node:crypto";

const DAYS = Number(process.argv[2] || 28);
const KEY = process.env.GSC_SA_KEY_JSON;
if (!KEY) {
  console.error("Missing GSC_SA_KEY_JSON env var (service-account JSON)");
  process.exit(1);
}

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const now = Math.floor(Date.now() / 1000);

async function getToken(k) {
  const jwt = [
    b64u({ alg: "RS256", typ: "JWT" }),
    b64u({
      iss: k.client_email,
      scope: "https://www.googleapis.com/auth/webmasters",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  ].join(".");
  const sig = crypto.createSign("RSA-SHA256").update(jwt).sign(k.private_key, "base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}.${sig}`,
  });
  const t = await res.json();
  if (!t.access_token) throw new Error(`token exchange failed: ${JSON.stringify(t).slice(0, 200)}`);
  return t.access_token;
}

const k = JSON.parse(KEY);
const token = await getToken(k);
const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
const site = encodeURIComponent("https://powerhousegym.co/");
const endDate = new Date().toISOString().slice(0, 10);
const startDate = new Date(Date.now() - DAYS * 864e5).toISOString().slice(0, 10);

// 1) Top queries
const q = await (
  await fetch(`https://searchconsole.googleapis.com/webmasters/v3/sites/${site}/searchAnalytics/query`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ startDate, endDate, dimensions: ["query"], rowLimit: 20 }),
  })
).json();

console.log(`\n=== Top queries (last ${DAYS} days) ===`);
(q.rows || []).forEach((r, i) => {
  const kw = (r.keys[0] || "").slice(0, 45).padEnd(45);
  console.log(
    `${String(i + 1).padStart(2)}. ${kw} clicks:${String(r.clicks).padStart(4)} impr:${String(r.impressions).padStart(5)} pos:${(r.position || 0).toFixed(1)}`,
  );
});

// 2) Top pages
const p = await (
  await fetch(`https://searchconsole.googleapis.com/webmasters/v3/sites/${site}/searchAnalytics/query`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ startDate, endDate, dimensions: ["page"], rowLimit: 10 }),
  })
).json();

console.log(`\n=== Top pages ===`);
(p.rows || []).forEach((r) => {
  console.log(`  ${r.keys[0].replace("https://powerhousegym.co", "").padEnd(50)} clicks:${r.clicks} impr:${r.impressions}`);
});

// 3) Sitemap status
const s = await (
  await fetch(`https://searchconsole.googleapis.com/webmasters/v3/sites/${site}/sitemaps`, { headers: auth })
).json();

console.log(`\n=== Sitemaps ===`);
(s.sitemap || []).forEach((m) => console.log(`  ${m.path}  ${m.lastSubmitted || ""}  errors:${m.errors || 0}  warnings:${m.warnings || 0}`));
