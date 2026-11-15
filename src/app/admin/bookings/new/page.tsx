import type { Metadata } from "next";
import { EmptyState } from "@/components/ui";
import { PageHeader } from "@/components/admin/PageHeader";
import { StaffBookingForm } from "@/components/admin/StaffBookingForm";
import { pickFacility, requireAdmin } from "@/lib/admin";
import { todayInTz } from "@/lib/format";

export const metadata: Metadata = { title: "New booking" };
export const dynamic = "force-dynamic";

export default async function NewStaffBooking(props: PageProps<"/admin/bookings/new">) {
  const ctx = await requireAdmin("/admin/bookings/new");
  const facility = pickFacility(ctx, (await props.searchParams).facility) ?? ctx.facilities[0]?.id;
  if (!facility) return <EmptyState title="No facilities" body="You don't manage any facility yet." />;
  return (
    <>
      <PageHeader title="New booking" description="Walk-in or staff-assisted reservation. The same overlap rules apply as for online bookings." />
      <StaffBookingForm initialFacility={facility} today={todayInTz()}
        facilities={ctx.facilities.filter((f) => f.is_active).map((f) => ({ id: f.id, name: f.name, timezone: f.timezone, isAdmin: ctx.adminOf.has(f.id) }))} />
    </>
  );
}
