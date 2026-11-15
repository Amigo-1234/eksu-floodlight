import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink, EmptyState } from "@/components/ui";
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
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="font-display text-5xl">My bookings</h1>
      <nav aria-label="Booking lists" className="mt-5 grid grid-cols-3 gap-1 rounded-xl bg-surface p-1">
        {TABS.map((t) => (
          <Link key={t.key} href={`/dashboard/bookings?tab=${t.key}`} aria-current={t.key === active ? "page" : undefined}
            className="rounded-lg px-2 py-2 text-center text-[13px] font-semibold text-muted aria-[current=page]:bg-raised aria-[current=page]:text-ink">
            {t.label} <span className="text-faint">({all.filter((b) => bucket(b, now) === t.key).length})</span>
          </Link>
        ))}
      </nav>
      <div className="mt-5">
        {shown.length === 0 ? (
          <EmptyState title="Nothing here" body={active === "upcoming" ? "You have no upcoming bookings." : "No bookings in this list."}
            action={active === "upcoming" ? <ButtonLink href="/facilities">Book a field</ButtonLink> : undefined} />
        ) : (
          <ul className="flex flex-col gap-2">{shown.map((b) => <BookingRow key={b.id} b={b} href={`/dashboard/bookings/${b.id}`} />)}</ul>
        )}
      </div>
    </div>
  );
}
