"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Notice } from "@/components/ui";
import { updateSettings } from "@/app/admin/actions";

type S = { support_email: string | null; support_phone: string | null; require_staff_mfa: boolean; live_gate_admission: boolean; online_payments_enabled: boolean };

export function SettingsForm({ initial }: { initial: S }) {
  const router = useRouter();
  const [v, setV] = useState({ ...initial, support_email: initial.support_email ?? "", support_phone: initial.support_phone ?? "" });
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const toggle = (k: "require_staff_mfa" | "live_gate_admission" | "online_payments_enabled", label: string, warn: string) => (
    <label className="flex items-start gap-3 rounded-xl border border-line p-3 text-sm">
      <input type="checkbox" className="mt-0.5 size-4" checked={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.checked })} />
      <span><strong>{label}</strong><br /><span className="text-muted">{warn}</span></span>
    </label>
  );
  return (
    <form className="grid gap-4" onSubmit={(e) => {
      e.preventDefault();
      start(async () => {
        const r = await updateSettings({ ...v, support_email: v.support_email || null, support_phone: v.support_phone || null });
        setMsg(r.ok ? { ok: true, text: "Settings saved." } : { ok: false, text: r.error });
        if (r.ok) router.refresh();
      });
    }}>
      {msg && <Notice tone={msg.ok ? "ok" : "danger"}>{msg.text}</Notice>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="s-email" label="Public support email" hint="Shown in the footer. Leave empty until confirmed.">
          <Input id="s-email" type="email" value={v.support_email} onChange={(e) => setV({ ...v, support_email: e.target.value })} />
        </Field>
        <Field id="s-phone" label="Public support phone" hint="Leave empty until confirmed.">
          <Input id="s-phone" type="tel" value={v.support_phone} onChange={(e) => setV({ ...v, support_phone: e.target.value })} />
        </Field>
      </div>
      {toggle("require_staff_mfa", "Require two-factor authentication for staff", "Turn on before production. Staff without a verified authenticator lose staff access until they enrol.")}
      {toggle("live_gate_admission", "Live gate admission", "Only after the entry policy and gate procedures are approved. While off, gate scans are verification tests and do not admit anyone.")}
      {toggle("online_payments_enabled", "Online payment collection", "Only after the payment policy is approved and the provider keys are configured on the server.")}
      <Button type="submit" disabled={pending}>Save settings</Button>
    </form>
  );
}
