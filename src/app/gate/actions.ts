"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { friendlyError } from "@/lib/errors";
import type { GateBookingSummary, GateScanResponse } from "@/lib/types";

// Gate actions only relay to Postgres, which checks the caller is a
// gatekeeper/admin of THIS facility, validates the signed pass against the
// live booking, and records the attempt. Nothing is decided here.

type R<T> = { ok: true; data: T } | { ok: false; error: string };
const uuid = z.string().uuid();
const key = z.string().min(8).max(80);

export async function gateScan(facilityId: string, token: string, commit: boolean, idempotencyKey: string, device: string): Promise<R<GateScanResponse>> {
  if (!uuid.safeParse(facilityId).success || !key.safeParse(idempotencyKey).success || token.length > 300) return { ok: false, error: "Invalid request." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("gate_scan", {
    p_facility_id: facilityId, p_token: token, p_commit: commit, p_idempotency_key: idempotencyKey, p_device_label: device.slice(0, 60),
  });
  if (error) return { ok: false, error: friendlyError(error) };
  return { ok: true, data: data as GateScanResponse };
}

export async function gateLookup(facilityId: string, reference: string): Promise<R<{ found: boolean; result?: string; booking?: GateBookingSummary }>> {
  if (!uuid.safeParse(facilityId).success || !/^[A-Za-z0-9-]{4,20}$/.test(reference.trim())) return { ok: false, error: "Enter a booking reference like FL-ABCD-2345." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("gate_lookup", { p_facility_id: facilityId, p_reference: reference.trim() });
  if (error) return { ok: false, error: friendlyError(error) };
  return { ok: true, data: data as { found: boolean; result?: string; booking?: GateBookingSummary } };
}

export async function gateManualCheckIn(facilityId: string, bookingId: string, reason: string, idempotencyKey: string, device: string): Promise<R<GateScanResponse>> {
  if (!uuid.safeParse(facilityId).success || !uuid.safeParse(bookingId).success || !key.safeParse(idempotencyKey).success) return { ok: false, error: "Invalid request." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("gate_manual_check_in", {
    p_facility_id: facilityId, p_booking_id: bookingId, p_reason: reason.slice(0, 300), p_idempotency_key: idempotencyKey, p_device_label: device.slice(0, 60),
  });
  if (error) return { ok: false, error: friendlyError(error) };
  return { ok: true, data: data as GateScanResponse };
}
