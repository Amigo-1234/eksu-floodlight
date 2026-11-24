"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Notice } from "@/components/ui";
import { updateSettings } from "@/app/admin/actions";

type S = { support_email: string | null; support_phone: string | null; require_staff_mfa: boolean; live_gate_admission: boolean; online_payments_enabled: boolean; public_booking_open: boolean;
  bank_name: string | null; bank_account_number: string | null; bank_account_name: string | null };

export function SettingsForm({ initial }: { initial: S }) {
  const router = useRouter();
  const [v, setV] = useState({ ...initial, support_email: initial.support_email ?? "", support_phone: initial.support_phone ?? "",
    bank_name: initial.bank_name ?? "", bank_account_number: initial.bank_account_number ?? "", bank_account_name: initial.bank_account_name ?? "" });
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const toggle = (k: "require_staff_mfa" | "live_gate_admission" | "online_payments_enabled" | "public_booking_open", label: string, warn: string) => (
    <label className="panel flex cursor-pointer items-start gap-3 p-4 text-sm transition-colors hover:border-signal/40">
      <input type="checkbox" className="mt-0.5 size-4 accent-[var(--signal)]" checked={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.checked })} />
      <span><strong>{label}</strong><br /><span className="text-muted">{warn}</span></span>
    </label>
  );
  return (
    <form className="grid gap-4" onSubmit={(e) => {
      e.preventDefault();
      start(async () => {
        const r = await updateSettings({ ...v, support_email: v.support_email || null, support_phone: v.support_phone || null,
          bank_name: v.bank_name || null, bank_account_number: v.bank_account_number || null, bank_account_name: v.bank_account_name || null });
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
      <fieldset className="panel grid gap-3 p-4 sm:grid-cols-3">
        <legend className="eyebrow px-1">Bank transfer details (shown to customers after their request is accepted)</legend>
        <Field id="s-bank" label="Bank name"><Input id="s-bank" value={v.bank_name} onChange={(e) => setV({ ...v, bank_name: e.target.value })} /></Field>
        <Field id="s-acct" label="Account number"><Input id="s-acct" inputMode="numeric" value={v.bank_account_number} onChange={(e) => setV({ ...v, bank_account_number: e.target.value.replace(/\D/g, "") })} /></Field>
        <Field id="s-acctname" label="Account name"><Input id="s-acctname" value={v.bank_account_name} onChange={(e) => setV({ ...v, bank_account_name: e.target.value })} /></Field>
      </fieldset>
      {toggle("public_booking_open", "Open booking to the public", "While off, only the owner, staff and listed testers can book, and every booking is a clearly marked TEST booking. Turn on at launch — bookings made after that are real.")}
      {toggle("require_staff_mfa", "Require two-factor authentication for staff", "Turn on before production. Staff without a verified authenticator lose staff access until they enrol.")}
      {toggle("live_gate_admission", "Live gate admission", "Only after the entry policy and gate procedures are approved. While off, gate scans are verification tests and do not admit anyone.")}
      {toggle("online_payments_enabled", "Online payment collection", "Only after the payment policy is approved and the provider keys are configured on the server.")}
      <Button type="submit" disabled={pending}>Save settings</Button>
    </form>
  );
}
