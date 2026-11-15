import type { Metadata } from "next";
import { EmptyState } from "@/components/ui";
import { FacilityCard } from "@/components/site/FacilityCard";
import { listPublicFacilities, listSportCategories } from "@/lib/data";
import { todayInTz } from "@/lib/format";
import Link from "next/link";

export const metadata: Metadata = { title: "Facilities" };
export const dynamic = "force-dynamic";

export default async function FacilitiesPage(props: PageProps<"/facilities">) {
  const { sport } = await props.searchParams;
  const sportFilter = typeof sport === "string" ? sport : null;
  let facilities: Awaited<ReturnType<typeof listPublicFacilities>> = [];
  let categories: Awaited<ReturnType<typeof listSportCategories>> = [];
  let failed = false;
  try {
    [facilities, categories] = await Promise.all([listPublicFacilities(todayInTz()), listSportCategories()]);
  } catch {
    failed = true;
  }
  const present = new Set(facilities.map((f) => f.sport_categories?.slug).filter(Boolean));
  const shown = sportFilter ? facilities.filter((f) => f.sport_categories?.slug === sportFilter) : facilities;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-signal">EKSU sports facilities</p>
      <h1 className="font-display text-5xl sm:text-6xl">Find a field</h1>
      <p className="mt-2 max-w-xl text-muted">Every facility listed here is configured by its managers. Choose one to see its rules and live availability.</p>

      {present.size > 1 && (
        <nav aria-label="Filter by sport" className="-mx-4 mt-6 flex gap-2 overflow-x-auto px-4 pb-1">
          <Link href="/facilities" aria-current={!sportFilter ? "page" : undefined}
            className="shrink-0 rounded-full border border-line px-4 py-2 text-sm font-medium aria-[current=page]:border-signal aria-[current=page]:bg-signal aria-[current=page]:text-signal-ink">
            All sports
          </Link>
          {categories.filter((c) => present.has(c.slug)).map((c) => (
            <Link key={c.id} href={`/facilities?sport=${c.slug}`} aria-current={sportFilter === c.slug ? "page" : undefined}
              className="shrink-0 rounded-full border border-line px-4 py-2 text-sm font-medium aria-[current=page]:border-signal aria-[current=page]:bg-signal aria-[current=page]:text-signal-ink">
              {c.name}
            </Link>
          ))}
        </nav>
      )}

      <div className="mt-8">
        {failed ? (
          <EmptyState title="Couldn't load facilities" body="Please refresh the page in a moment." />
        ) : shown.length === 0 ? (
          <EmptyState title="No facilities to show"
            body={sportFilter ? "No facility for this sport is open for booking." : "No EKSU facilities have been published for booking yet."} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((f) => <FacilityCard key={f.id} f={f} />)}
          </div>
        )}
      </div>
    </div>
  );
}
