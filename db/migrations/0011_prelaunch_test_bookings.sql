-- EKSU Floodlight 0011 — pre-launch test bookings.
--
-- While public booking is not yet open (platform_settings.public_booking_open
-- = false, the default):
--   * only authorised testers can create bookings — platform owners, active
--     staff, and accounts listed in floodlight.booking_testers. Everyone else
--     gets BOOKINGS_NOT_OPEN from the database, whatever client they use;
--   * every booking created in this period is marked is_test = true (set by
--     the server, never by the client) and is never listed on the public
--     schedule;
--   * payment status keeps its real meaning: a test booking approved with a
--     fee waiver is "waived", never "paid", and the UI labels it as a test
--     waiver. No payment provider is involved.
-- Opening public booking later is a single owner setting; bookings made after
-- that are real (is_test = false).
--
-- Touches only floodlight / floodlight_private.

alter table floodlight.platform_settings
  add column if not exists public_booking_open boolean not null default false;

alter table floodlight.bookings
  add column if not exists is_test boolean not null default false;

create table if not exists floodlight.booking_testers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  note text check (note is null or char_length(note) <= 200),
  added_by uuid references auth.users (id) on delete set null,
  added_at timestamptz not null default now()
);
alter table floodlight.booking_testers enable row level security;
revoke all on floodlight.booking_testers from public, anon, authenticated;
grant select on floodlight.booking_testers to authenticated;
drop policy if exists booking_testers_owner_read on floodlight.booking_testers;
create policy booking_testers_owner_read on floodlight.booking_testers for select to authenticated
  using (floodlight_private.is_platform_owner() or user_id = auth.uid());

create or replace function floodlight_private.is_booking_tester(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_user is not null and (
    exists (select 1 from floodlight.platform_owners o where o.user_id = p_user and o.revoked_at is null)
    or exists (select 1 from floodlight.staff_memberships m where m.user_id = p_user and m.revoked_at is null)
    or exists (select 1 from floodlight.booking_testers t where t.user_id = p_user))
$$;
revoke all on function floodlight_private.is_booking_tester(uuid) from public, anon, authenticated;

create or replace function floodlight_private.booking_launch_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce((select s.public_booking_open from floodlight.platform_settings s where s.id = 1), false) then
    new.is_test := false;
    return new;
  end if;
  if not floodlight_private.is_booking_tester(new.created_by) then
    raise exception 'BOOKINGS_NOT_OPEN' using errcode = 'P0001';
  end if;
  new.is_test := true;
  new.public_listing := false;   -- test bookings never appear on the public schedule
  return new;
end $$;
revoke all on function floodlight_private.booking_launch_guard() from public, anon, authenticated;

drop trigger if exists bookings_launch_guard on floodlight.bookings;
create trigger bookings_launch_guard before insert on floodlight.bookings
  for each row execute function floodlight_private.booking_launch_guard();

-- Lets every visitor's UI know whether reservations are open and whether the
-- signed-in caller may make (test) bookings. Reveals nothing else.
create or replace function floodlight.booking_access() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'public_open', coalesce((select s.public_booking_open from floodlight.platform_settings s where s.id = 1), false),
    'online_payments', coalesce((select s.online_payments_enabled from floodlight.platform_settings s where s.id = 1), false),
    'can_book', coalesce((select s.public_booking_open from floodlight.platform_settings s where s.id = 1), false)
                or floodlight_private.is_booking_tester(auth.uid()),
    'test_mode', not coalesce((select s.public_booking_open from floodlight.platform_settings s where s.id = 1), false))
$$;
revoke all on function floodlight.booking_access() from public;
grant execute on function floodlight.booking_access() to anon, authenticated;

-- The owner opens public booking from Admin → Settings (RLS: owner-only update).
grant update (public_booking_open) on floodlight.platform_settings to authenticated;
