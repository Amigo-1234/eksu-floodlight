import type { Metadata } from "next";
import Link from "next/link";
import { ScanLine } from "lucide-react";
import { ButtonLink, Chip, Notice } from "@/components/ui";
import { FacilityPicker } from "@/components/gate/FacilityPicker";
import { gateFacility, requireGate } from "@/lib/gate";
import { formatRange } from "@/lib/format";
import { bookingHeadline } from "@/lib/status";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { GateBookingSummary } from "@/lib/types";

export const metadata: Metadata = { title: "Gate" };
export const dynamic = "force-dynamic";

export default async function GateToday(props: PageProps<"/gate">) {
  const ctx = await requireGate("/gate");
  const facility = gateFacility(ctx, (await props.searchParams).facility);
  if (!facility) return <FacilityPicker facilities={ctx.facilities} base="/gate" />;
  const f = ctx.facilities.find((x) => x.id === facility)!;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("gate_today", { p_facility_id: facility });
  const list = (data ?? []) as GateBookingSummary[];

  return (
    <>
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Today at</p>
          <h1 className="font-display text-4xl">{f.name}</h1>
        </div>
        {ctx.facilities.length > 1 && <Link href="/gate?facility=" className="text-sm text-muted">Switch</Link>}
      </div>
      {!ctx.live && (
        <Notice tone="warn" title="Test mode" className="mb-4">Scans verify passes and are logged, but do not admit anyone yet. Follow the facility&apos;s current entry procedure.</Notice>
      )}
      <ButtonLink href={`/gate/scan?facility=${facility}`} size="lg" className="mb-6 w-full text-lg"><ScanLine className="size-6" aria-hidden="true" />Scan a pass</ButtonLink>
      {error && <Notice tone="danger">Couldn&apos;t load today&apos;s bookings.</Notice>}
      {list.length === 0 ? <p className="text-sm text-muted">No bookings today.</p> : (
        <ol className="flex flex-col gap-2">
          {list.map((b) => {
            const h = bookingHeadline(b);
            return (
              <li key={b.booking_id} className="grid grid-cols-[88px_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-line bg-surface p-3">
                <span className="font-display text-xl tabular">{formatRange(b.starts_at, b.ends_at, f.timezone)}</span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{[b.team_name, b.opponent_name].filter(Boolean).join(" vs ") || b.organizer}</span>
                  <span className="block truncate text-xs text-muted">{b.surface} · <span className="font-mono">{b.reference}</span></span>
                </span>
                {b.checked_in ? <Chip tone="ok">In</Chip> : <Chip tone={h.tone}>{h.label}</Chip>}
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}
