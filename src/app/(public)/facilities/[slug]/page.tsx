import { SmartDock } from "@/components/site/SmartDock";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { CalendarClock, Clock, Info, MapPin, ShieldCheck, Ticket } from "lucide-react";
import { ButtonLink, Chip, DevFixtureBadge, Notice } from "@/components/ui";
import { PitchArt } from "@/components/site/FacilityCard";
import { facilityImageUrl, getAvailability, getFacilityBySlug } from "@/lib/data";
import { getBookingAccess } from "@/lib/access";
import { formatDuration, formatNaira, todayInTz, WEEKDAYS } from "@/lib/format";
import { PAYMENT_MODE_LABEL, READINESS_LABEL } from "@/lib/status";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/facilities/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const d = await getFacilityBySlug(slug).catch(() => null);
  return { title: d?.facility.name ?? "Facility" };
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="panel min-w-0 px-3 py-2.5">
      <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">{label}</dt>
      <dd className="mt-0.5 font-bold tabular">{children}</dd>
    </div>
  );
}

function Disclosure({ title, icon, summary, children }: { title: string; icon: ReactNode; summary?: string; children: ReactNode }) {
  return (
    <details className="panel group px-4 py-3">
      <summary className="flex min-h-8 items-center gap-2 text-sm font-bold">
        {icon}{title}
        {summary && <span className="ml-auto truncate pl-2 text-xs font-semibold text-muted">{summary}</span>}
        <span className={`${summary ? "" : "ml-auto "}text-lg leading-none text-signal transition-transform duration-200 group-open:rotate-45`} aria-hidden="true">+</span>
      </summary>
      <div className="details-body mt-3">{children}</div>
    </details>
  );
}

function policyLine(label: string, value: string | null) {
  return (
    <div key={label} className="flex justify-between gap-4 border-b border-line py-2.5 text-sm last:border-0">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium">{value ?? <span className="text-faint">Not set by the facility</span>}</dd>
    </div>
  );
}

export default async function FacilityPage(props: PageProps<"/facilities/[slug]">) {
  const { slug } = await props.params;
  const d = await getFacilityBySlug(slug);
  if (!d || !d.facility.is_active) notFound();
  const { facility: f, policy, hours, prices, readiness, surfaces, images } = d;
  const today = todayInTz(f.timezone);
  const [slots, access] = await Promise.all([readiness.bookable ? getAvailability(f.id, today).catch(() => []) : Promise.resolve([]), getBookingAccess()]);
  const freeToday = slots.filter((s) => s.state === "available").length;
  const defaultPrice = (prices.find((p) => p.is_default) ?? prices[0])?.amount_kobo ?? null;
  const paymentText = !policy ? "not set yet" : policy.payment_mode === "free" ? "free"
    : policy.payment_mode === "unconfigured" ? "method to be confirmed by the facility — nothing is charged online"
    : policy.payment_mode === "offline" ? "bank transfer after your request is accepted — then upload your receipt"
    : ["online", "hybrid", "deposit"].includes(policy.payment_mode) && !access.online_payments ? "online payment opens at launch — nothing is charged now"
    : PAYMENT_MODE_LABEL[policy.payment_mode];
  const todayIdx = new Date(`${today}T12:00:00Z`).getUTCDay();
  const cover = facilityImageUrl(images[0]?.storage_path ?? f.cover_image_path);

  const byDay = WEEKDAYS.map((name, i) => ({
    name, ranges: hours.filter((h) => h.weekday === i).map((h) => `${h.opens_at.slice(0, 5)}–${h.closes_at.slice(0, 5)}`),
  }));
  const todayHours = (() => { const r = byDay[todayIdx]?.ranges; return r?.length ? `Today ${r.join(", ")}` : hours.length ? "Closed today" : undefined; })();

  return (
    <div className="pb-[calc(6rem+env(safe-area-inset-bottom))] sm:pb-10">
      <div className="relative h-36 overflow-hidden border-b border-line bg-raised sm:h-64">
        {cover
          // eslint-disable-next-line @next/next/no-img-element -- public storage image
          ? <img src={cover} alt={images[0]?.alt_text || ""} className="h-full w-full object-cover" />
          : <PitchArt sport={f.sport_categories?.slug} className="h-full w-full" />}
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/30 to-transparent" aria-hidden="true" />
        <div className="pointer-events-none absolute -left-24 -top-24 size-80 rounded-full bg-signal/20 blur-3xl" aria-hidden="true" />
      </div>

      <div className="mx-auto -mt-10 max-w-3xl px-4 sm:-mt-14">
        <div className="relative flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <Chip tone="muted">{f.sport_categories?.name}</Chip>
            {f.is_dev_fixture && <DevFixtureBadge />}
          </div>
          <h1 className="font-display t-page">{f.name}</h1>
          {f.location_label && <p className="flex items-center gap-1.5 text-muted"><MapPin className="size-4" aria-hidden="true" />{f.location_label}</p>}
        </div>

        {/* Key facts first: what it costs, how long, what's free today, how it's confirmed. */}
        <dl className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Fact label="Price">{defaultPrice != null ? <>{formatNaira(defaultPrice)}<span className="text-xs font-semibold text-muted"> / session</span></> : policy?.payment_mode === "free" ? "Free" : "—"}</Fact>
          <Fact label="Session">{policy?.slot_minutes ? formatDuration(policy.slot_minutes) : "—"}</Fact>
          <Fact label="Free today">{readiness.bookable ? <span className={freeToday > 0 ? "text-signal" : ""}>{freeToday}</span> : "—"}</Fact>
          <Fact label="Confirmation">{policy ? (policy.approval_mode === "required" ? "Staff review" : "Instant") : "—"}</Fact>
        </dl>
        <p className="mt-2 text-xs text-muted">Payment: {paymentText}</p>

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          <div className="flex min-w-0 flex-col gap-3">
            {f.description && <p className="whitespace-pre-line text-[15px] leading-relaxed text-ink/90">{f.description}</p>}

            {readiness.bookable && !access.public_open && (
              <Notice tone="info">Booking opens to everyone soon. Make an account now to be ready.</Notice>
            )}
            {!readiness.bookable && (
              <Notice tone="warn" title="Not taking online bookings yet">
                <ul className="list-disc pl-5">
                  {readiness.missing.map((m) => <li key={m}>{READINESS_LABEL[m] ?? m}</li>)}
                </ul>
              </Notice>
            )}

            {/* Secondary details stay one tap away. */}
            <Disclosure icon={<Clock className="size-4 text-signal" aria-hidden="true" />} title="Opening hours" summary={todayHours}>
              {hours.length === 0 ? <p className="text-sm text-muted">Not published yet.</p> : (
                <dl className="grid gap-x-6 sm:grid-cols-2">
                  {byDay.map((d) => (
                    <div key={d.name} className="flex justify-between border-b border-line py-2 text-sm last:border-0 sm:[&:nth-last-child(2)]:border-0">
                      <dt className="text-muted">{d.name}</dt>
                      <dd className={`tabular font-semibold ${d.ranges.length ? "" : "text-faint"}`}>{d.ranges.length ? d.ranges.join(", ") : "Closed"}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </Disclosure>
            <Disclosure icon={<Info className="size-4 text-signal" aria-hidden="true" />} title="Booking rules">
              <dl>
                {policyLine("Book up to", policy?.max_advance_days ? `${policy.max_advance_days} days ahead` : null)}
                {policyLine("Minimum notice", policy?.min_notice_minutes != null ? `${policy.min_notice_minutes} minutes` : null)}
                {policyLine("Cancelling", policy ? (policy.customer_cancellation === "until_cutoff"
                  ? (policy.cancellation_cutoff_hours != null ? `Online up to ${policy.cancellation_cutoff_hours} h before` : "Online before the start")
                  : policy.customer_cancellation === "pending_only" ? "Requests can be withdrawn; confirmed bookings via the facility" : "Via the facility") : null)}
                {surfaces.filter((s) => s.is_active).length > 1 && policyLine("Playing areas", surfaces.filter((s) => s.is_active).map((s) => s.name).join(", "))}
                {prices.length > 1 && prices.map((p) => policyLine(p.label, formatNaira(p.amount_kobo)))}
              </dl>
            </Disclosure>
            {(f.rules || f.eligibility_note) && (
              <Disclosure icon={<ShieldCheck className="size-4 text-signal" aria-hidden="true" />} title="Facility rules">
                {f.rules && <p className="whitespace-pre-line text-sm leading-relaxed text-ink/90">{f.rules}</p>}
                {f.eligibility_note && <p className="mt-3 text-sm text-muted"><strong className="text-ink">Who can book: </strong>{f.eligibility_note}</p>}
              </Disclosure>
            )}
            {f.entry_instructions && (
              <Disclosure icon={<Ticket className="size-4 text-signal" aria-hidden="true" />} title="On arrival">
                <p className="whitespace-pre-line text-sm text-ink/90">{f.entry_instructions}</p>
              </Disclosure>
            )}
          </div>
        </div>
      </div>

      {readiness.bookable && (
        <SmartDock>
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <p className="min-w-0 text-sm text-muted"><CalendarClock className="mr-1 inline size-4" aria-hidden="true" />
              {freeToday > 0 ? <><strong className="text-ink">{freeToday}</strong> free slots today</> : "No free slots today — try another date"}
            </p>
            {access.can_book
              ? <ButtonLink href={`/book/${f.id}`} size="lg" className="h-12 shrink-0 sm:h-14 sm:min-w-48">{access.test_mode ? "Test booking" : "Pick a slot"}</ButtonLink>
              : <span className="inline-flex h-12 shrink-0 items-center rounded-2xl border border-line-strong px-4 text-sm font-bold text-muted">Booking opens soon</span>}
          </div>
        </SmartDock>
      )}
    </div>
  );
}
