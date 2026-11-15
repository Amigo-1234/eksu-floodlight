import type { Metadata } from "next";
import { brand } from "@/lib/brand";

export const metadata: Metadata = { title: "Booking policies & privacy" };

export default function PoliciesPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-10 text-[15px] leading-relaxed">
      <h1 className="font-display text-5xl">Booking policies &amp; privacy</h1>
      <p className="mt-3 text-muted">{brand.endorsementNotice}</p>

      <h2 className="font-display mt-10 text-2xl">Each facility sets its own rules</h2>
      <p className="mt-2 text-ink/90">
        Slot length, opening hours, how far ahead you can book, whether a request needs staff approval, whether a fee applies,
        and how cancellations work are set separately for every facility by its managers. You can see a facility&apos;s current
        rules on its page before you book. Where a rule hasn&apos;t been set, the page says so rather than guessing.
      </p>

      <h2 className="font-display mt-8 text-2xl">Booking status, payment and entry are separate</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-ink/90">
        <li><strong>Booking status</strong> tells you whether your reservation is pending, confirmed, cancelled or finished.</li>
        <li><strong>Payment status</strong> is shown on its own. A booking receipt is not proof of payment unless it says <em>Paid</em>.</li>
        <li><strong>Entry passes</strong> are issued only where a facility has enabled them, and are checked live at the gate.</li>
      </ul>

      <h2 className="font-display mt-8 text-2xl">Your information</h2>
      <p className="mt-2 text-ink/90">
        We store your name, contact details, and the details you give for each booking (team names, purpose, notes). They are used
        to manage your bookings and are visible only to you and the staff of the facility you booked. Gate staff see only what
        they need to check you in (first name, teams, time). The public schedule shows a booking only if you chose to list it,
        and never shows contact details.
      </p>
      <p className="mt-2 text-ink/90">
        Payment card details are never stored by this platform. Online payment, if a facility enables it, is handled by the
        payment provider.
      </p>
      <p className="mt-6 text-sm text-muted">
        These terms are a working draft pending confirmation of facility policies and data-retention requirements by the client.
      </p>
    </article>
  );
}
