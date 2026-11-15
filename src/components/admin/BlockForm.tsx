"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Notice, Select } from "@/components/ui";
import { cancelBlock, createBlock } from "@/app/admin/actions";

const toIso = (local: string) => new Date(`${local}:00+01:00`).toISOString(); // inputs are in West Africa Time

export function BlockForm({ facilityId, surfaces }: { facilityId: string; surfaces: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [v, setV] = useState({ surfaceId: "", starts: "", ends: "", kind: "maintenance", reason: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string; conflicts?: { reference: string; starts_at: string; status: string }[] } | null>(null);
  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => {
      e.preventDefault();
      start(async () => {
        const r = await createBlock({ facilityId, surfaceId: v.surfaceId || null, startsAt: toIso(v.starts), endsAt: toIso(v.ends), kind: v.kind, reason: v.reason });
        if (!r.ok) return setMsg({ ok: false, text: r.error });
        if (!r.data.created) return setMsg({ ok: false, text: "These bookings overlap the period. Move or cancel them first:", conflicts: r.data.conflicts });
        setMsg({ ok: true, text: "Block added." });
        router.refresh();
      });
    }}>
      {msg && (
        <Notice tone={msg.ok ? "ok" : "danger"} className="sm:col-span-2">
          {msg.text}
          {msg.conflicts && <ul className="mt-1 list-disc pl-5 font-mono text-xs">{msg.conflicts.map((c) => <li key={c.reference}>{c.reference} · {c.status}</li>)}</ul>}
        </Notice>
      )}
      <Field id="bl-surface" label="Area">
        <Select id="bl-surface" value={v.surfaceId} onChange={(e) => setV({ ...v, surfaceId: e.target.value })}>
          <option value="">Whole facility</option>
          {surfaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
      </Field>
      <Field id="bl-kind" label="Reason type">
        <Select id="bl-kind" value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value })}>
          <option value="maintenance">Maintenance</option><option value="closure">Closure</option>
          <option value="official_use">Official university use</option><option value="event">Event</option><option value="other">Other</option>
        </Select>
      </Field>
      <Field id="bl-start" label="From (WAT)"><Input id="bl-start" type="datetime-local" required value={v.starts} onChange={(e) => setV({ ...v, starts: e.target.value })} /></Field>
      <Field id="bl-end" label="Until (WAT)"><Input id="bl-end" type="datetime-local" required value={v.ends} onChange={(e) => setV({ ...v, ends: e.target.value })} /></Field>
      <Field id="bl-reason" label="Note" className="sm:col-span-2"><Input id="bl-reason" value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} /></Field>
      <Button type="submit" disabled={pending || !v.starts || !v.ends} className="sm:col-span-2">Add block</Button>
    </form>
  );
}

export function CancelBlockButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button variant="ghost" size="sm" disabled={pending} onClick={() => start(async () => { const r = await cancelBlock(id); if (r.ok) router.refresh(); })}>Remove</Button>
  );
}
