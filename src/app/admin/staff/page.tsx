import type { Metadata } from "next";
import { Card, Chip, Notice } from "@/components/ui";
import { PageHeader } from "@/components/admin/PageHeader";
import { InviteForm, RevokeButton } from "@/components/admin/StaffForms";
import { requireAdmin } from "@/lib/admin";
import { formatDateTime } from "@/lib/format";
import { siteUrl } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Staff" };
export const dynamic = "force-dynamic";

const ROLE: Record<string, string> = { facility_admin: "Facility admin", scheduler: "Scheduler", gatekeeper: "Gatekeeper", platform_owner: "Platform owner" };

type Directory = {
  owners: { user_id: string; name: string; email: string; granted_at: string }[] | null;
  memberships: { id: string; user_id: string; name: string; email: string; facility: string; role: string; granted_at: string }[];
  invitations: { id: string; email: string; role: string; facility_id: string | null; expires_at: string }[];
};

export default async function StaffPage() {
  const ctx = await requireAdmin("/admin/staff");
  const supabase = await createSupabaseServerClient();
  const adminFacilities = ctx.facilities.filter((f) => ctx.adminOf.has(f.id));
  if (!ctx.isOwner && adminFacilities.length === 0) {
    return <><PageHeader title="Staff" /><Notice tone="info">Only facility administrators and platform owners manage staff.</Notice></>;
  }
  const dirs = ctx.isOwner
    ? [(await supabase.rpc("staff_directory", { p_facility_id: null })).data as Directory]
    : await Promise.all(adminFacilities.map(async (f) => (await supabase.rpc("staff_directory", { p_facility_id: f.id })).data as Directory));
  const memberships = dirs.flatMap((d) => d?.memberships ?? []);
  const invitations = dirs.flatMap((d) => d?.invitations ?? []);
  const owners = dirs[0]?.owners ?? null;
  const facName = new Map(ctx.facilities.map((f) => [f.id, f.name]));

  return (
    <>
      <PageHeader title="Staff" description="Staff join only by invitation. Each role is limited to the facilities it is assigned to; gatekeepers see only what they need at the gate." />
      <Card className="mb-6 p-4">
        <h2 className="font-display mb-3 text-xl">Invite someone</h2>
        <InviteForm facilities={adminFacilities} isOwner={ctx.isOwner} origin={siteUrl()} />
      </Card>
      {owners && (
        <section className="mb-6">
          <h2 className="font-display mb-2 text-2xl">Platform owners</h2>
          <ul className="divide-y divide-line panel text-sm">
            {owners.map((o) => (
              <li key={o.user_id} className="flex items-center justify-between gap-3 p-3">
                <span><strong>{o.name || "—"}</strong> <span className="text-muted">{o.email}</span></span>
                {o.user_id !== ctx.viewer.userId && <RevokeButton kind="owner" id={o.user_id} label="Remove owner" />}
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="mb-6">
        <h2 className="font-display mb-2 text-2xl">Facility staff</h2>
        {memberships.length === 0 ? <p className="text-sm text-muted">No staff assigned yet.</p> : (
          <ul className="divide-y divide-line panel text-sm">
            {memberships.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <span><strong>{m.name || "—"}</strong> <span className="text-muted">{m.email}</span></span>
                <span className="flex items-center gap-2"><Chip>{ROLE[m.role]}</Chip><span className="text-muted">{m.facility}</span>
                  {(ctx.isOwner || m.role !== "facility_admin") && m.user_id !== ctx.viewer.userId && <RevokeButton kind="membership" id={m.id} label="Revoke" />}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {invitations.length > 0 && (
        <section>
          <h2 className="font-display mb-2 text-2xl">Open invitations</h2>
          <ul className="divide-y divide-line panel text-sm">
            {invitations.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <span>{i.email} · {ROLE[i.role]}{i.facility_id ? ` · ${facName.get(i.facility_id) ?? ""}` : ""}</span>
                <span className="flex items-center gap-2 text-muted">expires {formatDateTime(i.expires_at)}<RevokeButton kind="invitation" id={i.id} label="Withdraw" /></span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
