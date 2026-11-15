"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button, Card, Field, Input, Notice, Select, Textarea, cx } from "@/components/ui";
import { loadAvailability } from "@/app/(customer)/actions";
import { staffCreateBooking } from "@/app/admin/actions";
import { formatRange, formatTime } from "@/lib/format";
import { ACTIVITY_TYPE_LABEL, SLOT_STATE } from "@/lib/status";
import type { AvailabilitySlot } from "@/lib/types";

type Fac = { id: string; name: string; timezone: string; isAdmin: boolean };

export function StaffBookingForm({ facilities, initialFacility, today }: { facilities: Fac[]; initialFacility: string; today: string }) {
  const router = useRouter();
  const [facilityId, setFacilityId] = useState(initialFacility);
  const [day, setDay] = useState(today);
  const [slots, setSlots] = useState<AvailabilitySlot[] | null>(null);
  const [slot, setSlot] = useState<AvailabilitySlot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();
  const [saving, startSave] = useTransition();
  const [key] = useState(() => crypto.randomUUID());
  const [f, setF] = useState({
    source: "walk_in" as "walk_in" | "staff", organizerName: "", organizerPhone: "", organizerEmail: "", customerEmail: "",
    activityType: "friendly" as keyof typeof ACTIVITY_TYPE_LABEL, activityTitle: "", teamName: "", opponentName: "", notes: "",
    waivePayment: false, publicListing: false,
  });
  const fac = facilities.find((x) => x.id === facilityId);

  const load = (fid: string, d: string) => startLoad(async () => {
    setSlot(null); setError(null);
    const r = await loadAvailability(fid, d);
    if (r.ok) setSlots(r.data); else { setSlots([]); setError(r.error); }
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!slot) return setError("Choose a time slot.");
    startSave(async () => {
      setError(null);
      const r = await staffCreateBooking({ surfaceId: slot.surface_id, start: slot.slot_start, idempotencyKey: key, ...f });
      if (!r.ok) { setError(r.error); load(facilityId, day); return; }
      router.push(`/admin/bookings/${r.data.id}`);
    });
  };

  const bySurface = new Map<string, AvailabilitySlot[]>();
  for (const s of slots ?? []) bySurface.set(s.surface_name, [...(bySurface.get(s.surface_name) ?? []), s]);

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      {error && <Notice tone="danger">{error}</Notice>}
      <Card className="grid gap-4 p-4 sm:grid-cols-3">
        <Field id="fac" label="Facility">
          <Select id="fac" value={facilityId} onChange={(e) => { setFacilityId(e.target.value); setSlots(null); setSlot(null); }}>
            {facilities.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </Select>
        </Field>
        <Field id="day" label="Date"><Input id="day" type="date" value={day} onChange={(e) => { setDay(e.target.value); setSlots(null); setSlot(null); }} /></Field>
        <div className="flex items-end">
          <Button type="button" variant="outline" onClick={() => load(facilityId, day)} disabled={loading} className="w-full">
            {loading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}Show slots
          </Button>
        </div>
      </Card>

      {slots && (
        <Card className="p-4">
          {slots.length === 0 ? <p className="text-sm text-muted">No slots on this date (closed or not configured).</p> : (
            [...bySurface.entries()].map(([name, list]) => (
              <div key={name} className="mb-4 last:mb-0">
                <p className="mb-2 text-sm font-semibold">{name}</p>
                <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {list.map((s) => {
                    const open = s.state === "available" || (s.state === "past" && new Date(s.slot_end).getTime() > Date.now()) || s.state === "too_soon";
                    const on = slot?.slot_start === s.slot_start && slot?.surface_id === s.surface_id;
                    return (
                      <li key={s.slot_start}>
                        <button type="button" disabled={!open} onClick={() => setSlot(s)} aria-pressed={on}
                          aria-label={`${formatRange(s.slot_start, s.slot_end, fac?.timezone)} ${SLOT_STATE[s.state].label}`}
                          className={cx("w-full rounded-xl border p-2 text-left text-sm",
                            on ? "border-ink bg-ink text-bg" : open ? "border-pitch/60 bg-surface" : "border-line bg-raised text-faint")}>
                          <span className="font-display block text-xl tabular">{formatTime(s.slot_start, fac?.timezone)}</span>
                          <span className="text-[11px]">{open ? (s.state === "past" ? "In progress" : "Free") : SLOT_STATE[s.state].label}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </Card>
      )}

      <Card className="grid gap-4 p-4 sm:grid-cols-2">
        <Field id="source" label="Booking type">
          <Select id="source" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value as "walk_in" | "staff" })}>
            <option value="walk_in">Walk-in at the facility</option><option value="staff">Staff-assisted booking</option>
          </Select>
        </Field>
        <Field id="atype" label="Activity">
          <Select id="atype" value={f.activityType} onChange={(e) => setF({ ...f, activityType: e.target.value as typeof f.activityType })}>
            {Object.entries(ACTIVITY_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field id="oname" label="Organiser name"><Input id="oname" required value={f.organizerName} onChange={(e) => setF({ ...f, organizerName: e.target.value })} /></Field>
        <Field id="ophone" label="Organiser phone"><Input id="ophone" type="tel" value={f.organizerPhone} onChange={(e) => setF({ ...f, organizerPhone: e.target.value })} /></Field>
        <Field id="oemail" label="Organiser email"><Input id="oemail" type="email" value={f.organizerEmail} onChange={(e) => setF({ ...f, organizerEmail: e.target.value })} /></Field>
        <Field id="cemail" label="Link to customer account (email, optional)" hint="If they have an account, the booking appears in their dashboard.">
          <Input id="cemail" type="email" value={f.customerEmail} onChange={(e) => setF({ ...f, customerEmail: e.target.value })} />
        </Field>
        <Field id="title" label="Title (optional)"><Input id="title" value={f.activityTitle} onChange={(e) => setF({ ...f, activityTitle: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="team" label="Team"><Input id="team" value={f.teamName} onChange={(e) => setF({ ...f, teamName: e.target.value })} /></Field>
          <Field id="opp" label="Opponent"><Input id="opp" value={f.opponentName} onChange={(e) => setF({ ...f, opponentName: e.target.value })} /></Field>
        </div>
        <Field id="notes" label="Notes" className="sm:col-span-2"><Textarea id="notes" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        {fac?.isAdmin && (
          <label className="flex items-start gap-2 text-sm sm:col-span-2">
            <input type="checkbox" className="mt-0.5 size-4" checked={f.waivePayment} onChange={(e) => setF({ ...f, waivePayment: e.target.checked })} />
            <span>No payment required for this booking (recorded in the audit log). Leave unticked if payment is still due.</span>
          </label>
        )}
        <label className="flex items-start gap-2 text-sm sm:col-span-2">
          <input type="checkbox" className="mt-0.5 size-4" checked={f.publicListing} onChange={(e) => setF({ ...f, publicListing: e.target.checked })} />
          <span>List on the public schedule</span>
        </label>
      </Card>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">{slot ? `Selected: ${formatRange(slot.slot_start, slot.slot_end, fac?.timezone)} · ${slot.surface_name}` : "No slot selected"}</p>
        <Button type="submit" size="lg" disabled={saving || !slot}>{saving && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}Create booking</Button>
      </div>
    </form>
  );
}
