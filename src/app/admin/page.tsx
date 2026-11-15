import type { Metadata } from "next";
import { ArtClipboard } from "@/components/brand/Illustrations";
import Link from "next/link";
import { Suspense } from "react";
import { buttonClass, Card, Chip, EmptyState, Notice } from "@/components/ui";
import { PageHeader, Stat } from "@/components/admin/PageHeader";
import { FacilitySwitcher } from "@/components/admin/FacilitySwitcher";
import { pickFacility, requireAdmin } from "@/lib/admin";
import { BOOKING_SELECT } from "@/lib/bookings";
import { formatDate, formatNaira, formatRange, parseRange, todayInTz } from "@/lib/format";
import { bookingHeadline } from "@/lib/status";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Booking } from "@/lib/types";

export const metadata: Metadata = { title: "Admin overview" };
export const dynamic = "force-dynamic";

type Overview = {
  total: number; today: number; confirmed_upcoming: number; pending_approval: number; pending_payment: number;
  cancelled_30d: number; available_slots_today: number; check_ins_today: number; manual_check_ins_7d: number;
  payments_recorded: number; revenue_kobo_30d: number | null;
};

export default async function AdminOverview(props: PageProps<"/admin">) {
  const ctx = await requireAdmin("/admin");
  const facility = pickFacility(ctx, (await props.searchParams).facility);
  const supabase = await createSupabaseServerClient();
  const today = todayInTz();
  const dayStart = new Date(`${today}T00:00:00+01:00`).toISOString();
  const dayEnd = new Date(new Date(dayStart).getTime() + 86400_000).toISOString();

  if (ctx.facilities.length === 0) {
    return (
      <>
        <PageHeader title="Overview" />
        <EmptyState art={<ArtClipboard className="h-28 w-auto" />} title="Let's light up the first field"
          body={ctx.isOwner ? "Create the first EKSU facility to start taking bookings." : "You haven't been assigned to a facility yet."}
          action={ctx.isOwner ? <Link href="/admin/facilities" className={buttonClass("signal", "md")}>Add a facility</Link> : undefined} />
      </>
    );
  }

  const ids = facility ? [facility] : ctx.facilities.map((f) => f.id);
  const [ov, pending, todays] = await Promise.all([
    supabase.rpc("admin_overview", { p_facility_id: facility }),
    supabase.from("bookings").select(BOOKING_SELECT).in("facility_id", ids).eq("status", "pending").eq("approval_status", "pending")
      .order("created_at").limit(6),
    supabase.from("bookings").select(BOOKING_SELECT).in("facility_id", ids).overlaps("period", `[${dayStart},${dayEnd})`)
      .not("status", "in", "(cancelled,rejected,expired)").order("period").limit(50),
  ]);
  const o = ov.data as Overview | null;

  return (
    <>
      <PageHeader title="Today" description={formatDate(new Date().toISOString())}
        actions={<Suspense><FacilitySwitcher facilities={ctx.facilities} /></Suspense>} />
      {ov.error && <Notice tone="danger" className="mb-4">Couldn&apos;t load metrics.</Notice>}
      {o && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Bookings today" value={o.today} />
          <Stat label="Free slots left today" value={o.available_slots_today} />
          <Stat label="Awaiting approval" value={o.pending_approval} tone={o.pending_approval ? "warn" : undefined} />
          <Stat label="Awaiting payment / decision" value={o.pending_payment} tone={o.pending_payment ? "warn" : undefined} />
          <Stat label="Confirmed upcoming" value={o.confirmed_upcoming} />
          <Stat label="Check-ins today" value={o.check_ins_today} hint={o.manual_check_ins_7d ? `${o.manual_check_ins_7d} manual in 7 days` : undefined} />
          <Stat label="Cancelled (30 days)" value={o.cancelled_30d} />
          {o.payments_recorded > 0
            ? <Stat label="Payments (30 days)" value={formatNaira(o.revenue_kobo_30d ?? 0)} hint={`${o.payments_recorded} recorded payments`} />
            : <Stat label="All bookings" value={o.total} />}
        </div>
      )}

      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <section aria-labelledby="queue-h">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="queue-h" className="font-display text-2xl">Needs a decision</h2>
            <Link href={`/admin/bookings?view=pending${facility ? `&facility=${facility}` : ""}`} className="text-sm font-semibold text-signal">All requests</Link>
          </div>
          {(pending.data ?? []).length === 0 ? <Card className="p-5 text-sm text-muted">No requests waiting.</Card> : (
            <ul className="flex flex-col gap-2">
              {(pending.data as Booking[]).map((b) => {
                const { start, end } = parseRange(b.period);
                return (
                  <li key={b.id}>
                    <Link href={`/admin/bookings/${b.id}`} className="flex items-center justify-between gap-3 panel p-3 hover:border-muted">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{b.organizer_name} <span className="font-normal text-muted">· {b.facilities?.name}</span></p>
                        <p className="text-sm text-muted tabular">{formatDate(start, undefined, "short")} · {formatRange(start, end)}</p>
                      </div>
                      <Chip tone="warn">Review</Chip>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-labelledby="day-h">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="day-h" className="font-display text-2xl">Day-sheet</h2>
            <Link href={`/admin/bookings?date=${today}${facility ? `&facility=${facility}` : ""}`} className="text-sm font-semibold text-signal">Open</Link>
          </div>
          {(todays.data ?? []).length === 0 ? <Card className="p-5 text-sm text-muted">Nothing booked today.</Card> : (
            <ol className="flex flex-col divide-y divide-line panel">
              {(todays.data as Booking[]).map((b) => {
                const { start, end } = parseRange(b.period);
                const h = bookingHeadline(b);
                return (
                  <li key={b.id}>
                    <Link href={`/admin/bookings/${b.id}`} className="grid grid-cols-[96px_minmax(0,1fr)_auto] items-center gap-3 p-3 hover:bg-raised">
                      <span className="font-mono text-sm tabular">{formatRange(start, end)}</span>
                      <span className="truncate text-sm"><strong>{b.playing_surfaces?.name}</strong> · {b.activity_title ?? b.organizer_name}</span>
                      <Chip tone={h.tone}>{h.label}</Chip>
                    </Link>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>
    </>
  );
}
