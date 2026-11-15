import type { Metadata } from "next";
import Link from "next/link";
import { Bell } from "lucide-react";
import { ButtonLink, Card, Chip, EmptyState } from "@/components/ui";
import { BookingRow } from "@/components/booking/BookingRow";
import { requireViewer } from "@/lib/auth";
import { listOwnBookings } from "@/lib/bookings";
import { formatDate, formatDateTime, formatRange, parseRange } from "@/lib/format";
import { bookingHeadline } from "@/lib/status";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { markNotificationsRead } from "../actions";
import { nowMs } from "@/lib/clock";

export const metadata: Metadata = { title: "My dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const viewer = await requireViewer("/dashboard");
  const supabase = await createSupabaseServerClient();
  const [bookings, { data: notes }] = await Promise.all([
    listOwnBookings(viewer.userId),
    supabase.from("notifications").select("id, title, body, created_at, read_at, booking_id")
      .eq("user_id", viewer.userId).order("created_at", { ascending: false }).limit(8),
  ]);
  const now = nowMs();
  const upcoming = bookings
    .filter((b) => ["pending", "confirmed", "held"].includes(b.status) && new Date(parseRange(b.period).end).getTime() > now)
    .sort((a, b) => new Date(parseRange(a.period).start).getTime() - new Date(parseRange(b.period).start).getTime());
  const next = upcoming[0];
  const awaiting = bookings.filter((b) => b.status === "pending").length;
  const unread = (notes ?? []).filter((n) => !n.read_at).length;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <p className="text-sm text-muted">Welcome{viewer.fullName ? `, ${viewer.fullName.split(" ")[0]}` : ""}</p>
      <h1 className="font-display text-5xl">My dashboard</h1>

      {next ? (() => {
        const { start, end } = parseRange(next.period);
        const tz = next.facilities?.timezone;
        const head = bookingHeadline(next);
        return (
          <Link href={`/dashboard/bookings/${next.id}`}
            className="animate-rise mt-6 block rounded-[22px] bg-signal p-5 text-signal-ink transition-transform active:scale-[0.99]">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em]">
              <span>Next up · {next.facilities?.name}</span>
              <span className="rounded-full bg-signal-ink px-2 py-0.5 text-signal">{head.label}</span>
            </div>
            <p className="font-display mt-3 text-5xl tabular">{formatRange(start, end, tz).split(" – ")[0]}</p>
            <p className="text-sm font-semibold">{formatDate(start, tz)}</p>
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="truncate">{next.activity_title ?? ([next.team_name, next.opponent_name].filter(Boolean).join(" vs ") || next.playing_surfaces?.name)}</span>
              <span className="font-mono">{next.reference}</span>
            </div>
          </Link>
        );
      })() : (
        <div className="mt-6">
          <EmptyState title="No upcoming bookings" body="Find a facility and pick a time that suits your team."
            action={<ButtonLink href="/facilities">Book a field</ButtonLink>} />
        </div>
      )}

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Card className="p-3"><p className="font-display text-3xl tabular">{upcoming.length}</p><p className="text-xs text-muted">Upcoming</p></Card>
        <Card className="p-3"><p className="font-display text-3xl tabular">{awaiting}</p><p className="text-xs text-muted">Awaiting action</p></Card>
        <Card className="p-3"><p className="font-display text-3xl tabular">{bookings.length}</p><p className="text-xs text-muted">All bookings</p></Card>
      </div>

      {upcoming.length > 1 && (
        <section className="mt-8" aria-labelledby="up-h">
          <h2 id="up-h" className="font-display mb-3 text-2xl">Coming up</h2>
          <ul className="flex flex-col gap-2">{upcoming.slice(1, 6).map((b) => <BookingRow key={b.id} b={b} href={`/dashboard/bookings/${b.id}`} />)}</ul>
        </section>
      )}

      <section className="mt-8" aria-labelledby="notes-h">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="notes-h" className="font-display flex items-center gap-2 text-2xl"><Bell className="size-5 text-signal" aria-hidden="true" />Updates {unread > 0 && <Chip tone="signal">{unread} new</Chip>}</h2>
          {unread > 0 && (
            <form action={markNotificationsRead}><button className="text-sm font-semibold text-signal">Mark all read</button></form>
          )}
        </div>
        {(notes ?? []).length === 0 ? (
          <p className="text-sm text-muted">No updates yet. You&apos;ll see approvals, confirmations and changes here.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-[var(--radius-card)] border border-line bg-surface">
            {notes!.map((n) => (
              <li key={n.id} className="flex gap-3 p-3">
                <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.read_at ? "bg-transparent" : "bg-signal"}`} aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{n.booking_id ? <Link href={`/dashboard/bookings/${n.booking_id}`} className="hover:underline">{n.title}</Link> : n.title}</p>
                  <p className="text-sm text-muted">{n.body}</p>
                  <p className="text-xs text-faint">{formatDateTime(n.created_at)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
