-- EKSU Floodlight — foundation (SHARED-PROJECT EDITION).
--
-- Designed to live inside an existing Supabase project (EKSU Sports Hub)
-- without touching it:
--   * Every Floodlight object lives in schema `floodlight` (API-exposed) or
--     `floodlight_private` (internal). Nothing is created, replaced, granted
--     or revoked in `public`, `private`, `auth` or any other existing schema.
--   * No trigger is added to auth.users. Floodlight profiles are created
--     lazily by floodlight.ensure_profile() the first time a user uses
--     Floodlight, so Sports Hub sign-ups never create Floodlight rows.
--   * The only database-wide additions are the btree_gist extension (needed
--     for the no-double-booking constraint) and one pg_cron job (0006).
--   * Roles are never taken from the client: they are looked up from
--     floodlight.platform_owners / floodlight.staff_memberships using
--     auth.uid(). Sports Hub roles (public.user_roles) grant nothing here,
--     and Floodlight roles grant nothing in Sports Hub.

create extension if not exists btree_gist with schema extensions;
-- pgcrypto already exists in `extensions` on Supabase; this is a no-op there.
create extension if not exists pgcrypto with schema extensions;

create schema if not exists floodlight;
create schema if not exists floodlight_private;
-- New schemas start with no privileges for API roles. Grant only usage here;
-- object-level grants are listed explicitly in 0006.
revoke all on schema floodlight from public;
revoke all on schema floodlight_private from public;
grant usage on schema floodlight to anon, authenticated, service_role;
grant usage on schema floodlight_private to anon, authenticated, service_role;
-- Functions created in these schemas would otherwise be executable by PUBLIC.
alter default privileges in schema floodlight revoke execute on functions from public;
alter default privileges in schema floodlight_private revoke execute on functions from public;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type floodlight.staff_role as enum ('facility_admin', 'scheduler', 'gatekeeper');

-- ---------------------------------------------------------------------------
-- Platform settings (single row). Values that need client approval start
-- unset or switched off.
-- ---------------------------------------------------------------------------
create table floodlight.platform_settings (
  id smallint primary key default 1 check (id = 1),
  product_name text not null default 'EKSU Floodlight',
  product_tagline text not null default 'Your Field. Your Time. Your Game.',
  institution_name text not null default 'Ekiti State University, Ado-Ekiti',
  default_timezone text not null default 'Africa/Lagos',
  support_email text,                       -- unset until supplied by the client
  support_phone text,                       -- unset until supplied by the client
  -- Gate admission stays in TEST MODE until the entry policy is approved.
  live_gate_admission boolean not null default false,
  -- Online payment collection stays off until a provider is approved and configured.
  online_payments_enabled boolean not null default false,
  -- Turn on before production: staff RPCs then require an aal2 (MFA) session.
  require_staff_mfa boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into floodlight.platform_settings (id) values (1);

-- ---------------------------------------------------------------------------
-- Profiles (one per auth user; created by trigger)
-- ---------------------------------------------------------------------------
create table floodlight.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 120),
  phone text check (phone is null or phone ~ '^\+?[0-9 ()-]{7,20}$'),
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Created on first use of Floodlight (never by a trigger on the shared auth.users).
create or replace function floodlight.ensure_profile() returns floodlight.profiles
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); r floodlight.profiles; v_user auth.users;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;
  select * into r from floodlight.profiles where id = v_uid;
  if found then return r; end if;
  select * into v_user from auth.users where id = v_uid;
  insert into floodlight.profiles (id, full_name, email)
  values (v_uid,
          left(coalesce(nullif(v_user.raw_user_meta_data ->> 'full_name', ''),
                        nullif(v_user.raw_user_meta_data ->> 'display_name', ''), ''), 120),
          v_user.email)
  on conflict (id) do nothing;
  select * into r from floodlight.profiles where id = v_uid;
  return r;
end $$;

-- ---------------------------------------------------------------------------
-- Platform owners (global) — separate from facility-scoped staff roles.
-- There is no self-service path to this table: the first owner is created
-- by running floodlight_private.bootstrap_platform_owner(email) as the database owner.
-- ---------------------------------------------------------------------------
create table floodlight.platform_owners (
  user_id uuid primary key references auth.users (id) on delete cascade,
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Facility-scoped staff memberships. facility_id is added as an FK in the
-- facilities migration (the table does not exist yet).
-- ---------------------------------------------------------------------------
create table floodlight.staff_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  facility_id uuid not null,
  role floodlight.staff_role not null,
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users (id) on delete set null
);
create unique index staff_memberships_active_uniq
  on floodlight.staff_memberships (user_id, facility_id, role) where revoked_at is null;
create index staff_memberships_facility_idx on floodlight.staff_memberships (facility_id) where revoked_at is null;

-- ---------------------------------------------------------------------------
-- Audit log (append-only)
-- ---------------------------------------------------------------------------
create table floodlight.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text,
  facility_id uuid,
  details jsonb not null default '{}'::jsonb
);
create index audit_log_at_idx on floodlight.audit_log (at desc);
create index audit_log_facility_idx on floodlight.audit_log (facility_id, at desc);

create or replace function floodlight_private.audit(
  p_action text, p_entity_type text, p_entity_id text, p_facility_id uuid, p_details jsonb default '{}'::jsonb
) returns void language sql security definer set search_path = '' as $$
  insert into floodlight.audit_log (actor_id, action, entity_type, entity_id, facility_id, details)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, p_facility_id, coalesce(p_details, '{}'::jsonb));
$$;

create or replace function floodlight_private.forbid_change() returns trigger
language plpgsql as $$
begin
  raise exception 'APPEND_ONLY: % rows cannot be changed or deleted', tg_table_name
    using errcode = 'P0001';
end $$;

create trigger audit_log_append_only before update or delete on floodlight.audit_log
  for each row execute function floodlight_private.forbid_change();

-- ---------------------------------------------------------------------------
-- Role helpers (all read auth.uid(); none accept a role from the client)
-- ---------------------------------------------------------------------------
create or replace function floodlight_private.staff_mfa_ok() returns boolean
language sql stable security definer set search_path = '' as $$
  select not coalesce((select require_staff_mfa from floodlight.platform_settings where id = 1), false)
      or coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;

create or replace function floodlight_private.is_platform_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
     and exists (select 1 from floodlight.platform_owners o where o.user_id = auth.uid() and o.revoked_at is null)
     and floodlight_private.staff_mfa_ok();
$$;

-- True when the caller holds one of p_roles at p_facility (owners hold every role).
create or replace function floodlight_private.has_facility_role(p_facility uuid, p_roles floodlight.staff_role[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select floodlight_private.is_platform_owner()
      or (auth.uid() is not null
          and floodlight_private.staff_mfa_ok()
          and exists (
            select 1 from floodlight.staff_memberships m
            where m.user_id = auth.uid() and m.facility_id = p_facility
              and m.revoked_at is null and m.role = any (p_roles)));
$$;

create or replace function floodlight_private.is_any_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select floodlight_private.is_platform_owner()
      or (auth.uid() is not null and floodlight_private.staff_mfa_ok() and exists (
            select 1 from floodlight.staff_memberships m where m.user_id = auth.uid() and m.revoked_at is null));
$$;

create or replace function floodlight_private.require_auth() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v uuid := auth.uid();
begin
  if v is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;
  return v;
end $$;

-- Bootstrap: make an existing account a platform owner. Not granted to any
-- API role: run it from the SQL editor / psql as the database owner.
create or replace function floodlight_private.bootstrap_platform_owner(p_email text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_user uuid;
begin
  select id into v_user from auth.users where lower(email) = lower(p_email);
  if v_user is null then raise exception 'No account with email %', p_email; end if;
  insert into floodlight.platform_owners (user_id) values (v_user)
  on conflict (user_id) do update set revoked_at = null, granted_at = now();
  insert into floodlight.audit_log (actor_id, action, entity_type, entity_id, details)
  values (null, 'platform_owner.bootstrap', 'user', v_user::text, jsonb_build_object('email', p_email));
  return v_user;
end $$;
revoke all on function floodlight_private.bootstrap_platform_owner(text) from public, anon, authenticated, service_role;

-- Current caller's roles, for the UI (navigation only — never trusted for authorization).
create or replace function floodlight.my_roles() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'user_id', auth.uid(),
    'is_platform_owner', coalesce((select true from floodlight.platform_owners o
                                   where o.user_id = auth.uid() and o.revoked_at is null), false),
    'mfa_ok', floodlight_private.staff_mfa_ok(),
    'memberships', coalesce((select jsonb_agg(jsonb_build_object('facility_id', m.facility_id, 'role', m.role))
                             from floodlight.staff_memberships m
                             where m.user_id = auth.uid() and m.revoked_at is null), '[]'::jsonb)
  );
$$;

create or replace function floodlight_private.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

create trigger profiles_touch before update on floodlight.profiles
  for each row execute function floodlight_private.touch_updated_at();
