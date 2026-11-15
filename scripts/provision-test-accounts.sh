#!/usr/bin/env bash
# Creates CONTROLLED Floodlight test accounts in the shared Supabase project
# while public sign-ups stay disabled. Users are inserted the way GoTrue stores
# email users (confirmed, bcrypt password, email identity). Passwords are
# generated locally and written ONLY to ~/.eksu/floodlight-test-accounts.env
# (chmod 600); they are never printed.
#
# Note: the shared project's EKSU Sports Hub trigger (on_auth_user_created)
# also gives each new auth user a public.profiles row with no Sports Hub role.
#
# Idempotent: existing accounts (same email) are left untouched.
set -euo pipefail
umask 077
ENV_FILE="${ENV_FILE:-$HOME/.eksu/sports-hub-db.env}"
OUT="$HOME/.eksu/floodlight-test-accounts.env"
PG17="$(brew --prefix postgresql@17)/bin"
set -a; . "$ENV_FILE"; set +a
if [ -n "${SPORTS_HUB_DB_PASSWORD:-}" ]; then export PGPASSWORD="$SPORTS_HUB_DB_PASSWORD"; fi
case "$SPORTS_HUB_DB_URL" in *lkvdoeomyhbtinpvvbfr*) ;; *) echo "refusing: unexpected project"; exit 1;; esac

# key  email  display name
ACCOUNTS="owner|fl-test-owner@example.com|FL TEST Owner
fadmin|fl-test-facility-admin@example.com|FL TEST Facility Admin
gate|fl-test-gatekeeper@example.com|FL TEST Gatekeeper
custa|fl-test-customer-a@example.com|FL TEST Customer A
custb|fl-test-customer-b@example.com|FL TEST Customer B"

[ -f "$OUT" ] || : > "$OUT"; chmod 600 "$OUT"
while IFS='|' read -r key email name; do
  if grep -q "^FL_${key}_EMAIL=" "$OUT"; then pw=$(grep "^FL_${key}_PASSWORD=" "$OUT" | cut -d= -f2-)
  else pw="$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | cut -c1-16)"; fi
  res=$("$PG17/psql" "$SPORTS_HUB_DB_URL" -X -q -A -t -v ON_ERROR_STOP=1 -v email="$email" -v name="$name" -v pw="$pw" <<'SQL'
begin;
select set_config('fl.email', :'email', true), set_config('fl.name', :'name', true), set_config('fl.pw', :'pw', true) \g /dev/null
do $$
declare v_id uuid := gen_random_uuid(); v_email text := lower(current_setting('fl.email'));
begin
  if exists (select 1 from auth.users where lower(email) = v_email) then
    raise notice 'exists'; return;
  end if;
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    extensions.crypt(current_setting('fl.pw'), extensions.gen_salt('bf', 10)), now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('full_name', current_setting('fl.name'), 'display_name', current_setting('fl.name'), 'floodlight_test_account', true),
    now(), now(), '', '', '', '', '', '', '', '');
  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (v_id::text, v_id, jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
          'email', null, now(), now());
end $$;
select (select id from auth.users where lower(email) = lower(current_setting('fl.email')));
commit;
SQL
)
  if ! grep -q "^FL_${key}_EMAIL=" "$OUT"; then
    printf 'FL_%s_EMAIL=%s\nFL_%s_PASSWORD=%s\n' "$key" "$email" "$key" "$pw" >> "$OUT"
  fi
  echo "$key: $email -> user ${res:0:8}…"
done <<< "$ACCOUNTS"
echo "credentials file: $OUT (chmod $(stat -f %Lp "$OUT"))"
