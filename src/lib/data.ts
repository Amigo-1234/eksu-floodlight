import "server-only";
import { createSupabaseServerClient } from "./supabase/server";
import { isBackendConfigured } from "./supabase/env";
import type {
  AvailabilitySlot, BookingPolicy, Facility, FacilityPrice, OperatingHours, Readiness, SportCategory, Surface,
} from "./types";

const FACILITY_COLS =
  "id, slug, name, description, location_label, sport_category_id, cover_image_path, rules, eligibility_note, entry_instructions, timezone, is_active, is_dev_fixture, show_on_public_schedule, sport_categories(id, slug, name, sort_order)";

export type FacilityCardData = Facility & {
  readiness: Readiness;
  surfaces: number;
  policy: Pick<BookingPolicy, "slot_minutes" | "approval_mode" | "payment_mode"> | null;
  freeToday: number | null;
};

export async function listSportCategories(): Promise<SportCategory[]> {
  if (!isBackendConfigured()) return [];
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("sport_categories").select("*").order("sort_order");
  return (data as SportCategory[]) ?? [];
}

/** Active facilities (RLS also shows inactive ones to their own staff; we filter those out here). */
export async function listPublicFacilities(today: string): Promise<FacilityCardData[]> {
  if (!isBackendConfigured()) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("facilities")
    .select(`${FACILITY_COLS}, playing_surfaces(id, is_active), booking_policies(slot_minutes, approval_mode, payment_mode), facility_images(storage_path, sort_order)`)
    .eq("is_active", true)
    .order("is_dev_fixture", { ascending: true })
    .order("name");
  if (error) throw error;
  const rows = (data ?? []) as unknown as (Facility & {
    playing_surfaces: { id: string; is_active: boolean }[];
    booking_policies: FacilityCardData["policy"] | FacilityCardData["policy"][];
    facility_images: { storage_path: string; sort_order: number }[];
  })[];
  return Promise.all(rows.map(async (f) => {
    const [{ data: readiness }, { data: slots }] = await Promise.all([
      supabase.rpc("facility_booking_readiness", { p_facility: f.id }),
      supabase.rpc("facility_availability", { p_facility: f.id, p_day: today }),
    ]);
    const policy = Array.isArray(f.booking_policies) ? f.booking_policies[0] ?? null : f.booking_policies;
    const firstImage = [...(f.facility_images ?? [])].sort((a, b) => a.sort_order - b.sort_order)[0]?.storage_path;
    return {
      ...f,
      cover_image_path: f.cover_image_path ?? firstImage ?? null,
      policy,
      surfaces: f.playing_surfaces.filter((s) => s.is_active).length,
      readiness: (readiness as Readiness) ?? { bookable: false, missing: [] },
      freeToday: slots ? (slots as AvailabilitySlot[]).filter((s) => s.state === "available").length : null,
    };
  }));
}

export type FacilityDetail = {
  facility: Facility;
  surfaces: Surface[];
  hours: OperatingHours[];
  policy: BookingPolicy | null;
  prices: FacilityPrice[];
  readiness: Readiness;
  images: { id: string; storage_path: string; alt_text: string }[];
};

async function loadFacility(column: "slug" | "id", value: string): Promise<FacilityDetail | null> {
  if (!isBackendConfigured()) return null;
  const supabase = await createSupabaseServerClient();
  const { data: f } = await supabase.from("facilities").select(FACILITY_COLS).eq(column, value).maybeSingle();
  if (!f) return null;
  const facility = f as unknown as Facility;
  const [surfaces, hours, policy, prices, readiness, images] = await Promise.all([
    supabase.from("playing_surfaces").select("*").eq("facility_id", facility.id).order("sort_order").order("name"),
    supabase.from("operating_hours").select("*").eq("facility_id", facility.id).order("weekday").order("opens_at"),
    supabase.from("booking_policies").select("*").eq("facility_id", facility.id).maybeSingle(),
    supabase.from("facility_prices").select("*").eq("facility_id", facility.id).eq("is_active", true).order("is_default", { ascending: false }),
    supabase.rpc("facility_booking_readiness", { p_facility: facility.id }),
    supabase.from("facility_images").select("id, storage_path, alt_text").eq("facility_id", facility.id).order("sort_order"),
  ]);
  return {
    facility,
    surfaces: (surfaces.data as Surface[]) ?? [],
    hours: (hours.data as OperatingHours[]) ?? [],
    policy: (policy.data as BookingPolicy) ?? null,
    prices: (prices.data as FacilityPrice[]) ?? [],
    readiness: (readiness.data as Readiness) ?? { bookable: false, missing: [] },
    images: images.data ?? [],
  };
}

export const getFacilityBySlug = (slug: string) => loadFacility("slug", slug);
export const getFacilityById = (id: string) => loadFacility("id", id);

export async function getAvailability(facilityId: string, day: string): Promise<AvailabilitySlot[]> {
  if (!isBackendConfigured()) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("facility_availability", { p_facility: facilityId, p_day: day });
  if (error) throw error;
  return (data as AvailabilitySlot[]) ?? [];
}

export type ScheduleItem = {
  booking_id: string; facility_name: string; facility_slug: string; surface_name: string; sport: string;
  starts_at: string; ends_at: string; activity_type: string; activity_title: string | null;
  team_name: string | null; opponent_name: string | null; activity_status: string | null;
  home_score: number | null; away_score: number | null; started_at: string | null; ended_at: string | null;
};

export async function getPublicSchedule(fromIso: string, toIso: string): Promise<ScheduleItem[]> {
  if (!isBackendConfigured()) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("public_schedule", { p_from: fromIso, p_to: toIso });
  if (error) throw error;
  return (data as ScheduleItem[]) ?? [];
}

export function facilityImageUrl(path: string | null): string | null {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base.replace(/\/$/, "")}/storage/v1/object/public/floodlight-facility-images/${path.split("/").map(encodeURIComponent).join("/")}`;
}
