import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, Chip, EmptyState, Notice } from "@/components/ui";
import { PageHeader } from "@/components/admin/PageHeader";
import { FacilitySwitcher } from "@/components/admin/FacilitySwitcher";
import { BlockForm, CancelBlockButton } from "@/components/admin/BlockForm";
import { pickFacility, requireAdmin } from "@/lib/admin";
import { formatDateTime, parseRange, todayInTz } from "@/lib/format";
import { getAvailability } from "@/lib/data";
import { SLOT_STATE } from "@/lib/status";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Availability" };
export const dynamic = "force-dynamic";

export default async function AvailabilityPage(props: PageProps<"/admin/availability">) {
  const ctx = await requireAdmin("/admin/availability");
  const facility = pickFacility(ctx, (await props.searchParams).facility) ?? ctx.facilities[0]?.id ?? null;
  if (!facility) return <EmptyState title="No facilities" body="Nothing to configure yet." />;
  const supabase = await createSupabaseServerClient();
  const today = todayInTz();
  const [surfaces, blocks, slots] = await Promise.all([
    supabase.from("playing_surfaces").select("id, name").eq("facility_id", facility).eq("is_active", true).order("sort_order"),
    supabase.from("facility_blocks").select("id, surface_id, period, kind, reason").eq("facility_id", facility).is("cancelled_at", null)
      .not("period", "sl", `[${new Date().toISOString()},${new Date().toISOString()}]`).order("period"),
    getAvailability(facility, today).catch(() => []),
  ]);
  const canEdit = ctx.adminOf.has(facility);
  const surfaceName = new Map((surfaces.data ?? []).map((s) => [s.id, s.name]));

  return (
    <>
      <PageHeader title="Availability" description="Close a facility or a playing area for maintenance, closures or official university use. Slot length and opening hours are set on the facility page."
        actions={<Suspense><FacilitySwitcher facilities={ctx.facilities} allowAll={false} /></Suspense>} />
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="flex flex-col gap-4">
          {canEdit ? (
            <Card className="p-4"><h2 className="font-display mb-3 text-xl">Add a block</h2><BlockForm facilityId={facility} surfaces={surfaces.data ?? []} /></Card>
          ) : <Notice tone="info">Only facility administrators can add blocks.</Notice>}
          <Card className="p-4">
            <h2 className="font-display mb-3 text-xl">Upcoming blocks</h2>
            {(blocks.data ?? []).length === 0 ? <p className="text-sm text-muted">No closures scheduled.</p> : (
              <ul className="divide-y divide-line text-sm">
                {blocks.data!.map((b) => {
                  const { start, end } = parseRange(b.period);
                  return (
                    <li key={b.id} className="flex items-center justify-between gap-3 py-2">
                      <div>
                        <p className="font-medium">{b.kind.replace("_", " ")} · {b.surface_id ? surfaceName.get(b.surface_id) : "Whole facility"}</p>
                        <p className="text-muted">{formatDateTime(start)} → {formatDateTime(end)}{b.reason ? ` · ${b.reason}` : ""}</p>
                      </div>
                      {canEdit && <CancelBlockButton id={b.id} />}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
        <Card className="p-4">
          <h2 className="font-display mb-3 text-xl">Today&apos;s slots</h2>
          {slots.length === 0 ? <p className="text-sm text-muted">No slots today (closed, inactive or not configured).</p> : (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {slots.map((s) => (
                <li key={`${s.surface_id}${s.slot_start}`} className="rounded-lg border border-line p-2 text-xs">
                  <p className="font-mono">{formatDateTime(s.slot_start).split(" · ")[1]}</p>
                  <p className="truncate text-muted">{s.surface_name}</p>
                  <Chip tone={s.state === "available" ? "ok" : s.state === "blocked" ? "danger" : "muted"} className="mt-1">{SLOT_STATE[s.state].label}</Chip>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
