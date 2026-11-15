import type { Metadata } from "next";
import Link from "next/link";
import { Card, Chip, EmptyState } from "@/components/ui";
import { PageHeader } from "@/components/admin/PageHeader";
import { CreateFacilityForm } from "@/components/admin/FacilityForms";
import { requireAdmin } from "@/lib/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { READINESS_LABEL } from "@/lib/status";
import type { Readiness, SportCategory } from "@/lib/types";

export const metadata: Metadata = { title: "Facilities" };
export const dynamic = "force-dynamic";

export default async function AdminFacilities() {
  const ctx = await requireAdmin("/admin/facilities");
  const supabase = await createSupabaseServerClient();
  const { data: cats } = await supabase.from("sport_categories").select("*").order("sort_order");
  const readiness = await Promise.all(ctx.facilities.map(async (f) => {
    const { data } = await supabase.rpc("facility_booking_readiness", { p_facility: f.id });
    return [f.id, data as Readiness] as const;
  }));
  const ready = new Map(readiness);

  return (
    <>
      <PageHeader title="Facilities" description="Configure each EKSU facility: details, playing areas, hours, booking rules and prices. Only real facility information should be entered here." />
      {ctx.isOwner && (
        <Card className="mb-6 p-4">
          <h2 className="font-display mb-3 text-xl">Add a facility</h2>
          <CreateFacilityForm categories={(cats ?? []) as SportCategory[]} />
        </Card>
      )}
      {ctx.facilities.length === 0 ? <EmptyState title="No facilities" body="Nothing configured yet." /> : (
        <ul className="grid gap-3 md:grid-cols-2">
          {ctx.facilities.map((f) => {
            const r = ready.get(f.id);
            return (
              <li key={f.id}>
                <Link href={`/admin/facilities/${f.id}`} className="block rounded-[var(--radius-card)] border border-line bg-surface p-4 hover:border-muted">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-display text-2xl">{f.name}</p>
                    <div className="flex flex-wrap justify-end gap-1">
                      {f.is_dev_fixture && <Chip tone="warn">Dev fixture</Chip>}
                      <Chip tone={f.is_active ? "ok" : "muted"}>{f.is_active ? "Active" : "Inactive"}</Chip>
                    </div>
                  </div>
                  {r && !r.bookable && (
                    <ul className="mt-2 list-disc pl-5 text-sm text-warn">{r.missing.map((m) => <li key={m}>{READINESS_LABEL[m] ?? m}</li>)}</ul>
                  )}
                  {r?.bookable && <p className="mt-2 text-sm text-ok">Ready for bookings</p>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
