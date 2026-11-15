import type { Metadata } from "next";
import { FacilityPicker } from "@/components/gate/FacilityPicker";
import { Scanner } from "@/components/gate/Scanner";
import { gateFacility, requireGate } from "@/lib/gate";

export const metadata: Metadata = { title: "Scan" };
export const dynamic = "force-dynamic";

export default async function ScanPage(props: PageProps<"/gate/scan">) {
  const ctx = await requireGate("/gate/scan");
  const facility = gateFacility(ctx, (await props.searchParams).facility);
  if (!facility) return <FacilityPicker facilities={ctx.facilities} base="/gate/scan" />;
  const f = ctx.facilities.find((x) => x.id === facility)!;
  return <Scanner facilityId={facility} facilityName={f.name} timezone={f.timezone} live={ctx.live} />;
}
