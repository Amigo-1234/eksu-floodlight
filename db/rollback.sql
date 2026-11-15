-- EKSU Floodlight — full rollback for a SHARED Supabase project.
-- Removes every Floodlight database object and leaves EKSU Sports Hub as it
-- was. Run only with explicit approval; it deletes all Floodlight data.
--
-- Not removed automatically (by design):
--   * Storage objects in bucket `floodlight-facility-images`: Supabase blocks
--     SQL deletes on storage.objects. Empty the bucket from the Dashboard /
--     Storage API first, then this script removes the bucket row.
--   * The btree_gist extension: harmless, and another app may start using it.
--     Drop manually only if nothing depends on it.
--   * Auth users: shared with Sports Hub; never touched.
begin;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('floodlight-housekeeping')
    where exists (select 1 from cron.job where jobname = 'floodlight-housekeeping');
  end if;
end $$;

drop policy if exists floodlight_facility_images_insert on storage.objects;
drop policy if exists floodlight_facility_images_update on storage.objects;
drop policy if exists floodlight_facility_images_delete on storage.objects;
delete from storage.buckets
where id = 'floodlight-facility-images'
  and not exists (select 1 from storage.objects where bucket_id = 'floodlight-facility-images');

drop schema if exists floodlight cascade;
drop schema if exists floodlight_private cascade;

notify pgrst, 'reload schema';
commit;
