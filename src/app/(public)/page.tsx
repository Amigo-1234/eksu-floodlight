import Link from "next/link";
import { ArrowRight, CalendarClock, QrCode, ReceiptText, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { ButtonLink, Chip, EmptyState, SectionHeading, stagger } from "@/components/ui";
import { FacilityCard } from "@/components/site/FacilityCard";
import { HeroScene, ArtEmpty } from "@/components/brand/Illustrations";
import { LogoMark } from "@/components/brand/Logo";
import { getPublicSchedule, listPublicFacilities, type ScheduleItem } from "@/lib/data";
import { formatDate, formatRange, todayInTz } from "@/lib/format";
import { activityLabel, ACTIVITY_TYPE_LABEL } from "@/lib/status";
import type { ActivityStatus, ActivityType } from "@/lib/types";

export const dynamic = "force-dynamic";

const STEPS = [
  { title: "Pick a facility", body: "See the rules, opening hours and what's free today." },
  { title: "Grab a slot", body: "Tap an open time. Taken slots can never be double-booked." },
  { title: "Get confirmed", body: "Instantly, or after a quick staff review where required." },
  { title: "Walk in", body: "Show your QR pass at the gate. That's it." },
];

/** Decorative QR-like glyph for the hero pass (not a real code). */
function QrGlyph() {
  const cells = [
    "1110111", "1010101", "1110111", "0001000", "1101011", "0110110", "1011101",
  ];
  return (
    <svg viewBox="0 0 7 7" className="size-20" aria-hidden="true">
      {cells.flatMap((row, y) => row.split("").map((v, x) => v === "1" ? <rect key={`${x}${y}`} x={x} y={y} width="0.86" height="0.86" rx="0.18" fill="#0b0d12" /> : null))}
    </svg>
  );
}

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
  const freeToday = facilities.reduce((n, f) => n + (f.freeToday ?? 0), 0);
  const bookable = facilities.filter((f) => f.readiness.bookable).length;

  return (
    <>
      {/* Hero */}
      <section className="floodlight-sky relative overflow-hidden border-b border-line">
        <div className="pitch-lines pointer-events-none absolute inset-0" aria-hidden="true" />
        <HeroScene className="pointer-events-none absolute inset-x-0 bottom-0 h-[46%] w-full opacity-70 md:left-auto md:right-[-4%] md:h-full md:w-[62%] md:opacity-95" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-bg to-transparent" aria-hidden="true" />

        <div className="relative mx-auto grid min-h-[640px] max-w-6xl items-center gap-10 px-4 pb-64 pt-12 md:min-h-[680px] md:grid-cols-[1.1fr_0.9fr] md:pb-20">
          <div className="stagger flex flex-col gap-6">
            <p className="eyebrow flex items-center gap-2" style={stagger(0)}>
              <span className="live-dot size-1.5 rounded-full bg-signal shadow-[0_0_10px_var(--signal)]" aria-hidden="true" />
              EKSU sports facility booking
            </p>
            <h1 className="font-display text-[54px] leading-[0.92] sm:text-[78px]" style={stagger(1)}>
              Your game,<br /><span className="text-beam">under the lights.</span>
            </h1>
            <p className="max-w-md text-[17px] leading-relaxed text-ink/80" style={stagger(2)}>
              Find a pitch or court, grab a free slot in seconds and walk in with a digital pass. No queues, no clashes, no paper.
            </p>
            <div className="flex flex-wrap gap-3" style={stagger(3)}>
              <ButtonLink href="/facilities" size="lg">Book a slot<ArrowRight className="size-4" aria-hidden="true" /></ButtonLink>
              <ButtonLink href="/schedule" size="lg" variant="outline">What&apos;s on</ButtonLink>
            </div>
            {!loadError && facilities.length > 0 && (
              <dl className="mt-2 flex flex-wrap gap-x-8 gap-y-3" style={stagger(4)}>
                <div><dt className="eyebrow !text-faint">Facilities</dt><dd className="font-display text-3xl tabular">{facilities.length}</dd></div>
                <div><dt className="eyebrow !text-faint">Taking bookings</dt><dd className="font-display text-3xl tabular">{bookable}</dd></div>
                <div><dt className="eyebrow !text-faint">Free today</dt><dd className="font-display text-3xl tabular text-signal">{freeToday}</dd></div>
              </dl>
            )}
          </div>

          {/* Floating pass (decorative) */}
          <div className="relative hidden justify-center md:flex" aria-hidden="true">
            <div className="floaty glow-ring relative w-[300px] rotate-[4deg] overflow-hidden rounded-[26px] bg-surface">
              <div className="bg-[linear-gradient(135deg,#ffd166,#ffc53d_45%,#ff9f1c)] px-5 pb-5 pt-4 text-signal-ink">
                <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.2em]">
                  <span className="flex items-center gap-1.5"><LogoMark size={18} plain />Entry pass</span>
                  <span>Confirmed</span>
                </div>
                <p className="font-display mt-4 text-[44px] leading-none">Kick-off</p>
                <p className="mt-1 text-sm font-bold opacity-80">Your slot · your team · your time</p>
              </div>
              <div className="ticket-notch h-6 border-b border-dashed border-line" />
              <div className="flex items-center gap-4 p-5">
                <div className="rounded-xl bg-white p-2"><QrGlyph /></div>
                <div className="flex flex-col gap-2">
                  <span className="h-2.5 w-24 rounded-full bg-ink/70" />
                  <span className="h-2 w-16 rounded-full bg-ink/25" />
                  <span className="h-2 w-20 rounded-full bg-ink/25" />
                  <Chip tone="ok" className="mt-1 w-fit">Show at the gate</Chip>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Facilities */}
      <section className="mx-auto w-full max-w-6xl px-4 py-16" aria-labelledby="facilities-heading">
        <div id="facilities-heading">
          <SectionHeading eyebrow="Open for booking" title="Find your field"
            action={facilities.length > 0 ? <Link href="/facilities" className="group inline-flex items-center gap-1 text-sm font-bold text-signal">All facilities<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" /></Link> : undefined} />
        </div>
        {loadError ? (
          <EmptyState title="Couldn't load facilities" body="Please refresh the page in a moment." />
        ) : facilities.length === 0 ? (
          <EmptyState art={<ArtEmpty className="h-32 w-auto" />} title="The lights are being set up"
            body="Facilities appear here as soon as their managers open them for booking. Create an account now and you'll be ready to book the moment they go live."
            action={<ButtonLink href="/sign-up" variant="outline">Create an account</ButtonLink>} />
        ) : (
          <div className="stagger grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {facilities.slice(0, 6).map((f, i) => <div key={f.id} style={stagger(i)}><FacilityCard f={f} /></div>)}
          </div>
        )}
      </section>

      {/* How it works */}
      <section className="relative border-y border-line bg-bg-2" aria-labelledby="how-heading">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <div id="how-heading"><SectionHeading eyebrow="Four taps" title="From couch to kick-off" /></div>
          <ol className="relative grid gap-4 md:grid-cols-4">
            <span className="pointer-events-none absolute left-6 right-6 top-6 hidden h-px bg-gradient-to-r from-signal/0 via-signal/60 to-signal/0 md:block" aria-hidden="true" />
            {STEPS.map((s, i) => (
              <li key={s.title} className="relative flex gap-4 md:flex-col">
                <span className="relative z-10 flex size-12 shrink-0 items-center justify-center rounded-2xl border border-signal/40 bg-surface font-display text-xl text-signal shadow-[0_0_30px_-8px_var(--signal)] tabular">
                  {i + 1}
                </span>
                <div>
                  <p className="font-display text-xl">{s.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Upcoming activities (only real, opted-in records) */}
      {upcoming.length > 0 && (
        <section className="mx-auto w-full max-w-6xl px-4 py-16" aria-labelledby="upcoming-heading">
          <div id="upcoming-heading">
            <SectionHeading eyebrow="On the fields" title="Coming up"
              action={<Link href="/schedule" className="text-sm font-bold text-signal">Full schedule</Link>} />
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {upcoming.slice(0, 6).map((m) => {
              const live = activityLabel(m.activity_status as ActivityStatus);
              return (
                <li key={m.booking_id} className="panel lift p-5">
                  <div className="flex items-center justify-between gap-2 text-xs text-muted">
                    <span className="font-mono uppercase tracking-[0.12em]">{ACTIVITY_TYPE_LABEL[m.activity_type as ActivityType]} · {m.facility_name}</span>
                    {live && <Chip tone={live.tone} live={live.label === "LIVE"}>{live.label}</Chip>}
                  </div>
                  <p className="font-display mt-3 text-xl">{m.activity_title ?? ([m.team_name, m.opponent_name].filter(Boolean).join(" vs ") || "Booked session")}</p>
                  <p className="mt-1 text-sm text-muted tabular">{formatDate(m.starts_at, undefined, "short")} · {formatRange(m.starts_at, m.ends_at)}</p>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Features bento */}
      <section className="mx-auto w-full max-w-6xl px-4 py-16" aria-labelledby="why-heading">
        <div id="why-heading"><SectionHeading eyebrow="Why Floodlight" title="Built for match day" /></div>
        <div className="grid gap-4 md:grid-cols-6">
          <div className="panel relative overflow-hidden p-6 md:col-span-4">
            <div className="pointer-events-none absolute -right-10 -top-10 size-56 rounded-full bg-signal/20 blur-3xl" aria-hidden="true" />
            <ShieldCheck className="size-7 text-signal" aria-hidden="true" />
            <p className="font-display mt-4 text-3xl">Zero double bookings.</p>
            <p className="mt-2 max-w-md text-muted">The database itself refuses overlapping reservations — for everyone, staff included. If you got the slot, it&apos;s yours.</p>
          </div>
          <div className="panel p-6 md:col-span-2">
            <Zap className="size-7 text-glow" aria-hidden="true" />
            <p className="font-display mt-4 text-2xl">Live availability</p>
            <p className="mt-2 text-sm text-muted">Straight from the booking engine, never a stale timetable.</p>
          </div>
          <div className="panel p-6 md:col-span-2">
            <QrCode className="size-7 text-signal" aria-hidden="true" />
            <p className="font-display mt-4 text-2xl">Signed QR passes</p>
            <p className="mt-2 text-sm text-muted">Each pass is cryptographically signed and can be used once.</p>
          </div>
          <div className="panel p-6 md:col-span-2">
            <ReceiptText className="size-7 text-glow" aria-hidden="true" />
            <p className="font-display mt-4 text-2xl">Receipts that stay</p>
            <p className="mt-2 text-sm text-muted">Every booking keeps its reference and receipt in your account.</p>
          </div>
          <div className="panel p-6 md:col-span-2">
            <CalendarClock className="size-7 text-signal" aria-hidden="true" />
            <p className="font-display mt-4 text-2xl">Run by the managers</p>
            <p className="mt-2 text-sm text-muted">Staff approve requests, block maintenance and see the whole day.</p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-20">
        <div className="glow-ring relative overflow-hidden rounded-[30px] bg-surface px-6 py-12 sm:px-12">
          <div className="pitch-lines pointer-events-none absolute inset-0" aria-hidden="true" />
          <div className="pointer-events-none absolute -left-20 top-0 size-72 rounded-full bg-signal/15 blur-3xl" aria-hidden="true" />
          <div className="relative flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="eyebrow flex items-center gap-2"><Sparkles className="size-3.5" aria-hidden="true" />Free to join</p>
              <h2 className="font-display mt-2 text-4xl sm:text-5xl">Got a team? Get a slot.</h2>
              <p className="mt-2 max-w-md text-muted">Create your account once — book any facility in seconds after that.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <ButtonLink href="/sign-up" size="lg">Create account</ButtonLink>
              <ButtonLink href="/facilities" size="lg" variant="outline">Browse facilities</ButtonLink>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
