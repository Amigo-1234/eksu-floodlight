#!/usr/bin/env bash
# Loads pgTAP 1.3.3 as plain SQL into schema `extensions` of a LOCAL database
# (no system install). Downloads the release once into tests/coexistence/.cache.
set -euo pipefail
DB="$1"; here="$(cd "$(dirname "$0")" && pwd)"; cache="$here/.cache"
mkdir -p "$cache"
if [ ! -f "$cache/pgtap.sql" ]; then
  curl -sSL -o "$cache/pgtap.tar.gz" https://github.com/theory/pgtap/archive/refs/tags/v1.3.3.tar.gz
  tar -xzf "$cache/pgtap.tar.gz" -C "$cache"
  sed -e 's,__OS__,darwin,g' -e 's,__VERSION__,1.33,g' -e 's,MODULE_PATHNAME,$libdir/pgtap,g' \
    "$cache/pgtap-1.3.3/sql/pgtap.sql.in" > "$cache/pgtap.sql"
fi
( echo "set search_path = extensions;"; cat "$cache/pgtap.sql"; echo "grant execute on all functions in schema extensions to anon, authenticated, service_role;" ) \
  | psql -q -X -v ON_ERROR_STOP=1 -d "$DB" >/dev/null 2>&1
echo "pgtap loaded into $DB"
