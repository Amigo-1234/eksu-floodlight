#!/usr/bin/env bash
# Verifies a Sports Hub backup by restoring it into an ISOLATED local
# PostgreSQL 17 database and comparing every table with the live database
# (read-only checksum queries). Usage: scripts/verify-sports-hub-backup.sh <BACKUP_DIR>
set -euo pipefail
umask 077
DIR="$1"; ENV_FILE="${ENV_FILE:-$HOME/.eksu/sports-hub-db.env}"
PG17="$(brew --prefix postgresql@17)/bin"
here="$(cd "$(dirname "$0")" && pwd)"; root="$here/.."
LOCAL_PORT="${LOCAL_PORT:-54330}"; DATA="${RESTORE_PGDATA:?set RESTORE_PGDATA to a scratch directory}"
set -a; . "$ENV_FILE"; set +a
# Optional separate password line avoids URL-encoding problems (libpq reads PGPASSWORD).
if [ -n "${SPORTS_HUB_DB_PASSWORD:-}" ]; then export PGPASSWORD="$SPORTS_HUB_DB_PASSWORD"; fi

( cd "$DIR" && shasum -a 256 -c SHA256SUMS )

# Fresh isolated PG17 cluster (TCP only, trust auth on localhost).
if [ ! -d "$DATA/base" ]; then "$PG17/initdb" -D "$DATA" -U postgres --auth=trust -E UTF8 >/dev/null; fi
"$PG17/pg_ctl" -D "$DATA" -o "-p $LOCAL_PORT -k '' -c listen_addresses=127.0.0.1" -l "$DATA/server.log" status >/dev/null 2>&1 \
  || "$PG17/pg_ctl" -D "$DATA" -o "-p $LOCAL_PORT -k '' -c listen_addresses=127.0.0.1" -l "$DATA/server.log" start -w >/dev/null
L="postgresql://postgres@127.0.0.1:$LOCAL_PORT"
"$PG17/psql" "$L/postgres" -X -q -c "drop database if exists sh_restore with (force)" -c "create database sh_restore"
"$PG17/psql" "$L/sh_restore" -X -q -v ON_ERROR_STOP=1 -f "$root/tests/coexistence/platform_shim.sql" >/dev/null 2>&1
# pg_dump records table/sequence privileges only as GRANTs on top of the built-in defaults, so any
# default privileges present in the target schema would WIDEN them (Supabase's defaults grant ALL to
# anon/authenticated). Clear them before restoring; the dump's own ALTER DEFAULT PRIVILEGES entries
# then re-create the live defaults. The same step is required when restoring into a Supabase project.
"$PG17/psql" "$L/sh_restore" -X -q -v ON_ERROR_STOP=1 \
  -c "alter default privileges in schema public revoke all on tables from anon, authenticated, service_role" \
  -c "alter default privileges in schema public revoke all on sequences from anon, authenticated, service_role" \
  -c "alter default privileges in schema public revoke all on functions from anon, authenticated, service_role"
# Platform role referenced by Sports Hub's default privileges (cluster-local, nologin).
"$PG17/psql" "$L/postgres" -X -q -c "do \$\$ begin if not exists (select 1 from pg_roles where rolname='supabase_admin') then create role supabase_admin nologin; end if; end \$\$"
# Make the shim's simplified platform tables carry every live column (read-only catalog query against
# live; enum types become text; generated columns are skipped because pg_dump never copies them).
PLATFORM_TABLES="('auth','users'),('auth','identities'),('storage','buckets'),('storage','objects'),('cron','job')"
"$PG17/psql" "$SPORTS_HUB_DB_URL" -X -q -A -t -c "
select format('create table if not exists %I.%I ();', n.nspname, c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where (n.nspname, c.relname) in ($PLATFORM_TABLES)
union all
select format('alter table %I.%I add column if not exists %I %s;', n.nspname, c.relname, a.attname,
       case when t.typtype='e' then 'text' else format_type(a.atttypid, a.atttypmod) end)
from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace join pg_type t on t.oid=a.atttypid
where (n.nspname, c.relname) in ($PLATFORM_TABLES) and a.attnum>0 and not a.attisdropped and a.attgenerated=''" > "$DIR/restore-platform-ddl.sql"
"$PG17/psql" "$L/sh_restore" -X -q -v ON_ERROR_STOP=1 -f "$DIR/restore-platform-ddl.sql" >/dev/null
"$PG17/pg_restore" -d "$L/sh_restore" --no-owner --data-only --disable-triggers --exit-on-error "$DIR/platform.dump" 2> "$DIR/restore-platform.log" \
  || { echo "platform data restore FAILED (see $DIR/restore-platform.log)"; tail -5 "$DIR/restore-platform.log"; exit 1; }
echo "platform data restored: $("$PG17/psql" "$L/sh_restore" -X -A -t -c "select format('auth.users=%s identities=%s buckets=%s objects=%s cron.job=%s',(select count(*) from auth.users),(select count(*) from auth.identities),(select count(*) from storage.buckets),(select count(*) from storage.objects),(select count(*) from cron.job))")"

# Every fresh database already has schema `public`, so skip only that one TOC entry; everything else restores with --exit-on-error.
"$PG17/pg_restore" -l "$DIR/app.dump" | sed -E 's/^([0-9]+; [0-9]+ [0-9]+ SCHEMA - public )/;\1/' > "$DIR/restore.list"
echo "TOC entries: $(grep -cE '^[0-9]' "$DIR/restore.list") restored, $(grep -cE '^;[0-9]' "$DIR/restore.list") skipped (SCHEMA public)"
"$PG17/pg_restore" -d "$L/sh_restore" --no-owner --exit-on-error -L "$DIR/restore.list" "$DIR/app.dump" 2> "$DIR/restore-app.log" \
  || { echo "app restore FAILED (see $DIR/restore-app.log)"; tail -5 "$DIR/restore-app.log"; exit 1; }
echo "app restore: ok"

# Sports Hub objects that live on platform tables (not in app.dump): triggers calling public/private
# functions and policies on storage/realtime. Recreated from their live definitions.
"$PG17/psql" "$SPORTS_HUB_DB_URL" -X -q -A -t -c "
select pg_get_triggerdef(t.oid)||';' from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_proc p on p.oid=t.tgfoid
 where not t.tgisinternal and c.relnamespace::regnamespace::text not in ('public','private') and p.pronamespace::regnamespace::text in ('public','private')
union all
select format('create policy %I on %I.%I as %s for %s to %s%s%s;', policyname, schemaname, tablename, permissive, cmd,
       (select string_agg(quote_ident(r), ', ') from unnest(roles) r),
       case when qual is not null then ' using ('||qual||')' else '' end,
       case when with_check is not null then ' with check ('||with_check||')' else '' end)
from pg_policies where schemaname in ('storage','realtime','auth')" > "$DIR/restore-platform-objects.sql"
"$PG17/psql" "$L/sh_restore" -X -q -v ON_ERROR_STOP=1 -f "$DIR/restore-platform-objects.sql" >/dev/null
echo "platform triggers/policies recreated: $(grep -c . "$DIR/restore-platform-objects.sql")"

Q="select n.nspname||'.'||c.relname as t,
  (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', n.nspname, c.relname), false, true, '')))[1]::text as n,
  (xpath('/row/h/text()', query_to_xml(format('select md5(coalesce(string_agg(x::text, chr(10) order by x::text collate \"C\"), '''')) as h from %I.%I x', n.nspname, c.relname), false, true, '')))[1]::text as h
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname in ('public','private') and c.relkind='r' order by 1"
# Identical text rendering on both sides (timestamptz output depends on the session time zone).
SET_FMT="set timezone='UTC'; set datestyle='ISO, MDY'; set extra_float_digits=0; set intervalstyle='postgres'; set bytea_output='hex';"
"$PG17/psql" "$SPORTS_HUB_DB_URL" -X -q -A -t -F'|' -c "$SET_FMT" -c "$Q" > "$DIR/live.checksums"
"$PG17/psql" "$L/sh_restore" -X -q -A -t -F'|' -c "$SET_FMT" -c "$Q" > "$DIR/restored.checksums"
total=$(wc -l < "$DIR/live.checksums" | tr -d ' ')
same=$(comm -12 <(sort "$DIR/live.checksums") <(sort "$DIR/restored.checksums") | wc -l | tr -d ' ')
echo "tables identical (rows + content checksum): $same / $total"
echo "differences (table|live rows vs restored rows):"
join -t'|' <(sort "$DIR/live.checksums") <(sort "$DIR/restored.checksums") | awk -F'|' '$3!=$5 {print "  "$1"|"$2" vs "$4}'
echo "RESTORE_DB=$L/sh_restore"
