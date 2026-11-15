"use client";

import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button, Field, Input, Notice } from "@/components/ui";
import { updateProfile } from "@/app/(customer)/actions";

export function ProfileForm({ initial }: { initial: { fullName: string; phone: string } }) {
  const [fullName, setFullName] = useState(initial.fullName);
  const [phone, setPhone] = useState(initial.phone);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => {
      e.preventDefault();
      start(async () => {
        const r = await updateProfile({ fullName, phone });
        setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error });
      });
    }}>
      {msg && <Notice tone={msg.ok ? "ok" : "danger"}>{msg.text}</Notice>}
      <Field id="fullName" label="Full name"><Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" /></Field>
      <Field id="phone" label="Phone" hint="Used to pre-fill your bookings."><Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" /></Field>
      <Button type="submit" disabled={pending}>{pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}Save</Button>
    </form>
  );
}
