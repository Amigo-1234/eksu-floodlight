import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ButtonLink, Chip, EmptyState, stagger } from "@/components/ui";
import { FacilityCard } from "@/components/site/FacilityCard";
import { HeroScene, ArtEmpty } from "@/components/brand/Illustrations";
import { getViewer } from "@/lib/auth";
import { getAvailability, getPublicSchedule, listPublicFacilities, type ScheduleItem } from "@/lib/data";
import { getBookingAccess } from "@/lib/access";
import { SessionBoard } from "@/components/site/SessionBoard";
import { formatDate, formatRange, todayInTz } from "@/lib/format";
import { activityLabel, ACTIVITY_TYPE_LABEL } from "@/lib/status";
import type { ActivityStatus, ActivityType } from "@/lib/types";

export const dynamic = "force-dynamic";

const STEPS = [
  { title: "Pick a time", body: "See what's free and tap a slot." },
  { title: "Get confirmed", body: "Staff review it — you'll see the status." },
  { title: "Play", body: "Your receipt and pass live in your account." },
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
  const boardFacilities = facilities.filter((f) => f.readiness.bookable).slice(0, 2);
  const [boards, access] = await Promise.all([
    Promise.all(boardFacilities.map(async (f) => ({ f, slots: await getAvailability(f.id, todayInTz(f.timezone)).catch(() => []) }))),
    getBookingAccess(),
  ]);
  const freeToday = facilities.reduce((n, f) => n + (f.freeToday ?? 0), 0);
  const viewer = await getViewer().catch(() => null);

  return (
    <>
      {/* Hero — one message, one primary action. */}
      <section className="floodlight-sky relative overflow-hidden border-b border-line">
        <div className="pitch-lines pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-6 px-4 pb-8 pt-8 sm:pb-12 sm:pt-12 md:grid-cols-[1.05fr_0.95fr] md:gap-10">
          <div className="stagger flex flex-col gap-4">
            <h1 className="font-display t-hero" style={stagger(0)}>
              Your game,<br /><span className="text-beam">under the lights.</span>
            </h1>
            <p className="max-w-md text-base leading-relaxed text-muted sm:text-[17px]" style={stagger(1)}>
              Book EKSU sports facilities in seconds — no queues, no clashes.
            </p>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3" style={stagger(2)}>
              <ButtonLink href="/facilities" size="lg">Book a session<ArrowRight className="size-4" aria-hidden="true" /></ButtonLink>
              {!viewer && <Link href="/sign-up" className="text-sm font-bold text-signal">Create a free account</Link>}
            </div>
            {!loadError && freeToday > 0 && (
              <p className="flex items-center gap-2 text-sm text-muted" style={stagger(3)}>
                <span className="live-dot size-1.5 rounded-full bg-signal" aria-hidden="true" /><strong className="text-ink">{freeToday}</strong> free slots today
              </p>
            )}
          </div>
          {/* Night-scene artwork, framed like a photo so it suits both themes. */}
          <div className="relative h-36 overflow-hidden rounded-[22px] border border-line bg-[#050608] sm:h-56 md:h-80" aria-hidden="true">
            <HeroScene className="absolute inset-0 h-full w-full" />
          </div>
        </div>
      </section>

      {/* Live schedule: which sessions are free, requested or booked (no names) */}
      {boards.length > 0 && (
        <section className="mx-auto w-full max-w-6xl px-4 pt-[var(--space-section)]" aria-labelledby="schedule-heading">
          <div className="mb-4 flex items-end justify-between gap-3">
            <h2 id="schedule-heading" className="font-display t-section">Who&apos;s on the pitch</h2>
            <Link href="/schedule" className="inline-flex items-center gap-1 text-sm font-bold text-signal">Schedule<ArrowRight className="size-4" aria-hidden="true" /></Link>
          </div>
          <div className={`grid grid-cols-1 gap-4 ${boards.length > 1 ? "lg:grid-cols-2" : ""}`}>
            {boards.map(({ f, slots }) => (
              <SessionBoard key={f.id} facility={{ id: f.id, name: f.name, slug: f.slug, timezone: f.timezone }}
                today={todayInTz(f.timezone)} initial={slots} canBook={access.can_book} />
            ))}
          </div>
        </section>
      )}

      {/* Facilities */}
      <section className="mx-auto w-full max-w-6xl px-4 py-[var(--space-section)]" aria-labelledby="facilities-heading">
        <div className="mb-4 flex items-end justify-between gap-3">
          <h2 id="facilities-heading" className="font-display t-section">Facilities</h2>
          {facilities.length > 3 && <Link href="/facilities" className="inline-flex items-center gap-1 text-sm font-bold text-signal">See all<ArrowRight className="size-4" aria-hidden="true" /></Link>}
        </div>
        {loadError ? (
          <EmptyState title="Couldn't load facilities" body="Please refresh in a moment." />
        ) : facilities.length === 0 ? (
          <EmptyState art={<ArtEmpty className="h-24 w-auto" />} title="The lights are being set up" body="Facilities appear here once they open." />
        ) : (
          <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {facilities.slice(0, 3).map((f, i) => <div key={f.id} style={stagger(i)}><FacilityCard f={f} /></div>)}
          </div>
        )}
      </section>

      {/* How it works */}
      <section className="border-y border-line bg-bg-2" aria-labelledby="how-heading">
        <div className="mx-auto max-w-6xl px-4 py-[var(--space-section)]">
          <h2 id="how-heading" className="font-display t-section mb-4">How it works</h2>
          <ol className="grid gap-3 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-signal/40 bg-surface font-display text-base text-signal tabular">{i + 1}</span>
                <div>
                  <p className="font-bold">{s.title}</p>
                  <p className="text-sm text-muted">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Upcoming activities (only real, opted-in records) */}
      {upcoming.length > 0 && (
        <section className="mx-auto w-full max-w-6xl px-4 py-[var(--space-section)]" aria-labelledby="upcoming-heading">
          <div className="mb-4 flex items-end justify-between gap-3">
            <h2 id="upcoming-heading" className="font-display t-section">Coming up</h2>
            <Link href="/schedule" className="text-sm font-bold text-signal">Full schedule</Link>
          </div>
          <ul className="grid gap-2 sm:grid-cols-3">
            {upcoming.slice(0, 3).map((m) => {
              const live = activityLabel(m.activity_status as ActivityStatus);
              return (
                <li key={m.booking_id} className="panel p-4">
                  <div className="flex items-center justify-between gap-2 text-xs text-muted">
                    <span className="truncate">{ACTIVITY_TYPE_LABEL[m.activity_type as ActivityType]} · {m.facility_name}</span>
                    {live && <Chip tone={live.tone} live={live.label === "LIVE"}>{live.label}</Chip>}
                  </div>
                  <p className="mt-1.5 font-bold">{m.activity_title ?? ([m.team_name, m.opponent_name].filter(Boolean).join(" vs ") || "Booked session")}</p>
                  <p className="text-sm text-muted tabular">{formatDate(m.starts_at, undefined, "short")} · {formatRange(m.starts_at, m.ends_at)}</p>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}
