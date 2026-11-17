import type { Metadata } from "next";
import { ButtonLink, EmptyState, PillLink, stagger } from "@/components/ui";
import { FacilityCard } from "@/components/site/FacilityCard";
import { ArtEmpty, ArtSearch } from "@/components/brand/Illustrations";
import { listPublicFacilities, listSportCategories } from "@/lib/data";
import { getBookingAccess } from "@/lib/access";
import { Notice } from "@/components/ui";
import { todayInTz } from "@/lib/format";

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
  const access = await getBookingAccess();
  const present = new Set(facilities.map((f) => f.sport_categories?.slug).filter(Boolean));
  const shown = sportFilter ? facilities.filter((f) => f.sport_categories?.slug === sportFilter) : facilities;

  return (
    <div>
      <section className="floodlight-sky relative overflow-hidden border-b border-line">
        <div className="pitch-lines pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="relative mx-auto max-w-6xl px-4 pb-6 pt-7 sm:pb-8 sm:pt-10">
          <h1 className="font-display t-page">Facilities</h1>
          <p className="mt-2 text-muted">Find your field and pick a time.</p>
          {present.size > 1 && (
            <nav aria-label="Filter by sport" className="-mx-4 mt-5 flex gap-2 overflow-x-auto px-4 pb-1">
              <PillLink href="/facilities" active={!sportFilter}>All sports</PillLink>
              {categories.filter((c) => present.has(c.slug)).map((c) => (
                <PillLink key={c.id} href={`/facilities?sport=${c.slug}`} active={sportFilter === c.slug}>{c.name}</PillLink>
              ))}
            </nav>
          )}
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-6 sm:py-10">
        {!failed && shown.length > 0 && !access.public_open && (
          <Notice tone="info" className="mb-5">Booking opens to everyone soon — live availability is already here.</Notice>
        )}
        {failed ? (
          <EmptyState title="Couldn't load facilities" body="Please refresh the page in a moment." />
        ) : shown.length === 0 ? (
          sportFilter ? (
            <EmptyState art={<ArtSearch className="h-28 w-auto" />} title="Nothing for this sport yet"
              body="No facility for this sport is open for booking right now." action={<ButtonLink href="/facilities" variant="outline">Show all sports</ButtonLink>} />
          ) : (
            <EmptyState art={<ArtEmpty className="h-32 w-auto" />} title="The lights are being set up"
              body="Check back soon." />
          )
        ) : (
          <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((f, i) => <div key={f.id} style={stagger(i)}><FacilityCard f={f} /></div>)}
          </div>
        )}
      </div>
    </div>
  );
}
