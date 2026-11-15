-- EKSU Floodlight — row level security and privileges.
--
-- Every revoke/grant below is limited to the floodlight and
-- floodlight_private schemas. Nothing in public, private, auth or storage is
-- touched. Anything not granted below is reached only through the SECURITY
-- DEFINER functions defined in earlier migrations.

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on all tables in schema floodlight from anon, authenticated;
revoke all on all sequences in schema floodlight from anon, authenticated;
revoke execute on all functions in schema floodlight from public, anon, authenticated;
revoke execute on all functions in schema floodlight_private from public, anon, authenticated;

-- Read access (rows are further limited by RLS policies below).
grant select on floodlight.platform_settings, floodlight.sport_categories, floodlight.facilities, floodlight.playing_surfaces,
  floodlight.facility_images, floodlight.operating_hours, floodlight.booking_policies, floodlight.facility_prices
  to anon, authenticated;
grant select on floodlight.profiles, floodlight.platform_owners, floodlight.staff_memberships, floodlight.audit_log,
  floodlight.facility_blocks, floodlight.bookings, floodlight.booking_events, floodlight.booking_participants,
  floodlight.receipts, floodlight.activities, floodlight.payment_transactions, floodlight.refunds,
  floodlight.notifications, floodlight.access_credentials, floodlight.check_ins, floodlight.access_verification_logs,
  floodlight.staff_invitations
  to authenticated;

-- Direct writes allowed only where RLS fully describes the rule.
grant update (full_name, phone) on floodlight.profiles to authenticated;
grant update (read_at) on floodlight.notifications to authenticated;
grant update (support_email, support_phone, live_gate_admission, online_payments_enabled, require_staff_mfa,
              product_name, product_tagline)
  on floodlight.platform_settings to authenticated;
grant insert, update, delete on floodlight.sport_categories to authenticated;
grant update (name, description, location_label, sport_category_id, cover_image_path, rules, eligibility_note,
              entry_instructions, timezone, is_active, show_on_public_schedule)
  on floodlight.facilities to authenticated;
grant insert, update, delete on floodlight.playing_surfaces, floodlight.facility_images, floodlight.operating_hours,
  floodlight.facility_prices to authenticated;
grant update (slot_minutes, gap_minutes, min_notice_minutes, max_advance_days, max_active_bookings_per_user,
              approval_mode, payment_mode, access_mode, entry_opens_minutes_before, entry_closes_minutes_after_start,
              customer_cancellation, cancellation_cutoff_hours, customer_reschedule_allowed, reschedule_cutoff_hours,
              updated_by)
  on floodlight.booking_policies to authenticated;

-- Functions callable from the app (each checks the caller itself).
grant execute on function
  floodlight.facility_availability(uuid, date),
  floodlight.facility_booking_readiness(uuid),
  floodlight.public_schedule(timestamptz, timestamptz)
  to anon, authenticated;
grant execute on function
  floodlight.ensure_profile(),
  floodlight.my_roles(),
  floodlight.create_booking(uuid, timestamptz, text, text, text, floodlight.activity_type, text, text, text, text, text, boolean, text),
  floodlight.staff_create_booking(uuid, timestamptz, floodlight.booking_source, text, text, text, floodlight.activity_type, text, text, text, text, text, boolean, boolean, text, text),
  floodlight.review_booking(uuid, text, text, boolean),
  floodlight.cancel_booking(uuid, text),
  floodlight.reschedule_booking(uuid, uuid, timestamptz),
  floodlight.record_offline_payment(uuid, bigint, text, text, text),
  floodlight.start_online_payment(uuid),
  floodlight.record_activity_event(uuid, text, smallint, smallint, text),
  floodlight.my_pass_token(uuid),
  floodlight.gate_scan(uuid, text, boolean, text, text),
  floodlight.gate_lookup(uuid, text),
  floodlight.gate_manual_check_in(uuid, uuid, text, text, text),
  floodlight.gate_today(uuid),
  floodlight.invite_staff(text, text, uuid),
  floodlight.accept_staff_invitation(text),
  floodlight.revoke_staff_invitation(uuid),
  floodlight.revoke_staff_membership(uuid),
  floodlight.revoke_platform_owner(uuid),
  floodlight.staff_directory(uuid),
  floodlight.create_facility_block(uuid, uuid, timestamptz, timestamptz, floodlight.block_kind, text),
  floodlight.cancel_facility_block(uuid),
  floodlight.create_facility(text, uuid, text, text),
  floodlight.admin_overview(uuid),
  floodlight.admin_report(uuid, date, date)
  to authenticated;
-- Payment verification is applied only by the server (service role) after it
-- has checked the provider signature and re-verified the transaction.
grant execute on function floodlight.apply_verified_payment(text, text, text, bigint, text, boolean, jsonb) to service_role;

-- Helpers referenced inside RLS policies must be executable by the API roles.
grant execute on function floodlight_private.is_platform_owner(), floodlight_private.has_facility_role(uuid, floodlight.staff_role[]),
  floodlight_private.staff_mfa_ok(), floodlight_private.is_any_staff() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------
alter table floodlight.platform_settings enable row level security;
alter table floodlight.profiles enable row level security;
alter table floodlight.platform_owners enable row level security;
alter table floodlight.staff_memberships enable row level security;
alter table floodlight.audit_log enable row level security;
alter table floodlight.sport_categories enable row level security;
alter table floodlight.facilities enable row level security;
alter table floodlight.playing_surfaces enable row level security;
alter table floodlight.facility_images enable row level security;
alter table floodlight.operating_hours enable row level security;
alter table floodlight.booking_policies enable row level security;
alter table floodlight.facility_prices enable row level security;
alter table floodlight.facility_blocks enable row level security;
alter table floodlight.bookings enable row level security;
alter table floodlight.booking_events enable row level security;
alter table floodlight.booking_participants enable row level security;
alter table floodlight.receipts enable row level security;
alter table floodlight.activities enable row level security;
alter table floodlight.payment_transactions enable row level security;
alter table floodlight.payment_webhook_events enable row level security;
alter table floodlight.refunds enable row level security;
alter table floodlight.notifications enable row level security;
alter table floodlight.notification_outbox enable row level security;
alter table floodlight.access_credentials enable row level security;
alter table floodlight.check_ins enable row level security;
alter table floodlight.access_verification_logs enable row level security;
alter table floodlight.staff_invitations enable row level security;

-- Platform settings: anyone may read (no secrets live here); owners update.
create policy settings_read on floodlight.platform_settings for select using (true);
create policy settings_owner_update on floodlight.platform_settings for update
  using (floodlight_private.is_platform_owner()) with check (floodlight_private.is_platform_owner());

-- Profiles: self, or owners.
create policy profiles_self_read on floodlight.profiles for select using (id = auth.uid() or floodlight_private.is_platform_owner());
create policy profiles_self_update on floodlight.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy owners_read on floodlight.platform_owners for select
  using (user_id = auth.uid() or floodlight_private.is_platform_owner());

create policy memberships_read on floodlight.staff_memberships for select
  using (user_id = auth.uid() or floodlight_private.has_facility_role(facility_id, array['facility_admin']::floodlight.staff_role[]));

create policy audit_read on floodlight.audit_log for select
  using (floodlight_private.is_platform_owner()
         or (facility_id is not null and floodlight_private.has_facility_role(facility_id, array['facility_admin']::floodlight.staff_role[])));

-- Catalogue: public read; owners manage categories.
create policy categories_read on floodlight.sport_categories for select using (true);
create policy categories_owner_write on floodlight.sport_categories for all
  using (floodlight_private.is_platform_owner()) with check (floodlight_private.is_platform_owner());

-- Facilities: active ones are public; staff of a facility also see it while inactive.
create policy facilities_read on floodlight.facilities for select
  using (is_active or floodlight_private.has_facility_role(id, array['facility_admin','scheduler','gatekeeper']::floodlight.staff_role[]));
create policy facilities_admin_update on floodlight.facilities for update
  using (floodlight_private.has_facility_role(id, array['facility_admin']::floodlight.staff_role[]))
  with check (floodlight_private.has_facility_role(id, array['facility_admin']::floodlight.staff_role[]));

-- Child tables follow their facility.
create policy surfaces_read on floodlight.playing_surfaces for select
  using (exists (select 1 from floodlight.facilities f where f.id = facility_id));
create policy surfaces_admin_write on floodlight.playing_surfaces for all
  using (floodlight_private.has_facility_role(facility_id, array['facility_admin']::floodlight.staff_role[]))
  with check (floodlight_private.has_facility_role(facility_id, array['facility_admin']::floodlight.staff_role[]));

create policy images_read on floodlight.facility_images for select
  using (exists (select 1 from floodlight.facilities f where f.id = facility_id));
create policy images_admin_write on floodlight.facility_images for all
  using (floodlight_private.has_facility_role(facility_id, array['facility_admin']::floodlight.staff_role[]))
  with check (floodlight_private.has_facility_role(facility_id, array['facility_admin']::floodlight.staff_role[]));

create policy hours_read on floodlight.operating_hours for select
  using (exists (select 1 from floodlight.facilities f where f.id = facility_id));
create policy hours_admin_write on floodlight.operating_hours for all
  using (floodlight_private.has_facility_role(facility_id, array['facility_admin']::floodlight.staff_role[]))
  with check (floodlight_private.has_facility_role(facility_id, array['facility_admin']::floodlight.staff_role[]));

create policy policies_read on floodlight.booking_policies for select
  using (exists (select 1 from floodlight.facilities f where f.id = facility_id));
create policy policies_admin_update on floodlight.booking_policies for update
  using (floodlight_private.has_facility_role(facility_id, array['facility_admin']::floodlight.staff_role[]))
  with check (floodlight_private.has_facility_role(facility_id, array['facility_admin']::floodlight.staff_role[]));

create policy prices_read on floodlight.facility_prices for select
  using (is_active and exists (select 1 from floodlight.facilities f where f.id = facility_id)
         or floodlight_private.has_facility_role(facility_id, array['facility_admin']::floodlight.staff_role[]));
create policy prices_admin_write on floodlight.facility_prices for all
  using (floodlight_private.has_facility_role(facility_id, array['facility_admin']::floodlight.staff_role[]))
  with check (floodlight_private.has_facility_role(facility_id, array['facility_admin']::floodlight.staff_role[]));

create policy blocks_staff_read on floodlight.facility_blocks for select
  using (floodlight_private.has_facility_role(facility_id, array['facility_admin','scheduler','gatekeeper']::floodlight.staff_role[]));

-- Bookings: the owner, or admins/schedulers of the facility. Gatekeepers have
-- no direct read access; they go through the gate_* functions, which return
-- a reduced view.
create policy bookings_read on floodlight.bookings for select
  using (customer_id = auth.uid()
         or floodlight_private.has_facility_role(facility_id, array['facility_admin','scheduler']::floodlight.staff_role[]));

create policy booking_events_read on floodlight.booking_events for select
  using (exists (select 1 from floodlight.bookings k where k.id = booking_id));
create policy participants_read on floodlight.booking_participants for select
  using (exists (select 1 from floodlight.bookings k where k.id = booking_id));
create policy receipts_read on floodlight.receipts for select
  using (exists (select 1 from floodlight.bookings k where k.id = booking_id));
create policy activities_read on floodlight.activities for select
  using (exists (select 1 from floodlight.bookings k where k.id = booking_id));
create policy payments_read on floodlight.payment_transactions for select
  using (exists (select 1 from floodlight.bookings k where k.id = booking_id));
create policy refunds_read on floodlight.refunds for select
  using (exists (select 1 from floodlight.bookings k where k.id = booking_id));
create policy credentials_read on floodlight.access_credentials for select
  using (exists (select 1 from floodlight.bookings k where k.id = booking_id));
-- (payment_webhook_events, notification_outbox: no policies => no API access.)

create policy notifications_own on floodlight.notifications for select using (user_id = auth.uid());
create policy notifications_mark_read on floodlight.notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy check_ins_read on floodlight.check_ins for select
  using (floodlight_private.has_facility_role(facility_id, array['facility_admin','gatekeeper']::floodlight.staff_role[]));
create policy verification_logs_read on floodlight.access_verification_logs for select
  using (floodlight_private.has_facility_role(facility_id, array['facility_admin','gatekeeper']::floodlight.staff_role[]));

create policy invitations_read on floodlight.staff_invitations for select
  using (floodlight_private.is_platform_owner()
         or (facility_id is not null and floodlight_private.has_facility_role(facility_id, array['facility_admin']::floodlight.staff_role[])));

-- ---------------------------------------------------------------------------
-- Housekeeping schedule (only where pg_cron is available, e.g. on Supabase).
-- ---------------------------------------------------------------------------
do $$
begin
  -- Never installs pg_cron; only schedules if it is already present.
  -- cron.schedule(name, …) updates the job in place if it already exists.
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('floodlight-housekeeping', '*/5 * * * *', 'select floodlight_private.run_booking_housekeeping()');
  end if;
exception when others then
  raise notice 'floodlight-housekeeping not scheduled: %', sqlerrm;
end $$;
