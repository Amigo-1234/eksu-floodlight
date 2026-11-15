import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink, EmptyState, stagger } from "@/components/ui";
import { ArtTicket } from "@/components/brand/Illustrations";
import { BookingRow } from "@/components/booking/BookingRow";
import { requireViewer } from "@/lib/auth";
import { listOwnBookings } from "@/lib/bookings";
import { parseRange } from "@/lib/format";
import type { Booking } from "@/lib/types";
import { nowMs } from "@/lib/clock";

export const metadata: Metadata = { title: "My bookings" };
export const dynamic = "force-dynamic";

const TABS = [
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Past" },
  { key: "cancelled", label: "Cancelled & declined" },
] as const;

function bucket(b: Booking, now: number): (typeof TABS)[number]["key"] {
  if (["cancelled", "rejected", "expired"].includes(b.status)) return "cancelled";
  return new Date(parseRange(b.period).end).getTime() > now ? "upcoming" : "past";
}

export default async function MyBookingsPage(props: PageProps<"/dashboard/bookings">) {
  const { tab } = await props.searchParams;
  const active = TABS.find((t) => t.key === tab)?.key ?? "upcoming";
  const viewer = await requireViewer("/dashboard/bookings");
  const all = await listOwnBookings(viewer.userId);
  const now = nowMs();
  const shown = all.filter((b) => bucket(b, now) === active)
    .sort((a, b) => {
      const d = new Date(parseRange(a.period).start).getTime() - new Date(parseRange(b.period).start).getTime();
      return active === "upcoming" ? d : -d;
    });

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <p className="eyebrow">Your passes &amp; receipts</p>
      <h1 className="font-display mt-2 text-5xl">My bookings</h1>
      <nav aria-label="Booking lists" className="mt-6 grid grid-cols-3 gap-1 rounded-2xl border border-line bg-surface p-1">
        {TABS.map((t) => (
          <Link key={t.key} href={`/dashboard/bookings?tab=${t.key}`} aria-current={t.key === active ? "page" : undefined}
            className="rounded-xl px-2 py-2.5 text-center text-[13px] font-bold text-muted transition-colors aria-[current=page]:bg-signal aria-[current=page]:text-signal-ink">
            {t.label} <span className="opacity-60">({all.filter((b) => bucket(b, now) === t.key).length})</span>
          </Link>
        ))}
      </nav>
      <div className="mt-5">
        {shown.length === 0 ? (
          <EmptyState art={<ArtTicket className="h-28 w-auto" />} title={active === "upcoming" ? "No games lined up" : "Nothing here yet"} body={active === "upcoming" ? "Your next booking will show up here with its pass." : "Bookings you make will be kept here."}
            action={active === "upcoming" ? <ButtonLink href="/facilities">Book a slot</ButtonLink> : undefined} />
        ) : (
          <ul className="stagger flex flex-col gap-2.5">{shown.map((b, i) => <div key={b.id} style={stagger(i)}><BookingRow b={b} href={`/dashboard/bookings/${b.id}`} /></div>)}</ul>
        )}
      </div>
    </div>
  );
}
