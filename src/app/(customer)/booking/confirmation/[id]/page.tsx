import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarClock, Check, CircleDot, Clock3, LayoutDashboard, Ticket } from "lucide-react";
import { z } from "zod";
import { ButtonLink, Chip, cx } from "@/components/ui";
import { CopyText } from "@/components/booking/ReceiptActions";
import { requireViewer } from "@/lib/auth";
import { getOwnBooking } from "@/lib/bookings";
import { formatDate, formatDuration, formatNaira, formatRange, minutesBetween, parseRange } from "@/lib/format";
import { bookingHeadline, paymentChip } from "@/lib/status";
import type { Booking } from "@/lib/types";

export const metadata: Metadata = { title: "Booking confirmation" };
export const dynamic = "force-dynamic";

/** Plain-language next steps derived only from the booking's stored statuses. */
function nextSteps(b: Booking, confirmed: boolean): { text: string; done: boolean }[] {
  const steps: { text: string; done: boolean }[] = [{ text: "Request submitted and slot held for you", done: true }];
  if (b.approval_status === "pending") steps.push({ text: "Facility staff review your request (you'll get an update here and on your dashboard)", done: false });
  if (b.approval_status === "approved") steps.push({ text: "Approved by facility staff", done: true });
  if (b.payment_status === "unconfigured") steps.push({ text: "The facility confirms how to pay — nothing has been charged", done: false });
  else if (b.payment_status === "pending" || b.payment_status === "failed") steps.push({ text: "Payment is needed before the booking is confirmed", done: false });
  steps.push({ text: confirmed ? "Your receipt is ready in My Bookings" : "Once confirmed, your receipt (and entry pass, if used) appears in My Bookings", done: confirmed });
  return steps;
}

export default async function ConfirmationPage(props: PageProps<"/booking/confirmation/[id]">) {
  const { id } = await props.params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const viewer = await requireViewer(`/booking/confirmation/${id}`);
  const booking = await getOwnBooking(id, viewer.userId);
  if (!booking) notFound();
  const confirmed = ["confirmed", "checked_in", "completed"].includes(booking.status);
  const head = bookingHeadline(booking);
  const tz = booking.facilities?.timezone ?? "Africa/Lagos";
  const { start, end } = parseRange(booking.period);

  return (
    <div className="floodlight-sky flex-1 page-pad">
      <div className="mx-auto flex max-w-md flex-col gap-4">
        <div className="animate-rise flex flex-col items-center gap-2 pt-2 text-center">
          <span className={cx("pop-in flex size-14 items-center justify-center rounded-full", confirmed ? "bg-ok/15 text-ok" : "bg-signal/15 text-signal")}>
            <Check className="size-7" strokeWidth={3} aria-hidden="true" />
          </span>
          <p className="eyebrow mt-1">{confirmed ? "Booking confirmed" : "Request sent"}</p>
          <h1 className="font-display t-page">{confirmed ? <>You&apos;re <span className="text-beam">on.</span></> : "Request submitted"}</h1>
          <p className="max-w-xs text-sm text-muted">
            {confirmed ? "Your slot is confirmed. Your receipt is saved in My Bookings." : "Your slot is held while the facility reviews it. Nothing has been charged."}
          </p>
        </div>

        <section aria-label="Booking summary" className="panel animate-rise overflow-hidden">
          <div className="flex items-start justify-between gap-3 border-b border-line p-4">
            <div className="min-w-0">
              <p className="font-bold leading-tight">{booking.facilities?.name}</p>
              <p className="text-sm text-muted">{booking.playing_surfaces?.name}</p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <Chip tone={head.tone}>{head.label}</Chip>
              {booking.is_test && <Chip tone="warn">TEST</Chip>}
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 p-4 text-sm">
            <div className="col-span-2 flex items-end justify-between gap-3">
              <div className="min-w-0">
                <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">Booking reference</dt>
                <dd className="font-mono text-lg tracking-[0.08em] text-signal">{booking.reference}</dd>
              </div>
              <CopyText text={booking.reference} />
            </div>
            <div className="min-w-0">
              <dt className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-faint"><CalendarClock className="size-3" aria-hidden="true" />When</dt>
              <dd className="font-semibold">{formatDate(start, tz, "short")}</dd>
              <dd className="tabular text-muted">{formatRange(start, end, tz)}</dd>
            </div>
            <div className="min-w-0">
              <dt className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-faint"><Clock3 className="size-3" aria-hidden="true" />Session</dt>
              <dd className="font-semibold">{formatDuration(minutesBetween(start, end))}</dd>
              {booking.amount_due_kobo != null && <dd className="font-mono text-muted">{formatNaira(booking.amount_due_kobo)}</dd>}
              <dd className="text-xs text-muted">{paymentChip(booking.payment_status, booking.is_test).label}</dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="next-h" className="panel animate-rise p-4">
          <h2 id="next-h" className="mb-2.5 text-sm font-bold">What happens next</h2>
          <ol className="flex flex-col gap-2 text-sm">
            {nextSteps(booking, confirmed).map((s) => (
              <li key={s.text} className="flex gap-2.5">
                {s.done ? <Check className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden="true" /> : <CircleDot className="mt-0.5 size-4 shrink-0 text-signal" aria-hidden="true" />}
                <span className={s.done ? "text-ink" : "text-muted"}>{s.text}<span className="sr-only">{s.done ? " (done)" : " (to do)"}</span></span>
              </li>
            ))}
          </ol>
        </section>

        <div className="no-print flex flex-col gap-2.5">
          <ButtonLink href={`/dashboard/bookings/${booking.id}`} size="lg">
            <Ticket className="size-4" aria-hidden="true" />{confirmed ? "View receipt" : "View booking"}
          </ButtonLink>
          <ButtonLink href="/dashboard" variant="outline"><LayoutDashboard className="size-4" aria-hidden="true" />Back to dashboard</ButtonLink>
        </div>
      </div>
    </div>
  );
}
