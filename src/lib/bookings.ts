import "server-only";
import QRCode from "qrcode";
import { createSupabaseServerClient } from "./supabase/server";
import type { Booking, Receipt } from "./types";

export const BOOKING_SELECT =
  "*, facilities(id, name, slug, timezone, location_label, is_dev_fixture, entry_instructions, rules), playing_surfaces(id, name), activities(*)";

/** The caller's own booking (RLS + explicit ownership check: no URL guessing). */
export async function getOwnBooking(id: string, userId: string): Promise<Booking | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("bookings").select(BOOKING_SELECT).eq("id", id).eq("customer_id", userId).maybeSingle();
  return (data as Booking) ?? null;
}

export async function listOwnBookings(userId: string): Promise<Booking[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("bookings").select(BOOKING_SELECT)
    .eq("customer_id", userId).order("created_at", { ascending: false }).limit(200);
  if (error) throw error;
  return (data as Booking[]) ?? [];
}

export async function getLatestReceipt(bookingId: string): Promise<Receipt | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("receipts").select("*").eq("booking_id", bookingId)
    .order("version", { ascending: false }).limit(1).maybeSingle();
  return (data as Receipt) ?? null;
}

export async function getBookingEvents(bookingId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("booking_events").select("id, at, event, from_status, to_status, details")
    .eq("booking_id", bookingId).order("at");
  return data ?? [];
}

export type PassInfo =
  | { available: false }
  | { available: true; token: string; qrSvg: string; liveGateAdmission: boolean };

export async function getOwnPass(bookingId: string): Promise<PassInfo> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("my_pass_token", { p_booking_id: bookingId });
  if (error || !data?.available) return { available: false };
  const qrSvg = await QRCode.toString(data.token as string, {
    type: "svg", errorCorrectionLevel: "M", margin: 1, color: { dark: "#0b100f", light: "#ffffff" },
  });
  return { available: true, token: data.token, qrSvg, liveGateAdmission: !!data.live_gate_admission };
}
