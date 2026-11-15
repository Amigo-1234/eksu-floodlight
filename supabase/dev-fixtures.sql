-- ============================================================================
-- DEVELOPMENT FIXTURES — NOT REAL EKSU FACILITIES.
-- ============================================================================
-- Run ONLY against a development/staging database, never production:
--   psql "$DEV_DATABASE_URL" -f supabase/dev-fixtures.sql
--
-- Every row is marked is_dev_fixture = true and the UI labels it
-- "Development fixture — not a real EKSU facility". Names, hours, slot
-- lengths and prices below are arbitrary test values chosen to exercise the
-- booking engine; they are NOT proposals for EKSU policy. Remove with:
--   delete from public.facilities where is_dev_fixture;

do $$
declare v_fb uuid; v_bb uuid; c_fb uuid; c_bb uuid; d int;
begin
  if exists (select 1 from public.facilities where is_dev_fixture) then
    raise notice 'dev fixtures already present; skipping';
    return;
  end if;
  select id into c_fb from public.sport_categories where slug = 'football';
  select id into c_bb from public.sport_categories where slug = 'basketball';

  insert into public.facilities (slug, name, sport_category_id, location_label, description, rules, entry_instructions,
                                 is_active, is_dev_fixture)
  values ('dev-test-pitch', 'DEV Test Pitch', c_fb, 'Development fixture',
          'Test facility for development. Not a real EKSU facility.',
          'Test rules text.', 'Test entry instructions: show your pass at the gate.', true, true)
  returning id into v_fb;
  update public.booking_policies set slot_minutes = 60, approval_mode = 'required', payment_mode = 'unconfigured',
         max_advance_days = 14, access_mode = 'organizer_pass', entry_opens_minutes_before = 30
  where facility_id = v_fb;
  insert into public.playing_surfaces (facility_id, name) values (v_fb, 'Test Pitch A');

  insert into public.facilities (slug, name, sport_category_id, location_label, description, is_active, is_dev_fixture)
  values ('dev-test-courts', 'DEV Test Courts', c_bb, 'Development fixture',
          'Two test courts for development. Not a real EKSU facility.', true, true)
  returning id into v_bb;
  update public.booking_policies set slot_minutes = 45, gap_minutes = 15, approval_mode = 'automatic', payment_mode = 'free',
         max_advance_days = 7, access_mode = 'organizer_pass', entry_opens_minutes_before = 15
  where facility_id = v_bb;
  insert into public.playing_surfaces (facility_id, name) values (v_bb, 'Test Court 1'), (v_bb, 'Test Court 2');

  for d in 0..6 loop
    insert into public.operating_hours (facility_id, weekday, opens_at, closes_at) values (v_fb, d, '08:00', '20:00');
    insert into public.operating_hours (facility_id, weekday, opens_at, closes_at) values (v_bb, d, '09:00', '18:00');
  end loop;
end $$;
