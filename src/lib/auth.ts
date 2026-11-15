import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "./supabase/server";
import { isBackendConfigured } from "./supabase/env";
import type { MyRoles, StaffRole } from "./types";

export type Viewer = {
  userId: string;
  email: string | null;
  fullName: string;
  roles: MyRoles;
};

/** The signed-in user (verified with Supabase Auth) and their roles, or null. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  if (!isBackendConfigured()) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  // Floodlight keeps its own profile per user, created on first use (the auth
  // service is shared with EKSU Sports Hub, which has its own profiles).
  const [{ data: roles }, { data: profile }] = await Promise.all([
    supabase.rpc("my_roles"),
    supabase.rpc("ensure_profile"),
  ]);
  return {
    userId: data.user.id,
    email: data.user.email ?? null,
    fullName: profile?.full_name || (data.user.user_metadata?.full_name as string | undefined) || "",
    roles: (roles as MyRoles) ?? { user_id: data.user.id, is_platform_owner: false, mfa_ok: true, memberships: [] },
  };
});

export async function requireViewer(next: string): Promise<Viewer> {
  const v = await getViewer();
  if (!v) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  return v;
}

/** Facility ids where the viewer holds one of `roles` (navigation only; Postgres re-checks every action). */
export function facilitiesWithRole(v: Viewer, roles: StaffRole[]): string[] {
  return [...new Set(v.roles.memberships.filter((m) => roles.includes(m.role)).map((m) => m.facility_id))];
}

export function canUseAdmin(v: Viewer | null): boolean {
  return !!v && (v.roles.is_platform_owner || facilitiesWithRole(v, ["facility_admin", "scheduler"]).length > 0);
}

export function canUseGate(v: Viewer | null): boolean {
  return !!v && (v.roles.is_platform_owner || facilitiesWithRole(v, ["gatekeeper", "facility_admin"]).length > 0);
}

export function isFacilityAdmin(v: Viewer, facilityId: string): boolean {
  return v.roles.is_platform_owner || v.roles.memberships.some((m) => m.facility_id === facilityId && m.role === "facility_admin");
}
