import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Chip, EmptyState, Notice } from "@/components/ui";
import { PageHeader } from "@/components/admin/PageHeader";
import { FacilitySwitcher } from "@/components/admin/FacilitySwitcher";
import { pickFacility, requireAdmin } from "@/lib/admin";
import { formatDateTime } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Check-ins" };
export const dynamic = "force-dynamic";

const RESULT_TONE: Record<string, "ok" | "warn" | "danger" | "muted"> = {
  VALID: "ok", ALREADY_USED: "warn", OUTSIDE_ENTRY_WINDOW: "warn", BOOKING_NOT_CONFIRMED: "danger",
  BOOKING_CANCELLED: "danger", PASS_REVOKED: "danger", UNKNOWN_CREDENTIAL: "danger", WRONG_FACILITY: "danger", ACCESS_DISABLED: "muted",
};

export default async function CheckInsPage(props: PageProps<"/admin/check-ins">) {
  const ctx = await requireAdmin("/admin/check-ins");
  const facility = pickFacility(ctx, (await props.searchParams).facility);
  const ids = facility ? [facility] : [...ctx.adminOf];
  const supabase = await createSupabaseServerClient();
  const [logs, settings] = await Promise.all([
    supabase.from("access_verification_logs").select("id, at, result, mode, method, committed, device_label, booking_id, facility_id")
      .in("facility_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]).order("at", { ascending: false }).limit(200),
    supabase.from("platform_settings").select("live_gate_admission").eq("id", 1).maybeSingle(),
  ]);
  const name = new Map(ctx.facilities.map((f) => [f.id, f.name]));

  return (
    <>
      <PageHeader title="Check-ins" description="Every gate verification attempt — valid or not — is logged here. The log cannot be edited."
        actions={<Suspense><FacilitySwitcher facilities={ctx.facilities.filter((f) => ctx.adminOf.has(f.id))} /></Suspense>} />
      {!settings.data?.live_gate_admission && (
        <Notice tone="warn" className="mb-4" title="Gate admission is in TEST MODE">Scans are verified and logged, but no booking is marked as checked in until a platform owner turns on live admission after the entry policy is approved.</Notice>
      )}
      {ids.length === 0 ? <Notice tone="info">Only facility administrators can view gate logs.</Notice> : (logs.data ?? []).length === 0 ? (
        <EmptyState title="No gate activity yet" />
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-surface">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-line text-left text-xs text-muted">
              <tr><th className="px-3 py-2">Time</th><th className="px-3 py-2">Facility</th><th className="px-3 py-2">Result</th><th className="px-3 py-2">Method</th><th className="px-3 py-2">Mode</th><th className="px-3 py-2">Booking</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {logs.data!.map((l) => (
                <tr key={l.id}>
                  <td className="px-3 py-2 tabular">{formatDateTime(l.at)}</td>
                  <td className="px-3 py-2">{name.get(l.facility_id ?? "") ?? "—"}</td>
                  <td className="px-3 py-2"><Chip tone={RESULT_TONE[l.result] ?? "muted"}>{l.result.replaceAll("_", " ").toLowerCase()}</Chip>{l.committed && <span className="ml-1 text-xs text-ok">checked in</span>}</td>
                  <td className="px-3 py-2">{l.method}{l.device_label ? ` · ${l.device_label}` : ""}</td>
                  <td className="px-3 py-2">{l.mode}</td>
                  <td className="px-3 py-2">{l.booking_id ? <Link className="text-pitch hover:underline" href={`/admin/bookings/${l.booking_id}`}>Open</Link> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
