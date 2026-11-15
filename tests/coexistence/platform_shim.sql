-- LOCAL TEST SHIM ONLY — never run against a real Supabase project.
-- Emulates the parts of the Supabase platform that EKSU Sports Hub's and
-- EKSU Floodlight's migrations depend on, so both apps' REAL migrations can be
-- applied to one plain PostgreSQL database for coexistence testing:
-- API roles, extensions schema, auth (users, jwt helpers, mfa), storage
-- (buckets, objects, foldername), realtime (messages, topic, send), vault
-- (secrets, decrypted_secrets, create_secret), net.http_post and pg_cron's
-- cron.schedule.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator login noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'dashboard_user') then create role dashboard_user nologin; end if;
end $$;
grant anon, authenticated, service_role to authenticator;
-- Mirrors Supabase: tests switch to these roles from the owner session.
grant anon, authenticated, service_role to postgres;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;
do $$ begin execute format('alter database %I set search_path = "$user", public, extensions', current_database()); end $$;

-- Supabase's default privileges for objects created by postgres in public.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public grant execute on functions to service_role;
grant usage on schema public to anon, authenticated, service_role;

-- ---------------------------------------------------------------- auth
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;
create table if not exists auth.users (
  instance_id uuid, id uuid primary key default gen_random_uuid(), aud text, role text,
  email text unique, encrypted_password text, email_confirmed_at timestamptz, last_sign_in_at timestamptz,
  raw_app_meta_data jsonb not null default '{}'::jsonb, raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  phone text, is_anonymous boolean not null default false
);
create table if not exists auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade);
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
create or replace function auth.role() returns text language sql stable as $$ select auth.jwt() ->> 'role' $$;
grant execute on function auth.jwt(), auth.uid(), auth.role() to anon, authenticated, service_role;

-- ---------------------------------------------------------------- storage
create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;
create table if not exists storage.buckets (
  id text primary key, name text not null unique, owner uuid, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text,
  owner uuid, metadata jsonb, created_at timestamptz default now(), updated_at timestamptz default now(),
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;
alter table storage.buckets enable row level security;
grant select, insert, update, delete on storage.objects, storage.buckets to anon, authenticated, service_role;
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
grant execute on function storage.foldername(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------- realtime
create schema if not exists realtime;
grant usage on schema realtime to anon, authenticated, service_role;
create table if not exists realtime.messages (
  id bigint generated always as identity primary key, topic text not null, extension text not null default 'broadcast',
  event text, payload jsonb, private boolean default false, inserted_at timestamptz not null default now()
);
alter table realtime.messages enable row level security;
grant select, insert on realtime.messages to anon, authenticated, service_role;
create or replace function realtime.topic() returns text language sql stable as $$
  select nullif(current_setting('realtime.topic', true), '') $$;
create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true)
returns void language sql security definer as $$
  insert into realtime.messages (topic, event, payload, private) values (topic, event, payload, private) $$;
grant execute on function realtime.topic(), realtime.send(jsonb, text, text, boolean) to anon, authenticated, service_role;

-- ---------------------------------------------------------------- vault
create schema if not exists vault;
create table if not exists vault.secrets (
  id uuid primary key default gen_random_uuid(), name text unique, secret text not null, description text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create or replace view vault.decrypted_secrets as select id, name, secret as decrypted_secret, description from vault.secrets;
create or replace function vault.create_secret(new_secret text, new_name text default null, new_description text default '')
returns uuid language sql as $$
  insert into vault.secrets (secret, name, description) values (new_secret, new_name, new_description) returning id $$;

-- ---------------------------------------------------------------- net (pg_net stub: records calls only)
create schema if not exists net;
create table if not exists net.calls (id bigint generated always as identity, url text, body jsonb, at timestamptz default now());
create or replace function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
  headers jsonb default '{}'::jsonb, timeout_milliseconds integer default 2000)
returns bigint language sql as $$ insert into net.calls (url, body) values (url, body) returning id $$;

-- ---------------------------------------------------------------- pg_cron stub
create schema if not exists cron;
create table if not exists cron.job (jobid bigint generated always as identity primary key, jobname text unique, schedule text, command text);
create or replace function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as $$
  insert into cron.job (jobname, schedule, command) values (job_name, schedule, command)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command returning jobid $$;
create or replace function cron.unschedule(job_name text) returns boolean language sql as $$
  with d as (delete from cron.job where jobname = job_name returning 1) select exists (select 1 from d) $$;
