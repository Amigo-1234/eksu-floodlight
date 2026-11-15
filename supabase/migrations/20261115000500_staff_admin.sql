-- EKSU Floodlight — staff provisioning, availability blocks, admin reporting.
--
-- Staff access is by invitation only. There is no public page or function
-- that lets anyone request or grant themselves a staff role.
--   * Platform owners may invite any role (including another owner).
--   * Facility admins may invite schedulers and gatekeepers for their own
--     facilities only.
--   * An invitation is bound to an email address, single-use, and expires.

create table public.staff_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role text not null check (role in ('platform_owner', 'facility_admin', 'scheduler', 'gatekeeper')),
  facility_id uuid references public.facilities (id) on delete cascade,
  token_hash bytea not null unique,
  invited_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '72 hours',
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id),
  revoked_at timestamptz,
  check ((role = 'platform_owner') = (facility_id is null))
);

create or replace function public.invite_staff(p_email text, p_role text, p_facility_id uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_token text; v_id uuid;
begin
  perform private.require_auth();
  if p_role = 'platform_owner' then
    if not private.is_platform_owner() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
    p_facility_id := null;
  elsif p_role = 'facility_admin' then
    if not private.is_platform_owner() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  elsif p_role in ('scheduler', 'gatekeeper') then
    if p_facility_id is null or not private.has_facility_role(p_facility_id, array['facility_admin']::public.staff_role[]) then
      raise exception 'FORBIDDEN' using errcode = 'P0001';
    end if;
  else
    raise exception 'INVALID_ROLE' using errcode = 'P0001';
  end if;
  if p_role <> 'platform_owner' and p_facility_id is null then raise exception 'FACILITY_REQUIRED' using errcode = 'P0001'; end if;

  v_token := private.b64url(extensions.gen_random_bytes(24));
  insert into public.staff_invitations (email, role, facility_id, token_hash, invited_by)
  values (lower(btrim(p_email)), p_role, p_facility_id, extensions.digest(v_token, 'sha256'), auth.uid())
  returning id into v_id;
  perform private.audit('staff.invited', 'staff_invitation', v_id::text, p_facility_id,
    jsonb_build_object('email', lower(btrim(p_email)), 'role', p_role));
  -- The token is returned once so the inviter can send the link; only its hash is stored.
  return jsonb_build_object('invitation_id', v_id, 'token', v_token);
end $$;

create or replace function public.accept_staff_invitation(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare i public.staff_invitations; v_uid uuid := private.require_auth(); v_email text;
begin
  select * into i from public.staff_invitations where token_hash = extensions.digest(p_token, 'sha256') for update;
  if not found or i.revoked_at is not null or i.accepted_at is not null or i.expires_at <= now() then
    raise exception 'INVITATION_INVALID' using errcode = 'P0001';
  end if;
  select lower(email) into v_email from auth.users where id = v_uid;
  if v_email is distinct from i.email then raise exception 'INVITATION_EMAIL_MISMATCH' using errcode = 'P0001'; end if;

  if i.role = 'platform_owner' then
    insert into public.platform_owners (user_id, granted_by) values (v_uid, i.invited_by)
    on conflict (user_id) do update set revoked_at = null, granted_by = excluded.granted_by, granted_at = now();
  else
    insert into public.staff_memberships (user_id, facility_id, role, granted_by)
    values (v_uid, i.facility_id, i.role::public.staff_role, i.invited_by)
    on conflict do nothing;
  end if;
  update public.staff_invitations set accepted_at = now(), accepted_by = v_uid where id = i.id;
  perform private.audit('staff.invitation_accepted', 'staff_invitation', i.id::text, i.facility_id,
    jsonb_build_object('role', i.role));
  return jsonb_build_object('role', i.role, 'facility_id', i.facility_id);
end $$;

create or replace function public.revoke_staff_invitation(p_invitation_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare i public.staff_invitations;
begin
  perform private.require_auth();
  select * into i from public.staff_invitations where id = p_invitation_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if not (private.is_platform_owner()
          or (i.role in ('scheduler', 'gatekeeper') and private.has_facility_role(i.facility_id, array['facility_admin']::public.staff_role[]))) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  update public.staff_invitations set revoked_at = now() where id = i.id and accepted_at is null;
  perform private.audit('staff.invitation_revoked', 'staff_invitation', i.id::text, i.facility_id, '{}');
end $$;

create or replace function public.revoke_staff_membership(p_membership_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.staff_memberships;
begin
  perform private.require_auth();
  select * into m from public.staff_memberships where id = p_membership_id for update;
  if not found or m.revoked_at is not null then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if not (private.is_platform_owner()
          or (m.role in ('scheduler', 'gatekeeper') and private.has_facility_role(m.facility_id, array['facility_admin']::public.staff_role[]))) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  update public.staff_memberships set revoked_at = now(), revoked_by = auth.uid() where id = m.id;
  perform private.audit('staff.membership_revoked', 'staff_membership', m.id::text, m.facility_id,
    jsonb_build_object('user_id', m.user_id, 'role', m.role));
end $$;

create or replace function public.revoke_platform_owner(p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_auth();
  if not private.is_platform_owner() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if (select count(*) from public.platform_owners where revoked_at is null and user_id <> p_user_id) = 0 then
    raise exception 'LAST_OWNER' using errcode = 'P0001';
  end if;
  update public.platform_owners set revoked_at = now() where user_id = p_user_id and revoked_at is null;
  perform private.audit('platform_owner.revoked', 'user', p_user_id::text, null, '{}');
end $$;

-- Staff list for a facility (or all facilities for owners), with names.
create or replace function public.staff_directory(p_facility_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_auth();
  if p_facility_id is null and not private.is_platform_owner() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_facility_id is not null and not private.has_facility_role(p_facility_id, array['facility_admin']::public.staff_role[]) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'owners', case when private.is_platform_owner() and p_facility_id is null then coalesce((
      select jsonb_agg(jsonb_build_object('user_id', o.user_id, 'name', p.full_name, 'email', p.email, 'granted_at', o.granted_at))
      from public.platform_owners o join public.profiles p on p.id = o.user_id where o.revoked_at is null), '[]') end,
    'memberships', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'user_id', m.user_id, 'name', p.full_name, 'email', p.email,
               'facility_id', m.facility_id, 'facility', f.name, 'role', m.role, 'granted_at', m.granted_at)
             order by f.name, m.role, p.full_name)
      from public.staff_memberships m
      join public.profiles p on p.id = m.user_id
      join public.facilities f on f.id = m.facility_id
      where m.revoked_at is null
        and (p_facility_id is null or m.facility_id = p_facility_id)), '[]'),
    'invitations', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'email', i.email, 'role', i.role, 'facility_id', i.facility_id,
               'expires_at', i.expires_at, 'created_at', i.created_at) order by i.created_at desc)
      from public.staff_invitations i
      where i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
        and ((p_facility_id is null and private.is_platform_owner()) or i.facility_id = p_facility_id)), '[]'));
end $$;

-- ---------------------------------------------------------------------------
-- Blocks (maintenance, closures, official use). A block may not overlap an
-- active booking: the conflicts are returned so staff can move or cancel
-- those bookings first.
-- ---------------------------------------------------------------------------
create or replace function public.create_facility_block(
  p_facility_id uuid, p_surface_id uuid, p_starts_at timestamptz, p_ends_at timestamptz,
  p_kind public.block_kind, p_reason text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_conflicts jsonb; v_id uuid; r record;
begin
  perform private.require_auth();
  if not private.has_facility_role(p_facility_id, array['facility_admin']::public.staff_role[]) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_ends_at <= p_starts_at then raise exception 'INVALID_PERIOD' using errcode = 'P0001'; end if;
  if p_surface_id is not null and not exists (select 1 from public.playing_surfaces where id = p_surface_id and facility_id = p_facility_id) then
    raise exception 'SURFACE_NOT_FOUND' using errcode = 'P0001';
  end if;
  for r in select id from public.playing_surfaces
           where facility_id = p_facility_id and (p_surface_id is null or id = p_surface_id) order by id loop
    perform private.lock_surface(r.id);
  end loop;
  select jsonb_agg(jsonb_build_object('id', k.id, 'reference', k.reference, 'starts_at', lower(k.period),
                                      'ends_at', upper(k.period), 'status', k.status) order by lower(k.period))
    into v_conflicts
  from public.bookings k
  where k.facility_id = p_facility_id and (p_surface_id is null or k.surface_id = p_surface_id)
    and k.status in ('held', 'pending', 'confirmed', 'checked_in')
    and k.period && tstzrange(p_starts_at, p_ends_at);
  if v_conflicts is not null then
    return jsonb_build_object('created', false, 'conflicts', v_conflicts);
  end if;
  insert into public.facility_blocks (facility_id, surface_id, period, kind, reason, created_by)
  values (p_facility_id, p_surface_id, tstzrange(p_starts_at, p_ends_at, '[)'), p_kind, nullif(btrim(p_reason), ''), auth.uid())
  returning id into v_id;
  perform private.audit('block.created', 'facility_block', v_id::text, p_facility_id,
    jsonb_build_object('kind', p_kind, 'starts_at', p_starts_at, 'ends_at', p_ends_at, 'surface_id', p_surface_id));
  return jsonb_build_object('created', true, 'id', v_id);
end $$;

create or replace function public.cancel_facility_block(p_block_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_fac uuid;
begin
  perform private.require_auth();
  select facility_id into v_fac from public.facility_blocks where id = p_block_id and cancelled_at is null;
  if v_fac is null or not private.has_facility_role(v_fac, array['facility_admin']::public.staff_role[]) then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  update public.facility_blocks set cancelled_at = now(), cancelled_by = auth.uid() where id = p_block_id;
  perform private.audit('block.cancelled', 'facility_block', p_block_id::text, v_fac, '{}');
end $$;

-- Owners create facilities; the creator becomes nothing special (owners
-- already hold every role). Slug is derived server-side.
create or replace function public.create_facility(
  p_name text, p_sport_category_id uuid, p_location_label text default null, p_description text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_slug text; v_base text; n int := 1;
begin
  perform private.require_auth();
  if not private.is_platform_owner() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  v_base := trim(both '-' from regexp_replace(lower(btrim(p_name)), '[^a-z0-9]+', '-', 'g'));
  if char_length(v_base) < 2 then v_base := 'facility'; end if;
  v_base := left(v_base, 50);
  v_slug := v_base;
  while exists (select 1 from public.facilities where slug = v_slug) loop
    n := n + 1; v_slug := v_base || '-' || n;
  end loop;
  insert into public.facilities (slug, name, sport_category_id, location_label, description, created_by)
  values (v_slug, btrim(p_name), p_sport_category_id, nullif(btrim(p_location_label), ''), nullif(btrim(p_description), ''), auth.uid())
  returning id into v_id;
  perform private.audit('facility.created', 'facility', v_id::text, v_id, jsonb_build_object('name', p_name));
  return v_id;
end $$;

-- Audit every change to a facility's booking policy and core facility fields.
create or replace function private.audit_policy_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.audit(tg_table_name || '.updated', tg_table_name,
    coalesce(new.facility_id, old.facility_id)::text, coalesce(new.facility_id, old.facility_id),
    jsonb_build_object('before', to_jsonb(old) - 'updated_at', 'after', to_jsonb(new) - 'updated_at'));
  return new;
end $$;
create trigger booking_policies_audit after update on public.booking_policies
  for each row execute function private.audit_policy_change();

create or replace function private.audit_facility_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.audit('facility.updated', 'facility', new.id::text, new.id,
    jsonb_build_object('before', to_jsonb(old) - 'updated_at', 'after', to_jsonb(new) - 'updated_at'));
  return new;
end $$;
create trigger facilities_audit after update on public.facilities
  for each row execute function private.audit_facility_change();

-- Platform settings may only be changed by owners; every change is audited.
create or replace function private.guard_platform_settings() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  perform private.audit('platform_settings.updated', 'platform_settings', '1', null,
    jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new)));
  return new;
end $$;
create trigger platform_settings_guard before update on public.platform_settings
  for each row execute function private.guard_platform_settings();

-- ---------------------------------------------------------------------------
-- Reporting (only real rows; nothing is estimated or filled in)
-- ---------------------------------------------------------------------------
create or replace function private.visible_facilities() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select f.id from public.facilities f
  where private.is_platform_owner()
     or (private.staff_mfa_ok()
         and exists (select 1 from public.staff_memberships m
                     where m.facility_id = f.id and m.user_id = auth.uid() and m.revoked_at is null
                       and m.role in ('facility_admin', 'scheduler')));
$$;

create or replace function public.admin_overview(p_facility_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_tz text := coalesce((select default_timezone from public.platform_settings where id = 1), 'Africa/Lagos');
        v_today date := (now() at time zone v_tz)::date;
        v_avail int := 0; f record;
begin
  perform private.require_auth();
  if p_facility_id is not null and p_facility_id not in (select private.visible_facilities()) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if not exists (select private.visible_facilities()) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;

  for f in select id from public.facilities
           where is_active and id in (select private.visible_facilities()) and (p_facility_id is null or id = p_facility_id) loop
    select v_avail + count(*) into v_avail from public.facility_availability(f.id, v_today) a where a.state = 'available';
  end loop;

  return (
    with scope as (
      select k.* from public.bookings k
      where k.facility_id in (select private.visible_facilities()) and (p_facility_id is null or k.facility_id = p_facility_id)
    )
    select jsonb_build_object(
      'total', (select count(*) from scope),
      'today', (select count(*) from scope where (lower(period) at time zone v_tz)::date = v_today
                                            and status not in ('cancelled', 'rejected', 'expired')),
      'confirmed_upcoming', (select count(*) from scope where status = 'confirmed' and lower(period) > now()),
      'pending_approval', (select count(*) from scope where status = 'pending' and approval_status = 'pending'),
      'pending_payment', (select count(*) from scope where status = 'pending' and approval_status in ('approved','not_required')
                                                       and payment_status in ('pending','unconfigured','failed')),
      'cancelled_30d', (select count(*) from scope where status = 'cancelled' and cancelled_at > now() - interval '30 days'),
      'available_slots_today', v_avail,
      'check_ins_today', (select count(*) from public.check_ins ci
                          where ci.booking_id in (select id from scope) and ci.voided_at is null
                            and (ci.at at time zone v_tz)::date = v_today),
      'manual_check_ins_7d', (select count(*) from public.check_ins ci
                              where ci.booking_id in (select id from scope) and ci.method = 'manual'
                                and ci.at > now() - interval '7 days'),
      'payments_recorded', (select count(*) from public.payment_transactions t
                            where t.booking_id in (select id from scope) and t.status = 'succeeded'),
      'revenue_kobo_30d', (select sum(t.amount_kobo) from public.payment_transactions t
                           where t.booking_id in (select id from scope) and t.status = 'succeeded'
                             and t.verified_at > now() - interval '30 days')
    ));
end $$;

create or replace function public.admin_report(p_facility_id uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_tz text := coalesce((select default_timezone from public.platform_settings where id = 1), 'Africa/Lagos');
        v_slot_minutes bigint := 0; d date; f record;
begin
  perform private.require_auth();
  if p_to < p_from or p_to - p_from > 92 then raise exception 'INVALID_RANGE' using errcode = 'P0001'; end if;
  if p_facility_id is not null and p_facility_id not in (select private.visible_facilities()) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if not exists (select private.visible_facilities()) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;

  -- Bookable capacity in minutes from the configured grids (per surface).
  for f in select fa.id from public.facilities fa
           where fa.id in (select private.visible_facilities()) and (p_facility_id is null or fa.id = p_facility_id) loop
    d := p_from;
    while d <= p_to loop
      select v_slot_minutes + coalesce(sum(extract(epoch from (g.slot_end - g.slot_start)) / 60), 0)
                            * (select count(*) from public.playing_surfaces s where s.facility_id = f.id and s.is_active)
        into v_slot_minutes from private.slot_grid(f.id, d) g;
      d := d + 1;
    end loop;
  end loop;

  return (
    with scope as (
      select k.*, (lower(k.period) at time zone v_tz) as local_start
      from public.bookings k
      where k.facility_id in (select private.visible_facilities())
        and (p_facility_id is null or k.facility_id = p_facility_id)
        and (lower(k.period) at time zone v_tz)::date between p_from and p_to
    ), used as (
      select coalesce(sum(extract(epoch from (upper(period) - lower(period))) / 60), 0) as minutes
      from scope where status in ('confirmed', 'checked_in', 'completed', 'no_show')
    )
    select jsonb_build_object(
      'range', jsonb_build_object('from', p_from, 'to', p_to),
      'by_status', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from scope group by status) s), '{}'),
      'by_day', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'bookings', n) order by day)
                          from (select local_start::date as day, count(*) n from scope
                                where status not in ('cancelled', 'rejected', 'expired') group by 1) s), '[]'),
      'by_hour', coalesce((select jsonb_agg(jsonb_build_object('hour', h, 'bookings', n) order by h)
                           from (select extract(hour from local_start)::int h, count(*) n from scope
                                 where status not in ('cancelled', 'rejected', 'expired') group by 1) s), '[]'),
      'by_activity', coalesce((select jsonb_object_agg(activity_type, n)
                               from (select activity_type, count(*) n from scope group by 1) s), '{}'),
      'capacity_minutes', v_slot_minutes,
      'booked_minutes', (select minutes from used),
      'utilization', case when v_slot_minutes > 0 then round((select minutes from used) / v_slot_minutes, 4) end,
      'cancellations', (select count(*) from scope where status = 'cancelled'),
      'rejections', (select count(*) from scope where status = 'rejected'),
      'check_ins', (select jsonb_build_object(
                      'total', count(*), 'manual', count(*) filter (where method = 'manual'),
                      'test_mode', count(*) filter (where mode = 'test'))
                    from public.check_ins ci where ci.booking_id in (select id from scope) and ci.voided_at is null)
    ));
end $$;
