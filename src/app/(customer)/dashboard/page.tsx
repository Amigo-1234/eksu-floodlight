import type { Metadata } from "next";
import Link from "next/link";
import { Bell, Plus } from "lucide-react";
import { ButtonLink, Chip, EmptyState, Notice } from "@/components/ui";
import { ArtTicket } from "@/components/brand/Illustrations";
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

export default async function DashboardPage(props: PageProps<"/dashboard">) {
  const { welcome, password } = await props.searchParams;
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
  const awaiting = upcoming.filter((b) => b.status === "pending" || b.status === "held").length;
  const confirmedCount = upcoming.filter((b) => b.status === "confirmed").length;
  const pendingList = upcoming.slice(1).filter((b) => b.status !== "confirmed");
  const confirmedList = upcoming.slice(1).filter((b) => b.status === "confirmed");
  const unread = (notes ?? []).filter((n) => !n.read_at).length;

  return (
    <div className="mx-auto w-full max-w-3xl page-pad">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display t-page min-w-0">Hey{viewer.fullName ? `, ${viewer.fullName.split(" ")[0]}` : ""} <span aria-hidden="true">👋</span></h1>
        <ButtonLink href="/facilities" size="sm" className="shrink-0"><Plus className="size-4" aria-hidden="true" />Book</ButtonLink>
      </div>
      {welcome && (
        <Notice tone="ok" title="Welcome to Floodlight!" className="mt-4">Your account is ready. Pick a facility to book your first session.</Notice>
      )}
      {password === "updated" && <Notice tone="ok" className="mt-4">Password updated.</Notice>}

      {next ? (() => {
        const { start, end } = parseRange(next.period);
        const tz = next.facilities?.timezone;
        const head = bookingHeadline(next);
        return (
          <Link href={`/dashboard/bookings/${next.id}`}
            className="glow-ring animate-rise relative mt-5 block overflow-hidden rounded-[22px] bg-[linear-gradient(135deg,#ffd166,#ffc53d_45%,#ff9f1c)] p-4 text-signal-ink transition-transform duration-200 hover:-translate-y-0.5 active:scale-[0.99] sm:p-5">
            <div className="pitch-lines pointer-events-none absolute inset-0 opacity-60" aria-hidden="true" />
            <div className="relative flex items-center justify-between gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.16em]">
              <span className="min-w-0 truncate">Next up · {next.facilities?.name}</span>
              <span className="shrink-0 rounded-full bg-signal-ink px-2 py-0.5 text-signal">{head.label}</span>
            </div>
            <div className="relative mt-3 flex items-baseline gap-2">
              <p className="font-display text-[40px] leading-none tracking-[-0.04em] tabular">{formatRange(start, end, tz).split(" – ")[0]}</p>
              <p className="text-sm font-bold opacity-80">– {formatRange(start, end, tz).split(" – ")[1]}</p>
            </div>
            <p className="relative mt-1 text-sm font-bold">{formatDate(start, tz)}</p>
            <div className="relative mt-3 flex items-center justify-between gap-3 border-t border-signal-ink/20 pt-2.5 text-sm font-semibold">
              <span className="min-w-0 truncate">{next.activity_title ?? ([next.team_name, next.opponent_name].filter(Boolean).join(" vs ") || next.playing_surfaces?.name)}</span>
              <span className="shrink-0 font-mono text-xs">{next.reference}</span>
            </div>
          </Link>
        );
      })() : (
        <div className="mt-5">
          <EmptyState art={<ArtTicket className="h-24 w-auto" />} title="No games lined up" body="Pick a field and a time."
            action={<ButtonLink href="/facilities">Book a session</ButtonLink>} />
        </div>
      )}

      <nav aria-label="Booking summary" className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Link href="/dashboard/bookings?tab=upcoming" className="panel lift px-2 py-3"><p className="font-display t-stat tabular text-signal">{confirmedCount}</p><p className="mt-1 text-[11.5px] font-semibold text-muted">Confirmed</p></Link>
        <Link href="/dashboard/bookings?tab=upcoming" className="panel lift px-2 py-3"><p className={`font-display t-stat tabular ${awaiting ? "text-warn" : ""}`}>{awaiting}</p><p className="mt-1 text-[11.5px] font-semibold text-muted">Pending</p></Link>
        <Link href="/dashboard/bookings?tab=past" className="panel lift px-2 py-3"><p className="font-display t-stat tabular">{bookings.length}</p><p className="mt-1 text-[11.5px] font-semibold text-muted">All time</p></Link>
      </nav>

      {pendingList.length > 0 && (
        <section className="mt-6" aria-labelledby="pend-h">
          <h2 id="pend-h" className="font-display t-section mb-2.5">Pending requests</h2>
          <ul className="flex flex-col gap-2">{pendingList.slice(0, 3).map((b) => <BookingRow key={b.id} b={b} href={`/dashboard/bookings/${b.id}`} />)}</ul>
        </section>
      )}
      {confirmedList.length > 0 && (
        <section className="mt-6" aria-labelledby="conf-h">
          <h2 id="conf-h" className="font-display t-section mb-2.5">Confirmed</h2>
          <ul className="flex flex-col gap-2">{confirmedList.slice(0, 3).map((b) => <BookingRow key={b.id} b={b} href={`/dashboard/bookings/${b.id}`} />)}</ul>
        </section>
      )}
      <p className="mt-4 text-right text-sm"><Link href="/dashboard/bookings?tab=past" className="font-semibold text-signal">Booking history →</Link></p>

      <section className="mt-6" aria-labelledby="notes-h">
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <h2 id="notes-h" className="font-display t-section flex items-center gap-2"><Bell className="size-5 text-signal" aria-hidden="true" />Updates {unread > 0 && <Chip tone="signal">{unread} new</Chip>}</h2>
          {unread > 0 && (
            <form action={markNotificationsRead}><button className="text-sm font-semibold text-signal">Mark all read</button></form>
          )}
        </div>
        {(notes ?? []).length === 0 ? (
          <p className="panel p-4 text-sm text-muted">No updates yet.</p>
        ) : (
          <ul className="panel flex flex-col divide-y divide-line">
            {notes!.slice(0, 4).map((n) => (
              <li key={n.id} className="flex gap-3 p-3">
                <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.read_at ? "bg-transparent" : "bg-signal"}`} aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{n.booking_id ? <Link href={`/dashboard/bookings/${n.booking_id}`} className="hover:underline">{n.title}</Link> : n.title}</p>
                  <p className="line-clamp-2 text-sm text-muted">{n.body}</p>
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
