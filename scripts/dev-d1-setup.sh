#!/usr/bin/env bash
# dev-d1-setup.sh — prepare the LOCAL D1 database used by
# `npx wrangler pages dev dist --d1 DB` for the evaluation system.
#
# Why this exists: `wrangler pages dev --d1 DB` persists its local sqlite
# under a different key than `wrangler d1 migrations apply --config`, so
# migrations applied through the config file are not visible to the local
# Pages dev server. This script applies the migration SQL files directly
# to the newest miniflare sqlite state file (the one `pages dev` uses).
#
# Usage (from the repo root):
#   ./scripts/dev-d1-setup.sh          # apply migrations to local dev DB
#   ./scripts/dev-d1-setup.sh --reset  # wipe + re-apply (fresh seed)
#
# Requires: python3 (stdlib sqlite3 only).

set -euo pipefail

cd "$(dirname "$0")/.."

STATE_DIR="$(find .wrangler/state -type d -name "miniflare-D1DatabaseObject" 2>/dev/null | head -1 || true)"

if [ -z "$STATE_DIR" ]; then
  echo "No local D1 state found yet."
  echo "Start the dev server once first (it creates the sqlite file):"
  echo "  npx wrangler pages dev dist --d1 DB --port 8799"
  exit 1
fi

RESET="${1:-}"
python3 - "$STATE_DIR" "$RESET" <<'PYEOF'
import glob, os, sqlite3, sys

state_dir, reset = sys.argv[1], sys.argv[2]
files = sorted(
    (f for f in glob.glob(f"{state_dir}/*.sqlite") if "metadata" not in f),
    key=os.path.getmtime,
)
if not files:
    print("No sqlite file found — boot `wrangler pages dev` once first.")
    sys.exit(1)
target = files[-1]
print(f"Local D1 file: {target}")

conn = sqlite3.connect(target)
if reset == "--reset":
    conn.executescript(
        "DROP TABLE IF EXISTS evaluations; DROP TABLE IF EXISTS trainers;"
    )
    print("Reset: dropped existing evaluation tables.")

# Mark migrations as applied so `wrangler d1 migrations apply` stays coherent.
conn.executescript(
    """
    CREATE TABLE IF NOT EXISTS d1_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    """
)
for name in (
    "0001_evaluation_schema.sql",
    "0002_seed_trainers.sql",
):
    sql = open(os.path.join("migrations", name), encoding="utf-8").read()
    conn.executescript(sql)
    conn.execute(
        "INSERT OR IGNORE INTO d1_migrations (name) VALUES (?)", (name,)
    )
    print(f"Applied: {name}")

conn.commit()
rows = conn.execute(
    "SELECT slug, name FROM trainers ORDER BY id"
).fetchall()
print("Trainers seeded:", ", ".join(f"{slug} ({name})" for slug, name in rows))
PYEOF
