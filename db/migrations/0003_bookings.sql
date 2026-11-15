-- EKSU Floodlight — booking engine.
--
-- Guarantees enforced here, not in the browser:
--   1. No two slot-holding bookings overlap on the same playing surface
--      (EXCLUDE constraint, covers every write path).
--   2. Bookings and blocks for a surface are written under a per-surface
--      transaction advisory lock, so a block can never be created over a
--      booking that is being inserted at the same moment (and vice versa).
--   3. Booking status, approval status and payment status are separate
--      columns. A booking is `confirmed` only when approval is not required or
--      approved AND payment is not required, paid or explicitly waived by an
--      administrator. An unconfigured payment policy therefore never confirms
--      a booking on its own.
--   4. Only SECURITY DEFINER functions below change bookings; clients have no
--      INSERT/UPDATE/DELETE privilege on these tables.

create type floodlight.booking_status as enum
  ('held', 'pending', 'confirmed', 'checked_in', 'completed', 'no_show', 'cancelled', 'rejected', 'expired');
create type floodlight.approval_status as enum ('not_required', 'pending', 'approved', 'rejected');
create type floodlight.payment_status as enum
  ('not_required', 'unconfigured', 'pending', 'paid', 'waived', 'failed', 'refunded', 'partially_refunded');
create type floodlight.booking_source as enum ('customer', 'staff', 'walk_in');
create type floodlight.activity_type as enum ('friendly', 'training', 'practice', 'competition', 'other');
create type floodlight.activity_status as enum ('scheduled', 'in_progress', 'completed', 'postponed', 'cancelled');

create table floodlight.bookings (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  facility_id uuid not null references floodlight.facilities (id),
  surface_id uuid not null references floodlight.playing_surfaces (id),
  period tstzrange not null check (not isempty(period) and lower_inc(period) and not upper_inc(period)),
  status floodlight.booking_status not null,
  approval_status floodlight.approval_status not null,
  payment_status floodlight.payment_status not null,
  source floodlight.booking_source not null,
  customer_id uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  organizer_name text not null check (char_length(organizer_name) between 2 and 120),
  organizer_phone text check (organizer_phone is null or organizer_phone ~ '^\+?[0-9 ()-]{7,20}$'),
  organizer_email text check (organizer_email is null or organizer_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  activity_type floodlight.activity_type not null default 'friendly',
  activity_title text check (char_length(activity_title) <= 120),
  team_name text check (char_length(team_name) <= 80),
  opponent_name text check (char_length(opponent_name) <= 80),
  purpose text check (char_length(purpose) <= 300),
  notes text check (char_length(notes) <= 1000),
  public_listing boolean not null default false,
  amount_due_kobo bigint check (amount_due_kobo >= 0),
  price_snapshot jsonb,
  policy_snapshot jsonb not null default '{}'::jsonb,
  hold_expires_at timestamptz,
  idempotency_key text check (char_length(idempotency_key) <= 80),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  decision_reason text check (char_length(decision_reason) <= 500),
  cancelled_by uuid references auth.users (id) on delete set null,
  cancelled_at timestamptz,
  cancellation_reason text check (char_length(cancellation_reason) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bookings_no_overlap exclude using gist (surface_id with =, period with &&)
    where (status in ('held', 'pending', 'confirmed', 'checked_in', 'completed', 'no_show')),
  constraint bookings_confirmed_consistent check (
    status not in ('confirmed', 'checked_in', 'completed', 'no_show')
    or (approval_status in ('not_required', 'approved')
        and payment_status in ('not_required', 'paid', 'waived', 'refunded', 'partially_refunded')))
);
create unique index bookings_idempotency on floodlight.bookings (created_by, idempotency_key) where idempotency_key is not null;
create index bookings_facility_period on floodlight.bookings using gist (facility_id, period);
create index bookings_customer on floodlight.bookings (customer_id, created_at desc);
create index bookings_status on floodlight.bookings (status);
create trigger bookings_touch before update on floodlight.bookings
  for each row execute function floodlight_private.touch_updated_at();

create table floodlight.booking_events (
  id bigint generated always as identity primary key,
  booking_id uuid not null references floodlight.bookings (id) on delete cascade,
  at timestamptz not null default now(),
  actor_id uuid,
  event text not null,
  from_status floodlight.booking_status,
  to_status floodlight.booking_status,
  details jsonb not null default '{}'::jsonb
);
create index booking_events_booking on floodlight.booking_events (booking_id, at);
create trigger booking_events_append_only before update or delete on floodlight.booking_events
  for each row execute function floodlight_private.forbid_change();

-- Optional participant list (individual player passes stay disabled until the
-- client approves an access policy that needs them).
create table floodlight.booking_participants (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references floodlight.bookings (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 120),
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Booking confirmation record. A receipt confirms the reservation; it is not
-- proof of payment (payment_status is shown separately) and not, on its own,
-- an entry authorization.
create table floodlight.receipts (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references floodlight.bookings (id) on delete cascade,
  receipt_number text not null unique,
  version int not null default 1,
  issued_at timestamptz not null default now(),
  snapshot jsonb not null,
  unique (booking_id, version)
);

-- Field activity attached to a booking. LIVE / FULL TIME come only from
-- events recorded here by staff, never from the clock.
create table floodlight.activities (
  booking_id uuid primary key references floodlight.bookings (id) on delete cascade,
  status floodlight.activity_status not null default 'scheduled',
  started_at timestamptz,
  ended_at timestamptz,
  home_score smallint check (home_score between 0 and 99),
  away_score smallint check (away_score between 0 and 99),
  result_note text check (char_length(result_note) <= 300),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Payments (provider-agnostic). Nothing here is created by the browser.
create type floodlight.payment_txn_status as enum ('initiated', 'pending', 'succeeded', 'failed', 'abandoned');
create table floodlight.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references floodlight.bookings (id),
  provider text not null check (provider in ('paystack', 'offline')),
  status floodlight.payment_txn_status not null,
  amount_kobo bigint not null check (amount_kobo > 0),
  currency text not null default 'NGN',
  provider_reference text unique,
  method text check (char_length(method) <= 40),
  receipt_number text check (char_length(receipt_number) <= 60),
  note text check (char_length(note) <= 300),
  recorded_by uuid references auth.users (id) on delete set null,
  verified_by uuid references auth.users (id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  raw jsonb
);
create index payment_transactions_booking on floodlight.payment_transactions (booking_id);

create table floodlight.payment_webhook_events (
  id bigint generated always as identity primary key,
  provider text not null,
  event_id text not null,
  event_type text,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  result text,
  unique (provider, event_id)
);

create type floodlight.refund_status as enum ('pending_review', 'approved', 'processing', 'refunded', 'declined', 'failed');
create table floodlight.refunds (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references floodlight.bookings (id),
  payment_id uuid references floodlight.payment_transactions (id),
  amount_kobo bigint check (amount_kobo >= 0),
  status floodlight.refund_status not null default 'pending_review',
  reason text check (char_length(reason) <= 500),
  requested_by uuid references auth.users (id) on delete set null,
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

-- Notifications: in-app rows are visible immediately; outbound messages are
-- queued and stay `awaiting_provider` until an email provider is configured.
create table floodlight.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  booking_id uuid references floodlight.bookings (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null default '',
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index notifications_user on floodlight.notifications (user_id, created_at desc);

create table floodlight.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('email', 'push')),
  recipient text not null,
  template text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'awaiting_provider'
    check (status in ('awaiting_provider', 'queued', 'sent', 'failed', 'skipped')),
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

-- ===========================================================================
-- Helpers
-- ===========================================================================
create or replace function floodlight_private.random_code(p_len int) returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- no 0/O/1/I
  bytes bytea := extensions.gen_random_bytes(p_len);
  out text := '';
begin
  for i in 0 .. p_len - 1 loop
    out := out || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;
  return out;
end $$;

create or replace function floodlight_private.new_booking_reference() returns text
language plpgsql volatile security definer set search_path = '' as $$
declare v text;
begin
  loop
    v := 'FL-' || floodlight_private.random_code(4) || '-' || floodlight_private.random_code(4);
    exit when not exists (select 1 from floodlight.bookings where reference = v);
  end loop;
  return v;
end $$;

create or replace function floodlight_private.lock_surface(p_surface uuid) returns void
language sql volatile set search_path = '' as $$
  select pg_advisory_xact_lock(hashtextextended('surface:' || p_surface::text, 0));
$$;

create or replace function floodlight_private.add_event(
  p_booking uuid, p_event text, p_from floodlight.booking_status, p_to floodlight.booking_status, p_details jsonb default '{}'::jsonb
) returns void language sql security definer set search_path = '' as $$
  insert into floodlight.booking_events (booking_id, actor_id, event, from_status, to_status, details)
  values (p_booking, auth.uid(), p_event, p_from, p_to, coalesce(p_details, '{}'::jsonb));
$$;

create or replace function floodlight_private.notify(
  p_user uuid, p_booking uuid, p_kind text, p_title text, p_body text, p_email text default null
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_user is not null then
    insert into floodlight.notifications (user_id, booking_id, kind, title, body)
    values (p_user, p_booking, p_kind, p_title, p_body);
  end if;
  if p_email is not null then
    insert into floodlight.notification_outbox (channel, recipient, template, payload)
    values ('email', p_email, p_kind, jsonb_build_object('booking_id', p_booking, 'title', p_title, 'body', p_body));
  end if;
end $$;

-- Slot grid for one facility and one local date, from the configured policy
-- and opening hours. Returns nothing when the policy is incomplete.
create or replace function floodlight_private.slot_grid(p_facility uuid, p_day date)
returns table (slot_start timestamptz, slot_end timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_tz text; v_slot int; v_gap int; r record; t timestamp; t_end timestamp; day_close timestamp;
begin
  select f.timezone, p.slot_minutes, p.gap_minutes into v_tz, v_slot, v_gap
  from floodlight.facilities f join floodlight.booking_policies p on p.facility_id = f.id
  where f.id = p_facility;
  if v_slot is null then return; end if;
  for r in
    select h.opens_at, h.closes_at from floodlight.operating_hours h
    where h.facility_id = p_facility and h.weekday = extract(dow from p_day)::int
    order by h.opens_at
  loop
    t := p_day + r.opens_at;
    day_close := p_day + r.closes_at;
    loop
      t_end := t + make_interval(mins => v_slot);
      exit when t_end > day_close;
      slot_start := t at time zone v_tz;
      slot_end := t_end at time zone v_tz;
      return next;
      t := t_end + make_interval(mins => v_gap);
    end loop;
  end loop;
end $$;

-- What is missing before a facility can take bookings (empty array = ready).
create or replace function floodlight.facility_booking_readiness(p_facility uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'bookable', cardinality(missing) = 0,
    'missing', to_jsonb(missing))
  from (
    select array_remove(array[
      case when not f.is_active then 'facility_inactive' end,
      case when p.slot_minutes is null then 'slot_duration_not_set' end,
      case when not exists (select 1 from floodlight.operating_hours h where h.facility_id = f.id) then 'opening_hours_not_set' end,
      case when not exists (select 1 from floodlight.playing_surfaces s where s.facility_id = f.id and s.is_active) then 'no_active_surface' end,
      case when p.payment_mode in ('online', 'offline', 'hybrid', 'deposit')
            and not exists (select 1 from floodlight.facility_prices fp where fp.facility_id = f.id and fp.is_default and fp.is_active)
           then 'price_not_set' end
    ], null) as missing
    from floodlight.facilities f join floodlight.booking_policies p on p.facility_id = f.id
    where f.id = p_facility
  ) x;
$$;

-- Public availability for one facility and one local date. No personal data.
create or replace function floodlight.facility_availability(p_facility uuid, p_day date)
returns table (surface_id uuid, surface_name text, slot_start timestamptz, slot_end timestamptz, state text)
language plpgsql stable security definer set search_path = '' as $$
declare v_pol floodlight.booking_policies; v_active boolean; v_now timestamptz := now();
begin
  select f.is_active into v_active from floodlight.facilities f where f.id = p_facility;
  if not coalesce(v_active, false) and not floodlight_private.has_facility_role(p_facility, array['facility_admin','scheduler','gatekeeper']::floodlight.staff_role[]) then
    return;
  end if;
  select * into v_pol from floodlight.booking_policies where facility_id = p_facility;
  return query
  select s.id, s.name, g.slot_start, g.slot_end,
    case
      when exists (select 1 from floodlight.facility_blocks b
                   where b.facility_id = p_facility and b.cancelled_at is null
                     and (b.surface_id is null or b.surface_id = s.id)
                     and b.period && tstzrange(g.slot_start, g.slot_end)) then 'blocked'
      when exists (select 1 from floodlight.bookings k
                   where k.surface_id = s.id and k.period && tstzrange(g.slot_start, g.slot_end)
                     and k.status in ('confirmed','checked_in','completed','no_show')) then 'booked'
      when exists (select 1 from floodlight.bookings k
                   where k.surface_id = s.id and k.period && tstzrange(g.slot_start, g.slot_end)
                     and (k.status = 'pending' or (k.status = 'held' and k.hold_expires_at > v_now))) then 'requested'
      when g.slot_start <= v_now then 'past'
      when v_pol.min_notice_minutes is not null
           and g.slot_start < v_now + make_interval(mins => v_pol.min_notice_minutes) then 'too_soon'
      when v_pol.max_advance_days is not null
           and g.slot_start > v_now + make_interval(days => v_pol.max_advance_days) then 'too_far'
      else 'available'
    end
  from floodlight.playing_surfaces s
  cross join floodlight_private.slot_grid(p_facility, p_day) g
  where s.facility_id = p_facility and s.is_active
  order by s.sort_order, s.name, g.slot_start;
end $$;

-- Validates that [p_start, p_start + slot) is a real, open slot of the
-- surface. Raises a coded error otherwise. Must run under lock_surface().
create or replace function floodlight_private.validate_slot(
  p_surface uuid, p_start timestamptz, p_is_staff boolean, p_ignore_booking uuid default null
) returns timestamptz
language plpgsql stable security definer set search_path = '' as $$
declare
  v_fac uuid; v_tz text; v_active boolean; v_surface_active boolean; v_pol floodlight.booking_policies;
  v_end timestamptz; v_day date;
begin
  select s.facility_id, s.is_active, f.timezone, f.is_active
    into v_fac, v_surface_active, v_tz, v_active
  from floodlight.playing_surfaces s join floodlight.facilities f on f.id = s.facility_id
  where s.id = p_surface;
  if v_fac is null then raise exception 'SURFACE_NOT_FOUND' using errcode = 'P0001'; end if;
  if not v_active or not v_surface_active then raise exception 'FACILITY_NOT_BOOKABLE' using errcode = 'P0001'; end if;
  select * into v_pol from floodlight.booking_policies where facility_id = v_fac;
  if v_pol.slot_minutes is null then raise exception 'POLICY_INCOMPLETE' using errcode = 'P0001'; end if;

  v_day := (p_start at time zone v_tz)::date;
  select g.slot_end into v_end from floodlight_private.slot_grid(v_fac, v_day) g where g.slot_start = p_start;
  if v_end is null then raise exception 'INVALID_SLOT' using errcode = 'P0001'; end if;

  -- Staff may book a slot that is already under way (walk-ins); customers may not.
  if (p_is_staff and v_end <= now()) or (not p_is_staff and p_start <= now()) then
    raise exception 'SLOT_IN_PAST' using errcode = 'P0001';
  end if;
  if not p_is_staff then
    if v_pol.min_notice_minutes is not null and p_start < now() + make_interval(mins => v_pol.min_notice_minutes) then
      raise exception 'NOTICE_TOO_SHORT' using errcode = 'P0001';
    end if;
    if v_pol.max_advance_days is not null and p_start > now() + make_interval(days => v_pol.max_advance_days) then
      raise exception 'TOO_FAR_AHEAD' using errcode = 'P0001';
    end if;
  end if;
  if exists (select 1 from floodlight.facility_blocks b
             where b.facility_id = v_fac and b.cancelled_at is null
               and (b.surface_id is null or b.surface_id = p_surface)
               and b.period && tstzrange(p_start, v_end)) then
    raise exception 'SLOT_BLOCKED' using errcode = 'P0001';
  end if;
  return v_end;
end $$;

-- Lapsed holds on a surface must not block a live customer.
create or replace function floodlight_private.expire_stale_holds(p_surface uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in
    update floodlight.bookings set status = 'expired'
    where surface_id = p_surface and status = 'held' and hold_expires_at <= now()
    returning id
  loop
    perform floodlight_private.add_event(r.id, 'expired', 'held', 'expired', '{"reason":"hold_lapsed"}');
  end loop;
end $$;

create or replace function floodlight_private.price_snapshot(p_facility uuid, p_mode floodlight.payment_mode)
returns table (amount_due bigint, snapshot jsonb)
language sql stable security definer set search_path = '' as $$
  select case when p_mode = 'deposit' then coalesce(fp.deposit_kobo, fp.amount_kobo) else fp.amount_kobo end,
         jsonb_build_object('price_id', fp.id, 'label', fp.label, 'amount_kobo', fp.amount_kobo,
                            'deposit_kobo', fp.deposit_kobo, 'currency', fp.currency)
  from floodlight.facility_prices fp
  where fp.facility_id = p_facility and fp.is_default and fp.is_active
    and p_mode in ('online', 'offline', 'hybrid', 'deposit');
$$;

-- Issues the receipt (and, when the facility's access mode allows, the
-- organizer's access credential) for a booking that has just been confirmed.
-- Defined fully in the access migration; this placeholder keeps ordering valid.
create or replace function floodlight_private.on_booking_confirmed(p_booking uuid) returns void
language plpgsql security definer set search_path = '' as $$ begin null; end $$;

-- Moves a pending booking to confirmed when every requirement is satisfied.
create or replace function floodlight_private.confirm_if_ready(p_booking uuid) returns floodlight.booking_status
language plpgsql security definer set search_path = '' as $$
declare b floodlight.bookings;
begin
  select * into b from floodlight.bookings where id = p_booking for update;
  if b.status in ('pending', 'held')
     and b.approval_status in ('not_required', 'approved')
     and b.payment_status in ('not_required', 'paid', 'waived') then
    update floodlight.bookings set status = 'confirmed', hold_expires_at = null where id = p_booking;
    perform floodlight_private.add_event(p_booking, 'confirmed', b.status, 'confirmed');
    perform floodlight_private.on_booking_confirmed(p_booking);
    perform floodlight_private.notify(b.customer_id, p_booking, 'booking.confirmed', 'Booking confirmed',
      'Your booking ' || b.reference || ' is confirmed.', b.organizer_email);
    return 'confirmed';
  end if;
  return b.status;
end $$;

create or replace function floodlight_private.initial_statuses(
  p_pol floodlight.booking_policies, p_staff_approved boolean, p_waive_payment boolean,
  out approval floodlight.approval_status, out payment floodlight.payment_status, out status floodlight.booking_status
) language plpgsql immutable as $$
begin
  approval := case
    when p_staff_approved then 'approved'
    when p_pol.approval_mode = 'required' then 'pending'
    else 'not_required' end;
  payment := case
    when p_waive_payment then 'waived'
    when p_pol.payment_mode = 'free' then 'not_required'
    when p_pol.payment_mode = 'unconfigured' then 'unconfigured'
    else 'pending' end;
  status := case
    when approval in ('not_required', 'approved') and payment in ('not_required', 'waived') then 'confirmed'
    else 'pending' end;
end $$;

-- Shared insert path for every kind of booking.
create or replace function floodlight_private.insert_booking(
  p_surface uuid, p_start timestamptz, p_source floodlight.booking_source, p_customer uuid,
  p_is_staff boolean, p_staff_approved boolean, p_waive_payment boolean,
  p_activity_type floodlight.activity_type, p_activity_title text, p_team text, p_opponent text,
  p_purpose text, p_organizer_name text, p_organizer_phone text, p_organizer_email text,
  p_notes text, p_public_listing boolean, p_idempotency_key text
) returns floodlight.bookings
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := floodlight_private.require_auth();
  v_fac uuid; v_end timestamptz; v_pol floodlight.booking_policies; v_st record; v_price record;
  v_existing floodlight.bookings; b floodlight.bookings;
begin
  if p_idempotency_key is not null then
    select * into v_existing from floodlight.bookings where created_by = v_uid and idempotency_key = p_idempotency_key;
    if found then return v_existing; end if;
  end if;

  select facility_id into v_fac from floodlight.playing_surfaces where id = p_surface;
  if v_fac is null then raise exception 'SURFACE_NOT_FOUND' using errcode = 'P0001'; end if;

  perform floodlight_private.lock_surface(p_surface);
  perform floodlight_private.expire_stale_holds(p_surface);
  v_end := floodlight_private.validate_slot(p_surface, p_start, p_is_staff);
  select * into v_pol from floodlight.booking_policies where facility_id = v_fac;

  if not p_is_staff and v_pol.max_active_bookings_per_user is not null
     and (select count(*) from floodlight.bookings
          where customer_id = p_customer and facility_id = v_fac
            and status in ('held', 'pending', 'confirmed') and upper(period) > now())
         >= v_pol.max_active_bookings_per_user then
    raise exception 'ACTIVE_BOOKING_LIMIT' using errcode = 'P0001';
  end if;

  select * into v_price from floodlight_private.price_snapshot(v_fac, v_pol.payment_mode);
  if v_pol.payment_mode in ('online', 'offline', 'hybrid', 'deposit') and v_price.amount_due is null then
    raise exception 'PRICE_NOT_SET' using errcode = 'P0001';
  end if;
  select * into v_st from floodlight_private.initial_statuses(v_pol, p_staff_approved, p_waive_payment);

  begin
    insert into floodlight.bookings (
      reference, facility_id, surface_id, period, status, approval_status, payment_status, source,
      customer_id, created_by, organizer_name, organizer_phone, organizer_email,
      activity_type, activity_title, team_name, opponent_name, purpose, notes, public_listing,
      amount_due_kobo, price_snapshot, policy_snapshot, idempotency_key, decided_by, decided_at)
    values (
      floodlight_private.new_booking_reference(), v_fac, p_surface, tstzrange(p_start, v_end, '[)'),
      'pending', v_st.approval, v_st.payment, p_source,
      p_customer, v_uid, btrim(p_organizer_name), nullif(btrim(p_organizer_phone), ''),
      nullif(lower(btrim(p_organizer_email)), ''),
      coalesce(p_activity_type, 'friendly'), nullif(btrim(p_activity_title), ''),
      nullif(btrim(p_team), ''), nullif(btrim(p_opponent), ''), nullif(btrim(p_purpose), ''),
      nullif(btrim(p_notes), ''), coalesce(p_public_listing, false),
      v_price.amount_due, v_price.snapshot, to_jsonb(v_pol) - 'updated_by' - 'updated_at',
      p_idempotency_key,
      case when p_staff_approved then v_uid end, case when p_staff_approved then now() end)
    returning * into b;
  exception when exclusion_violation then
    raise exception 'SLOT_TAKEN' using errcode = 'P0001';
  end;

  insert into floodlight.activities (booking_id) values (b.id);
  perform floodlight_private.add_event(b.id, 'created', null, 'pending',
    jsonb_build_object('source', p_source, 'approval', v_st.approval, 'payment', v_st.payment,
                       'waived_payment', p_waive_payment));
  if p_waive_payment then
    perform floodlight_private.audit('booking.payment_waived', 'booking', b.id::text, v_fac, jsonb_build_object('reference', b.reference));
  end if;
  if p_is_staff then
    perform floodlight_private.audit('booking.staff_created', 'booking', b.id::text, v_fac,
      jsonb_build_object('reference', b.reference, 'source', p_source));
  end if;
  perform floodlight_private.notify(p_customer, b.id, 'booking.submitted', 'Booking request received',
    'We have your request ' || b.reference || '.', b.organizer_email);

  if v_st.status = 'confirmed' then perform floodlight_private.confirm_if_ready(b.id); end if;
  select * into b from floodlight.bookings where id = b.id;
  return b;
end $$;

-- ===========================================================================
-- Public booking RPCs
-- ===========================================================================

-- Customer booking (always on the caller's own account).
create or replace function floodlight.create_booking(
  p_surface_id uuid, p_start timestamptz,
  p_organizer_name text, p_organizer_phone text default null, p_organizer_email text default null,
  p_activity_type floodlight.activity_type default 'friendly', p_activity_title text default null,
  p_team_name text default null, p_opponent_name text default null, p_purpose text default null,
  p_notes text default null, p_public_listing boolean default false, p_idempotency_key text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare b floodlight.bookings; v_uid uuid := floodlight_private.require_auth();
begin
  if nullif(btrim(p_organizer_phone), '') is null and nullif(btrim(p_organizer_email), '') is null then
    raise exception 'CONTACT_REQUIRED' using errcode = 'P0001';
  end if;
  b := floodlight_private.insert_booking(p_surface_id, p_start, 'customer', v_uid, false, false, false,
    p_activity_type, p_activity_title, p_team_name, p_opponent_name, p_purpose,
    p_organizer_name, p_organizer_phone, p_organizer_email, p_notes, p_public_listing, p_idempotency_key);
  return jsonb_build_object('id', b.id, 'reference', b.reference, 'status', b.status,
    'approval_status', b.approval_status, 'payment_status', b.payment_status);
end $$;

-- Staff-assisted / walk-in booking. Facility admins and schedulers only.
-- Only a facility admin may waive payment, and only explicitly.
create or replace function floodlight.staff_create_booking(
  p_surface_id uuid, p_start timestamptz, p_source floodlight.booking_source,
  p_organizer_name text, p_organizer_phone text default null, p_organizer_email text default null,
  p_activity_type floodlight.activity_type default 'friendly', p_activity_title text default null,
  p_team_name text default null, p_opponent_name text default null, p_purpose text default null,
  p_notes text default null, p_public_listing boolean default false,
  p_waive_payment boolean default false, p_customer_email text default null, p_idempotency_key text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_fac uuid; v_customer uuid; b floodlight.bookings; v_is_admin boolean;
begin
  perform floodlight_private.require_auth();
  if p_source not in ('staff', 'walk_in') then raise exception 'INVALID_SOURCE' using errcode = 'P0001'; end if;
  select facility_id into v_fac from floodlight.playing_surfaces where id = p_surface_id;
  if v_fac is null then raise exception 'SURFACE_NOT_FOUND' using errcode = 'P0001'; end if;
  if not floodlight_private.has_facility_role(v_fac, array['facility_admin','scheduler']::floodlight.staff_role[]) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  v_is_admin := floodlight_private.has_facility_role(v_fac, array['facility_admin']::floodlight.staff_role[]);
  if coalesce(p_waive_payment, false) and not v_is_admin then
    raise exception 'FORBIDDEN_WAIVE' using errcode = 'P0001';
  end if;
  if nullif(btrim(p_customer_email), '') is not null then
    select id into v_customer from auth.users where lower(email) = lower(btrim(p_customer_email));
  end if;
  b := floodlight_private.insert_booking(p_surface_id, p_start, p_source, v_customer, true, true, coalesce(p_waive_payment, false),
    p_activity_type, p_activity_title, p_team_name, p_opponent_name, p_purpose,
    p_organizer_name, p_organizer_phone, p_organizer_email, p_notes, p_public_listing, p_idempotency_key);
  return jsonb_build_object('id', b.id, 'reference', b.reference, 'status', b.status,
    'approval_status', b.approval_status, 'payment_status', b.payment_status,
    'linked_customer', v_customer is not null);
end $$;

-- Approve or reject a pending request. Facility admins only.
create or replace function floodlight.review_booking(
  p_booking_id uuid, p_decision text, p_reason text default null, p_waive_payment boolean default false
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare b floodlight.bookings; v_status floodlight.booking_status;
begin
  perform floodlight_private.require_auth();
  select * into b from floodlight.bookings where id = p_booking_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if not floodlight_private.has_facility_role(b.facility_id, array['facility_admin']::floodlight.staff_role[]) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if b.status <> 'pending' or b.approval_status <> 'pending' then
    raise exception 'NOT_AWAITING_APPROVAL' using errcode = 'P0001';
  end if;

  if p_decision = 'reject' then
    if nullif(btrim(p_reason), '') is null then raise exception 'REASON_REQUIRED' using errcode = 'P0001'; end if;
    update floodlight.bookings set status = 'rejected', approval_status = 'rejected',
      decided_by = auth.uid(), decided_at = now(), decision_reason = btrim(p_reason)
    where id = b.id;
    perform floodlight_private.add_event(b.id, 'rejected', 'pending', 'rejected', jsonb_build_object('reason', p_reason));
    perform floodlight_private.audit('booking.rejected', 'booking', b.id::text, b.facility_id, jsonb_build_object('reference', b.reference));
    perform floodlight_private.notify(b.customer_id, b.id, 'booking.rejected', 'Booking not approved',
      'Your request ' || b.reference || ' was not approved: ' || btrim(p_reason), b.organizer_email);
    return jsonb_build_object('status', 'rejected');
  elsif p_decision = 'approve' then
    if upper(b.period) <= now() then raise exception 'SLOT_IN_PAST' using errcode = 'P0001'; end if;
    update floodlight.bookings set approval_status = 'approved',
      decided_by = auth.uid(), decided_at = now(), decision_reason = nullif(btrim(p_reason), ''),
      payment_status = case when coalesce(p_waive_payment, false) and payment_status in ('unconfigured', 'pending')
                            then 'waived'::floodlight.payment_status else payment_status end
    where id = b.id;
    perform floodlight_private.add_event(b.id, 'approved', 'pending', 'pending',
      jsonb_build_object('waived_payment', coalesce(p_waive_payment, false)));
    perform floodlight_private.audit('booking.approved', 'booking', b.id::text, b.facility_id,
      jsonb_build_object('reference', b.reference, 'waived_payment', coalesce(p_waive_payment, false)));
    v_status := floodlight_private.confirm_if_ready(b.id);
    if v_status = 'pending' then
      perform floodlight_private.notify(b.customer_id, b.id, 'booking.approved', 'Booking approved',
        'Your request ' || b.reference || ' was approved. Payment is still outstanding.', b.organizer_email);
    end if;
    return jsonb_build_object('status', v_status);
  end if;
  raise exception 'INVALID_DECISION' using errcode = 'P0001';
end $$;

-- Who may cancel, and when, is decided here from the facility policy.
create or replace function floodlight.cancel_booking(p_booking_id uuid, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  b floodlight.bookings; v_uid uuid := floodlight_private.require_auth(); v_pol floodlight.booking_policies;
  v_is_admin boolean; v_is_scheduler_owner boolean; v_is_customer boolean;
begin
  select * into b from floodlight.bookings where id = p_booking_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  v_is_admin := floodlight_private.has_facility_role(b.facility_id, array['facility_admin']::floodlight.staff_role[]);
  v_is_scheduler_owner := b.created_by = v_uid
    and floodlight_private.has_facility_role(b.facility_id, array['scheduler']::floodlight.staff_role[]);
  v_is_customer := b.customer_id = v_uid;
  if not (v_is_admin or v_is_scheduler_owner or v_is_customer) then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if b.status not in ('held', 'pending', 'confirmed') then raise exception 'NOT_CANCELLABLE' using errcode = 'P0001'; end if;
  if lower(b.period) <= now() and not v_is_admin then raise exception 'ALREADY_STARTED' using errcode = 'P0001'; end if;

  if not (v_is_admin or v_is_scheduler_owner) then
    select * into v_pol from floodlight.booking_policies where facility_id = b.facility_id;
    if b.status = 'confirmed' then
      if v_pol.customer_cancellation <> 'until_cutoff' then
        raise exception 'CANCELLATION_NOT_ALLOWED' using errcode = 'P0001';
      end if;
      if v_pol.cancellation_cutoff_hours is not null
         and now() > lower(b.period) - make_interval(hours => v_pol.cancellation_cutoff_hours) then
        raise exception 'CANCELLATION_CUTOFF_PASSED' using errcode = 'P0001';
      end if;
    end if;
  elsif v_is_admin and not v_is_customer and nullif(btrim(p_reason), '') is null then
    raise exception 'REASON_REQUIRED' using errcode = 'P0001';
  end if;

  update floodlight.bookings set status = 'cancelled', cancelled_by = v_uid, cancelled_at = now(),
    cancellation_reason = nullif(btrim(p_reason), ''), hold_expires_at = null
  where id = b.id;
  update floodlight.activities set status = 'cancelled', updated_by = v_uid, updated_at = now() where booking_id = b.id;
  perform floodlight_private.revoke_credentials(b.id, 'booking_cancelled');
  if b.payment_status = 'paid' then
    insert into floodlight.refunds (booking_id, payment_id, amount_kobo, reason, requested_by)
    select b.id, t.id, t.amount_kobo, 'Booking cancelled', v_uid
    from floodlight.payment_transactions t where t.booking_id = b.id and t.status = 'succeeded'
    order by t.created_at desc limit 1;
  end if;
  perform floodlight_private.add_event(b.id, 'cancelled', b.status, 'cancelled', jsonb_build_object('reason', p_reason));
  if v_is_admin or v_is_scheduler_owner then
    perform floodlight_private.audit('booking.cancelled', 'booking', b.id::text, b.facility_id,
      jsonb_build_object('reference', b.reference, 'reason', p_reason));
  end if;
  perform floodlight_private.notify(b.customer_id, b.id, 'booking.cancelled', 'Booking cancelled',
    'Booking ' || b.reference || ' has been cancelled.', b.organizer_email);
  return jsonb_build_object('status', 'cancelled', 'refund_review', b.payment_status = 'paid');
end $$;

-- Move a booking to another slot (same facility). Reference and history are kept.
create or replace function floodlight.reschedule_booking(p_booking_id uuid, p_surface_id uuid, p_start timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  b floodlight.bookings; v_uid uuid := floodlight_private.require_auth(); v_pol floodlight.booking_policies;
  v_new_fac uuid; v_end timestamptz; v_is_staff boolean;
begin
  select * into b from floodlight.bookings where id = p_booking_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  v_is_staff := floodlight_private.has_facility_role(b.facility_id, array['facility_admin']::floodlight.staff_role[])
    or (b.created_by = v_uid and floodlight_private.has_facility_role(b.facility_id, array['scheduler']::floodlight.staff_role[]));
  if not v_is_staff and b.customer_id is distinct from v_uid then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if b.status not in ('pending', 'confirmed') then raise exception 'NOT_RESCHEDULABLE' using errcode = 'P0001'; end if;
  select facility_id into v_new_fac from floodlight.playing_surfaces where id = p_surface_id;
  if v_new_fac is distinct from b.facility_id then raise exception 'DIFFERENT_FACILITY' using errcode = 'P0001'; end if;

  if not v_is_staff then
    select * into v_pol from floodlight.booking_policies where facility_id = b.facility_id;
    if not v_pol.customer_reschedule_allowed then raise exception 'RESCHEDULE_NOT_ALLOWED' using errcode = 'P0001'; end if;
    if v_pol.reschedule_cutoff_hours is not null
       and now() > lower(b.period) - make_interval(hours => v_pol.reschedule_cutoff_hours) then
      raise exception 'RESCHEDULE_CUTOFF_PASSED' using errcode = 'P0001';
    end if;
  end if;

  -- Lock both surfaces in a fixed order to avoid deadlocks.
  if b.surface_id::text < p_surface_id::text then
    perform floodlight_private.lock_surface(b.surface_id); perform floodlight_private.lock_surface(p_surface_id);
  else
    perform floodlight_private.lock_surface(p_surface_id);
    if p_surface_id <> b.surface_id then perform floodlight_private.lock_surface(b.surface_id); end if;
  end if;
  perform floodlight_private.expire_stale_holds(p_surface_id);
  v_end := floodlight_private.validate_slot(p_surface_id, p_start, v_is_staff);

  begin
    update floodlight.bookings set surface_id = p_surface_id, period = tstzrange(p_start, v_end, '[)') where id = b.id;
  exception when exclusion_violation then
    raise exception 'SLOT_TAKEN' using errcode = 'P0001';
  end;
  perform floodlight_private.add_event(b.id, 'rescheduled', b.status, b.status, jsonb_build_object(
    'from_surface', b.surface_id, 'from_start', lower(b.period), 'to_surface', p_surface_id, 'to_start', p_start));
  if v_is_staff then
    perform floodlight_private.audit('booking.rescheduled', 'booking', b.id::text, b.facility_id, jsonb_build_object('reference', b.reference));
  end if;
  if b.status = 'confirmed' then
    perform floodlight_private.revoke_credentials(b.id, 'rescheduled');
    perform floodlight_private.on_booking_confirmed(b.id);
  end if;
  perform floodlight_private.notify(b.customer_id, b.id, 'booking.rescheduled', 'Booking moved',
    'Booking ' || b.reference || ' has a new time.', b.organizer_email);
  return jsonb_build_object('status', b.status);
end $$;

-- Offline payment recorded by a facility admin. Requires an offline-capable
-- payment mode; never available while payment is unconfigured.
create or replace function floodlight.record_offline_payment(
  p_booking_id uuid, p_amount_kobo bigint, p_method text, p_receipt_number text, p_note text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare b floodlight.bookings; v_mode floodlight.payment_mode; v_txn uuid; v_paid bigint;
begin
  perform floodlight_private.require_auth();
  select * into b from floodlight.bookings where id = p_booking_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if not floodlight_private.has_facility_role(b.facility_id, array['facility_admin']::floodlight.staff_role[]) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  select payment_mode into v_mode from floodlight.booking_policies where facility_id = b.facility_id;
  if v_mode not in ('offline', 'hybrid', 'deposit') then raise exception 'OFFLINE_PAYMENT_NOT_ENABLED' using errcode = 'P0001'; end if;
  if b.status not in ('pending', 'confirmed') or b.payment_status not in ('pending', 'failed') then
    raise exception 'PAYMENT_NOT_DUE' using errcode = 'P0001';
  end if;
  if p_amount_kobo is null or p_amount_kobo <= 0 then raise exception 'INVALID_AMOUNT' using errcode = 'P0001'; end if;
  if nullif(btrim(p_receipt_number), '') is null then raise exception 'RECEIPT_NUMBER_REQUIRED' using errcode = 'P0001'; end if;

  insert into floodlight.payment_transactions (booking_id, provider, status, amount_kobo, method, receipt_number, note,
                                           recorded_by, verified_by, verified_at)
  values (b.id, 'offline', 'succeeded', p_amount_kobo, nullif(btrim(p_method), ''), btrim(p_receipt_number),
          nullif(btrim(p_note), ''), auth.uid(), auth.uid(), now())
  returning id into v_txn;
  select coalesce(sum(amount_kobo), 0) into v_paid from floodlight.payment_transactions
  where booking_id = b.id and status = 'succeeded';
  if v_paid >= coalesce(b.amount_due_kobo, 0) then
    update floodlight.bookings set payment_status = 'paid' where id = b.id;
  end if;
  perform floodlight_private.add_event(b.id, 'payment_recorded', b.status, b.status,
    jsonb_build_object('transaction', v_txn, 'amount_kobo', p_amount_kobo, 'provider', 'offline'));
  perform floodlight_private.audit('payment.offline_recorded', 'booking', b.id::text, b.facility_id,
    jsonb_build_object('reference', b.reference, 'amount_kobo', p_amount_kobo, 'receipt_number', p_receipt_number));
  return jsonb_build_object('transaction_id', v_txn, 'status', floodlight_private.confirm_if_ready(b.id),
                            'paid_total_kobo', v_paid);
end $$;

-- Online payment start (customer). Refuses unless online collection is
-- switched on platform-wide AND the facility uses an online-capable mode.
create or replace function floodlight.start_online_payment(p_booking_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare b floodlight.bookings; v_mode floodlight.payment_mode; v_ref text; v_email text;
begin
  perform floodlight_private.require_auth();
  select * into b from floodlight.bookings where id = p_booking_id and customer_id = auth.uid() for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if not coalesce((select online_payments_enabled from floodlight.platform_settings where id = 1), false) then
    raise exception 'ONLINE_PAYMENTS_DISABLED' using errcode = 'P0001';
  end if;
  select payment_mode into v_mode from floodlight.booking_policies where facility_id = b.facility_id;
  if v_mode not in ('online', 'hybrid', 'deposit') then raise exception 'ONLINE_PAYMENTS_DISABLED' using errcode = 'P0001'; end if;
  if b.status <> 'pending' or b.payment_status not in ('pending', 'failed') or b.amount_due_kobo is null then
    raise exception 'PAYMENT_NOT_DUE' using errcode = 'P0001';
  end if;
  v_ref := 'FLP-' || floodlight_private.random_code(12);
  insert into floodlight.payment_transactions (booking_id, provider, status, amount_kobo, provider_reference)
  values (b.id, 'paystack', 'initiated', b.amount_due_kobo, v_ref);
  select coalesce(b.organizer_email, u.email) into v_email from auth.users u where u.id = auth.uid();
  return jsonb_build_object('reference', v_ref, 'amount_kobo', b.amount_due_kobo, 'email', v_email);
end $$;

-- Applies a payment the SERVER has verified with the provider (signature +
-- verify API). Service role only. Idempotent on (provider, event_id).
create or replace function floodlight.apply_verified_payment(
  p_provider text, p_event_id text, p_reference text, p_amount_kobo bigint, p_currency text,
  p_success boolean, p_payload jsonb
) returns text
language plpgsql security definer set search_path = '' as $$
declare t floodlight.payment_transactions; b floodlight.bookings; v_inserted bigint;
begin
  insert into floodlight.payment_webhook_events (provider, event_id, event_type, payload)
  values (p_provider, p_event_id, case when p_success then 'success' else 'failure' end, coalesce(p_payload, '{}'))
  on conflict (provider, event_id) do nothing
  returning id into v_inserted;
  if v_inserted is null then return 'duplicate'; end if;

  select * into t from floodlight.payment_transactions where provider = p_provider and provider_reference = p_reference for update;
  if not found then
    update floodlight.payment_webhook_events set processed_at = now(), result = 'unknown_reference' where id = v_inserted;
    return 'unknown_reference';
  end if;
  if t.status = 'succeeded' then
    update floodlight.payment_webhook_events set processed_at = now(), result = 'already_applied' where id = v_inserted;
    return 'already_applied';
  end if;
  if p_success and (p_amount_kobo <> t.amount_kobo or upper(p_currency) <> t.currency) then
    update floodlight.payment_transactions set status = 'failed', raw = p_payload where id = t.id;
    update floodlight.payment_webhook_events set processed_at = now(), result = 'amount_mismatch' where id = v_inserted;
    return 'amount_mismatch';
  end if;

  select * into b from floodlight.bookings where id = t.booking_id for update;
  if p_success then
    update floodlight.payment_transactions set status = 'succeeded', verified_at = now(), raw = p_payload where id = t.id;
    update floodlight.bookings set payment_status = 'paid' where id = b.id and payment_status in ('pending', 'failed');
    insert into floodlight.booking_events (booking_id, actor_id, event, from_status, to_status, details)
    values (b.id, null, 'payment_verified', b.status, b.status, jsonb_build_object('transaction', t.id, 'provider', p_provider));
    perform floodlight_private.confirm_if_ready(b.id);
  else
    update floodlight.payment_transactions set status = 'failed', raw = p_payload where id = t.id;
    update floodlight.bookings set payment_status = 'failed' where id = b.id and payment_status = 'pending';
  end if;
  update floodlight.payment_webhook_events set processed_at = now(), result = case when p_success then 'applied' else 'failed' end
  where id = v_inserted;
  return case when p_success then 'applied' else 'failed' end;
end $$;

-- Match / activity events recorded by staff (the only source of LIVE / FULL TIME).
create or replace function floodlight.record_activity_event(
  p_booking_id uuid, p_event text, p_home_score smallint default null, p_away_score smallint default null,
  p_note text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare b floodlight.bookings; a floodlight.activities;
begin
  perform floodlight_private.require_auth();
  select * into b from floodlight.bookings where id = p_booking_id;
  if not found or not floodlight_private.has_facility_role(b.facility_id, array['facility_admin','scheduler','gatekeeper']::floodlight.staff_role[]) then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if b.status not in ('confirmed', 'checked_in', 'completed') then raise exception 'BOOKING_NOT_CONFIRMED' using errcode = 'P0001'; end if;
  select * into a from floodlight.activities where booking_id = b.id for update;
  if p_event = 'start' then
    if a.status <> 'scheduled' and a.status <> 'postponed' then raise exception 'INVALID_TRANSITION' using errcode = 'P0001'; end if;
    update floodlight.activities set status = 'in_progress', started_at = now(), updated_by = auth.uid(), updated_at = now() where booking_id = b.id;
  elsif p_event = 'finish' then
    if a.status <> 'in_progress' then raise exception 'INVALID_TRANSITION' using errcode = 'P0001'; end if;
    update floodlight.activities set status = 'completed', ended_at = now(), home_score = coalesce(p_home_score, home_score),
      away_score = coalesce(p_away_score, away_score), result_note = coalesce(nullif(btrim(p_note), ''), result_note),
      updated_by = auth.uid(), updated_at = now() where booking_id = b.id;
  elsif p_event = 'score' then
    if a.status not in ('in_progress', 'completed') then raise exception 'INVALID_TRANSITION' using errcode = 'P0001'; end if;
    update floodlight.activities set home_score = p_home_score, away_score = p_away_score, updated_by = auth.uid(), updated_at = now()
    where booking_id = b.id;
  elsif p_event = 'postpone' then
    if a.status not in ('scheduled', 'in_progress') then raise exception 'INVALID_TRANSITION' using errcode = 'P0001'; end if;
    update floodlight.activities set status = 'postponed', result_note = nullif(btrim(p_note), ''), updated_by = auth.uid(), updated_at = now()
    where booking_id = b.id;
  else
    raise exception 'INVALID_EVENT' using errcode = 'P0001';
  end if;
  perform floodlight_private.add_event(b.id, 'activity.' || p_event, b.status, b.status,
    jsonb_build_object('home', p_home_score, 'away', p_away_score));
  select * into a from floodlight.activities where booking_id = b.id;
  return to_jsonb(a);
end $$;

-- Public schedule: confirmed activities whose organizer opted in to listing.
create or replace function floodlight.public_schedule(p_from timestamptz, p_to timestamptz)
returns table (
  booking_id uuid, facility_name text, facility_slug text, surface_name text, sport text,
  starts_at timestamptz, ends_at timestamptz, activity_type floodlight.activity_type, activity_title text,
  team_name text, opponent_name text, activity_status floodlight.activity_status,
  home_score smallint, away_score smallint, started_at timestamptz, ended_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select k.id, f.name, f.slug, s.name, c.name, lower(k.period), upper(k.period), k.activity_type, k.activity_title,
         k.team_name, k.opponent_name, a.status, a.home_score, a.away_score, a.started_at, a.ended_at
  from floodlight.bookings k
  join floodlight.facilities f on f.id = k.facility_id
  join floodlight.playing_surfaces s on s.id = k.surface_id
  join floodlight.sport_categories c on c.id = f.sport_category_id
  left join floodlight.activities a on a.booking_id = k.id
  where k.public_listing and f.is_active and f.show_on_public_schedule
    and k.status in ('confirmed', 'checked_in', 'completed')
    and k.period && tstzrange(p_from, p_to)
    and p_to - p_from <= interval '62 days'
  order by lower(k.period)
  limit 300;
$$;

-- Housekeeping: run by pg_cron every few minutes (scheduled in a later
-- migration when the extension is available) and safe to run by hand.
create or replace function floodlight_private.run_booking_housekeeping() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_expired int; v_holds int; v_completed int;
begin
  with x as (update floodlight.bookings set status = 'expired'
             where status = 'held' and hold_expires_at <= now() returning id)
  select count(*) into v_holds from x;
  with x as (update floodlight.bookings set status = 'expired'
             where status = 'pending' and lower(period) <= now() returning id, reference)
  select count(*) into v_expired from x;
  with x as (update floodlight.bookings set status = 'completed'
             where status in ('confirmed', 'checked_in') and upper(period) <= now() returning id)
  select count(*) into v_completed from x;
  return jsonb_build_object('expired_holds', v_holds, 'expired_requests', v_expired, 'completed', v_completed);
end $$;
