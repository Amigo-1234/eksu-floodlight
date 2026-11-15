import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { z } from "zod";
import { Chip, DevFixtureBadge, Notice } from "@/components/ui";
import {
  FacilityDetailsForm, HoursForm, ImageUploadForm, PolicyForm, PricesForm, SurfacesForm,
} from "@/components/admin/FacilityForms";
import { requireAdmin } from "@/lib/admin";
import { facilityImageUrl, getFacilityById } from "@/lib/data";
import { READINESS_LABEL } from "@/lib/status";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SportCategory } from "@/lib/types";

export const metadata: Metadata = { title: "Facility settings" };
export const dynamic = "force-dynamic";

export default async function FacilityAdminPage(props: PageProps<"/admin/facilities/[id]">) {
  const { id } = await props.params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const ctx = await requireAdmin(`/admin/facilities/${id}`);
  if (!ctx.facilities.some((f) => f.id === id)) notFound();
  const d = await getFacilityById(id);
  if (!d || !d.policy) notFound();
  const supabase = await createSupabaseServerClient();
  const { data: cats } = await supabase.from("sport_categories").select("*").order("sort_order");
  const canEdit = ctx.adminOf.has(id);

  return (
    <>
      <Link href="/admin/facilities" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ChevronLeft className="size-4" aria-hidden="true" />Facilities</Link>
      <div className="mb-6 mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl sm:text-5xl">{d.facility.name}</h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <Chip tone={d.facility.is_active ? "ok" : "muted"}>{d.facility.is_active ? "Active" : "Inactive"}</Chip>
            {d.facility.is_dev_fixture && <DevFixtureBadge />}
          </div>
        </div>
        {d.facility.is_active && <Link href={`/facilities/${d.facility.slug}`} className="inline-flex items-center gap-1 text-sm font-semibold text-signal">Public page<ExternalLink className="size-3.5" aria-hidden="true" /></Link>}
      </div>

      {!d.readiness.bookable && (
        <Notice tone="warn" title="Not yet bookable" className="mb-4">
          <ul className="list-disc pl-5">{d.readiness.missing.map((m) => <li key={m}>{READINESS_LABEL[m] ?? m}</li>)}</ul>
        </Notice>
      )}
      {!canEdit && <Notice tone="info" className="mb-4">You can view this facility. Only its facility administrators can change settings.</Notice>}

      <fieldset disabled={!canEdit} className="grid gap-4 xl:grid-cols-2">
        <div className="flex flex-col gap-4">
          <FacilityDetailsForm f={d.facility} categories={(cats ?? []) as SportCategory[]} />
          <ImageUploadForm facilityId={id} images={d.images.map((i) => ({ id: i.id, alt_text: i.alt_text, url: facilityImageUrl(i.storage_path) }))} />
        </div>
        <div className="flex flex-col gap-4">
          <PolicyForm facilityId={id} policy={d.policy} />
          <SurfacesForm facilityId={id} surfaces={d.surfaces} />
          <HoursForm facilityId={id} hours={d.hours} />
          <PricesForm facilityId={id} prices={d.prices} />
        </div>
      </fieldset>
    </>
  );
}
