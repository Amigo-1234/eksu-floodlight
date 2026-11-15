import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui";
import { PageHeader } from "@/components/admin/PageHeader";
import { SettingsForm } from "@/components/admin/SettingsForm";
import { requireAdmin } from "@/lib/admin";
import { formatDateTime } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const ctx = await requireAdmin("/admin/settings");
  if (!ctx.isOwner) redirect("/admin");
  const supabase = await createSupabaseServerClient();
  const [{ data: s }, { data: audit }] = await Promise.all([
    supabase.from("platform_settings").select("*").eq("id", 1).single(),
    supabase.from("audit_log").select("id, at, action, entity_type, entity_id, details").order("at", { ascending: false }).limit(40),
  ]);
  return (
    <>
      <PageHeader title="Settings" description="Platform-wide switches. Switches that affect money or entry stay off until the client approves the policy." />
      <Card className="mb-6 p-4"><SettingsForm initial={s} /></Card>
      <section>
        <h2 className="font-display mb-2 text-2xl">Recent audit log</h2>
        <ul className="divide-y divide-line panel text-sm">
          {(audit ?? []).map((a) => (
            <li key={a.id} className="flex flex-wrap justify-between gap-2 p-3">
              <span className="font-mono text-xs">{a.action}</span>
              <span className="text-muted">{a.entity_type}{a.details?.reference ? ` · ${a.details.reference}` : ""}</span>
              <span className="text-muted tabular">{formatDateTime(a.at)}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
