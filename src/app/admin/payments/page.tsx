import type { Metadata } from "next";
import Link from "next/link";
import { Chip, EmptyState, Notice } from "@/components/ui";
import { PageHeader } from "@/components/admin/PageHeader";
import { requireAdmin } from "@/lib/admin";
import { formatDateTime, formatNaira } from "@/lib/format";
import { PAYMENT_MODE_LABEL } from "@/lib/status";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PaymentMode } from "@/lib/types";

export const metadata: Metadata = { title: "Payments" };
export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  const ctx = await requireAdmin("/admin/payments");
  const ids = [...ctx.adminOf];
  const supabase = await createSupabaseServerClient();
  const none = ["00000000-0000-0000-0000-000000000000"];
  const [settings, policies, txns, refunds] = await Promise.all([
    supabase.from("platform_settings").select("online_payments_enabled").eq("id", 1).maybeSingle(),
    supabase.from("booking_policies").select("facility_id, payment_mode").in("facility_id", ids.length ? ids : none),
    supabase.from("payment_transactions").select("id, booking_id, provider, status, amount_kobo, method, receipt_number, created_at, verified_at, bookings!inner(reference, facility_id)")
      .in("bookings.facility_id", ids.length ? ids : none).order("created_at", { ascending: false }).limit(200),
    supabase.from("refunds").select("id, booking_id, amount_kobo, status, reason, created_at, bookings!inner(reference, facility_id)")
      .in("bookings.facility_id", ids.length ? ids : none).order("created_at", { ascending: false }).limit(50),
  ]);
  const name = new Map(ctx.facilities.map((f) => [f.id, f.name]));

  return (
    <>
      <PageHeader title="Payments" description="Payment records come only from staff-recorded offline payments or provider-verified online payments. Nothing here is estimated." />
      <Notice tone="info" className="mb-4" title="Payment policy status">
        Online collection is {settings.data?.online_payments_enabled ? "enabled" : "switched off"} platform-wide.
        <ul className="mt-1 list-disc pl-5">
          {(policies.data ?? []).map((p) => <li key={p.facility_id}>{name.get(p.facility_id)}: {PAYMENT_MODE_LABEL[p.payment_mode as PaymentMode]}</li>)}
        </ul>
      </Notice>
      {ids.length === 0 ? <Notice tone="info">Only facility administrators can view payments.</Notice> : (txns.data ?? []).length === 0 ? (
        <EmptyState title="No payments recorded" body="When staff record an offline payment, or an online payment is verified, it appears here." />
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-surface">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-line text-left text-xs text-muted">
              <tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Booking</th><th className="px-3 py-2">Source</th><th className="px-3 py-2">Amount</th><th className="px-3 py-2">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {txns.data!.map((t) => {
                const bk = t.bookings as unknown as { reference: string };
                return (
                  <tr key={t.id}>
                    <td className="px-3 py-2 tabular">{formatDateTime(t.created_at)}</td>
                    <td className="px-3 py-2"><Link href={`/admin/bookings/${t.booking_id}`} className="font-mono text-pitch hover:underline">{bk.reference}</Link></td>
                    <td className="px-3 py-2">{t.provider === "offline" ? `Offline · ${t.method ?? ""}${t.receipt_number ? ` #${t.receipt_number}` : ""}` : "Paystack"}</td>
                    <td className="px-3 py-2 font-mono">{formatNaira(t.amount_kobo)}</td>
                    <td className="px-3 py-2"><Chip tone={t.status === "succeeded" ? "ok" : t.status === "failed" ? "danger" : "warn"}>{t.status}</Chip></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {(refunds.data ?? []).length > 0 && (
        <section className="mt-8">
          <h2 className="font-display mb-3 text-2xl">Refund reviews</h2>
          <ul className="divide-y divide-line rounded-[var(--radius-card)] border border-line bg-surface text-sm">
            {refunds.data!.map((r) => (
              <li key={r.id} className="flex justify-between gap-3 p-3">
                <span className="font-mono">{(r.bookings as unknown as { reference: string }).reference}</span>
                <span>{formatNaira(r.amount_kobo)}</span><Chip tone="warn">{r.status.replace("_", " ")}</Chip>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">Refund processing is handled manually until a refund policy and provider are approved.</p>
        </section>
      )}
    </>
  );
}
