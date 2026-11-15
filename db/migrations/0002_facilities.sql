-- EKSU Floodlight — facilities, playing surfaces, operating schedules,
-- booking policies, pricing and availability blocks.
--
-- No real EKSU facility is created here. Facilities are configured by staff
-- (or, in development only, by supabase/dev-fixtures.sql, whose rows carry
-- is_dev_fixture = true and are labelled in the UI).

create type floodlight.approval_mode as enum ('required', 'automatic');
create type floodlight.payment_mode as enum ('unconfigured', 'free', 'online', 'offline', 'hybrid', 'deposit');
create type floodlight.access_mode as enum ('disabled', 'organizer_pass', 'participant_passes', 'organizer_and_participants');
create type floodlight.customer_cancellation as enum ('pending_only', 'until_cutoff', 'not_allowed');
create type floodlight.block_kind as enum ('maintenance', 'closure', 'official_use', 'event', 'other');

create table floodlight.sport_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null check (char_length(name) between 2 and 40),
  sort_order int not null default 100
);

-- Category options only (what kind of sport a facility hosts). Their presence
-- does not mean EKSU has, or offers for booking, a facility of that kind.
insert into floodlight.sport_categories (slug, name, sort_order) values
  ('football', 'Football', 10),
  ('basketball', 'Basketball', 20),
  ('volleyball', 'Volleyball', 30),
  ('tennis', 'Tennis', 40),
  ('athletics', 'Athletics', 50),
  ('handball', 'Handball', 60),
  ('other', 'Other', 900);

create table floodlight.facilities (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  name text not null check (char_length(name) between 2 and 80),
  description text check (char_length(description) <= 2000),
  location_label text check (char_length(location_label) <= 120),
  sport_category_id uuid not null references floodlight.sport_categories (id),
  cover_image_path text,
  rules text check (char_length(rules) <= 4000),
  eligibility_note text check (char_length(eligibility_note) <= 1000),
  entry_instructions text check (char_length(entry_instructions) <= 1000),
  timezone text not null default 'Africa/Lagos',
  is_active boolean not null default false,
  is_dev_fixture boolean not null default false,
  show_on_public_schedule boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger facilities_touch before update on floodlight.facilities
  for each row execute function floodlight_private.touch_updated_at();

alter table floodlight.staff_memberships
  add constraint staff_memberships_facility_fk foreign key (facility_id)
  references floodlight.facilities (id) on delete cascade;

create table floodlight.playing_surfaces (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references floodlight.facilities (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  description text check (char_length(description) <= 500),
  is_active boolean not null default true,
  sort_order int not null default 100,
  created_at timestamptz not null default now(),
  unique (facility_id, name)
);
create index playing_surfaces_facility_idx on floodlight.playing_surfaces (facility_id);

create table floodlight.facility_images (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references floodlight.facilities (id) on delete cascade,
  storage_path text not null,
  alt_text text not null default '' check (char_length(alt_text) <= 200),
  sort_order int not null default 100,
  created_at timestamptz not null default now()
);

-- Weekly opening hours in the facility's local time. weekday follows
-- PostgreSQL extract(dow): 0 = Sunday … 6 = Saturday. Several rows per day
-- are allowed (e.g. a midday closure).
create table floodlight.operating_hours (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references floodlight.facilities (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  opens_at time not null,
  closes_at time not null,
  check (closes_at > opens_at)
);
create index operating_hours_facility_idx on floodlight.operating_hours (facility_id, weekday);

-- One policy row per facility. NULL means "not configured yet": a facility
-- without slot_minutes and opening hours cannot take bookings, and optional
-- limits that are NULL are simply not enforced. Defaults are the cautious
-- choices: approval required, payment unconfigured, gate passes disabled.
create table floodlight.booking_policies (
  facility_id uuid primary key references floodlight.facilities (id) on delete cascade,
  slot_minutes int check (slot_minutes between 15 and 480),
  gap_minutes int not null default 0 check (gap_minutes between 0 and 120),
  min_notice_minutes int check (min_notice_minutes between 0 and 10080),
  max_advance_days int check (max_advance_days between 1 and 365),
  max_active_bookings_per_user int check (max_active_bookings_per_user between 1 and 100),
  approval_mode floodlight.approval_mode not null default 'required',
  payment_mode floodlight.payment_mode not null default 'unconfigured',
  access_mode floodlight.access_mode not null default 'disabled',
  entry_opens_minutes_before int check (entry_opens_minutes_before between 0 and 240),
  entry_closes_minutes_after_start int check (entry_closes_minutes_after_start between 0 and 480),
  customer_cancellation floodlight.customer_cancellation not null default 'pending_only',
  cancellation_cutoff_hours int check (cancellation_cutoff_hours between 0 and 720),
  customer_reschedule_allowed boolean not null default false,
  reschedule_cutoff_hours int check (reschedule_cutoff_hours between 0 and 720),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
create trigger booking_policies_touch before update on floodlight.booking_policies
  for each row execute function floodlight_private.touch_updated_at();

create or replace function floodlight_private.facility_default_policy() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into floodlight.booking_policies (facility_id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger facilities_default_policy after insert on floodlight.facilities
  for each row execute function floodlight_private.facility_default_policy();

-- Prices are entered by staff. No price exists until the client supplies one.
create table floodlight.facility_prices (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references floodlight.facilities (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 60),
  amount_kobo bigint not null check (amount_kobo >= 0),
  deposit_kobo bigint check (deposit_kobo >= 0),
  currency text not null default 'NGN' check (currency = 'NGN'),
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index facility_prices_one_default
  on floodlight.facility_prices (facility_id) where is_default and is_active;

-- Unavailable periods. surface_id NULL blocks every surface of the facility.
create table floodlight.facility_blocks (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references floodlight.facilities (id) on delete cascade,
  surface_id uuid references floodlight.playing_surfaces (id) on delete cascade,
  period tstzrange not null check (not isempty(period) and lower_inc(period) and not upper_inc(period)),
  kind floodlight.block_kind not null,
  reason text check (char_length(reason) <= 300),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users (id) on delete set null
);
create index facility_blocks_lookup on floodlight.facility_blocks using gist (facility_id, period) where cancelled_at is null;
