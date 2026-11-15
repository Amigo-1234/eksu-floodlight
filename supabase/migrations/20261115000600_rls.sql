-- EKSU Floodlight — row level security and privileges.
--
-- Supabase grants broad default privileges to anon/authenticated on new
-- objects in `public`. We revoke them and grant back only what each role
-- needs. Anything not granted below is reached only through the SECURITY
-- DEFINER functions defined in earlier migrations.

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;

-- Read access (rows are further limited by RLS policies below).
grant select on public.platform_settings, public.sport_categories, public.facilities, public.playing_surfaces,
  public.facility_images, public.operating_hours, public.booking_policies, public.facility_prices
  to anon, authenticated;
grant select on public.profiles, public.platform_owners, public.staff_memberships, public.audit_log,
  public.facility_blocks, public.bookings, public.booking_events, public.booking_participants,
  public.receipts, public.activities, public.payment_transactions, public.refunds,
  public.notifications, public.access_credentials, public.check_ins, public.access_verification_logs,
  public.staff_invitations
  to authenticated;

-- Direct writes allowed only where RLS fully describes the rule.
grant update (full_name, phone) on public.profiles to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant update (support_email, support_phone, live_gate_admission, online_payments_enabled, require_staff_mfa,
              product_name, product_tagline)
  on public.platform_settings to authenticated;
grant insert, update, delete on public.sport_categories to authenticated;
grant update (name, description, location_label, sport_category_id, cover_image_path, rules, eligibility_note,
              entry_instructions, timezone, is_active, show_on_public_schedule)
  on public.facilities to authenticated;
grant insert, update, delete on public.playing_surfaces, public.facility_images, public.operating_hours,
  public.facility_prices to authenticated;
grant update (slot_minutes, gap_minutes, min_notice_minutes, max_advance_days, max_active_bookings_per_user,
              approval_mode, payment_mode, access_mode, entry_opens_minutes_before, entry_closes_minutes_after_start,
              customer_cancellation, cancellation_cutoff_hours, customer_reschedule_allowed, reschedule_cutoff_hours,
              updated_by)
  on public.booking_policies to authenticated;

-- Functions callable from the app (each checks the caller itself).
grant execute on function
  public.facility_availability(uuid, date),
  public.facility_booking_readiness(uuid),
  public.public_schedule(timestamptz, timestamptz)
  to anon, authenticated;
grant execute on function
  public.my_roles(),
  public.create_booking(uuid, timestamptz, text, text, text, public.activity_type, text, text, text, text, text, boolean, text),
  public.staff_create_booking(uuid, timestamptz, public.booking_source, text, text, text, public.activity_type, text, text, text, text, text, boolean, boolean, text, text),
  public.review_booking(uuid, text, text, boolean),
  public.cancel_booking(uuid, text),
  public.reschedule_booking(uuid, uuid, timestamptz),
  public.record_offline_payment(uuid, bigint, text, text, text),
  public.start_online_payment(uuid),
  public.record_activity_event(uuid, text, smallint, smallint, text),
  public.my_pass_token(uuid),
  public.gate_scan(uuid, text, boolean, text, text),
  public.gate_lookup(uuid, text),
  public.gate_manual_check_in(uuid, uuid, text, text, text),
  public.gate_today(uuid),
  public.invite_staff(text, text, uuid),
  public.accept_staff_invitation(text),
  public.revoke_staff_invitation(uuid),
  public.revoke_staff_membership(uuid),
  public.revoke_platform_owner(uuid),
  public.staff_directory(uuid),
  public.create_facility_block(uuid, uuid, timestamptz, timestamptz, public.block_kind, text),
  public.cancel_facility_block(uuid),
  public.create_facility(text, uuid, text, text),
  public.admin_overview(uuid),
  public.admin_report(uuid, date, date)
  to authenticated;
-- Payment verification is applied only by the server (service role) after it
-- has checked the provider signature and re-verified the transaction.
grant execute on function public.apply_verified_payment(text, text, text, bigint, text, boolean, jsonb) to service_role;

-- Helpers referenced inside RLS policies must be executable by the API roles.
grant execute on function private.is_platform_owner(), private.has_facility_role(uuid, public.staff_role[]),
  private.staff_mfa_ok(), private.is_any_staff() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------
alter table public.platform_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.platform_owners enable row level security;
alter table public.staff_memberships enable row level security;
alter table public.audit_log enable row level security;
alter table public.sport_categories enable row level security;
alter table public.facilities enable row level security;
alter table public.playing_surfaces enable row level security;
alter table public.facility_images enable row level security;
alter table public.operating_hours enable row level security;
alter table public.booking_policies enable row level security;
alter table public.facility_prices enable row level security;
alter table public.facility_blocks enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_events enable row level security;
alter table public.booking_participants enable row level security;
alter table public.receipts enable row level security;
alter table public.activities enable row level security;
alter table public.payment_transactions enable row level security;
alter table public.payment_webhook_events enable row level security;
alter table public.refunds enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_outbox enable row level security;
alter table public.access_credentials enable row level security;
alter table public.check_ins enable row level security;
alter table public.access_verification_logs enable row level security;
alter table public.staff_invitations enable row level security;

-- Platform settings: anyone may read (no secrets live here); owners update.
create policy settings_read on public.platform_settings for select using (true);
create policy settings_owner_update on public.platform_settings for update
  using (private.is_platform_owner()) with check (private.is_platform_owner());

-- Profiles: self, or owners.
create policy profiles_self_read on public.profiles for select using (id = auth.uid() or private.is_platform_owner());
create policy profiles_self_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy owners_read on public.platform_owners for select
  using (user_id = auth.uid() or private.is_platform_owner());

create policy memberships_read on public.staff_memberships for select
  using (user_id = auth.uid() or private.has_facility_role(facility_id, array['facility_admin']::public.staff_role[]));

create policy audit_read on public.audit_log for select
  using (private.is_platform_owner()
         or (facility_id is not null and private.has_facility_role(facility_id, array['facility_admin']::public.staff_role[])));

-- Catalogue: public read; owners manage categories.
create policy categories_read on public.sport_categories for select using (true);
create policy categories_owner_write on public.sport_categories for all
  using (private.is_platform_owner()) with check (private.is_platform_owner());

-- Facilities: active ones are public; staff of a facility also see it while inactive.
create policy facilities_read on public.facilities for select
  using (is_active or private.has_facility_role(id, array['facility_admin','scheduler','gatekeeper']::public.staff_role[]));
create policy facilities_admin_update on public.facilities for update
  using (private.has_facility_role(id, array['facility_admin']::public.staff_role[]))
  with check (private.has_facility_role(id, array['facility_admin']::public.staff_role[]));

-- Child tables follow their facility.
create policy surfaces_read on public.playing_surfaces for select
  using (exists (select 1 from public.facilities f where f.id = facility_id));
create policy surfaces_admin_write on public.playing_surfaces for all
  using (private.has_facility_role(facility_id, array['facility_admin']::public.staff_role[]))
  with check (private.has_facility_role(facility_id, array['facility_admin']::public.staff_role[]));

create policy images_read on public.facility_images for select
  using (exists (select 1 from public.facilities f where f.id = facility_id));
create policy images_admin_write on public.facility_images for all
  using (private.has_facility_role(facility_id, array['facility_admin']::public.staff_role[]))
  with check (private.has_facility_role(facility_id, array['facility_admin']::public.staff_role[]));

create policy hours_read on public.operating_hours for select
  using (exists (select 1 from public.facilities f where f.id = facility_id));
create policy hours_admin_write on public.operating_hours for all
  using (private.has_facility_role(facility_id, array['facility_admin']::public.staff_role[]))
  with check (private.has_facility_role(facility_id, array['facility_admin']::public.staff_role[]));

create policy policies_read on public.booking_policies for select
  using (exists (select 1 from public.facilities f where f.id = facility_id));
create policy policies_admin_update on public.booking_policies for update
  using (private.has_facility_role(facility_id, array['facility_admin']::public.staff_role[]))
  with check (private.has_facility_role(facility_id, array['facility_admin']::public.staff_role[]));

create policy prices_read on public.facility_prices for select
  using (is_active and exists (select 1 from public.facilities f where f.id = facility_id)
         or private.has_facility_role(facility_id, array['facility_admin']::public.staff_role[]));
create policy prices_admin_write on public.facility_prices for all
  using (private.has_facility_role(facility_id, array['facility_admin']::public.staff_role[]))
  with check (private.has_facility_role(facility_id, array['facility_admin']::public.staff_role[]));

create policy blocks_staff_read on public.facility_blocks for select
  using (private.has_facility_role(facility_id, array['facility_admin','scheduler','gatekeeper']::public.staff_role[]));

-- Bookings: the owner, or admins/schedulers of the facility. Gatekeepers have
-- no direct read access; they go through the gate_* functions, which return
-- a reduced view.
create policy bookings_read on public.bookings for select
  using (customer_id = auth.uid()
         or private.has_facility_role(facility_id, array['facility_admin','scheduler']::public.staff_role[]));

create policy booking_events_read on public.booking_events for select
  using (exists (select 1 from public.bookings k where k.id = booking_id));
create policy participants_read on public.booking_participants for select
  using (exists (select 1 from public.bookings k where k.id = booking_id));
create policy receipts_read on public.receipts for select
  using (exists (select 1 from public.bookings k where k.id = booking_id));
create policy activities_read on public.activities for select
  using (exists (select 1 from public.bookings k where k.id = booking_id));
create policy payments_read on public.payment_transactions for select
  using (exists (select 1 from public.bookings k where k.id = booking_id));
create policy refunds_read on public.refunds for select
  using (exists (select 1 from public.bookings k where k.id = booking_id));
create policy credentials_read on public.access_credentials for select
  using (exists (select 1 from public.bookings k where k.id = booking_id));
-- (payment_webhook_events, notification_outbox: no policies => no API access.)

create policy notifications_own on public.notifications for select using (user_id = auth.uid());
create policy notifications_mark_read on public.notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy check_ins_read on public.check_ins for select
  using (private.has_facility_role(facility_id, array['facility_admin','gatekeeper']::public.staff_role[]));
create policy verification_logs_read on public.access_verification_logs for select
  using (private.has_facility_role(facility_id, array['facility_admin','gatekeeper']::public.staff_role[]));

create policy invitations_read on public.staff_invitations for select
  using (private.is_platform_owner()
         or (facility_id is not null and private.has_facility_role(facility_id, array['facility_admin']::public.staff_role[])));

-- ---------------------------------------------------------------------------
-- Housekeeping schedule (only where pg_cron is available, e.g. on Supabase).
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('floodlight-housekeeping', '*/5 * * * *', 'select private.run_booking_housekeeping()');
  end if;
exception when others then
  raise notice 'pg_cron not scheduled: %', sqlerrm;
end $$;
