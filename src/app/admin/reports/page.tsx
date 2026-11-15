import type { Metadata } from "next";
import { ArtClipboard } from "@/components/brand/Illustrations";
import { Suspense } from "react";
import { Card, EmptyState, Notice } from "@/components/ui";
import { PageHeader, Stat } from "@/components/admin/PageHeader";
import { FacilitySwitcher } from "@/components/admin/FacilitySwitcher";
import { pickFacility, requireAdmin } from "@/lib/admin";
import { addDays, isYmd, todayInTz } from "@/lib/format";
import { ACTIVITY_TYPE_LABEL, BOOKING_STATUS_LABEL } from "@/lib/status";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActivityType, BookingStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

type Report = {
  by_status: Record<string, number>; by_day: { day: string; bookings: number }[]; by_hour: { hour: number; bookings: number }[];
  by_activity: Record<string, number>; capacity_minutes: number; booked_minutes: number; utilization: number | null;
  cancellations: number; rejections: number; check_ins: { total: number; manual: number; test_mode: number };
};

function Bars({ rows, label }: { rows: { key: string; value: number }[]; label: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <figure>
      <figcaption className="sr-only">{label}</figcaption>
      <ul className="flex flex-col gap-1.5">
        {rows.map((r) => (
          <li key={r.key} className="grid grid-cols-[72px_minmax(0,1fr)_40px] items-center gap-2 text-xs">
            <span className="text-muted tabular">{r.key}</span>
            <span className="h-3 rounded-full bg-raised"><span className="block h-3 rounded-full bg-signal" style={{ width: `${(r.value / max) * 100}%` }} /></span>
            <span className="text-right tabular">{r.value}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

export default async function ReportsPage(props: PageProps<"/admin/reports">) {
  const ctx = await requireAdmin("/admin/reports");
  const sp = await props.searchParams;
  const facility = pickFacility(ctx, sp.facility);
  const to = isYmd(sp.to) ? sp.to : todayInTz();
  const from = isYmd(sp.from) ? sp.from : addDays(to, -29);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_report", { p_facility_id: facility, p_from: from, p_to: to });
  const r = data as Report | null;
  const total = r ? Object.values(r.by_status).reduce((a, b) => a + b, 0) : 0;

  return (
    <>
      <PageHeader title="Reports" description="Built only from recorded bookings, blocks and check-ins."
        actions={<>
          <Suspense><FacilitySwitcher facilities={ctx.facilities} /></Suspense>
          <form className="flex items-center gap-2 text-sm" action="/admin/reports">
            {facility && <input type="hidden" name="facility" value={facility} />}
            <label className="sr-only" htmlFor="from">From</label><input id="from" name="from" type="date" defaultValue={from} className="h-10 rounded-xl border border-line bg-surface px-2" />
            <label className="sr-only" htmlFor="to">To</label><input id="to" name="to" type="date" defaultValue={to} className="h-10 rounded-xl border border-line bg-surface px-2" />
            <button className="h-10 rounded-xl bg-ink px-3 font-semibold text-bg">Apply</button>
          </form>
        </>} />
      {error && <Notice tone="danger">{error.message.startsWith("INVALID_RANGE") ? "Choose a range of up to 92 days." : "Couldn't build the report."}</Notice>}
      {r && total === 0 && <EmptyState art={<ArtClipboard className="h-28 w-auto" />} title="No bookings in this range" body="Try a wider date range." />}
      {r && total > 0 && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Bookings" value={total} />
            <Stat label="Utilisation" value={r.utilization != null ? `${Math.round(r.utilization * 100)}%` : "—"}
              hint={r.capacity_minutes ? `${Math.round(r.booked_minutes / 60)} of ${Math.round(r.capacity_minutes / 60)} bookable hours` : "No configured capacity"} />
            <Stat label="Cancelled" value={r.cancellations} hint={`${r.rejections} declined`} />
            <Stat label="Check-ins" value={r.check_ins.total} hint={`${r.check_ins.manual} manual · ${r.check_ins.test_mode} test mode`} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4"><h2 className="font-display mb-3 text-xl">Bookings per day</h2>
              <Bars label="Bookings per day" rows={r.by_day.map((d) => ({ key: d.day.slice(5), value: d.bookings }))} /></Card>
            <Card className="p-4"><h2 className="font-display mb-3 text-xl">Peak start times</h2>
              <Bars label="Bookings by start hour" rows={r.by_hour.map((h) => ({ key: `${String(h.hour).padStart(2, "0")}:00`, value: h.bookings }))} /></Card>
            <Card className="p-4"><h2 className="font-display mb-3 text-xl">By status</h2>
              <Bars label="Bookings by status" rows={Object.entries(r.by_status).map(([k, v]) => ({ key: BOOKING_STATUS_LABEL[k as BookingStatus] ?? k, value: v }))} /></Card>
            <Card className="p-4"><h2 className="font-display mb-3 text-xl">By activity</h2>
              <Bars label="Bookings by activity" rows={Object.entries(r.by_activity).map(([k, v]) => ({ key: ACTIVITY_TYPE_LABEL[k as ActivityType]?.split(" ")[0] ?? k, value: v }))} /></Card>
          </div>
        </div>
      )}
    </>
  );
}
