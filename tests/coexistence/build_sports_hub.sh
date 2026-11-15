#!/usr/bin/env bash
# Builds a LOCAL database containing EKSU Sports Hub's real schema + seed
# (read from its repository, never modified) on top of the platform shim.
# Usage: tests/coexistence/build_sports_hub.sh <dbname>
set -euo pipefail
DB="$1"; SH="${SPORTS_HUB_DIR:-$HOME/Documents/Eksu-Projects/eksu-sports-hub}/supabase"
here="$(cd "$(dirname "$0")" && pwd)"
dropdb --if-exists "$DB"; createdb "$DB"
psql -q -X -v ON_ERROR_STOP=1 -d "$DB" -f "$here/platform_shim.sql" >/dev/null
for f in "$SH"/migrations/*.sql; do
  if ! out=$(psql -q -X -v ON_ERROR_STOP=1 -d "$DB" -f "$f" 2>&1); then
    echo "Sports Hub migration failed: $(basename "$f")"; echo "$out" | grep -E "ERROR|LINE" | head -5; exit 1
  fi
done
psql -q -X -1 -v ON_ERROR_STOP=1 -d "$DB" -f "$SH/seed.sql" >/dev/null
echo "Sports Hub schema ready in $DB ($(ls "$SH"/migrations/*.sql | wc -l | tr -d ' ') migrations + seed)"
