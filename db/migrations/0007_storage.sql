-- EKSU Floodlight — facility image storage (Supabase Storage).
-- Skipped automatically where the storage schema does not exist (local
-- PostgreSQL test runs).
--
-- Bucket `floodlight-facility-images` (public read). Upload/update/delete are
-- limited to Floodlight facility admins of the facility whose id is the first
-- path segment: <facility_id>/<file>.
--
-- SHARED-PROJECT SAFETY: storage.objects is shared with EKSU Sports Hub.
-- Every policy here is wrapped in CASE on bucket_id, so it evaluates to FALSE
-- (never errors, never grants) for any other bucket, and the path is parsed
-- with a function that returns NULL instead of failing on non-UUID names.

create or replace function floodlight_private.storage_facility_id(p_name text) returns uuid
language plpgsql immutable set search_path = '' as $$
declare v text := split_part(p_name, '/', 1);
begin
  if v ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then return v::uuid; end if;
  return null;
end $$;

create or replace function floodlight_private.can_manage_facility_object(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(floodlight_private.has_facility_role(floodlight_private.storage_facility_id(p_name),
                                                       array['facility_admin']::floodlight.staff_role[]), false);
$$;
revoke execute on function floodlight_private.storage_facility_id(text) from public;
revoke execute on function floodlight_private.can_manage_facility_object(text) from public;
grant execute on function floodlight_private.storage_facility_id(text), floodlight_private.can_manage_facility_object(text) to authenticated;

do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then
    raise notice 'storage schema not present; skipping bucket setup';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('floodlight-facility-images', 'floodlight-facility-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do nothing;

  execute 'drop policy if exists floodlight_facility_images_insert on storage.objects';
  execute 'drop policy if exists floodlight_facility_images_update on storage.objects';
  execute 'drop policy if exists floodlight_facility_images_delete on storage.objects';
  execute $p$
    create policy floodlight_facility_images_insert on storage.objects for insert to authenticated
    with check (case when bucket_id = 'floodlight-facility-images'
                     then floodlight_private.can_manage_facility_object(name) else false end)
  $p$;
  execute $p$
    create policy floodlight_facility_images_update on storage.objects for update to authenticated
    using (case when bucket_id = 'floodlight-facility-images'
                then floodlight_private.can_manage_facility_object(name) else false end)
    with check (case when bucket_id = 'floodlight-facility-images'
                     then floodlight_private.can_manage_facility_object(name) else false end)
  $p$;
  execute $p$
    create policy floodlight_facility_images_delete on storage.objects for delete to authenticated
    using (case when bucket_id = 'floodlight-facility-images'
                then floodlight_private.can_manage_facility_object(name) else false end)
  $p$;
end $$;
