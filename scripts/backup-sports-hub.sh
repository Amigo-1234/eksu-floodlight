#!/usr/bin/env bash
# Backs up the shared EKSU Sports Hub Supabase database BEFORE any Floodlight
# change. Read-only against the live database (pg_dump only).
#
#   ~/.eksu/sports-hub-db.env  (chmod 600) must contain:
#     SPORTS_HUB_DB_URL=postgresql://postgres.<ref>@<pooler-host>:5432/postgres   (no password in the URL)
#     SPORTS_HUB_DB_PASSWORD=<database password, as-is, no quotes or brackets>
#
# Output (private folder, never inside a git repo):
#   ~/Documents/eksu-backups/<timestamp>/app.dump        public + private schemas (schema + data)
#   ~/Documents/eksu-backups/<timestamp>/platform.dump   data of auth.users, auth.identities,
#                                                        storage.buckets, storage.objects, cron.job
#   ~/Documents/eksu-backups/<timestamp>/SHA256SUMS
# The connection string is never printed.
set -euo pipefail
umask 077
ENV_FILE="${ENV_FILE:-$HOME/.eksu/sports-hub-db.env}"
EXPECTED_REF="lkvdoeomyhbtinpvvbfr"
PG17="$(brew --prefix postgresql@17)/bin"

[ -f "$ENV_FILE" ] || { echo "missing $ENV_FILE"; exit 1; }
perm=$(stat -f %Lp "$ENV_FILE"); [ "$perm" = "600" ] || { echo "$ENV_FILE must be chmod 600 (is $perm)"; exit 1; }
# shellcheck disable=SC1090
set -a; . "$ENV_FILE"; set +a
# Optional separate password line avoids URL-encoding problems (libpq reads PGPASSWORD).
if [ -n "${SPORTS_HUB_DB_PASSWORD:-}" ]; then export PGPASSWORD="$SPORTS_HUB_DB_PASSWORD"; fi
[ -n "${SPORTS_HUB_DB_URL:-}" ] || { echo "SPORTS_HUB_DB_URL not set in $ENV_FILE"; exit 1; }
case "$SPORTS_HUB_DB_URL" in *"$EXPECTED_REF"*) ;; *) echo "refusing: connection is not for project $EXPECTED_REF"; exit 1;; esac

OUT="$HOME/Documents/eksu-backups/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$OUT"; chmod 700 "$HOME/Documents/eksu-backups" "$OUT"

"$PG17/psql" "$SPORTS_HUB_DB_URL" -X -q -A -t -c "select 'connected: '||current_database()||' server '||current_setting('server_version')"

"$PG17/pg_dump" "$SPORTS_HUB_DB_URL" --format=custom --no-owner \
  --schema=public --schema=private --file="$OUT/app.dump" 2> "$OUT/app.dump.log" || { echo "pg_dump app failed (see $OUT/app.dump.log)"; exit 1; }
"$PG17/pg_dump" "$SPORTS_HUB_DB_URL" --format=custom --data-only \
  --table=auth.users --table=auth.identities --table=storage.buckets --table=storage.objects --table=cron.job \
  --file="$OUT/platform.dump" 2> "$OUT/platform.dump.log" || { echo "pg_dump platform failed (see $OUT/platform.dump.log)"; exit 1; }

( cd "$OUT" && shasum -a 256 app.dump platform.dump > SHA256SUMS )
ls -l "$OUT" | awk 'NR>1 {print $5, $NF}'
echo "BACKUP_DIR=$OUT"
