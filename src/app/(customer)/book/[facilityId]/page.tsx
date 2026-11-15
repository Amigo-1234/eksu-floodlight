import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Card, DevFixtureBadge, Notice } from "@/components/ui";
import { BookingFlow } from "@/components/booking/BookingFlow";
import { requireViewer } from "@/lib/auth";
import { getFacilityById } from "@/lib/data";
import { todayInTz } from "@/lib/format";
import { READINESS_LABEL } from "@/lib/status";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { z } from "zod";

export const metadata: Metadata = { title: "Book a field" };
export const dynamic = "force-dynamic";

export default async function BookPage(props: PageProps<"/book/[facilityId]">) {
  const { facilityId } = await props.params;
  if (!z.string().uuid().safeParse(facilityId).success) notFound();
  const viewer = await requireViewer(`/book/${facilityId}`);
  const d = await getFacilityById(facilityId);
  if (!d || !d.facility.is_active) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: profile } = await supabase.from("profiles").select("full_name, phone, email").eq("id", viewer.userId).maybeSingle();
  const today = todayInTz(d.facility.timezone);
  const defaultPrice = d.prices.find((p) => p.is_default) ?? null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <Link href={`/facilities/${d.facility.slug}`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ChevronLeft className="size-4" aria-hidden="true" />{d.facility.name}
      </Link>
      <h1 className="font-display mt-2 text-5xl">Book a field</h1>
      {d.facility.is_dev_fixture && <div className="mt-2"><DevFixtureBadge /></div>}

      {!d.readiness.bookable ? (
        <Card className="mt-6 p-5">
          <Notice tone="warn" title="This facility isn't taking online bookings yet">
            <ul className="list-disc pl-5">{d.readiness.missing.map((m) => <li key={m}>{READINESS_LABEL[m] ?? m}</li>)}</ul>
          </Notice>
        </Card>
      ) : (
        <BookingFlow
          facility={{ id: d.facility.id, name: d.facility.name, timezone: d.facility.timezone, rules: d.facility.rules }}
          policy={d.policy!}
          surfaces={d.surfaces.filter((s) => s.is_active).map((s) => ({ id: s.id, name: s.name }))}
          price={defaultPrice ? { label: defaultPrice.label, amount_kobo: defaultPrice.amount_kobo, deposit_kobo: defaultPrice.deposit_kobo } : null}
          today={today}
          profile={{ name: profile?.full_name ?? viewer.fullName, phone: profile?.phone ?? "", email: profile?.email ?? viewer.email ?? "" }}
        />
      )}
    </div>
  );
}
