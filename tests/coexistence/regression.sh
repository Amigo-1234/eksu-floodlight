#!/usr/bin/env bash
# Full shared-project rehearsal on a LOCAL PostgreSQL (never a remote project):
#  1. build Sports Hub's real schema + seed   2. run Sports Hub's pgTAP suite (baseline)
#  3. snapshot every non-Floodlight object     4. apply the Floodlight bundle
#  5. diff the snapshot                         6. re-run Sports Hub's suite
# Env: PGHOST/PGPORT/PGUSER of the local server; SPORTS_HUB_DIR (read only).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"; root="$here/../.."; DB="${1:-fl_coexist}"
SH="${SPORTS_HUB_DIR:-$HOME/Documents/Eksu-Projects/eksu-sports-hub}"
work="$(mktemp -d)"; cp "$SH"/supabase/tests/*.sql "$SH"/supabase/tests/helpers.inc "$work/"
sed -i.bak 's/^create extension if not exists pgtap with schema extensions;/-- pgtap preloaded/' "$work/helpers.inc"
cp "$here/run_sports_hub_suite.sh" "$work/"
"$here/build_sports_hub.sh" "$DB"; "$here/load_pgtap.sh" "$DB"
echo "== Sports Hub suite BEFORE Floodlight"; "$work/run_sports_hub_suite.sh" "$DB" | tail -1
psql -X -q -A -t -F'|' -d "$DB" -f "$here/snapshot.sql" | sort > "$work/before"
node "$root/scripts/build-db-bundle.mjs" >/dev/null
psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -f "$root/db/dist/floodlight_bundle.sql" 2>&1 | grep -cE "applied [0-9]" | sed 's/^/Floodlight migrations applied: /'
psql -X -q -A -t -F'|' -d "$DB" -f "$here/snapshot.sql" | sort > "$work/after"
echo "== Changes outside floodlight schemas (kind|schema count)"
comm -3 "$work/before" "$work/after" | awk -F'|' '{gsub(/^\t/,""); split($2,a,"."); print $1"|"a[1]}' | sort | uniq -c
echo "== Sports Hub suite AFTER Floodlight"; "$work/run_sports_hub_suite.sh" "$DB" | tail -1
