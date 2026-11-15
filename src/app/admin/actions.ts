"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { friendlyError } from "@/lib/errors";
import { phoneSchema } from "@/lib/validation";

// Every action runs as the signed-in user. Postgres decides whether the
// caller may do it (role + facility scope); nothing here grants permission.

export type AdminResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
const uuid = z.string().uuid();
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: friendlyError(e) });
const invalid = (e: z.ZodError): { ok: false; error: string } => ({ ok: false, error: e.issues[0]?.message ?? "Please check the form." });

function done(paths: string[]) {
  for (const p of paths) revalidatePath(p);
}

// ---- Bookings --------------------------------------------------------------
export async function reviewBooking(input: { bookingId: string; decision: "approve" | "reject"; reason?: string; waivePayment?: boolean }): Promise<AdminResult<{ status: string }>> {
  const p = z.object({
    bookingId: uuid, decision: z.enum(["approve", "reject"]), reason: z.string().max(500).optional(), waivePayment: z.boolean().optional(),
  }).safeParse(input);
  if (!p.success) return invalid(p.error);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("review_booking", {
    p_booking_id: p.data.bookingId, p_decision: p.data.decision, p_reason: p.data.reason || null, p_waive_payment: !!p.data.waivePayment,
  });
  if (error) return fail(error);
  done(["/admin", "/admin/bookings"]);
  return { ok: true, data: data as { status: string } };
}

export async function staffCancelBooking(bookingId: string, reason: string): Promise<AdminResult> {
  if (!uuid.safeParse(bookingId).success) return { ok: false, error: "Invalid booking." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("cancel_booking", { p_booking_id: bookingId, p_reason: reason.slice(0, 500) });
  if (error) return fail(error);
  done(["/admin", "/admin/bookings"]);
  return { ok: true, data: undefined };
}

export async function staffReschedule(bookingId: string, surfaceId: string, start: string): Promise<AdminResult> {
  if (!uuid.safeParse(bookingId).success || !uuid.safeParse(surfaceId).success) return { ok: false, error: "Invalid request." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("reschedule_booking", { p_booking_id: bookingId, p_surface_id: surfaceId, p_start: start });
  if (error) return fail(error);
  done(["/admin/bookings"]);
  return { ok: true, data: undefined };
}

const staffBookingSchema = z.object({
  surfaceId: uuid,
  start: z.string().datetime({ offset: true }),
  source: z.enum(["staff", "walk_in"]),
  organizerName: z.string().trim().min(2, "Enter the organiser's name").max(120),
  organizerPhone: phoneSchema.optional().or(z.literal("")),
  organizerEmail: z.string().trim().email("Enter a valid email").optional().or(z.literal("")),
  customerEmail: z.string().trim().email("Enter a valid email").optional().or(z.literal("")),
  activityType: z.enum(["friendly", "training", "practice", "competition", "other"]),
  activityTitle: z.string().trim().max(120).optional().or(z.literal("")),
  teamName: z.string().trim().max(80).optional().or(z.literal("")),
  opponentName: z.string().trim().max(80).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
  waivePayment: z.boolean(),
  publicListing: z.boolean(),
  idempotencyKey: z.string().min(8).max(80),
});

export async function staffCreateBooking(input: z.input<typeof staffBookingSchema>): Promise<AdminResult<{ id: string; reference: string; status: string }>> {
  const p = staffBookingSchema.safeParse(input);
  if (!p.success) return invalid(p.error);
  const d = p.data;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("staff_create_booking", {
    p_surface_id: d.surfaceId, p_start: d.start, p_source: d.source,
    p_organizer_name: d.organizerName, p_organizer_phone: d.organizerPhone || null, p_organizer_email: d.organizerEmail || null,
    p_activity_type: d.activityType, p_activity_title: d.activityTitle || null, p_team_name: d.teamName || null,
    p_opponent_name: d.opponentName || null, p_purpose: null, p_notes: d.notes || null, p_public_listing: d.publicListing,
    p_waive_payment: d.waivePayment, p_customer_email: d.customerEmail || null, p_idempotency_key: d.idempotencyKey,
  });
  if (error) return fail(error);
  done(["/admin", "/admin/bookings"]);
  return { ok: true, data: data as { id: string; reference: string; status: string } };
}

export async function recordOfflinePayment(input: { bookingId: string; amountNaira: number; method: string; receiptNumber: string; note?: string }): Promise<AdminResult> {
  const p = z.object({
    bookingId: uuid, amountNaira: z.number().positive("Enter the amount received").max(10_000_000),
    method: z.string().trim().min(2).max(40), receiptNumber: z.string().trim().min(1, "Enter the receipt number").max(60),
    note: z.string().trim().max(300).optional(),
  }).safeParse(input);
  if (!p.success) return invalid(p.error);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("record_offline_payment", {
    p_booking_id: p.data.bookingId, p_amount_kobo: Math.round(p.data.amountNaira * 100), p_method: p.data.method,
    p_receipt_number: p.data.receiptNumber, p_note: p.data.note || null,
  });
  if (error) return fail(error);
  done(["/admin/payments", "/admin/bookings"]);
  return { ok: true, data: undefined };
}

export async function recordActivityEvent(input: { bookingId: string; event: "start" | "finish" | "score" | "postpone"; home?: number | null; away?: number | null; note?: string }): Promise<AdminResult> {
  const p = z.object({
    bookingId: uuid, event: z.enum(["start", "finish", "score", "postpone"]),
    home: z.number().int().min(0).max(99).nullable().optional(), away: z.number().int().min(0).max(99).nullable().optional(),
    note: z.string().max(300).optional(),
  }).safeParse(input);
  if (!p.success) return invalid(p.error);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("record_activity_event", {
    p_booking_id: p.data.bookingId, p_event: p.data.event, p_home_score: p.data.home ?? null, p_away_score: p.data.away ?? null,
    p_note: p.data.note || null,
  });
  if (error) return fail(error);
  done(["/admin/bookings", "/schedule"]);
  return { ok: true, data: undefined };
}

// ---- Facilities ------------------------------------------------------------
export async function createFacility(input: { name: string; sportCategoryId: string; location?: string; description?: string }): Promise<AdminResult<{ id: string }>> {
  const p = z.object({
    name: z.string().trim().min(2, "Enter a name").max(80), sportCategoryId: uuid,
    location: z.string().trim().max(120).optional(), description: z.string().trim().max(2000).optional(),
  }).safeParse(input);
  if (!p.success) return invalid(p.error);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_facility", {
    p_name: p.data.name, p_sport_category_id: p.data.sportCategoryId, p_location_label: p.data.location || null, p_description: p.data.description || null,
  });
  if (error) return fail(error);
  done(["/admin/facilities"]);
  return { ok: true, data: { id: data as string } };
}

const facilityUpdate = z.object({
  name: z.string().trim().min(2).max(80),
  sport_category_id: uuid,
  location_label: z.string().trim().max(120).nullable(),
  description: z.string().trim().max(2000).nullable(),
  rules: z.string().trim().max(4000).nullable(),
  eligibility_note: z.string().trim().max(1000).nullable(),
  entry_instructions: z.string().trim().max(1000).nullable(),
  is_active: z.boolean(),
  show_on_public_schedule: z.boolean(),
});

export async function updateFacility(id: string, input: z.input<typeof facilityUpdate>): Promise<AdminResult> {
  const p = facilityUpdate.safeParse(input);
  if (!p.success || !uuid.safeParse(id).success) return p.success ? { ok: false, error: "Invalid facility." } : invalid(p.error);
  const supabase = await createSupabaseServerClient();
  const v = Object.fromEntries(Object.entries(p.data).map(([k, x]) => [k, x === "" ? null : x]));
  const { data, error } = await supabase.from("facilities").update(v).eq("id", id).select("id");
  if (error) return fail(error);
  if (!data?.length) return { ok: false, error: "You don't have permission to edit this facility." };
  done([`/admin/facilities/${id}`, "/facilities"]);
  return { ok: true, data: undefined };
}

const policyUpdate = z.object({
  slot_minutes: z.number().int().min(15).max(480).nullable(),
  gap_minutes: z.number().int().min(0).max(120),
  min_notice_minutes: z.number().int().min(0).max(10080).nullable(),
  max_advance_days: z.number().int().min(1).max(365).nullable(),
  max_active_bookings_per_user: z.number().int().min(1).max(100).nullable(),
  approval_mode: z.enum(["required", "automatic"]),
  payment_mode: z.enum(["unconfigured", "free", "online", "offline", "hybrid", "deposit"]),
  access_mode: z.enum(["disabled", "organizer_pass", "participant_passes", "organizer_and_participants"]),
  entry_opens_minutes_before: z.number().int().min(0).max(240).nullable(),
  entry_closes_minutes_after_start: z.number().int().min(0).max(480).nullable(),
  customer_cancellation: z.enum(["pending_only", "until_cutoff", "not_allowed"]),
  cancellation_cutoff_hours: z.number().int().min(0).max(720).nullable(),
  customer_reschedule_allowed: z.boolean(),
  reschedule_cutoff_hours: z.number().int().min(0).max(720).nullable(),
});

export async function updatePolicy(facilityId: string, input: z.input<typeof policyUpdate>): Promise<AdminResult> {
  const p = policyUpdate.safeParse(input);
  if (!p.success) return invalid(p.error);
  if (!uuid.safeParse(facilityId).success) return { ok: false, error: "Invalid facility." };
  const supabase = await createSupabaseServerClient();
  const { data: u } = await supabase.auth.getUser();
  const { data, error } = await supabase.from("booking_policies").update({ ...p.data, updated_by: u.user?.id ?? null })
    .eq("facility_id", facilityId).select("facility_id");
  if (error) return fail(error);
  if (!data?.length) return { ok: false, error: "You don't have permission to change this policy." };
  done([`/admin/facilities/${facilityId}`, `/admin/availability`]);
  return { ok: true, data: undefined };
}

export async function saveSurface(facilityId: string, input: { id?: string; name: string; isActive: boolean }): Promise<AdminResult> {
  const p = z.object({ id: uuid.optional(), name: z.string().trim().min(1, "Enter a name").max(60), isActive: z.boolean() }).safeParse(input);
  if (!p.success) return invalid(p.error);
  const supabase = await createSupabaseServerClient();
  const q = p.data.id
    ? supabase.from("playing_surfaces").update({ name: p.data.name, is_active: p.data.isActive }).eq("id", p.data.id).eq("facility_id", facilityId).select("id")
    : supabase.from("playing_surfaces").insert({ facility_id: facilityId, name: p.data.name, is_active: p.data.isActive }).select("id");
  const { data, error } = await q;
  if (error) return fail(error);
  if (!data?.length) return { ok: false, error: "You don't have permission to change this facility." };
  done([`/admin/facilities/${facilityId}`]);
  return { ok: true, data: undefined };
}

const hoursSchema = z.array(z.object({
  weekday: z.number().int().min(0).max(6),
  opens_at: z.string().regex(/^\d{2}:\d{2}$/),
  closes_at: z.string().regex(/^(\d{2}:\d{2}|24:00)$/),
})).max(28);

export async function replaceHours(facilityId: string, rows: z.input<typeof hoursSchema>): Promise<AdminResult> {
  const p = hoursSchema.safeParse(rows);
  if (!p.success) return invalid(p.error);
  for (const r of p.data) if (r.closes_at !== "24:00" && r.closes_at <= r.opens_at) return { ok: false, error: "Closing time must be after opening time." };
  const supabase = await createSupabaseServerClient();
  const del = await supabase.from("operating_hours").delete().eq("facility_id", facilityId).select("id");
  if (del.error) return fail(del.error);
  if (p.data.length) {
    const ins = await supabase.from("operating_hours").insert(p.data.map((r) => ({ ...r, facility_id: facilityId }))).select("id");
    if (ins.error) return fail(ins.error);
    if (!ins.data?.length) return { ok: false, error: "You don't have permission to change these hours." };
  }
  done([`/admin/facilities/${facilityId}`]);
  return { ok: true, data: undefined };
}

export async function savePrice(facilityId: string, input: { id?: string; label: string; amountNaira: number; depositNaira: number | null; isDefault: boolean; isActive: boolean }): Promise<AdminResult> {
  const p = z.object({
    id: uuid.optional(), label: z.string().trim().min(1).max(60), amountNaira: z.number().min(0).max(10_000_000),
    depositNaira: z.number().min(0).max(10_000_000).nullable(), isDefault: z.boolean(), isActive: z.boolean(),
  }).safeParse(input);
  if (!p.success) return invalid(p.error);
  const supabase = await createSupabaseServerClient();
  const row = {
    facility_id: facilityId, label: p.data.label, amount_kobo: Math.round(p.data.amountNaira * 100),
    deposit_kobo: p.data.depositNaira == null ? null : Math.round(p.data.depositNaira * 100),
    is_default: p.data.isDefault, is_active: p.data.isActive,
  };
  if (p.data.isDefault) {
    await supabase.from("facility_prices").update({ is_default: false }).eq("facility_id", facilityId).neq("id", p.data.id ?? "00000000-0000-0000-0000-000000000000");
  }
  const { data, error } = p.data.id
    ? await supabase.from("facility_prices").update(row).eq("id", p.data.id).select("id")
    : await supabase.from("facility_prices").insert(row).select("id");
  if (error) return fail(error);
  if (!data?.length) return { ok: false, error: "You don't have permission to change prices." };
  done([`/admin/facilities/${facilityId}`]);
  return { ok: true, data: undefined };
}

export async function uploadFacilityImage(facilityId: string, form: FormData): Promise<AdminResult> {
  const file = form.get("file");
  if (!(file instanceof File) || !uuid.safeParse(facilityId).success) return { ok: false, error: "Choose an image." };
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return { ok: false, error: "Use a JPG, PNG or WebP image." };
  if (file.size > 5 * 1024 * 1024) return { ok: false, error: "Images must be 5 MB or smaller." };
  const alt = String(form.get("alt") ?? "").slice(0, 200);
  const supabase = await createSupabaseServerClient();
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${facilityId}/${crypto.randomUUID()}.${ext}`;
  const up = await supabase.storage.from("floodlight-facility-images").upload(path, file, { contentType: file.type, upsert: false });
  if (up.error) return { ok: false, error: "Upload failed. Check that you manage this facility and storage is configured." };
  const { error } = await supabase.from("facility_images").insert({ facility_id: facilityId, storage_path: path, alt_text: alt });
  if (error) return fail(error);
  done([`/admin/facilities/${facilityId}`]);
  return { ok: true, data: undefined };
}

// ---- Availability blocks ---------------------------------------------------
export async function createBlock(input: { facilityId: string; surfaceId: string | null; startsAt: string; endsAt: string; kind: string; reason?: string }): Promise<AdminResult<{ created: boolean; conflicts?: { reference: string; starts_at: string; status: string }[] }>> {
  const p = z.object({
    facilityId: uuid, surfaceId: uuid.nullable(), startsAt: z.string().datetime({ offset: true }), endsAt: z.string().datetime({ offset: true }),
    kind: z.enum(["maintenance", "closure", "official_use", "event", "other"]), reason: z.string().max(300).optional(),
  }).safeParse(input);
  if (!p.success) return invalid(p.error);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_facility_block", {
    p_facility_id: p.data.facilityId, p_surface_id: p.data.surfaceId, p_starts_at: p.data.startsAt, p_ends_at: p.data.endsAt,
    p_kind: p.data.kind, p_reason: p.data.reason || null,
  });
  if (error) return fail(error);
  done(["/admin/availability"]);
  return { ok: true, data: data as { created: boolean } };
}

export async function cancelBlock(blockId: string): Promise<AdminResult> {
  if (!uuid.safeParse(blockId).success) return { ok: false, error: "Invalid block." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("cancel_facility_block", { p_block_id: blockId });
  if (error) return fail(error);
  done(["/admin/availability"]);
  return { ok: true, data: undefined };
}

// ---- Staff -----------------------------------------------------------------
export async function inviteStaff(input: { email: string; role: string; facilityId: string | null }): Promise<AdminResult<{ token: string }>> {
  const p = z.object({
    email: z.string().trim().email("Enter a valid email"),
    role: z.enum(["platform_owner", "facility_admin", "scheduler", "gatekeeper"]),
    facilityId: uuid.nullable(),
  }).safeParse(input);
  if (!p.success) return invalid(p.error);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("invite_staff", { p_email: p.data.email, p_role: p.data.role, p_facility_id: p.data.facilityId });
  if (error) return fail(error);
  done(["/admin/staff"]);
  return { ok: true, data: { token: (data as { token: string }).token } };
}

export async function revokeMembership(id: string): Promise<AdminResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Invalid membership." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("revoke_staff_membership", { p_membership_id: id });
  if (error) return fail(error);
  done(["/admin/staff"]);
  return { ok: true, data: undefined };
}

export async function revokeInvitation(id: string): Promise<AdminResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Invalid invitation." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("revoke_staff_invitation", { p_invitation_id: id });
  if (error) return fail(error);
  done(["/admin/staff"]);
  return { ok: true, data: undefined };
}

export async function revokeOwner(userId: string): Promise<AdminResult> {
  if (!uuid.safeParse(userId).success) return { ok: false, error: "Invalid user." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("revoke_platform_owner", { p_user_id: userId });
  if (error) return fail(error);
  done(["/admin/staff"]);
  return { ok: true, data: undefined };
}

// ---- Platform settings (owners) ------------------------------------------
export async function updateSettings(input: {
  support_email: string | null; support_phone: string | null; require_staff_mfa: boolean;
  live_gate_admission: boolean; online_payments_enabled: boolean;
}): Promise<AdminResult> {
  const p = z.object({
    support_email: z.string().trim().email("Enter a valid email").nullable().or(z.literal("").transform(() => null)),
    support_phone: phoneSchema.nullable().or(z.literal("").transform(() => null)),
    require_staff_mfa: z.boolean(), live_gate_admission: z.boolean(), online_payments_enabled: z.boolean(),
  }).safeParse(input);
  if (!p.success) return invalid(p.error);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("platform_settings").update(p.data).eq("id", 1).select("id");
  if (error) return fail(error);
  if (!data?.length) return { ok: false, error: "Only platform owners can change these settings." };
  done(["/admin/settings", "/"]);
  return { ok: true, data: undefined };
}
