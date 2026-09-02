#!/usr/bin/env bash
# restore-payment-tunnel.sh — one-shot Cloudflare maintenance for the
# FaceGYM payment pipeline (2026-09-02 outage: the tunnel serving
# faceapp.powerhousegym.co was deleted on the Cloudflare side, so every
# Pages Function proxy to the backend returned 530 / error 1033).
#
# What it does (idempotent per tunnel name):
#   1. Verifies Cloudflare API auth (Global API Key).
#   2. Resolves the powerhousegym.co zone id.
#   3. Recreates the cloudflared tunnel "faceapp-lxc114"
#      (remotely-managed: config_src=cloudflare).
#   4. Configures tunnel ingress: faceapp.powerhousegym.co -> http://localhost:80
#      (nginx on LXC 114 proxies /api to the backend), catch-all 404.
#   5. Upserts the DNS CNAME faceapp.powerhousegym.co -> <tunnel>.cfargotunnel.com
#      (proxied).
#   6. Merges two plain-text env vars into the Pages project production
#      environment: FACEGYM_PORTAL_INTERNAL_KEY (must equal the backend's
#      PORTAL_INTERNAL_API_KEY) and FACEGYM_API_URL. Existing vars —
#      including secret_text ones — are preserved.
#   7. Prints the tunnel id + token (base64) so the operator can configure
#      the LXC connector. The workflow run is deleted after retrieval.
#
# Requires env: CF_EMAIL, CF_KEY, CF_ACCOUNT, PORTAL_KEY.
set -euo pipefail

API="https://api.cloudflare.com/client/v4"
TUNNEL_NAME="faceapp-lxc114"
ZONE_NAME="powerhousegym.co"
HOSTNAME="faceapp.powerhousegym.co"
PAGES_PROJECT="powerhouse-site"
: "${CF_EMAIL:?CF_EMAIL missing}" "${CF_KEY:?CF_KEY missing}"
: "${CF_ACCOUNT:?CF_ACCOUNT missing}" "${PORTAL_KEY:?PORTAL_KEY missing}"

cf() {
  local method=$1 path=$2 data=${3:-}
  if [ -n "$data" ]; then
    curl -sS -X "$method" "$API$path" \
      -H "X-Auth-Email: $CF_EMAIL" -H "X-Auth-Key: $CF_KEY" \
      -H "Content-Type: application/json" --data "$data"
  else
    curl -sS -X "$method" "$API$path" \
      -H "X-Auth-Email: $CF_EMAIL" -H "X-Auth-Key: $CF_KEY"
  fi
}

fail() { echo "FAILED: $1" >&2; exit 1; }

echo "== 1. verify API auth =="
USER_JSON=$(cf GET /user) || fail "curl /user"
[ "$(jq -r '.success' <<<"$USER_JSON")" = "true" ] || fail "auth rejected: $(jq -c '.errors' <<<"$USER_JSON")"
echo "auth OK for $(jq -r '.result.email' <<<"$USER_JSON")"

echo "== 2. resolve zone $ZONE_NAME =="
ZONE_ID=$(cf GET "/zones?name=$ZONE_NAME" | jq -r '.result[0].id // empty')
[ -n "$ZONE_ID" ] || fail "zone not found"
echo "zone: $ZONE_ID"

echo "== 3. recreate tunnel $TUNNEL_NAME =="
EXISTING=$(cf GET "/accounts/$CF_ACCOUNT/cfd_tunnel?name=$TUNNEL_NAME&is_deleted=false" | jq -r '.result[0].id // empty')
if [ -n "$EXISTING" ]; then
  echo "deleting stale tunnel $EXISTING"
  cf DELETE "/accounts/$CF_ACCOUNT/cfd_tunnel/$EXISTING" | jq -e '.success' >/dev/null
fi
CREATED=$(cf POST "/accounts/$CF_ACCOUNT/cfd_tunnel" \
  "{\"name\":\"$TUNNEL_NAME\",\"config_src\":\"cloudflare\"}")
[ "$(jq -r '.success' <<<"$CREATED")" = "true" ] || fail "tunnel create: $(jq -c '.errors' <<<"$CREATED")"
TUNNEL_ID=$(jq -r '.result.id' <<<"$CREATED")
TUNNEL_TOKEN=$(jq -r '.result.token' <<<"$CREATED")
[ -n "$TUNNEL_ID" ] && [ "$TUNNEL_ID" != "null" ] || fail "no tunnel id"
[ -n "$TUNNEL_TOKEN" ] && [ "$TUNNEL_TOKEN" != "null" ] || fail "no tunnel token"
echo "tunnel: $TUNNEL_ID"

echo "== 4. tunnel ingress =="
INGRESS=$(cf PUT "/accounts/$CF_ACCOUNT/cfd_tunnel/$TUNNEL_ID/configurations" \
  "{\"ingress\":[{\"hostname\":\"$HOSTNAME\",\"service\":\"http://localhost:80\"},{\"service\":\"http_status:404\"}]}")
[ "$(jq -r '.success' <<<"$INGRESS")" = "true" ] || fail "ingress put: $(jq -c '.errors' <<<"$INGRESS")"
echo "ingress configured"

echo "== 5. DNS upsert $HOSTNAME =="
DNS_BODY=$(printf '{"type":"CNAME","name":"faceapp","content":"%s.cfargotunnel.com","proxied":true}' "$TUNNEL_ID")
REC_ID=$(cf GET "/zones/$ZONE_ID/dns_records?name=$HOSTNAME" | jq -r '.result[0].id // empty')
if [ -n "$REC_ID" ]; then
  DNS_RES=$(cf PUT "/zones/$ZONE_ID/dns_records/$REC_ID" "$DNS_BODY")
  echo "updated record $REC_ID"
else
  DNS_RES=$(cf POST "/zones/$ZONE_ID/dns_records" "$DNS_BODY")
  echo "created record"
fi
[ "$(jq -r '.success' <<<"$DNS_RES")" = "true" ] || fail "dns upsert: $(jq -c '.errors' <<<"$DNS_RES")"

echo "== 6. Pages production env vars (merge, preserve secrets) =="
PROJ=$(cf GET "/accounts/$CF_ACCOUNT/pages/projects/$PAGES_PROJECT")
[ "$(jq -r '.success' <<<"$PROJ")" = "true" ] || fail "pages project get: $(jq -c '.errors' <<<"$PROJ")"
MERGED=$(jq --arg key "$PORTAL_KEY" '
  (.result.deployment_configs.production.env_vars // {})
  | map_values(if .type == "secret_text" then {type: "secret_text"} else . end)
  | . + {
      "FACEGYM_PORTAL_INTERNAL_KEY": {type: "plain_text", value: $key},
      "FACEGYM_API_URL": {type: "plain_text", value: "https://faceapp.powerhousegym.co"}
    }
  | {deployment_configs: {production: {env_vars: .}}}' <<<"$PROJ")
PATCHED=$(cf PATCH "/accounts/$CF_ACCOUNT/pages/projects/$PAGES_PROJECT" "$MERGED")
[ "$(jq -r '.success' <<<"$PATCHED")" = "true" ] || fail "pages patch: $(jq -c '.errors' <<<"$PATCHED")"
echo "pages env vars set (FACEGYM_PORTAL_INTERNAL_KEY, FACEGYM_API_URL)"

echo "== 7. connector material (delete this run log after configuring LXC 114) =="
echo "TUNNEL_ID=$TUNNEL_ID"
echo "TUNNEL_TOKEN_B64=$(printf %s "$TUNNEL_TOKEN" | base64 -w0)"
echo "ALL STEPS OK"
