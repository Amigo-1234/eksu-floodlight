import { SmartDock } from "@/components/site/SmartDock";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarClock, Clock, Info, MapPin, ShieldCheck, Ticket, Wallet } from "lucide-react";
import { ButtonLink, Card, Chip, DevFixtureBadge, Notice } from "@/components/ui";
import { PitchArt } from "@/components/site/FacilityCard";
import { facilityImageUrl, getAvailability, getFacilityBySlug } from "@/lib/data";
import { getBookingAccess } from "@/lib/access";
import { formatNaira, todayInTz, WEEKDAYS } from "@/lib/format";
import { PAYMENT_MODE_LABEL, READINESS_LABEL } from "@/lib/status";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/facilities/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const d = await getFacilityBySlug(slug).catch(() => null);
  return { title: d?.facility.name ?? "Facility" };
}

function policyLine(label: string, value: string | null) {
  return (
    <div className="flex justify-between gap-4 border-b border-line py-2.5 text-sm last:border-0">
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
  const cover = facilityImageUrl(images[0]?.storage_path ?? f.cover_image_path);

  const byDay = WEEKDAYS.map((name, i) => ({
    name, ranges: hours.filter((h) => h.weekday === i).map((h) => `${h.opens_at.slice(0, 5)}–${h.closes_at.slice(0, 5)}`),
  }));

  return (
    <div className="pb-[calc(6rem+env(safe-area-inset-bottom))] sm:pb-10">
      <div className="relative h-44 overflow-hidden border-b border-line bg-raised sm:h-80">
        {cover
          // eslint-disable-next-line @next/next/no-img-element -- public storage image
          ? <img src={cover} alt={images[0]?.alt_text || ""} className="h-full w-full object-cover" />
          : <PitchArt sport={f.sport_categories?.slug} className="h-full w-full" />}
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/30 to-transparent" aria-hidden="true" />
        <div className="pointer-events-none absolute -left-24 -top-24 size-80 rounded-full bg-signal/20 blur-3xl" aria-hidden="true" />
      </div>

      <div className="mx-auto -mt-12 max-w-6xl px-4 sm:-mt-16">
        <div className="relative flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Chip tone="muted">{f.sport_categories?.name}</Chip>
            {f.is_dev_fixture && <DevFixtureBadge />}
          </div>
          <h1 className="font-display t-display">{f.name}</h1>
          {f.location_label && <p className="flex items-center gap-1.5 text-muted"><MapPin className="size-4" aria-hidden="true" />{f.location_label}</p>}
        </div>

        <div className="mt-6 grid gap-6 sm:mt-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex flex-col gap-6">
            {f.description && <p className="whitespace-pre-line text-[15px] leading-relaxed text-ink/90">{f.description}</p>}

            {readiness.bookable && !access.public_open && (
              <Notice tone="info" title="Online reservations open soon">
                The schedule below is live, but bookings aren&apos;t open to the public yet. Check back soon — creating an account now means you&apos;re ready on day one.
              </Notice>
            )}

            {!readiness.bookable && (
              <Notice tone="warn" title="Online booking isn't open for this facility yet">
                <ul className="list-disc pl-5">
                  {readiness.missing.map((m) => <li key={m}>{READINESS_LABEL[m] ?? m}</li>)}
                </ul>
              </Notice>
            )}

            <section aria-labelledby="hours-h">
              <h2 id="hours-h" className="font-display mb-3 flex items-center gap-2 text-2xl"><Clock className="size-5 text-signal" aria-hidden="true" />Opening hours</h2>
              {hours.length === 0 ? <p className="text-sm text-muted">Opening hours haven&apos;t been published.</p> : (
                <dl className="grid gap-1 sm:grid-cols-2">
                  {byDay.map((d) => (
                    <div key={d.name} className="flex justify-between rounded-xl border border-line bg-surface px-4 py-2.5 text-sm">
                      <dt className="text-muted">{d.name}</dt>
                      <dd className={`tabular font-semibold ${d.ranges.length ? "" : "text-faint"}`}>{d.ranges.length ? d.ranges.join(", ") : "Closed"}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </section>

            {surfaces.filter((s) => s.is_active).length > 1 && (
              <section aria-labelledby="areas-h">
                <h2 id="areas-h" className="font-display mb-3 text-2xl">Playing areas</h2>
                <ul className="flex flex-wrap gap-2">
                  {surfaces.filter((s) => s.is_active).map((s) => <li key={s.id}><Chip>{s.name}</Chip></li>)}
                </ul>
              </section>
            )}

            {(f.rules || f.eligibility_note) && (
              <section aria-labelledby="rules-h">
                <h2 id="rules-h" className="font-display mb-3 flex items-center gap-2 text-2xl"><ShieldCheck className="size-5 text-signal" aria-hidden="true" />Rules</h2>
                {f.rules && <p className="whitespace-pre-line text-sm leading-relaxed text-ink/90">{f.rules}</p>}
                {f.eligibility_note && <p className="mt-3 text-sm text-muted"><strong className="text-ink">Who can book: </strong>{f.eligibility_note}</p>}
              </section>
            )}
          </div>

          <aside className="flex flex-col gap-4">
            <Card className="p-4">
              <h2 className="font-display mb-2 flex items-center gap-2 text-xl"><Info className="size-5 text-signal" aria-hidden="true" />Booking rules</h2>
              <dl>
                {policyLine("Session length", policy?.slot_minutes ? `${policy.slot_minutes} minutes` : null)}
                {policyLine("Confirmation", policy ? (policy.approval_mode === "required" ? "Reviewed by staff" : "Instant") : null)}
                {policyLine("Payment", policy ? (policy.payment_mode === "unconfigured" ? (prices.length ? "Method to be confirmed" : null)
                  : ["online", "hybrid", "deposit"].includes(policy.payment_mode) && !access.online_payments ? "Online (opens at launch)" : PAYMENT_MODE_LABEL[policy.payment_mode]) : null)}
                {policyLine("Book up to", policy?.max_advance_days ? `${policy.max_advance_days} days ahead` : null)}
                {policyLine("Minimum notice", policy?.min_notice_minutes != null ? `${policy.min_notice_minutes} minutes` : null)}
                {policyLine("Cancelling", policy ? (policy.customer_cancellation === "until_cutoff"
                  ? (policy.cancellation_cutoff_hours != null ? `Online up to ${policy.cancellation_cutoff_hours} h before` : "Online before the start")
                  : policy.customer_cancellation === "pending_only" ? "Requests can be withdrawn; confirmed bookings via the facility" : "Via the facility") : null)}
              </dl>
            </Card>
            {prices.length > 0 && (
              <Card className="p-4">
                <h2 className="font-display mb-2 flex items-center gap-2 text-xl"><Wallet className="size-5 text-signal" aria-hidden="true" />Prices</h2>
                <ul className="text-sm">
                  {prices.map((p) => (
                    <li key={p.id} className="flex justify-between border-b border-line py-2 last:border-0">
                      <span>{p.label}</span><span className="font-mono">{formatNaira(p.amount_kobo)}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            {f.entry_instructions && (
              <Card className="p-4">
                <h2 className="font-display mb-2 flex items-center gap-2 text-xl"><Ticket className="size-5 text-signal" aria-hidden="true" />On arrival</h2>
                <p className="whitespace-pre-line text-sm text-ink/90">{f.entry_instructions}</p>
              </Card>
            )}
          </aside>
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
