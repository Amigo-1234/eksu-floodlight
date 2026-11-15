-- EKSU Floodlight — facility image storage (Supabase Storage).
-- Skipped automatically where the storage schema does not exist (local
-- PostgreSQL test runs).
--
-- Bucket `facility-images` is public-read (facility photos are public
-- content). Uploads, updates and deletes are limited to facility admins of
-- the facility whose id is the first path segment: <facility_id>/<file>.

do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then
    raise notice 'storage schema not present; skipping bucket setup';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('facility-images', 'facility-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do nothing;

  execute $p$
    create policy facility_images_admin_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'facility-images'
      and private.has_facility_role(((storage.foldername(name))[1])::uuid, array['facility_admin']::public.staff_role[]))
  $p$;
  execute $p$
    create policy facility_images_admin_update on storage.objects for update to authenticated
    using (bucket_id = 'facility-images'
      and private.has_facility_role(((storage.foldername(name))[1])::uuid, array['facility_admin']::public.staff_role[]))
  $p$;
  execute $p$
    create policy facility_images_admin_delete on storage.objects for delete to authenticated
    using (bucket_id = 'facility-images'
      and private.has_facility_role(((storage.foldername(name))[1])::uuid, array['facility_admin']::public.staff_role[]))
  $p$;
end $$;
