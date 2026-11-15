import "server-only";
import { redirect } from "next/navigation";
import { canUseAdmin, facilitiesWithRole, requireViewer, type Viewer } from "./auth";
import { createSupabaseServerClient } from "./supabase/server";
import type { Facility } from "./types";

export type AdminContext = {
  viewer: Viewer;
  facilities: Pick<Facility, "id" | "name" | "slug" | "is_active" | "is_dev_fixture" | "timezone">[];
  /** Facility ids where the viewer is facility_admin (or every facility for owners). */
  adminOf: Set<string>;
  isOwner: boolean;
};

/** Loads the staff context; non-staff are sent away (Postgres still checks every action). */
export async function requireAdmin(path: string): Promise<AdminContext> {
  const viewer = await requireViewer(path);
  if (!canUseAdmin(viewer)) redirect("/dashboard?denied=admin");
  const supabase = await createSupabaseServerClient();
  const isOwner = viewer.roles.is_platform_owner;
  const ids = facilitiesWithRole(viewer, ["facility_admin", "scheduler"]);
  let q = supabase.from("facilities").select("id, name, slug, is_active, is_dev_fixture, timezone").order("name");
  if (!isOwner) q = q.in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  const { data } = await q;
  const facilities = (data ?? []) as AdminContext["facilities"];
  const adminOf = new Set(isOwner ? facilities.map((f) => f.id) : facilitiesWithRole(viewer, ["facility_admin"]));
  return { viewer, facilities, adminOf, isOwner };
}

/** Facility chosen via ?facility=…, limited to those the viewer manages; "all" means every managed facility. */
export function pickFacility(ctx: AdminContext, raw: unknown): string | null {
  if (typeof raw === "string" && ctx.facilities.some((f) => f.id === raw)) return raw;
  return null;
}
