#!/usr/bin/env bash
# Runs EKSU Sports Hub's own pgTAP suite against the SCHEMA restored from a backup.
# Sports Hub's tests depend on its development seed (fixed-UUID teams/competition),
# which production data does not contain, so: schema-only restore of app.dump into a
# fresh isolated database + the platform objects recreated by verify-sports-hub-backup.sh
# + Sports Hub's unmodified seed.sql, then the unmodified tests (pgtap preloaded).
# Usage: RESTORE_PGDATA=<scratch> scripts/verify-sports-hub-backup-suite.sh <BACKUP_DIR>
# Requires verify-sports-hub-backup.sh to have run first (cluster up, DDL files written).
set -euo pipefail
umask 077
DIR="$1"; here="$(cd "$(dirname "$0")" && pwd)"; root="$here/.."
PG17="$(brew --prefix postgresql@17)/bin"; export PATH="$PG17:$PATH"
LOCAL_PORT="${LOCAL_PORT:-54330}"; L="postgresql://postgres@127.0.0.1:$LOCAL_PORT"
SH="${SPORTS_HUB_DIR:-$HOME/Documents/Eksu-Projects/eksu-sports-hub}"
for f in restore.list restore-platform-ddl.sql restore-platform-objects.sql; do
  [ -f "$DIR/$f" ] || { echo "missing $DIR/$f — run verify-sports-hub-backup.sh first"; exit 1; }
done

psql "$L/postgres" -X -q -c "drop database if exists sh_restore_schema with (force)" -c "create database sh_restore_schema"
DB="$L/sh_restore_schema"
psql "$DB" -X -q -v ON_ERROR_STOP=1 -f "$root/tests/coexistence/platform_shim.sql" >/dev/null 2>&1
psql "$DB" -X -q -v ON_ERROR_STOP=1 \
  -c "alter default privileges in schema public revoke all on tables from anon, authenticated, service_role" \
  -c "alter default privileges in schema public revoke all on sequences from anon, authenticated, service_role" \
  -c "alter default privileges in schema public revoke all on functions from anon, authenticated, service_role"
psql "$DB" -X -q -v ON_ERROR_STOP=1 -f "$DIR/restore-platform-ddl.sql" >/dev/null 2>&1
pg_restore -d "$DB" --no-owner --schema-only --exit-on-error -L "$DIR/restore.list" "$DIR/app.dump" 2> "$DIR/restore-schema.log" \
  || { echo "schema restore FAILED (see $DIR/restore-schema.log)"; tail -5 "$DIR/restore-schema.log"; exit 1; }
psql "$DB" -X -q -v ON_ERROR_STOP=1 -f "$DIR/restore-platform-objects.sql" >/dev/null
echo "schema-only restore: ok"
# Reference rows that Sports Hub's migrations (not its seed) insert: the only tables a
# migrations-only build leaves non-empty. Restored from the backup itself.
pg_restore -d "$DB" --no-owner --data-only --exit-on-error -n public -t formations "$DIR/app.dump"
pg_restore -d "$DB" --no-owner --data-only --exit-on-error -n private -t notification_config "$DIR/app.dump"
# Sports Hub's migration also inserts its storage bucket (platform table, kept in platform.dump).
pg_restore -d "$DB" --no-owner --data-only --exit-on-error -n storage -t buckets "$DIR/platform.dump"
echo "reference data from backup: buckets=$(psql "$DB" -X -A -t -c 'select count(*) from storage.buckets') formations=$(psql "$DB" -X -A -t -c 'select count(*) from public.formations') notification_config=$(psql "$DB" -X -A -t -c 'select count(*) from private.notification_config')"
psql "$DB" -X -q -1 -v ON_ERROR_STOP=1 -f "$SH/supabase/seed.sql" >/dev/null 2>"$DIR/restore-seed.log" \
  || { echo "seed FAILED (see $DIR/restore-seed.log)"; tail -5 "$DIR/restore-seed.log"; exit 1; }
echo "Sports Hub seed: ok"

work="$(mktemp -d)"; cp "$SH"/supabase/tests/*.sql "$SH"/supabase/tests/helpers.inc "$work/"
sed -i.bak 's/^create extension if not exists pgtap with schema extensions;/-- pgtap preloaded/' "$work/helpers.inc"
cp "$root/tests/coexistence/run_sports_hub_suite.sh" "$work/"
"$root/tests/coexistence/load_pgtap.sh" "$DB" >/dev/null
bash "$work/run_sports_hub_suite.sh" "$DB"
rm -rf "$work"
