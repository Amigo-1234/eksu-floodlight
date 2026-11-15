import Link from "next/link";
import {
  CalendarCheck2, CalendarRange, Clock3, MousePointerClick, QrCode, ReceiptText, Search, ShieldCheck, Ticket, Zap,
} from "lucide-react";
import { ButtonLink, Chip, EmptyState, SectionHeading } from "@/components/ui";
import { FacilityCard } from "@/components/site/FacilityCard";
import { StadiumHero } from "@/components/site/StadiumHero";
import { getPublicSchedule, listPublicFacilities, type ScheduleItem } from "@/lib/data";
import { brand } from "@/lib/brand";
import { formatDate, formatRange, todayInTz } from "@/lib/format";
import { activityLabel, ACTIVITY_TYPE_LABEL } from "@/lib/status";
import type { ActivityStatus, ActivityType } from "@/lib/types";

export const dynamic = "force-dynamic";

const STEPS = [
  { icon: Search, title: "Discover", body: "Browse the facilities open for booking and their rules." },
  { icon: MousePointerClick, title: "Choose a slot", body: "Pick a date and a free time. Taken slots are clearly marked." },
  { icon: CalendarCheck2, title: "Reserve", body: "Add your team details. The server checks the slot is still free." },
  { icon: ShieldCheck, title: "Confirm", body: "Approval or payment, if the facility requires it. You see each step." },
  { icon: Ticket, title: "Present pass", body: "Open your digital receipt on your phone when you arrive." },
];

const BENEFITS = [
  { icon: Zap, title: "Simple reservations", body: "From facility to booking in a few taps, built for phones first." },
  { icon: Clock3, title: "Real-time availability", body: "Slots come straight from the booking engine, not a static timetable." },
  { icon: ShieldCheck, title: "No double bookings", body: "The database itself refuses overlapping reservations — for everyone, staff included." },
  { icon: ReceiptText, title: "Digital receipts", body: "Every confirmed booking keeps its reference and receipt. Nothing disappears after one screen." },
  { icon: CalendarRange, title: "Organised schedules", body: "Facility managers see the whole day, approve requests and record activity." },
  { icon: QrCode, title: "Secure entry passes", body: "Signed QR passes checked live at the gate, once enabled by the facility." },
];

export default async function HomePage() {
  const today = todayInTz();
  let facilities: Awaited<ReturnType<typeof listPublicFacilities>> = [];
  let upcoming: ScheduleItem[] = [];
  let loadError = false;
  try {
    const now = new Date();
    [facilities, upcoming] = await Promise.all([
      listPublicFacilities(today),
      getPublicSchedule(new Date(now.getTime() - 3 * 3600_000).toISOString(), new Date(now.getTime() + 7 * 86400_000).toISOString()),
    ]);
  } catch {
    loadError = true;
  }

  return (
    <>
      {/* A — Hero */}
      <section className="floodlight-sky relative overflow-hidden border-b border-line">
        <div className="pitch-lines pointer-events-none absolute inset-0" aria-hidden="true" />
        <StadiumHero className="pointer-events-none absolute inset-x-0 bottom-0 h-[38%] w-full opacity-60 sm:left-auto sm:right-0 sm:h-full sm:w-[58%] sm:opacity-90" />
        <div className="relative mx-auto flex min-h-[600px] max-w-6xl flex-col justify-start gap-6 px-4 pb-56 pt-10 sm:justify-center sm:min-h-[600px] sm:pb-16">
          <Chip tone="muted" className="w-fit">{brand.descriptor}</Chip>
          <h1 className="font-display max-w-xl text-[64px] leading-[0.88] sm:text-[96px]">
            The field<br />is <span className="text-signal">yours.</span>
          </h1>
          <p className="max-w-md text-lg text-ink/85">Find your field. Choose your time. Book your next game.</p>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/facilities" size="lg">Book a Field</ButtonLink>
            <ButtonLink href="/schedule" size="lg" variant="outline">View Schedule</ButtonLink>
          </div>
          <p className="hidden text-sm text-muted sm:block">{brand.tagline}</p>
        </div>
      </section>

      {/* B — Facilities */}
      <section className="mx-auto max-w-6xl px-4 py-14" aria-labelledby="facilities-heading">
        <div id="facilities-heading">
          <SectionHeading eyebrow="Open for booking" title="Facilities"
            action={facilities.length > 0 ? <Link href="/facilities" className="text-sm font-semibold text-signal">See all</Link> : undefined} />
        </div>
        {loadError ? (
          <EmptyState title="Couldn't load facilities" body="Please refresh the page in a moment." />
        ) : facilities.length === 0 ? (
          <EmptyState title="No facilities published yet"
            body="Facility managers haven't published any EKSU sports facilities for booking yet. Check back soon." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {facilities.slice(0, 6).map((f) => <FacilityCard key={f.id} f={f} />)}
          </div>
        )}
      </section>

      {/* C — How booking works */}
      <section className="border-y border-line bg-surface/50" aria-labelledby="how-heading">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <div id="how-heading"><SectionHeading eyebrow="Five steps" title="How booking works" /></div>
          <ol className="grid gap-3 sm:grid-cols-5">
            {STEPS.map((s, i) => (
              <li key={s.title} className="relative flex gap-3 rounded-[var(--radius-card)] border border-line bg-bg p-4 sm:flex-col">
                <span className="font-display text-4xl text-signal tabular" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <p className="flex items-center gap-2 font-semibold"><s.icon className="size-4 text-signal" aria-hidden="true" />{s.title}</p>
                  <p className="mt-1 text-sm text-muted">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* D — Upcoming activities (only real, opted-in records) */}
      {upcoming.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-14" aria-labelledby="upcoming-heading">
          <div id="upcoming-heading">
            <SectionHeading eyebrow="On the fields" title="Upcoming activities"
              action={<Link href="/schedule" className="text-sm font-semibold text-signal">Full schedule</Link>} />
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {upcoming.slice(0, 6).map((m) => {
              const live = activityLabel(m.activity_status as ActivityStatus);
              return (
                <li key={m.booking_id} className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
                  <div className="flex items-center justify-between gap-2 text-xs text-muted">
                    <span>{ACTIVITY_TYPE_LABEL[m.activity_type as ActivityType]} · {m.facility_name}</span>
                    {live && <Chip tone={live.tone} live={live.label === "LIVE"}>{live.label}</Chip>}
                  </div>
                  <p className="mt-2 font-semibold">{m.activity_title ?? ([m.team_name, m.opponent_name].filter(Boolean).join(" vs ") || "Booked session")}</p>
                  <p className="mt-1 text-sm text-muted tabular">{formatDate(m.starts_at, undefined, "short")} · {formatRange(m.starts_at, m.ends_at)}</p>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* E — Benefits */}
      <section className="mx-auto max-w-6xl px-4 py-14" aria-labelledby="benefits-heading">
        <div id="benefits-heading"><SectionHeading eyebrow="Why Floodlight" title="Built for match day" /></div>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {BENEFITS.map((b) => (
            <li key={b.title} className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
              <b.icon className="size-6 text-signal" aria-hidden="true" />
              <p className="mt-3 font-semibold">{b.title}</p>
              <p className="mt-1 text-sm text-muted">{b.body}</p>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
