#!/usr/bin/env bash
# Runs EKSU Sports Hub's own pgTAP suite (copies) against a local database.
DB="$1"; cd "$(dirname "$0")"
total_ok=0; total_bad=0
for f in [0-9]*.test.sql; do
  out=$(printf "set search_path = public, extensions;\n\\\\i %s\n" "$PWD/$f" | psql -X -q -t -A -d "$DB" 2>&1)
  ok=$(grep -cE '^ok ' <<<"$out"); bad=$(grep -cE '^not ok ' <<<"$out"); plan=$(grep -m1 -oE '^1\.\.[0-9]+' <<<"$out")
  err=$(grep -m1 'ERROR' <<<"$out")
  printf '%-34s plan=%-7s ok=%-4s not_ok=%s %s\n' "$f" "${plan:-?}" "$ok" "$bad" "${err:+ $err}"
  total_ok=$((total_ok+ok)); total_bad=$((total_bad+bad))
  if [ "$bad" != 0 ]; then grep -E '^not ok' <<<"$out" | head -5 | sed 's/^/    /'; fi
done
echo "TOTAL ok=$total_ok not_ok=$total_bad"
