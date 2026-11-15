-- EKSU Floodlight — receipts, access credentials and gate verification.
--
-- Pass token format:  FL1.<credential uuid>.<version>.<signature>
--   signature = base64url(HMAC-SHA256(secret, 'FL1.<uuid>.<version>'))
-- The token carries no status, time or "approved" flag: everything that
-- decides entry is read from the live booking at scan time. Tokens cannot be
-- forged without the signing secret, which is readable only by the database
-- owner (SECURITY DEFINER functions below), never by API roles.
--
-- Gate admission runs in TEST MODE while platform_settings.live_gate_admission
-- is false: scans are fully verified and logged, check-ins are recorded with
-- mode = 'test', and the booking is NOT marked as checked in.

create table private.app_secrets (
  name text primary key,
  value bytea not null,
  created_at timestamptz not null default now()
);
revoke all on private.app_secrets from public, anon, authenticated, service_role;
insert into private.app_secrets (name, value) values ('pass_signing_key', extensions.gen_random_bytes(32));

create type public.credential_holder as enum ('organizer', 'participant');

create table public.access_credentials (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  holder public.credential_holder not null default 'organizer',
  participant_id uuid references public.booking_participants (id) on delete cascade,
  version int not null default 1,
  issued_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_reason text,
  check ((holder = 'participant') = (participant_id is not null))
);
create unique index access_credentials_one_active_organizer
  on public.access_credentials (booking_id) where holder = 'organizer' and revoked_at is null;

create type public.gate_mode as enum ('test', 'live');
create type public.check_in_method as enum ('scan', 'manual');

create table public.check_ins (
  id uuid primary key default gen_random_uuid(),
  credential_id uuid references public.access_credentials (id),
  booking_id uuid not null references public.bookings (id),
  facility_id uuid not null references public.facilities (id),
  mode public.gate_mode not null,
  method public.check_in_method not null,
  checked_in_by uuid not null references auth.users (id),
  device_label text check (char_length(device_label) <= 60),
  manual_reason text check (char_length(manual_reason) <= 300),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 80),
  at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references auth.users (id),
  unique (idempotency_key)
);
-- One admission per booking per mode: concurrent scans on two phones cannot both succeed.
create unique index check_ins_one_per_booking on public.check_ins (booking_id, mode) where voided_at is null;
create index check_ins_facility_at on public.check_ins (facility_id, at desc);

create table public.access_verification_logs (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  facility_id uuid references public.facilities (id),
  credential_id uuid,
  booking_id uuid,
  result text not null,
  mode public.gate_mode not null,
  method public.check_in_method not null,
  actor_id uuid,
  device_label text,
  committed boolean not null default false
);
create index access_verification_logs_facility on public.access_verification_logs (facility_id, at desc);
create trigger access_verification_logs_append_only before update or delete on public.access_verification_logs
  for each row execute function private.forbid_change();

-- ---------------------------------------------------------------------------
-- Signing
-- ---------------------------------------------------------------------------
create or replace function private.b64url(p bytea) returns text
language sql immutable set search_path = '' as $$
  select rtrim(translate(encode(p, 'base64'), E'+/\n', '-_'), '=');
$$;

create or replace function private.pass_token(p_credential uuid, p_version int) returns text
language sql stable security definer set search_path = '' as $$
  select 'FL1.' || p_credential::text || '.' || p_version::text || '.'
         || private.b64url(extensions.hmac(convert_to('FL1.' || p_credential::text || '.' || p_version::text, 'UTF8'),
                                           (select value from private.app_secrets where name = 'pass_signing_key'),
                                           'sha256'));
$$;

-- Returns (credential, version) for an authentic token, or nothing.
create or replace function private.parse_pass_token(p_token text, out credential_id uuid, out version int)
language plpgsql stable security definer set search_path = '' as $$
declare parts text[];
begin
  if p_token is null or char_length(p_token) > 200 then return; end if;
  parts := string_to_array(btrim(p_token), '.');
  if cardinality(parts) <> 4 or parts[1] <> 'FL1'
     or parts[2] !~ '^[0-9a-f-]{36}$' or parts[3] !~ '^[0-9]{1,6}$' then
    return;
  end if;
  if private.pass_token(parts[2]::uuid, parts[3]::int) <> btrim(p_token) then return; end if;
  credential_id := parts[2]::uuid;
  version := parts[3]::int;
end $$;

-- ---------------------------------------------------------------------------
-- Issuing / revoking
-- ---------------------------------------------------------------------------
create or replace function private.revoke_credentials(p_booking uuid, p_reason text) returns void
language sql security definer set search_path = '' as $$
  update public.access_credentials set revoked_at = now(), revoked_reason = p_reason
  where booking_id = p_booking and revoked_at is null;
$$;

create or replace function private.on_booking_confirmed(p_booking uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  b public.bookings; f public.facilities; s public.playing_surfaces; v_access public.access_mode;
  v_version int; v_number text;
begin
  select * into b from public.bookings where id = p_booking;
  select * into f from public.facilities where id = b.facility_id;
  select * into s from public.playing_surfaces where id = b.surface_id;
  select access_mode into v_access from public.booking_policies where facility_id = b.facility_id;

  select coalesce(max(version), 0) + 1 into v_version from public.receipts where booking_id = b.id;
  select coalesce((select receipt_number from public.receipts where booking_id = b.id order by version limit 1),
                  'RC-' || to_char(now() at time zone f.timezone, 'YYMMDD') || '-' || private.random_code(6))
    into v_number;
  insert into public.receipts (booking_id, receipt_number, version, snapshot)
  values (b.id, v_number || case when v_version > 1 then '-' || v_version else '' end, v_version, jsonb_build_object(
    'reference', b.reference, 'facility', f.name, 'surface', s.name, 'location', f.location_label,
    'timezone', f.timezone, 'starts_at', lower(b.period), 'ends_at', upper(b.period),
    'organizer_name', b.organizer_name, 'activity_type', b.activity_type, 'activity_title', b.activity_title,
    'team_name', b.team_name, 'opponent_name', b.opponent_name, 'booking_status', b.status,
    'approval_status', b.approval_status, 'payment_status', b.payment_status,
    'amount_due_kobo', b.amount_due_kobo, 'entry_instructions', f.entry_instructions,
    'rules', f.rules, 'access_mode', v_access, 'is_dev_fixture', f.is_dev_fixture));

  -- Organizer pass only when the facility's access policy calls for one.
  -- Participant passes need participants and an approved policy; none are
  -- issued automatically.
  if v_access in ('organizer_pass', 'organizer_and_participants')
     and not exists (select 1 from public.access_credentials
                     where booking_id = b.id and holder = 'organizer' and revoked_at is null) then
    insert into public.access_credentials (booking_id, holder) values (b.id, 'organizer');
  end if;
end $$;

-- The caller's own pass token for a booking (owner only; staff use the gate).
create or replace function public.my_pass_token(p_booking_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare c public.access_credentials; b public.bookings;
begin
  perform private.require_auth();
  select * into b from public.bookings where id = p_booking_id and customer_id = auth.uid();
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  select * into c from public.access_credentials
  where booking_id = b.id and holder = 'organizer' and revoked_at is null;
  if not found or b.status not in ('confirmed', 'checked_in') then
    return jsonb_build_object('available', false);
  end if;
  return jsonb_build_object('available', true, 'token', private.pass_token(c.id, c.version),
    'live_gate_admission', coalesce((select live_gate_admission from public.platform_settings where id = 1), false));
end $$;

-- ---------------------------------------------------------------------------
-- Verification core (shared by scan and manual paths)
-- ---------------------------------------------------------------------------
create or replace function private.evaluate_entry(p_booking uuid, p_gate_facility uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare b public.bookings; v_pol public.booking_policies; v_opens timestamptz; v_closes timestamptz;
begin
  select * into b from public.bookings where id = p_booking;
  if not found then return 'UNKNOWN_CREDENTIAL'; end if;
  if b.facility_id <> p_gate_facility then return 'WRONG_FACILITY'; end if;
  if b.status in ('cancelled') then return 'BOOKING_CANCELLED'; end if;
  if b.status in ('pending', 'held', 'rejected', 'expired') then return 'BOOKING_NOT_CONFIRMED'; end if;
  if b.payment_status not in ('not_required', 'paid', 'waived') then return 'BOOKING_NOT_CONFIRMED'; end if;
  select * into v_pol from public.booking_policies where facility_id = b.facility_id;
  if v_pol.access_mode = 'disabled' then return 'ACCESS_DISABLED'; end if;
  v_opens := lower(b.period) - make_interval(mins => coalesce(v_pol.entry_opens_minutes_before, 0));
  v_closes := case when v_pol.entry_closes_minutes_after_start is null then upper(b.period)
                   else least(upper(b.period), lower(b.period) + make_interval(mins => v_pol.entry_closes_minutes_after_start)) end;
  if now() < v_opens or now() >= v_closes then return 'OUTSIDE_ENTRY_WINDOW'; end if;
  return 'VALID';
end $$;

create or replace function private.gate_summary(p_booking uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  -- Minimum a gatekeeper needs: no phone, email, notes or amounts.
  select jsonb_build_object('booking_id', k.id, 'reference', k.reference, 'facility', f.name, 'surface', s.name,
    'starts_at', lower(k.period), 'ends_at', upper(k.period), 'organizer', split_part(k.organizer_name, ' ', 1),
    'team_name', k.team_name, 'opponent_name', k.opponent_name, 'activity_type', k.activity_type,
    'status', k.status, 'payment_status', k.payment_status, 'approval_status', k.approval_status)
  from public.bookings k join public.facilities f on f.id = k.facility_id join public.playing_surfaces s on s.id = k.surface_id
  where k.id = p_booking;
$$;

create or replace function private.gate_finish(
  p_facility uuid, p_credential uuid, p_booking uuid, p_result text, p_commit boolean,
  p_method public.check_in_method, p_device text, p_key text, p_reason text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_mode public.gate_mode := case when coalesce((select live_gate_admission from public.platform_settings where id = 1), false)
                                  then 'live' else 'test' end;
  v_result text := p_result; v_prev public.check_ins; v_committed boolean := false; v_at timestamptz;
begin
  if v_result = 'VALID' then
    select * into v_prev from public.check_ins
    where booking_id = p_booking and mode = v_mode and voided_at is null;
    if found then
      if v_prev.idempotency_key = p_key then
        v_committed := true; v_at := v_prev.at;          -- retry of the same request
      else
        v_result := 'ALREADY_USED'; v_at := v_prev.at;
      end if;
    elsif p_commit then
      begin
        insert into public.check_ins (credential_id, booking_id, facility_id, mode, method, checked_in_by,
                                      device_label, manual_reason, idempotency_key)
        values (p_credential, p_booking, p_facility, v_mode, p_method, auth.uid(), left(p_device, 60),
                nullif(btrim(p_reason), ''), p_key)
        returning at into v_at;
        v_committed := true;
        if v_mode = 'live' then
          update public.bookings set status = 'checked_in' where id = p_booking and status = 'confirmed';
          perform private.add_event(p_booking, 'checked_in', 'confirmed', 'checked_in', jsonb_build_object('method', p_method));
        else
          perform private.add_event(p_booking, 'test_check_in', null, null, jsonb_build_object('method', p_method));
        end if;
      exception when unique_violation then
        select * into v_prev from public.check_ins
        where booking_id = p_booking and mode = v_mode and voided_at is null;
        v_result := case when v_prev.idempotency_key = p_key then 'VALID' else 'ALREADY_USED' end;
        v_committed := v_prev.idempotency_key = p_key; v_at := v_prev.at;
      end;
    end if;
  end if;

  insert into public.access_verification_logs (facility_id, credential_id, booking_id, result, mode, method,
                                               actor_id, device_label, committed)
  values (p_facility, p_credential, p_booking, v_result, v_mode, p_method, auth.uid(), left(p_device, 60), v_committed);

  return jsonb_build_object(
    'result', v_result, 'mode', v_mode, 'checked_in', v_committed, 'checked_in_at', v_at,
    'booking', case when p_booking is not null and v_result <> 'WRONG_FACILITY' then private.gate_summary(p_booking) end);
end $$;

-- Scan a pass at a gate. p_commit = false only verifies; true also records
-- the check-in (still test mode until live admission is approved).
create or replace function public.gate_scan(
  p_facility_id uuid, p_token text, p_commit boolean, p_idempotency_key text, p_device_label text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_parsed record; c public.access_credentials; v_result text;
begin
  perform private.require_auth();
  if not private.has_facility_role(p_facility_id, array['gatekeeper','facility_admin']::public.staff_role[]) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) < 8 then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = 'P0001';
  end if;
  select * into v_parsed from private.parse_pass_token(p_token);
  if v_parsed.credential_id is null then
    return private.gate_finish(p_facility_id, null, null, 'UNKNOWN_CREDENTIAL', false, 'scan', p_device_label, p_idempotency_key, null);
  end if;
  select * into c from public.access_credentials where id = v_parsed.credential_id;
  if not found then
    return private.gate_finish(p_facility_id, null, null, 'UNKNOWN_CREDENTIAL', false, 'scan', p_device_label, p_idempotency_key, null);
  end if;
  -- Serialize scans of the same booking.
  perform 1 from public.bookings where id = c.booking_id for update;
  if c.revoked_at is not null or c.version <> v_parsed.version then
    v_result := 'PASS_REVOKED';
  else
    v_result := private.evaluate_entry(c.booking_id, p_facility_id);
  end if;
  return private.gate_finish(p_facility_id, c.id, c.booking_id, v_result, coalesce(p_commit, false), 'scan',
                             p_device_label, p_idempotency_key, null);
end $$;

-- Manual lookup by reference, limited to the gate's facility and a two-day
-- window. Read-only.
create or replace function public.gate_lookup(p_facility_id uuid, p_reference text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_booking uuid;
begin
  perform private.require_auth();
  if not private.has_facility_role(p_facility_id, array['gatekeeper','facility_admin']::public.staff_role[]) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  select id into v_booking from public.bookings
  where reference = upper(btrim(p_reference)) and facility_id = p_facility_id
    and period && tstzrange(now() - interval '1 day', now() + interval '1 day');
  if v_booking is null then return jsonb_build_object('found', false); end if;
  return jsonb_build_object('found', true, 'result', private.evaluate_entry(v_booking, p_facility_id),
                            'booking', private.gate_summary(v_booking));
end $$;

-- Manual check-in (no QR). Same rules as a scan — it never bypasses them —
-- plus a mandatory reason; every manual check-in is listed for admin review.
create or replace function public.gate_manual_check_in(
  p_facility_id uuid, p_booking_id uuid, p_reason text, p_idempotency_key text, p_device_label text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_result text; v_cred uuid;
begin
  perform private.require_auth();
  if not private.has_facility_role(p_facility_id, array['gatekeeper','facility_admin']::public.staff_role[]) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if nullif(btrim(p_reason), '') is null then raise exception 'REASON_REQUIRED' using errcode = 'P0001'; end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) < 8 then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = 'P0001';
  end if;
  perform 1 from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  v_result := private.evaluate_entry(p_booking_id, p_facility_id);
  select id into v_cred from public.access_credentials
  where booking_id = p_booking_id and holder = 'organizer' and revoked_at is null;
  return private.gate_finish(p_facility_id, v_cred, p_booking_id, v_result, true, 'manual',
                             p_device_label, p_idempotency_key, p_reason);
end $$;

-- Gate's view of today at its facility.
create or replace function public.gate_today(p_facility_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_tz text;
begin
  perform private.require_auth();
  if not private.has_facility_role(p_facility_id, array['gatekeeper','facility_admin']::public.staff_role[]) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  select timezone into v_tz from public.facilities where id = p_facility_id;
  return coalesce((
    select jsonb_agg(private.gate_summary(k.id) || jsonb_build_object(
             'checked_in', exists (select 1 from public.check_ins ci where ci.booking_id = k.id and ci.voided_at is null))
           order by lower(k.period))
    from public.bookings k
    where k.facility_id = p_facility_id
      and k.status in ('confirmed', 'checked_in', 'completed', 'pending')
      and (lower(k.period) at time zone v_tz)::date = (now() at time zone v_tz)::date), '[]'::jsonb);
end $$;
