import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ButtonLink } from "@/components/ui";
import { ArtSuccess, ArtTicket } from "@/components/brand/Illustrations";
import { BookingTicket } from "@/components/booking/BookingTicket";
import { ReceiptActions } from "@/components/booking/ReceiptActions";
import { requireViewer } from "@/lib/auth";
import { getLatestReceipt, getOwnBooking, getOwnPass } from "@/lib/bookings";
import { siteUrl } from "@/lib/supabase/env";
import { formatDateTime, parseRange } from "@/lib/format";
import { bookingHeadline } from "@/lib/status";

export const metadata: Metadata = { title: "Booking confirmation" };
export const dynamic = "force-dynamic";

export default async function ConfirmationPage(props: PageProps<"/booking/confirmation/[id]">) {
  const { id } = await props.params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const viewer = await requireViewer(`/booking/confirmation/${id}`);
  const booking = await getOwnBooking(id, viewer.userId);
  if (!booking) notFound();
  const [receipt, pass] = await Promise.all([getLatestReceipt(id), getOwnPass(id)]);
  const confirmed = ["confirmed", "checked_in", "completed"].includes(booking.status);
  const head = bookingHeadline(booking);
  const { start } = parseRange(booking.period);

  return (
    <div className="floodlight-sky flex-1 px-4 py-8">
      <div className="mx-auto flex max-w-md flex-col gap-5">
        <div className="animate-rise flex flex-col items-center gap-2 text-center">
          {confirmed ? <ArtSuccess className="h-32 w-auto" /> : <ArtTicket className="h-28 w-auto" />}
          <p className="eyebrow">{confirmed ? "Booking confirmed" : "Request sent"}</p>
          <h1 className="font-display text-5xl">{confirmed ? <>You&apos;re <span className="text-beam">on.</span></> : "Request received"}</h1>
          <p className="text-sm text-muted">
            {confirmed
              ? "Your booking is confirmed. Keep this receipt — it's always in My Bookings."
              : `Status: ${head.label}. We'll notify you when it changes. Your reference is saved in My Bookings.`}
          </p>
        </div>
        <BookingTicket booking={booking} receipt={receipt} pass={pass} />
        <ReceiptActions
          shareText={`${booking.facilities?.name} · ${formatDateTime(start, booking.facilities?.timezone)} · Ref ${booking.reference}`}
          shareUrl={`${siteUrl()}/facilities/${booking.facilities?.slug ?? ""}`} />
        <div className="no-print flex flex-col gap-2">
          <ButtonLink href={`/dashboard/bookings/${booking.id}`} variant="outline">Manage this booking</ButtonLink>
          <Link href="/facilities" className="text-center text-sm font-bold text-signal">Book another slot</Link>
        </div>
      </div>
    </div>
  );
}
