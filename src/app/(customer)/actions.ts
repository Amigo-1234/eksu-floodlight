"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { friendlyError, errorCode } from "@/lib/errors";
import { isYmd } from "@/lib/format";
import type { AvailabilitySlot } from "@/lib/types";
import { bookingDetailsSchema, phoneSchema } from "@/lib/validation";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string; code: string | null };

const uuid = z.string().uuid();

export async function loadAvailability(facilityId: string, day: string): Promise<ActionResult<AvailabilitySlot[]>> {
  if (!uuid.safeParse(facilityId).success || !isYmd(day)) return { ok: false, error: "Invalid request.", code: null };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("facility_availability", { p_facility: facilityId, p_day: day });
  if (error) return { ok: false, error: friendlyError(error), code: errorCode(error) };
  return { ok: true, data: (data as AvailabilitySlot[]) ?? [] };
}



const createSchema = z.object({
  surfaceId: uuid,
  start: z.string().datetime({ offset: true }),
  idempotencyKey: z.string().min(8).max(80),
  details: bookingDetailsSchema,
});

export async function submitBooking(input: z.input<typeof createSchema>): Promise<ActionResult<{ id: string; reference: string; status: string }>> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form.", code: "VALIDATION" };
  const { surfaceId, start, idempotencyKey, details: d } = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_booking", {
    p_surface_id: surfaceId,
    p_start: start,
    p_organizer_name: d.organizerName,
    p_organizer_phone: d.organizerPhone || null,
    p_organizer_email: d.organizerEmail || null,
    p_activity_type: d.activityType,
    p_activity_title: d.activityTitle || null,
    p_team_name: d.teamName || null,
    p_opponent_name: d.opponentName || null,
    p_purpose: d.purpose || null,
    p_notes: d.notes || null,
    p_public_listing: d.publicListing,
    p_idempotency_key: idempotencyKey,
  });
  if (error) return { ok: false, error: friendlyError(error), code: errorCode(error) };
  revalidatePath("/dashboard");
  const r = data as { id: string; reference: string; status: string };
  return { ok: true, data: r };
}

export async function cancelMyBooking(bookingId: string, reason: string): Promise<ActionResult> {
  if (!uuid.safeParse(bookingId).success) return { ok: false, error: "Invalid request.", code: null };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("cancel_booking", { p_booking_id: bookingId, p_reason: reason.slice(0, 500) || null });
  if (error) return { ok: false, error: friendlyError(error), code: errorCode(error) };
  revalidatePath(`/dashboard/bookings/${bookingId}`);
  revalidatePath("/dashboard");
  return { ok: true, data: undefined };
}

export async function rescheduleMyBooking(bookingId: string, surfaceId: string, start: string): Promise<ActionResult> {
  if (!uuid.safeParse(bookingId).success || !uuid.safeParse(surfaceId).success) return { ok: false, error: "Invalid request.", code: null };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("reschedule_booking", { p_booking_id: bookingId, p_surface_id: surfaceId, p_start: start });
  if (error) return { ok: false, error: friendlyError(error), code: errorCode(error) };
  revalidatePath(`/dashboard/bookings/${bookingId}`);
  return { ok: true, data: undefined };
}

const profileSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name").max(120),
  phone: phoneSchema.optional().or(z.literal("")),
});

export async function updateProfile(input: z.input<typeof profileSchema>): Promise<ActionResult> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form.", code: "VALIDATION" };
  const supabase = await createSupabaseServerClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return { ok: false, error: "Please sign in.", code: "AUTH_REQUIRED" };
  const { error } = await supabase.from("profiles")
    .update({ full_name: parsed.data.fullName, phone: parsed.data.phone || null }).eq("id", u.user.id);
  if (error) return { ok: false, error: friendlyError(error), code: errorCode(error) };
  revalidatePath("/dashboard/profile");
  return { ok: true, data: undefined };
}

export async function markNotificationsRead(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return;
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", u.user.id).is("read_at", null);
  revalidatePath("/dashboard");
}

/** Starts an online payment. Refused by Postgres unless online collection is enabled and due. */
export async function startOnlinePayment(bookingId: string): Promise<ActionResult<{ url: string }>> {
  if (!uuid.safeParse(bookingId).success) return { ok: false, error: "Invalid request.", code: null };
  const { initializeTransaction, paystackConfigured } = await import("@/lib/paystack");
  if (!paystackConfigured()) return { ok: false, error: "Online payment isn't available yet.", code: "ONLINE_PAYMENTS_DISABLED" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("start_online_payment", { p_booking_id: bookingId });
  if (error) return { ok: false, error: friendlyError(error), code: errorCode(error) };
  const d = data as { reference: string; amount_kobo: number; email: string };
  const { siteUrl } = await import("@/lib/supabase/env");
  const url = await initializeTransaction({
    email: d.email, amountKobo: d.amount_kobo, reference: d.reference,
    callbackUrl: `${siteUrl()}/dashboard/bookings/${bookingId}?payment=returned`,
  });
  if (!url) return { ok: false, error: "The payment provider couldn't start the payment. Please try again.", code: null };
  return { ok: true, data: { url } };
}
