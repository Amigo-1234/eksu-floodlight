import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { z } from "zod";
import { Card, Chip } from "@/components/ui";
import { BookingAdminActions } from "@/components/admin/BookingAdminActions";
import { requireAdmin } from "@/lib/admin";
import { BOOKING_SELECT, getBookingEvents } from "@/lib/bookings";
import { formatDate, formatDateTime, formatDuration, formatNaira, formatRange, minutesBetween, parseRange } from "@/lib/format";
import { ACTIVITY_TYPE_LABEL, APPROVAL_LABEL, bookingHeadline, PAYMENT_LABEL } from "@/lib/status";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { nowMs } from "@/lib/clock";
import type { Booking, PaymentMode } from "@/lib/types";

export const metadata: Metadata = { title: "Booking" };
export const dynamic = "force-dynamic";

export default async function AdminBookingDetail(props: PageProps<"/admin/bookings/[id]">) {
  const { id } = await props.params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const ctx = await requireAdmin(`/admin/bookings/${id}`);
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("bookings").select(BOOKING_SELECT).eq("id", id).maybeSingle();
  if (!data) notFound();
  const b = data as Booking;
  const [events, payments, checkIns, policy] = await Promise.all([
    getBookingEvents(id),
    supabase.from("payment_transactions").select("id, provider, status, amount_kobo, method, receipt_number, verified_at, created_at").eq("booking_id", id).order("created_at"),
    supabase.from("check_ins").select("id, mode, method, at, device_label, manual_reason").eq("booking_id", id).order("at"),
    supabase.from("booking_policies").select("payment_mode").eq("facility_id", b.facility_id).maybeSingle(),
  ]);
  const { start, end } = parseRange(b.period);
  const h = bookingHeadline(b);
  const isAdmin = ctx.adminOf.has(b.facility_id);
  const canCancel = isAdmin || b.created_by === ctx.viewer.userId;

  return (
    <>
      <Link href="/admin/bookings" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ChevronLeft className="size-4" aria-hidden="true" />Bookings</Link>
      <div className="mt-2 mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-sm text-muted">{b.reference}</p>
          <h1 className="font-display text-4xl sm:text-5xl">{formatRange(start, end)} · {formatDate(start, undefined, "short")}</h1>
          <p className="text-muted">{b.facilities?.name} · {b.playing_surfaces?.name}</p>
        </div>
        <div className="flex flex-wrap gap-2"><Chip tone={h.tone}>{h.label}</Chip><Chip>{PAYMENT_LABEL[b.payment_status]}</Chip></div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex flex-col gap-4">
          <Card className="p-4">
            <h2 className="font-display mb-3 text-xl">Details</h2>
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              {([
                ["Organiser", b.organizer_name], ["Phone", b.organizer_phone], ["Email", b.organizer_email],
                ["Activity", ACTIVITY_TYPE_LABEL[b.activity_type]], ["Title", b.activity_title],
                ["Teams", [b.team_name, b.opponent_name].filter(Boolean).join(" vs ")], ["Purpose", b.purpose],
                ["Source", b.source === "customer" ? "Customer request" : b.source === "walk_in" ? "Walk-in (staff)" : "Staff booking"],
                ["Approval", APPROVAL_LABEL[b.approval_status]], ["Payment", PAYMENT_LABEL[b.payment_status]],
                ["Duration", formatDuration(minutesBetween(start, end))],
                ["Amount due", b.amount_due_kobo != null ? `${formatNaira(b.amount_due_kobo)} (per session)` : null],
                ["Public listing", b.public_listing ? "Yes" : "No"], ["Notes", b.notes], ["Decision note", b.decision_reason],
                ["Cancellation reason", b.cancellation_reason],
              ] as const).filter(([, v]) => v).map(([k, v]) => (
                <div key={k}><dt className="text-xs text-muted">{k}</dt><dd className="whitespace-pre-line font-medium">{v}</dd></div>
              ))}
            </dl>
          </Card>

          {(payments.data ?? []).length > 0 && (
            <Card className="p-4">
              <h2 className="font-display mb-3 text-xl">Payments</h2>
              <ul className="divide-y divide-line text-sm">
                {payments.data!.map((t) => (
                  <li key={t.id} className="flex flex-wrap justify-between gap-2 py-2">
                    <span>{t.provider === "offline" ? `Offline · ${t.method ?? ""}` : "Paystack"} {t.receipt_number && <span className="font-mono text-xs text-muted">#{t.receipt_number}</span>}</span>
                    <span className="font-mono">{formatNaira(t.amount_kobo)}</span>
                    <Chip tone={t.status === "succeeded" ? "ok" : t.status === "failed" ? "danger" : "warn"}>{t.status}</Chip>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {(checkIns.data ?? []).length > 0 && (
            <Card className="p-4">
              <h2 className="font-display mb-3 text-xl">Check-ins</h2>
              <ul className="text-sm">
                {checkIns.data!.map((c) => (
                  <li key={c.id} className="py-1">{formatDateTime(c.at)} · {c.method === "manual" ? `Manual (${c.manual_reason})` : "QR scan"} · {c.mode === "test" ? "test mode" : "live"}</li>
                ))}
              </ul>
            </Card>
          )}

          <Card className="p-4">
            <h2 className="font-display mb-3 text-xl">History</h2>
            <ol className="flex flex-col gap-2 text-sm">
              {events.map((e) => (
                <li key={e.id} className="flex justify-between gap-3"><span>{e.event.replace(/[._]/g, " ")}</span><span className="text-muted tabular">{formatDateTime(e.at)}</span></li>
              ))}
            </ol>
          </Card>
        </div>

        <BookingAdminActions
          bookingId={b.id} status={b.status} approval={b.approval_status} payment={b.payment_status}
          paymentMode={(policy.data?.payment_mode ?? "unconfigured") as PaymentMode}
          activity={b.activities?.status ?? null} homeScore={b.activities?.home_score ?? null} awayScore={b.activities?.away_score ?? null}
          isAdmin={isAdmin} canCancel={canCancel}
          amountDueNaira={b.amount_due_kobo != null ? b.amount_due_kobo / 100 : null}
          upcoming={new Date(end).getTime() > nowMs()} />
      </div>
    </>
  );
}
