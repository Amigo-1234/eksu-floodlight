import type { Metadata } from "next";
import { Chip } from "@/components/ui";
import { FacilityPicker } from "@/components/gate/FacilityPicker";
import { GATE_RESULT, gateFacility, requireGate } from "@/lib/gate";
import { formatDateTime } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Gate history" };
export const dynamic = "force-dynamic";

export default async function GateHistory(props: PageProps<"/gate/history">) {
  const ctx = await requireGate("/gate/history");
  const facility = gateFacility(ctx, (await props.searchParams).facility);
  if (!facility) return <FacilityPicker facilities={ctx.facilities} base="/gate/history" />;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("access_verification_logs")
    .select("id, at, result, mode, method, committed, device_label")
    .eq("facility_id", facility).order("at", { ascending: false }).limit(100);
  return (
    <>
      <p className="eyebrow">Today&apos;s log</p>
      <h1 className="font-display t-page mb-4 mt-1">Gate history</h1>
      {(data ?? []).length === 0 ? <p className="text-sm text-muted">No scans yet.</p> : (
        <ul className="flex flex-col gap-2">
          {data!.map((l) => {
            const r = GATE_RESULT[l.result];
            return (
              <li key={l.id} className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-3 text-sm">
                <span>
                  <span className="block font-semibold">{r?.title ?? l.result}</span>
                  <span className="text-xs text-muted">{formatDateTime(l.at)} · {l.method}{l.mode === "test" ? " · test" : ""}</span>
                </span>
                {l.committed ? <Chip tone="ok">Checked in</Chip> : <Chip tone={r?.tone === "ok" ? "muted" : r?.tone ?? "muted"}>{l.result === "VALID" ? "Verified" : "Refused"}</Chip>}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
