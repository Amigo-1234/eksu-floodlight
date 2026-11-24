-- EKSU Floodlight 0012 — manual payment with uploaded receipts, and deadlines
-- that release held slots.
--
-- Flow (payment mode "offline" = bank transfer + receipt):
--   1. A request holds its session immediately (unchanged: the exclusion
--      constraint means two people can never request the same session).
--   2. Staff accept or decline. Deadline A: 12 h after the request, and never
--      later than 2 h before the session. Missed → request expires, slot freed.
--   3. Once accepted, the customer pays by bank transfer and uploads the
--      receipt. Deadline B: 6 h after acceptance, and never later than 1 h
--      before the session. Missed (with no receipt waiting) → expires.
--   4. Staff verify the receipt: accept → payment recorded as a verified bank
--      transfer → booking confirmed (receipt + pass issued as before);
--      reject (reason required) → customer may upload again, up to 2 receipts
--      in total; a second rejection cancels the booking and frees the slot.
-- Receipts are stored in a PRIVATE bucket readable only by the booking's
-- customer and the facility's admins. Amounts always come from the booking
-- (server-side price snapshot), never from the client.
--
-- Touches floodlight / floodlight_private, plus one private storage bucket and
-- bucket-scoped policies on storage.objects (CASE-wrapped like 0007, so they
-- are FALSE for every other bucket — EKSU Sports Hub's storage is unaffected).

-- ---------------------------------------------------------------- settings
alter table floodlight.platform_settings
  add column if not exists bank_name text check (bank_name is null or char_length(bank_name) <= 80),
  add column if not exists bank_account_number text check (bank_account_number is null or bank_account_number ~ '^[0-9]{6,20}$'),
  add column if not exists bank_account_name text check (bank_account_name is null or char_length(bank_account_name) <= 120),
  add column if not exists approval_window_hours smallint not null default 12 check (approval_window_hours between 1 and 168),
  add column if not exists approval_cutoff_minutes smallint not null default 120 check (approval_cutoff_minutes between 0 and 1440),
  add column if not exists payment_window_hours smallint not null default 6 check (payment_window_hours between 1 and 168),
  add column if not exists payment_cutoff_minutes smallint not null default 60 check (payment_cutoff_minutes between 0 and 1440),
  add column if not exists max_receipt_uploads smallint not null default 2 check (max_receipt_uploads between 1 and 5);
grant update (bank_name, bank_account_number, bank_account_name, approval_window_hours, approval_cutoff_minutes,
              payment_window_hours, payment_cutoff_minutes, max_receipt_uploads)
  on floodlight.platform_settings to authenticated;

-- ---------------------------------------------------------------- bookings
alter table floodlight.bookings
  add column if not exists approval_deadline timestamptz,
  add column if not exists payment_deadline timestamptz,
  add column if not exists proof_status text check (proof_status in ('submitted', 'rejected', 'accepted')),
  add column if not exists proof_attempts smallint not null default 0;

create index if not exists bookings_proof_review on floodlight.bookings (facility_id) where proof_status = 'submitted';

-- Sets the two deadlines; never trusts client input.
create or replace function floodlight_private.booking_deadlines() returns trigger
language plpgsql security definer set search_path = '' as $$
declare s floodlight.platform_settings; v timestamptz;
begin
  select * into s from floodlight.platform_settings where id = 1;
  if tg_op = 'INSERT' then
    new.payment_deadline := null; new.proof_status := null; new.proof_attempts := 0;
    if new.status = 'pending' and new.approval_status = 'pending' then
      v := least(now() + make_interval(hours => s.approval_window_hours),
                 lower(new.period) - make_interval(mins => s.approval_cutoff_minutes));
      new.approval_deadline := case when v <= now() then lower(new.period) else v end;
    else
      new.approval_deadline := null;
    end if;
    if new.status = 'pending' and new.approval_status in ('approved', 'not_required') and new.payment_status in ('pending', 'failed') then
      v := least(now() + make_interval(hours => s.payment_window_hours),
                 lower(new.period) - make_interval(mins => s.payment_cutoff_minutes));
      new.payment_deadline := case when v <= now() then lower(new.period) else v end;
    end if;
  elsif new.approval_status = 'approved' and old.approval_status is distinct from 'approved'
        and new.status = 'pending' and new.payment_status in ('pending', 'failed') then
    v := least(now() + make_interval(hours => s.payment_window_hours),
               lower(new.period) - make_interval(mins => s.payment_cutoff_minutes));
    new.payment_deadline := case when v <= now() then lower(new.period) else v end;
  end if;
  return new;
end $$;
revoke all on function floodlight_private.booking_deadlines() from public, anon, authenticated;
drop trigger if exists bookings_deadlines on floodlight.bookings;
create trigger bookings_deadlines before insert or update of approval_status on floodlight.bookings
  for each row execute function floodlight_private.booking_deadlines();

-- ---------------------------------------------------------------- receipts
create table if not exists floodlight.payment_proofs (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references floodlight.bookings (id) on delete cascade,
  uploaded_by uuid references auth.users (id) on delete set null,
  storage_path text not null unique,
  file_name text check (file_name is null or char_length(file_name) <= 200),
  status text not null default 'submitted' check (status in ('submitted', 'accepted', 'rejected')),
  decision_reason text check (decision_reason is null or char_length(decision_reason) <= 500),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists payment_proofs_booking on floodlight.payment_proofs (booking_id, created_at desc);
alter table floodlight.payment_proofs enable row level security;
revoke all on floodlight.payment_proofs from public, anon, authenticated;
grant select on floodlight.payment_proofs to authenticated;
drop policy if exists payment_proofs_read on floodlight.payment_proofs;
create policy payment_proofs_read on floodlight.payment_proofs for select to authenticated using (
  exists (select 1 from floodlight.bookings b where b.id = booking_id
          and (b.customer_id = auth.uid() or b.created_by = auth.uid()
               or floodlight_private.has_facility_role(b.facility_id, array['facility_admin']::floodlight.staff_role[]))));

create or replace function floodlight_private.notify_facility_admins(p_facility uuid, p_booking uuid, p_kind text, p_title text, p_body text)
returns void language plpgsql security definer set search_path = '' as $$
declare u uuid;
begin
  for u in
    select o.user_id from floodlight.platform_owners o where o.revoked_at is null
    union
    select m.user_id from floodlight.staff_memberships m
    where m.facility_id = p_facility and m.role = 'facility_admin' and m.revoked_at is null
  loop
    perform floodlight_private.notify(u, p_booking, p_kind, p_title, p_body);
  end loop;
end $$;
revoke all on function floodlight_private.notify_facility_admins(uuid, uuid, text, text, text) from public, anon, authenticated;

-- Storage path for a receipt: "<booking id>/<anything>".
create or replace function floodlight_private.proof_booking_id(p_name text) returns uuid
language plpgsql immutable set search_path = '' as $$
declare v text := split_part(p_name, '/', 1);
begin
  if v ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then return v::uuid; end if;
  return null;
end $$;

-- Customer may upload only into their own booking's folder, only while payment is awaited.
create or replace function floodlight_private.can_upload_payment_proof(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from floodlight.bookings b
    where b.id = floodlight_private.proof_booking_id(p_name)
      and (b.customer_id = auth.uid() or b.created_by = auth.uid())
      and b.status = 'pending' and b.approval_status = 'approved' and b.payment_status in ('pending', 'failed')
      and coalesce(b.proof_status, '') <> 'submitted'
      and (b.payment_deadline is null or b.payment_deadline > now()))
$$;
create or replace function floodlight_private.can_view_payment_proof(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from floodlight.bookings b
    where b.id = floodlight_private.proof_booking_id(p_name)
      and (b.customer_id = auth.uid() or b.created_by = auth.uid()
           or floodlight_private.has_facility_role(b.facility_id, array['facility_admin']::floodlight.staff_role[])))
$$;
revoke execute on function floodlight_private.proof_booking_id(text), floodlight_private.can_upload_payment_proof(text),
  floodlight_private.can_view_payment_proof(text) from public;
grant execute on function floodlight_private.proof_booking_id(text), floodlight_private.can_upload_payment_proof(text),
  floodlight_private.can_view_payment_proof(text) to authenticated;

do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then
    raise notice 'storage schema not present; skipping receipt bucket setup';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('floodlight-payment-proofs', 'floodlight-payment-proofs', false, 5242880,
          array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
  on conflict (id) do nothing;
  execute 'drop policy if exists floodlight_payment_proofs_insert on storage.objects';
  execute 'drop policy if exists floodlight_payment_proofs_select on storage.objects';
  execute $p$
    create policy floodlight_payment_proofs_insert on storage.objects for insert to authenticated
    with check (case when bucket_id = 'floodlight-payment-proofs'
                     then floodlight_private.can_upload_payment_proof(name) else false end)
  $p$;
  execute $p$
    create policy floodlight_payment_proofs_select on storage.objects for select to authenticated
    using (case when bucket_id = 'floodlight-payment-proofs'
                then floodlight_private.can_view_payment_proof(name) else false end)
  $p$;
end $$;

-- Customer: register an uploaded receipt for review.
create or replace function floodlight.submit_payment_proof(p_booking_id uuid, p_storage_path text, p_file_name text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := floodlight_private.require_auth(); b floodlight.bookings; v_mode floodlight.payment_mode;
        v_max int; v_id uuid;
begin
  select * into b from floodlight.bookings where id = p_booking_id for update;
  if not found or (b.customer_id is distinct from v_uid and b.created_by is distinct from v_uid) then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  select payment_mode into v_mode from floodlight.booking_policies where facility_id = b.facility_id;
  if v_mode not in ('offline', 'hybrid', 'deposit') then raise exception 'OFFLINE_PAYMENT_NOT_ENABLED' using errcode = 'P0001'; end if;
  if b.status <> 'pending' or b.approval_status <> 'approved' or b.payment_status not in ('pending', 'failed') then
    raise exception 'NOT_AWAITING_PAYMENT' using errcode = 'P0001';
  end if;
  if b.payment_deadline is not null and b.payment_deadline <= now() then raise exception 'PAYMENT_DEADLINE_PASSED' using errcode = 'P0001'; end if;
  if b.proof_status = 'submitted' then raise exception 'PROOF_ALREADY_SUBMITTED' using errcode = 'P0001'; end if;
  select max_receipt_uploads into v_max from floodlight.platform_settings where id = 1;
  if b.proof_attempts >= coalesce(v_max, 2) then raise exception 'PROOF_ATTEMPTS_EXHAUSTED' using errcode = 'P0001'; end if;
  if p_storage_path is null or floodlight_private.proof_booking_id(p_storage_path) is distinct from b.id then
    raise exception 'PROOF_FILE_MISSING' using errcode = 'P0001';
  end if;
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    if not exists (select 1 from storage.objects o where o.bucket_id = 'floodlight-payment-proofs' and o.name = p_storage_path) then
      raise exception 'PROOF_FILE_MISSING' using errcode = 'P0001';
    end if;
  end if;
  insert into floodlight.payment_proofs (booking_id, uploaded_by, storage_path, file_name)
  values (b.id, v_uid, p_storage_path, nullif(left(btrim(coalesce(p_file_name, '')), 200), ''))
  returning id into v_id;
  update floodlight.bookings set proof_status = 'submitted', proof_attempts = proof_attempts + 1 where id = b.id;
  perform floodlight_private.add_event(b.id, 'payment_proof_submitted', b.status, b.status, jsonb_build_object('proof', v_id, 'attempt', b.proof_attempts + 1));
  perform floodlight_private.audit('payment.proof_submitted', 'booking', b.id::text, b.facility_id,
    jsonb_build_object('reference', b.reference, 'proof', v_id));
  perform floodlight_private.notify_facility_admins(b.facility_id, b.id, 'payment.proof_submitted',
    'Payment receipt to review', format('Booking %s uploaded a payment receipt.', b.reference));
  return jsonb_build_object('proof_id', v_id, 'attempt', b.proof_attempts + 1);
end $$;
revoke all on function floodlight.submit_payment_proof(uuid, text, text) from public, anon;
grant execute on function floodlight.submit_payment_proof(uuid, text, text) to authenticated;

-- Staff: accept (→ verified bank transfer → confirmed) or reject a receipt.
create or replace function floodlight.review_payment_proof(p_proof_id uuid, p_decision text, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := floodlight_private.require_auth(); pr floodlight.payment_proofs; b floodlight.bookings;
        v_max int; v_res jsonb; v_status floodlight.booking_status;
begin
  select * into pr from floodlight.payment_proofs where id = p_proof_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  select * into b from floodlight.bookings where id = pr.booking_id for update;
  if not floodlight_private.has_facility_role(b.facility_id, array['facility_admin']::floodlight.staff_role[]) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if pr.status <> 'submitted' then raise exception 'PROOF_ALREADY_REVIEWED' using errcode = 'P0001'; end if;

  if p_decision = 'accept' then
    update floodlight.payment_proofs set status = 'accepted', reviewed_by = v_uid, reviewed_at = now(),
      decision_reason = nullif(btrim(coalesce(p_reason, '')), '') where id = pr.id;
    update floodlight.bookings set proof_status = 'accepted' where id = b.id;
    v_res := floodlight.record_offline_payment(b.id, b.amount_due_kobo, 'bank_transfer',
      'TRF-' || upper(left(replace(pr.id::text, '-', ''), 10)), 'Verified from the customer''s uploaded receipt');
    v_status := (v_res ->> 'status')::floodlight.booking_status;
    perform floodlight_private.notify(coalesce(b.customer_id, b.created_by), b.id, 'payment.verified', 'Payment verified',
      case when v_status = 'confirmed' then format('Your payment for %s was verified. Your booking is confirmed.', b.reference)
           else format('Your payment for %s was verified.', b.reference) end);
    return jsonb_build_object('decision', 'accepted', 'status', v_status);
  elsif p_decision = 'reject' then
    if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'REASON_REQUIRED' using errcode = 'P0001'; end if;
    update floodlight.payment_proofs set status = 'rejected', reviewed_by = v_uid, reviewed_at = now(),
      decision_reason = left(btrim(p_reason), 500) where id = pr.id;
    select max_receipt_uploads into v_max from floodlight.platform_settings where id = 1;
    if b.proof_attempts >= coalesce(v_max, 2) then
      update floodlight.bookings set proof_status = 'rejected', status = 'cancelled', cancelled_at = now(), cancelled_by = v_uid,
        cancellation_reason = 'Payment receipt could not be verified' where id = b.id;
      perform floodlight_private.add_event(b.id, 'payment_proof_rejected', b.status, 'cancelled', jsonb_build_object('proof', pr.id, 'final', true));
      perform floodlight_private.notify(coalesce(b.customer_id, b.created_by), b.id, 'booking.cancelled', 'Booking cancelled',
        format('We couldn''t verify your payment receipt for %s (%s). The booking was cancelled and the session released.', b.reference, btrim(p_reason)));
      perform floodlight_private.audit('payment.proof_rejected', 'booking', b.id::text, b.facility_id,
        jsonb_build_object('reference', b.reference, 'proof', pr.id, 'final', true, 'reason', btrim(p_reason)));
      return jsonb_build_object('decision', 'rejected', 'status', 'cancelled');
    end if;
    update floodlight.bookings set proof_status = 'rejected' where id = b.id;
    perform floodlight_private.add_event(b.id, 'payment_proof_rejected', b.status, b.status, jsonb_build_object('proof', pr.id, 'final', false));
    perform floodlight_private.notify(coalesce(b.customer_id, b.created_by), b.id, 'payment.proof_rejected', 'Receipt not accepted',
      format('Your receipt for %s wasn''t accepted: %s. Please upload a clear receipt before the deadline.', b.reference, btrim(p_reason)));
    perform floodlight_private.audit('payment.proof_rejected', 'booking', b.id::text, b.facility_id,
      jsonb_build_object('reference', b.reference, 'proof', pr.id, 'final', false, 'reason', btrim(p_reason)));
    return jsonb_build_object('decision', 'rejected', 'status', b.status);
  end if;
  raise exception 'INVALID_DECISION' using errcode = 'P0001';
end $$;
revoke all on function floodlight.review_payment_proof(uuid, text, text) from public, anon;
grant execute on function floodlight.review_payment_proof(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------- housekeeping
create or replace function floodlight_private.expire_overdue_requests() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r record; v_a int := 0; v_p int := 0;
begin
  for r in update floodlight.bookings set status = 'expired', cancellation_reason = 'Not reviewed before the deadline'
           where status = 'pending' and approval_status = 'pending' and approval_deadline is not null and approval_deadline <= now()
           returning id, reference, coalesce(customer_id, created_by) as who loop
    v_a := v_a + 1;
    perform floodlight_private.add_event(r.id, 'request_expired', 'pending', 'expired', '{"reason":"approval_deadline"}');
    perform floodlight_private.notify(r.who, r.id, 'booking.expired', 'Request expired',
      format('Your request %s wasn''t reviewed in time, so the session was released. Please pick another time.', r.reference));
  end loop;
  for r in update floodlight.bookings set status = 'expired', cancellation_reason = 'No payment receipt before the deadline'
           where status = 'pending' and approval_status = 'approved' and payment_status in ('pending', 'failed')
             and payment_deadline is not null and payment_deadline <= now() and coalesce(proof_status, '') <> 'submitted'
           returning id, reference, coalesce(customer_id, created_by) as who loop
    v_p := v_p + 1;
    perform floodlight_private.add_event(r.id, 'request_expired', 'pending', 'expired', '{"reason":"payment_deadline"}');
    perform floodlight_private.notify(r.who, r.id, 'booking.expired', 'Booking expired',
      format('No payment receipt arrived for %s before the deadline, so the session was released.', r.reference));
  end loop;
  return jsonb_build_object('expired_unreviewed', v_a, 'expired_unpaid', v_p);
end $$;
revoke all on function floodlight_private.expire_overdue_requests() from public, anon, authenticated;

create or replace function floodlight_private.run_booking_housekeeping() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_expired int; v_holds int; v_completed int; v_deadlines jsonb;
begin
  v_deadlines := floodlight_private.expire_overdue_requests();
  with x as (update floodlight.bookings set status = 'expired'
             where status = 'held' and hold_expires_at <= now() returning id)
  select count(*) into v_holds from x;
  with x as (update floodlight.bookings set status = 'expired'
             where status = 'pending' and lower(period) <= now() returning id, reference)
  select count(*) into v_expired from x;
  with x as (update floodlight.bookings set status = 'completed'
             where status in ('confirmed', 'checked_in') and upper(period) <= now() returning id)
  select count(*) into v_completed from x;
  return jsonb_build_object('expired_holds', v_holds, 'expired_requests', v_expired, 'completed', v_completed) || v_deadlines;
end $$;
