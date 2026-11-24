import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { z } from "zod";
import { Card, Chip } from "@/components/ui";
import { BookingAdminActions } from "@/components/admin/BookingAdminActions";
import { ProofReview, type ProofView } from "@/components/admin/ProofReview";
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
  const [events, payments, checkIns, policy, proofRows, settings] = await Promise.all([
    getBookingEvents(id),
    supabase.from("payment_transactions").select("id, provider, status, amount_kobo, method, receipt_number, verified_at, created_at").eq("booking_id", id).order("created_at"),
    supabase.from("check_ins").select("id, mode, method, at, device_label, manual_reason").eq("booking_id", id).order("at"),
    supabase.from("booking_policies").select("payment_mode").eq("facility_id", b.facility_id).maybeSingle(),
    supabase.from("payment_proofs").select("id, status, decision_reason, created_at, file_name, storage_path").eq("booking_id", id).order("created_at", { ascending: false }),
    supabase.from("platform_settings").select("max_receipt_uploads").eq("id", 1).maybeSingle(),
  ]);
  const proofs: ProofView[] = await Promise.all((proofRows.data ?? []).map(async (x) => {
    const { data: signed } = await supabase.storage.from("floodlight-payment-proofs").createSignedUrl(x.storage_path, 600);
    return { id: x.id, status: x.status, decision_reason: x.decision_reason, created_at: x.created_at, file_name: x.file_name,
      url: signed?.signedUrl ?? null, isPdf: /\.pdf$/i.test(x.storage_path) };
  }));
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
          <h1 className="font-display t-page">{formatRange(start, end)} · {formatDate(start, undefined, "short")}</h1>
          <p className="text-muted">{b.facilities?.name} · {b.playing_surfaces?.name}</p>
        </div>
        <div className="flex flex-wrap gap-2">{b.is_test && <Chip tone="warn">TEST BOOKING</Chip>}<Chip tone={h.tone}>{h.label}</Chip><Chip>{b.is_test && b.payment_status === "waived" ? "Test waiver — no payment collected" : PAYMENT_LABEL[b.payment_status]}</Chip></div>
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

          {proofs.length > 0 && (
            <Card className="p-4">
              <h2 className="font-display mb-3 text-xl">Payment receipts</h2>
              <ProofReview proofs={proofs} amountKobo={b.amount_due_kobo} reference={b.reference} canReview={isAdmin}
                attemptsLeft={Math.max(0, (settings.data?.max_receipt_uploads ?? 2) - (b.proof_attempts ?? 0))} />
            </Card>
          )}
          {b.status === "pending" && b.approval_status === "pending" && b.approval_deadline && (
            <p className="text-sm text-muted">Decide by <strong className="text-ink">{formatDateTime(b.approval_deadline)}</strong> — after that the request expires and the session is released.</p>
          )}
          {b.status === "pending" && b.approval_status === "approved" && b.payment_deadline && b.proof_status !== "submitted" && (
            <p className="text-sm text-muted">Waiting for the customer&apos;s receipt until <strong className="text-ink">{formatDateTime(b.payment_deadline)}</strong>.</p>
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
          upcoming={new Date(end).getTime() > nowMs()} isTest={!!b.is_test} />
      </div>
    </>
  );
}
