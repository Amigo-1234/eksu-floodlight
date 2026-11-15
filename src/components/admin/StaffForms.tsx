"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy } from "lucide-react";
import { Button, Field, Input, Notice, Select } from "@/components/ui";
import { inviteStaff, revokeInvitation, revokeMembership, revokeOwner } from "@/app/admin/actions";

export function InviteForm({ facilities, isOwner, origin }: { facilities: { id: string; name: string }[]; isOwner: boolean; origin: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [v, setV] = useState({ email: "", role: isOwner ? "facility_admin" : "gatekeeper", facilityId: facilities[0]?.id ?? "" });
  const [link, setLink] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3">
      {err && <Notice tone="danger">{err}</Notice>}
      {link && (
        <Notice tone="ok" title="Invitation created">
          Email delivery isn&apos;t configured yet, so send this single-use link to the person yourself. It works only for {v.email} and expires in 72 hours.
          <div className="mt-2 flex gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-raised px-2 py-1 font-mono text-xs text-ink">{link}</code>
            <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(link)}><Copy className="size-4" aria-hidden="true" />Copy</Button>
          </div>
        </Notice>
      )}
      <form className="grid gap-3 sm:grid-cols-4" onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setErr(null); setLink(null);
          const r = await inviteStaff({ email: v.email, role: v.role, facilityId: v.role === "platform_owner" ? null : v.facilityId });
          if (!r.ok) return setErr(r.error);
          setLink(`${origin}/invite/${r.data.token}`);
          router.refresh();
        });
      }}>
        <Field id="inv-email" label="Email"><Input id="inv-email" type="email" required value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} /></Field>
        <Field id="inv-role" label="Role">
          <Select id="inv-role" value={v.role} onChange={(e) => setV({ ...v, role: e.target.value })}>
            {isOwner && <option value="facility_admin">Facility administrator</option>}
            <option value="scheduler">Scheduler</option>
            <option value="gatekeeper">Gatekeeper</option>
            {isOwner && <option value="platform_owner">Platform owner</option>}
          </Select>
        </Field>
        <Field id="inv-fac" label="Facility">
          <Select id="inv-fac" value={v.facilityId} disabled={v.role === "platform_owner"} onChange={(e) => setV({ ...v, facilityId: e.target.value })}>
            {facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </Select>
        </Field>
        <div className="flex items-end"><Button type="submit" disabled={pending} className="w-full">Create invitation</Button></div>
      </form>
    </div>
  );
}

export function RevokeButton({ kind, id, label }: { kind: "membership" | "invitation" | "owner"; id: string; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-2">
      {err && <span className="text-xs text-danger">{err}</span>}
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => {
        if (!confirm(`${label}?`)) return;
        start(async () => {
          const r = kind === "membership" ? await revokeMembership(id) : kind === "invitation" ? await revokeInvitation(id) : await revokeOwner(id);
          if (!r.ok) setErr(r.error); else router.refresh();
        });
      }}>{label}</Button>
    </span>
  );
}
