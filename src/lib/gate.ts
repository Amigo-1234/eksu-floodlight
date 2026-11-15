import "server-only";
import { redirect } from "next/navigation";
import { canUseGate, facilitiesWithRole, requireViewer, type Viewer } from "./auth";
import { createSupabaseServerClient } from "./supabase/server";

export type GateContext = { viewer: Viewer; facilities: { id: string; name: string; timezone: string }[]; live: boolean };

export async function requireGate(path: string): Promise<GateContext> {
  const viewer = await requireViewer(path);
  if (!canUseGate(viewer)) redirect("/dashboard?denied=gate");
  const supabase = await createSupabaseServerClient();
  const ids = facilitiesWithRole(viewer, ["gatekeeper", "facility_admin"]);
  let q = supabase.from("facilities").select("id, name, timezone").order("name");
  if (!viewer.roles.is_platform_owner) q = q.in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  const [{ data }, { data: s }] = await Promise.all([q, supabase.from("platform_settings").select("live_gate_admission").eq("id", 1).maybeSingle()]);
  return { viewer, facilities: data ?? [], live: !!s?.live_gate_admission };
}

export function gateFacility(ctx: GateContext, raw: unknown): string | null {
  if (typeof raw === "string" && ctx.facilities.some((f) => f.id === raw)) return raw;
  return ctx.facilities.length === 1 ? ctx.facilities[0].id : null;
}

export const GATE_RESULT: Record<string, { title: string; body: string; tone: "ok" | "warn" | "danger" }> = {
  VALID: { title: "VALID", body: "Booking confirmed for this facility and time.", tone: "ok" },
  ALREADY_USED: { title: "ALREADY USED", body: "This pass has already been checked in.", tone: "danger" },
  BOOKING_NOT_CONFIRMED: { title: "NOT CONFIRMED", body: "The booking is not confirmed (awaiting approval or payment).", tone: "danger" },
  WRONG_FACILITY: { title: "WRONG FACILITY", body: "This pass is for a different facility.", tone: "danger" },
  OUTSIDE_ENTRY_WINDOW: { title: "OUTSIDE ENTRY TIME", body: "Too early or too late for this booking's entry window.", tone: "warn" },
  BOOKING_CANCELLED: { title: "CANCELLED", body: "This booking has been cancelled.", tone: "danger" },
  PASS_REVOKED: { title: "PASS REVOKED", body: "This pass was replaced or revoked (e.g. the booking moved).", tone: "danger" },
  UNKNOWN_CREDENTIAL: { title: "UNKNOWN PASS", body: "Not a valid Floodlight pass. A booking reference alone is not a pass.", tone: "danger" },
  ACCESS_DISABLED: { title: "PASSES OFF", body: "Digital passes are not enabled for this facility.", tone: "warn" },
};
