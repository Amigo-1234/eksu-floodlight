import type { Metadata } from "next";
import { getBookingAccess } from "@/lib/access";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { z } from "zod";
import { Card } from "@/components/ui";
import { BookingTicket } from "@/components/booking/BookingTicket";
import { ReceiptActions } from "@/components/booking/ReceiptActions";
import { ManageBooking } from "@/components/booking/ManageBooking";
import { PayOnlineButton } from "@/components/booking/PayOnlineButton";
import { formatNaira } from "@/lib/format";
import { requireViewer } from "@/lib/auth";
import { getBookingEvents, getLatestReceipt, getOwnBooking, getOwnPass } from "@/lib/bookings";
import { formatDateTime, parseRange, todayInTz } from "@/lib/format";
import { siteUrl } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { BookingPolicy } from "@/lib/types";
import { nowMs } from "@/lib/clock";

export const metadata: Metadata = { title: "Booking" };
export const dynamic = "force-dynamic";

const EVENT_LABEL: Record<string, string> = {
  created: "Request submitted", approved: "Approved by staff", rejected: "Not approved", confirmed: "Confirmed",
  cancelled: "Cancelled", rescheduled: "Moved to a new time", payment_recorded: "Payment recorded by staff",
  payment_verified: "Payment verified", checked_in: "Checked in at the gate", test_check_in: "Gate test scan recorded",
  expired: "Expired",
};

export default async function BookingDetailPage(props: PageProps<"/dashboard/bookings/[id]">) {
  const { id } = await props.params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const viewer = await requireViewer(`/dashboard/bookings/${id}`);
  const booking = await getOwnBooking(id, viewer.userId);
  if (!booking) notFound();
  const supabase = await createSupabaseServerClient();
  const [receipt, pass, events, { data: policy }] = await Promise.all([
    getLatestReceipt(id), getOwnPass(id), getBookingEvents(id),
    supabase.from("booking_policies").select("*").eq("facility_id", booking.facility_id).maybeSingle(),
  ]);
  const p = policy as BookingPolicy | null;
  const access = await getBookingAccess();
  const { start } = parseRange(booking.period);
  const beforeStart = new Date(start).getTime() > nowMs();
  const hoursLeft = (new Date(start).getTime() - nowMs()) / 3600_000;

  const canCancel = beforeStart && (
    booking.status === "pending" ||
    (booking.status === "confirmed" && p?.customer_cancellation === "until_cutoff"
      && (p.cancellation_cutoff_hours == null || hoursLeft >= p.cancellation_cutoff_hours)));
  const canReschedule = beforeStart && ["pending", "confirmed"].includes(booking.status) && !!p?.customer_reschedule_allowed
    && (p.reschedule_cutoff_hours == null || hoursLeft >= p.reschedule_cutoff_hours);
  const cancelHint = booking.status === "pending"
    ? "Withdraw this request. The slot is released for others."
    : booking.status === "confirmed" && !canCancel
      ? "This facility doesn't allow cancelling confirmed bookings online. Please contact the facility with your reference."
      : booking.status === "confirmed" ? "Cancel this booking. Any refund follows the facility's policy." : "No changes are possible for this booking.";

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <Link href="/dashboard/bookings" className="no-print inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ChevronLeft className="size-4" aria-hidden="true" />My bookings
      </Link>
      <div className="mt-4 flex flex-col gap-5">
        <BookingTicket booking={booking} receipt={receipt} pass={pass} />
        {booking.status === "pending" && ["pending", "failed"].includes(booking.payment_status) && booking.approval_status !== "pending"
          && p && ["online", "hybrid", "deposit"].includes(p.payment_mode) && booking.amount_due_kobo != null && (
          access.online_payments
            ? <PayOnlineButton bookingId={booking.id} label={`Pay ${formatNaira(booking.amount_due_kobo)} online`} />
            : <p className="no-print rounded-2xl border border-line bg-surface p-4 text-sm text-muted">Online payment isn&apos;t open yet. You won&apos;t be charged — the facility will confirm how to pay before launch.</p>
        )}
        <ReceiptActions
          shareText={`${booking.facilities?.name} · ${formatDateTime(start, booking.facilities?.timezone)} · Ref ${booking.reference}`}
          shareUrl={`${siteUrl()}/facilities/${booking.facilities?.slug ?? ""}`} />
        <ManageBooking bookingId={booking.id} facilityId={booking.facility_id} timezone={booking.facilities?.timezone ?? "Africa/Lagos"}
          canCancel={canCancel} canReschedule={canReschedule} cancelHint={cancelHint} today={todayInTz(booking.facilities?.timezone)} />
        <Card className="no-print p-4">
          <h2 className="font-display mb-3 text-xl">History</h2>
          <ol className="relative flex flex-col gap-3 border-l border-line pl-4">
            {events.map((e) => (
              <li key={e.id} className="text-sm">
                <span className="absolute -left-[5px] mt-1.5 size-2.5 rounded-full bg-signal" aria-hidden="true" />
                <p className="font-medium">{EVENT_LABEL[e.event] ?? e.event.replace(/[._]/g, " ")}</p>
                <p className="text-xs text-muted">{formatDateTime(e.at, booking.facilities?.timezone)}</p>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </div>
  );
}
