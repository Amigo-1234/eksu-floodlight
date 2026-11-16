-- EKSU Floodlight 0010 — record the booking price while the payment method is
-- still undecided.
--
-- Before: a booking only carried amount_due_kobo when the facility's payment
-- mode was a collecting mode (online / offline / hybrid / deposit). With the
-- mode "unconfigured", a facility with a published price produced bookings with
-- no amount, so reviews, dashboards, admin lists and receipts could not show it.
--
-- After: "unconfigured" also snapshots the facility's default active price.
-- Nothing else changes, by design:
--   * payment_status stays 'unconfigured' — never 'paid', never 'pending';
--   * start_online_payment still refuses (needs payment_status pending/failed);
--   * record_offline_payment still refuses (needs payment mode 'offline');
--   * 'free' still means no charge (amount stays NULL).
-- The amount is always computed here, on the server, from the facility's price
-- at booking time (one price per booked slot); the client never supplies it.
--
-- Touches only floodlight_private.

create or replace function floodlight_private.price_snapshot(p_facility uuid, p_mode floodlight.payment_mode)
returns table (amount_due bigint, snapshot jsonb)
language sql stable security definer set search_path = '' as $$
  select case when p_mode = 'deposit' then coalesce(fp.deposit_kobo, fp.amount_kobo) else fp.amount_kobo end,
         jsonb_build_object('price_id', fp.id, 'label', fp.label, 'amount_kobo', fp.amount_kobo,
                            'deposit_kobo', fp.deposit_kobo, 'currency', fp.currency,
                            'collection', case when p_mode = 'unconfigured' then 'not_yet_decided' else p_mode::text end)
  from floodlight.facility_prices fp
  where fp.facility_id = p_facility and fp.is_default and fp.is_active
    and p_mode in ('online', 'offline', 'hybrid', 'deposit', 'unconfigured');
$$;
revoke all on function floodlight_private.price_snapshot(uuid, floodlight.payment_mode) from public, anon, authenticated;
