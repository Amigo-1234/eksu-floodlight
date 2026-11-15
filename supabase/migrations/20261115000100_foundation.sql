-- EKSU Floodlight — foundation: extensions, private schema, platform settings,
-- profiles, platform owners, facility-scoped staff roles, audit log.
--
-- Security model (applies to every later migration):
--   * Every table has RLS enabled. Clients never write booking, payment,
--     credential or check-in rows directly: all state changes go through
--     SECURITY DEFINER functions that check the caller's role in Postgres.
--   * Internal helpers live in the `private` schema, which is not exposed
--     through the Data API.
--   * Roles are never taken from the client: they are looked up from
--     platform_owners / staff_memberships using auth.uid().

create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.staff_role as enum ('facility_admin', 'scheduler', 'gatekeeper');

-- ---------------------------------------------------------------------------
-- Platform settings (single row). Values that need client approval start
-- unset or switched off.
-- ---------------------------------------------------------------------------
create table public.platform_settings (
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
insert into public.platform_settings (id) values (1);

-- ---------------------------------------------------------------------------
-- Profiles (one per auth user; created by trigger)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 120),
  phone text check (phone is null or phone ~ '^\+?[0-9 ()-]{7,20}$'),
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Platform owners (global) — separate from facility-scoped staff roles.
-- There is no self-service path to this table: the first owner is created
-- by running private.bootstrap_platform_owner(email) as the database owner.
-- ---------------------------------------------------------------------------
create table public.platform_owners (
  user_id uuid primary key references auth.users (id) on delete cascade,
  granted_by uuid references auth.users (id),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Facility-scoped staff memberships. facility_id is added as an FK in the
-- facilities migration (the table does not exist yet).
-- ---------------------------------------------------------------------------
create table public.staff_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  facility_id uuid not null,
  role public.staff_role not null,
  granted_by uuid references auth.users (id),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users (id)
);
create unique index staff_memberships_active_uniq
  on public.staff_memberships (user_id, facility_id, role) where revoked_at is null;
create index staff_memberships_facility_idx on public.staff_memberships (facility_id) where revoked_at is null;

-- ---------------------------------------------------------------------------
-- Audit log (append-only)
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text,
  facility_id uuid,
  details jsonb not null default '{}'::jsonb
);
create index audit_log_at_idx on public.audit_log (at desc);
create index audit_log_facility_idx on public.audit_log (facility_id, at desc);

create or replace function private.audit(
  p_action text, p_entity_type text, p_entity_id text, p_facility_id uuid, p_details jsonb default '{}'::jsonb
) returns void language sql security definer set search_path = '' as $$
  insert into public.audit_log (actor_id, action, entity_type, entity_id, facility_id, details)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, p_facility_id, coalesce(p_details, '{}'::jsonb));
$$;

create or replace function private.forbid_change() returns trigger
language plpgsql as $$
begin
  raise exception 'APPEND_ONLY: % rows cannot be changed or deleted', tg_table_name
    using errcode = 'P0001';
end $$;

create trigger audit_log_append_only before update or delete on public.audit_log
  for each row execute function private.forbid_change();

-- ---------------------------------------------------------------------------
-- Role helpers (all read auth.uid(); none accept a role from the client)
-- ---------------------------------------------------------------------------
create or replace function private.staff_mfa_ok() returns boolean
language sql stable security definer set search_path = '' as $$
  select not coalesce((select require_staff_mfa from public.platform_settings where id = 1), false)
      or coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;

create or replace function private.is_platform_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
     and exists (select 1 from public.platform_owners o where o.user_id = auth.uid() and o.revoked_at is null)
     and private.staff_mfa_ok();
$$;

-- True when the caller holds one of p_roles at p_facility (owners hold every role).
create or replace function private.has_facility_role(p_facility uuid, p_roles public.staff_role[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_platform_owner()
      or (auth.uid() is not null
          and private.staff_mfa_ok()
          and exists (
            select 1 from public.staff_memberships m
            where m.user_id = auth.uid() and m.facility_id = p_facility
              and m.revoked_at is null and m.role = any (p_roles)));
$$;

create or replace function private.is_any_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_platform_owner()
      or (auth.uid() is not null and private.staff_mfa_ok() and exists (
            select 1 from public.staff_memberships m where m.user_id = auth.uid() and m.revoked_at is null));
$$;

create or replace function private.require_auth() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v uuid := auth.uid();
begin
  if v is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;
  return v;
end $$;

-- Bootstrap: make an existing account a platform owner. Not granted to any
-- API role: run it from the SQL editor / psql as the database owner.
create or replace function private.bootstrap_platform_owner(p_email text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_user uuid;
begin
  select id into v_user from auth.users where lower(email) = lower(p_email);
  if v_user is null then raise exception 'No account with email %', p_email; end if;
  insert into public.platform_owners (user_id) values (v_user)
  on conflict (user_id) do update set revoked_at = null, granted_at = now();
  insert into public.audit_log (actor_id, action, entity_type, entity_id, details)
  values (null, 'platform_owner.bootstrap', 'user', v_user::text, jsonb_build_object('email', p_email));
  return v_user;
end $$;
revoke all on function private.bootstrap_platform_owner(text) from public, anon, authenticated, service_role;

-- Current caller's roles, for the UI (navigation only — never trusted for authorization).
create or replace function public.my_roles() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'user_id', auth.uid(),
    'is_platform_owner', coalesce((select true from public.platform_owners o
                                   where o.user_id = auth.uid() and o.revoked_at is null), false),
    'mfa_ok', private.staff_mfa_ok(),
    'memberships', coalesce((select jsonb_agg(jsonb_build_object('facility_id', m.facility_id, 'role', m.role))
                             from public.staff_memberships m
                             where m.user_id = auth.uid() and m.revoked_at is null), '[]'::jsonb)
  );
$$;

create or replace function private.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();
