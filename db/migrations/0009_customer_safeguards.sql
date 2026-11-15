-- EKSU Floodlight 0009 — safeguards for public customer self-registration.
--
-- Shared-project rules still apply: only floodlight / floodlight_private
-- objects are created or changed; nothing in public, private, auth, storage
-- or realtime.
--
-- 1. Verified email before booking. Supabase Auth (with "Confirm email" on)
--    gives no session until the address is confirmed; this is the database-
--    level backstop: no booking row can be created for, or by, an account
--    whose email is unconfirmed — whatever client calls the API.
-- 2. Anti-abuse: per-account cap on booking requests per hour (counts every
--    insert, including ones later cancelled) and on upcoming active bookings
--    across all facilities. Both are platform settings (owner-editable);
--    the defaults are technical guard rails, not EKSU booking policy.
--    Facility-level ACTIVE_BOOKING_LIMIT (0003) still applies on top.
-- 3. Roles: unchanged and enforced elsewhere — a new account gets only a
--    Floodlight customer profile (ensure_profile); platform owners come only
--    from bootstrap_platform_owner (database owner), staff only from an
--    invitation addressed to that verified email.

alter table floodlight.platform_settings
  add column if not exists max_booking_requests_per_hour smallint not null default 10
    check (max_booking_requests_per_hour between 1 and 200),
  add column if not exists max_upcoming_bookings_per_customer smallint not null default 6
    check (max_upcoming_bookings_per_customer between 1 and 200);

create or replace function floodlight_private.booking_account_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_rate int; v_upcoming int; v_n int;
begin
  -- 1. Every account that creates or owns a booking must have a confirmed email.
  if new.created_by is not null and not exists (
       select 1 from auth.users u where u.id = new.created_by and u.email_confirmed_at is not null) then
    raise exception 'EMAIL_NOT_VERIFIED' using errcode = 'P0001';
  end if;
  if new.customer_id is not null and new.customer_id is distinct from new.created_by and not exists (
       select 1 from auth.users u where u.id = new.customer_id and u.email_confirmed_at is not null) then
    raise exception 'EMAIL_NOT_VERIFIED' using errcode = 'P0001';
  end if;

  -- 2. Self-service (customer) bookings are rate limited per account.
  if new.source = 'customer' and new.created_by is not null then
    -- serialise this account's concurrent requests so the counts are exact
    perform pg_advisory_xact_lock(hashtextextended('floodlight.booking_account_guard:' || new.created_by::text, 0));
    select coalesce(s.max_booking_requests_per_hour, 10), coalesce(s.max_upcoming_bookings_per_customer, 6)
      into v_rate, v_upcoming from floodlight.platform_settings s where s.id = 1;
    v_rate := coalesce(v_rate, 10); v_upcoming := coalesce(v_upcoming, 6);

    select count(*) into v_n from floodlight.bookings b
     where b.created_by = new.created_by and b.source = 'customer' and b.created_at > now() - interval '1 hour';
    if v_n >= v_rate then raise exception 'BOOKING_RATE_LIMITED' using errcode = 'P0001'; end if;

    select count(*) into v_n from floodlight.bookings b
     where b.created_by = new.created_by and b.source = 'customer'
       and b.status in ('held', 'pending', 'confirmed') and upper(b.period) > now();
    if v_n >= v_upcoming then raise exception 'UPCOMING_BOOKING_LIMIT' using errcode = 'P0001'; end if;
  end if;
  return new;
end $$;
revoke all on function floodlight_private.booking_account_guard() from public, anon, authenticated, service_role;

drop trigger if exists bookings_account_guard on floodlight.bookings;
create trigger bookings_account_guard before insert on floodlight.bookings
  for each row execute function floodlight_private.booking_account_guard();

-- Lets the app tell a signed-in user (only about themselves) whether their
-- email is confirmed, without exposing auth.users.
create or replace function floodlight.my_account_status() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('email_verified', u.email_confirmed_at is not null)
  from auth.users u where u.id = auth.uid()
$$;
revoke all on function floodlight.my_account_status() from public, anon;
grant execute on function floodlight.my_account_status() to authenticated;
