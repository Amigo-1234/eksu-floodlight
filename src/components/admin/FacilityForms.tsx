"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button, Card, Field, Input, Notice, Select, Textarea } from "@/components/ui";
import {
  createFacility, replaceHours, savePrice, saveSurface, updateFacility, updatePolicy, uploadFacilityImage,
} from "@/app/admin/actions";
import { WEEKDAYS } from "@/lib/format";
import type { BookingPolicy, Facility, FacilityPrice, OperatingHours, SportCategory, Surface } from "@/lib/types";

function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok = "Saved.") => start(async () => {
    setMsg(null);
    const r = await fn();
    setMsg(r.ok ? { ok: true, text: ok } : { ok: false, text: r.error ?? "Failed." });
    if (r.ok) router.refresh();
  });
  const banner = msg ? <Notice tone={msg.ok ? "ok" : "danger"} className="mb-3">{msg.text}</Notice> : null;
  return { pending, run, banner };
}

const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v));

export function CreateFacilityForm({ categories }: { categories: SportCategory[] }) {
  const router = useRouter();
  const [v, setV] = useState({ name: "", sportCategoryId: categories[0]?.id ?? "", location: "", description: "" });
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => {
      e.preventDefault();
      start(async () => {
        const r = await createFacility(v);
        if (!r.ok) return setErr(r.error);
        router.push(`/admin/facilities/${r.data.id}`);
      });
    }}>
      {err && <Notice tone="danger" className="sm:col-span-2">{err}</Notice>}
      <Field id="nf-name" label="Facility name"><Input id="nf-name" required value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
      <Field id="nf-sport" label="Sport">
        <Select id="nf-sport" value={v.sportCategoryId} onChange={(e) => setV({ ...v, sportCategoryId: e.target.value })}>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Field>
      <Field id="nf-loc" label="Location on campus (optional)"><Input id="nf-loc" value={v.location} onChange={(e) => setV({ ...v, location: e.target.value })} /></Field>
      <div className="flex items-end"><Button type="submit" disabled={pending} className="w-full">{pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}Create (inactive)</Button></div>
      <p className="text-xs text-muted sm:col-span-2">New facilities start inactive with no slot length or hours, so nothing can be booked until you configure them.</p>
    </form>
  );
}

export function FacilityDetailsForm({ f, categories }: { f: Facility; categories: SportCategory[] }) {
  const { pending, run, banner } = useAction();
  const [v, setV] = useState({
    name: f.name, sport_category_id: f.sport_category_id, location_label: f.location_label ?? "", description: f.description ?? "",
    rules: f.rules ?? "", eligibility_note: f.eligibility_note ?? "", entry_instructions: f.entry_instructions ?? "",
    is_active: f.is_active, show_on_public_schedule: f.show_on_public_schedule,
  });
  const nn = (s: string) => (s.trim() === "" ? null : s);
  return (
    <Card className="p-4">
      <h2 className="sr-only">Details</h2>
      {banner}
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => {
        e.preventDefault();
        run(() => updateFacility(f.id, { ...v, location_label: nn(v.location_label), description: nn(v.description), rules: nn(v.rules),
          eligibility_note: nn(v.eligibility_note), entry_instructions: nn(v.entry_instructions) }));
      }}>
        <Field id="fd-name" label="Name"><Input id="fd-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
        <Field id="fd-sport" label="Sport">
          <Select id="fd-sport" value={v.sport_category_id} onChange={(e) => setV({ ...v, sport_category_id: e.target.value })}>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field id="fd-loc" label="Location"><Input id="fd-loc" value={v.location_label} onChange={(e) => setV({ ...v, location_label: e.target.value })} /></Field>
        <Field id="fd-elig" label="Who can book (shown, not enforced)" hint="Eligibility rules are a client decision; this note is informational only.">
          <Input id="fd-elig" value={v.eligibility_note} onChange={(e) => setV({ ...v, eligibility_note: e.target.value })} />
        </Field>
        <Field id="fd-desc" label="Description" className="sm:col-span-2"><Textarea id="fd-desc" rows={3} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></Field>
        <Field id="fd-rules" label="Facility rules" className="sm:col-span-2"><Textarea id="fd-rules" rows={3} value={v.rules} onChange={(e) => setV({ ...v, rules: e.target.value })} /></Field>
        <Field id="fd-entry" label="Entry instructions (shown on receipts)" className="sm:col-span-2"><Textarea id="fd-entry" rows={2} value={v.entry_instructions} onChange={(e) => setV({ ...v, entry_instructions: e.target.value })} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4" checked={v.is_active} onChange={(e) => setV({ ...v, is_active: e.target.checked })} />Active (visible and bookable when configured)</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4" checked={v.show_on_public_schedule} onChange={(e) => setV({ ...v, show_on_public_schedule: e.target.checked })} />Allow listings on the public schedule</label>
        <Button type="submit" disabled={pending} className="sm:col-span-2">Save details</Button>
      </form>
    </Card>
  );
}

export function SurfacesForm({ facilityId, surfaces }: { facilityId: string; surfaces: Surface[] }) {
  const { pending, run, banner } = useAction();
  const [name, setName] = useState("");
  return (
    <Card className="p-4">
      <h2 className="sr-only">Playing areas</h2>
      <p className="mb-3 text-sm text-muted">Each area is booked independently (e.g. two courts at one facility).</p>
      {banner}
      <ul className="mb-3 flex flex-col gap-2">
        {surfaces.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-2 rounded-xl border border-line p-2.5 text-sm">
            <span className="font-medium">{s.name}</span>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="size-4" defaultChecked={s.is_active} disabled={pending}
                onChange={(e) => run(() => saveSurface(facilityId, { id: s.id, name: s.name, isActive: e.target.checked }))} />Active
            </label>
          </li>
        ))}
        {surfaces.length === 0 && <li className="text-sm text-warn">No playing area yet — add at least one.</li>}
      </ul>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); run(() => saveSurface(facilityId, { name, isActive: true }), "Added."); setName(""); }}>
        <label className="sr-only" htmlFor="sf-name">New area name</label>
        <Input id="sf-name" placeholder="e.g. Main pitch, Court 1" value={name} onChange={(e) => setName(e.target.value)} />
        <Button type="submit" variant="outline" disabled={pending || !name.trim()}><Plus className="size-4" aria-hidden="true" />Add</Button>
      </form>
    </Card>
  );
}

type HourRow = { weekday: number; opens_at: string; closes_at: string };

export function HoursForm({ facilityId, hours }: { facilityId: string; hours: OperatingHours[] }) {
  const { pending, run, banner } = useAction();
  const [rows, setRows] = useState<HourRow[]>(hours.map((h) => ({ weekday: h.weekday, opens_at: h.opens_at.slice(0, 5), closes_at: h.closes_at.slice(0, 5) })));
  const update = (i: number, patch: Partial<HourRow>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <Card className="p-4">
      <h2 className="sr-only">Opening hours</h2>
      <p className="mb-3 text-sm text-muted">Facility local time. Add several ranges for a day if it closes in between. Days without a range are closed.</p>
      {banner}
      <ul className="flex flex-col gap-2">
        {rows.map((r, i) => (
          <li key={i} className="grid grid-cols-[minmax(0,1fr)_96px_96px_40px] items-center gap-2">
            <Select aria-label="Day" value={r.weekday} onChange={(e) => update(i, { weekday: Number(e.target.value) })} className="h-10">
              {WEEKDAYS.map((d, k) => <option key={d} value={k}>{d}</option>)}
            </Select>
            <Input aria-label="Opens" type="time" value={r.opens_at} onChange={(e) => update(i, { opens_at: e.target.value })} className="h-10 px-2" />
            <Input aria-label="Closes" type="time" value={r.closes_at} onChange={(e) => update(i, { closes_at: e.target.value })} className="h-10 px-2" />
            <Button type="button" variant="ghost" size="sm" aria-label="Remove" onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 className="size-4" aria-hidden="true" /></Button>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setRows([...rows, { weekday: 1, opens_at: "", closes_at: "" }])}><Plus className="size-4" aria-hidden="true" />Add range</Button>
        <Button type="button" size="sm" disabled={pending || rows.some((r) => !r.opens_at || !r.closes_at)} onClick={() => run(() => replaceHours(facilityId, rows))}>Save hours</Button>
      </div>
    </Card>
  );
}

export function PolicyForm({ facilityId, policy }: { facilityId: string; policy: BookingPolicy }) {
  const { pending, run, banner } = useAction();
  const s = (n: number | null) => (n == null ? "" : String(n));
  const [v, setV] = useState({
    slot_minutes: s(policy.slot_minutes), gap_minutes: String(policy.gap_minutes), min_notice_minutes: s(policy.min_notice_minutes),
    max_advance_days: s(policy.max_advance_days), max_active_bookings_per_user: s(policy.max_active_bookings_per_user),
    approval_mode: policy.approval_mode, payment_mode: policy.payment_mode, access_mode: policy.access_mode,
    entry_opens_minutes_before: s(policy.entry_opens_minutes_before), entry_closes_minutes_after_start: s(policy.entry_closes_minutes_after_start),
    customer_cancellation: policy.customer_cancellation, cancellation_cutoff_hours: s(policy.cancellation_cutoff_hours),
    customer_reschedule_allowed: policy.customer_reschedule_allowed, reschedule_cutoff_hours: s(policy.reschedule_cutoff_hours),
  });
  const num = (id: keyof typeof v, label: string, hint?: string) => (
    <Field id={`pol-${id}`} label={label} hint={hint ?? "Leave empty if not decided."}>
      <Input id={`pol-${id}`} inputMode="numeric" value={v[id] as string} onChange={(e) => setV({ ...v, [id]: e.target.value })} placeholder="Not set" />
    </Field>
  );
  return (
    <Card className="p-4">
      <h2 className="sr-only">Booking policy</h2>
      <p className="mb-3 text-sm text-muted">Values left empty stay “not set” — the platform never fills in a default for you. Every change is recorded in the audit log.</p>
      {banner}
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => {
        e.preventDefault();
        run(() => updatePolicy(facilityId, {
          slot_minutes: numOrNull(v.slot_minutes), gap_minutes: Number(v.gap_minutes || 0), min_notice_minutes: numOrNull(v.min_notice_minutes),
          max_advance_days: numOrNull(v.max_advance_days), max_active_bookings_per_user: numOrNull(v.max_active_bookings_per_user),
          approval_mode: v.approval_mode, payment_mode: v.payment_mode, access_mode: v.access_mode,
          entry_opens_minutes_before: numOrNull(v.entry_opens_minutes_before), entry_closes_minutes_after_start: numOrNull(v.entry_closes_minutes_after_start),
          customer_cancellation: v.customer_cancellation, cancellation_cutoff_hours: numOrNull(v.cancellation_cutoff_hours),
          customer_reschedule_allowed: v.customer_reschedule_allowed, reschedule_cutoff_hours: numOrNull(v.reschedule_cutoff_hours),
        }));
      }}>
        {num("slot_minutes", "Slot length (minutes)", "Required before bookings open. 15–480.")}
        {num("gap_minutes", "Gap between slots (minutes)", "0 means back-to-back slots.")}
        {num("min_notice_minutes", "Minimum notice (minutes)")}
        {num("max_advance_days", "Book up to (days ahead)")}
        {num("max_active_bookings_per_user", "Max active bookings per person")}
        <Field id="pol-approval" label="Confirmation">
          <Select id="pol-approval" value={v.approval_mode} onChange={(e) => setV({ ...v, approval_mode: e.target.value as typeof v.approval_mode })}>
            <option value="required">Staff approval required</option><option value="automatic">Automatic (no review)</option>
          </Select>
        </Field>
        <Field id="pol-payment" label="Payment" hint="Online collection also needs an owner to enable it in Settings.">
          <Select id="pol-payment" value={v.payment_mode} onChange={(e) => setV({ ...v, payment_mode: e.target.value as typeof v.payment_mode })}>
            <option value="unconfigured">Not configured (requests stay unconfirmed)</option>
            <option value="free">Free</option><option value="offline">Pay at facility (staff record)</option>
            <option value="online">Online</option><option value="hybrid">Online or at facility</option><option value="deposit">Deposit</option>
          </Select>
        </Field>
        <Field id="pol-access" label="Entry passes" hint="Live admission stays in test mode until the owner approves it.">
          <Select id="pol-access" value={v.access_mode} onChange={(e) => setV({ ...v, access_mode: e.target.value as typeof v.access_mode })}>
            <option value="disabled">Disabled</option><option value="organizer_pass">Organiser pass</option>
            <option value="participant_passes" disabled>Per-player passes (needs approval)</option>
            <option value="organizer_and_participants" disabled>Organiser + players (needs approval)</option>
          </Select>
        </Field>
        {num("entry_opens_minutes_before", "Entry opens (minutes before start)")}
        {num("entry_closes_minutes_after_start", "Entry closes (minutes after start)", "Empty = until the slot ends.")}
        <Field id="pol-cancel" label="Customer cancellation">
          <Select id="pol-cancel" value={v.customer_cancellation} onChange={(e) => setV({ ...v, customer_cancellation: e.target.value as typeof v.customer_cancellation })}>
            <option value="pending_only">Only unconfirmed requests</option>
            <option value="until_cutoff">Also confirmed, until a cutoff</option>
            <option value="not_allowed">Confirmed bookings: not online</option>
          </Select>
        </Field>
        {num("cancellation_cutoff_hours", "Cancellation cutoff (hours before)")}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4" checked={v.customer_reschedule_allowed} onChange={(e) => setV({ ...v, customer_reschedule_allowed: e.target.checked })} />Customers may move their booking</label>
        {num("reschedule_cutoff_hours", "Reschedule cutoff (hours before)")}
        <Button type="submit" disabled={pending} className="sm:col-span-2">Save policy</Button>
      </form>
    </Card>
  );
}

export function PricesForm({ facilityId, prices }: { facilityId: string; prices: FacilityPrice[] }) {
  const { pending, run, banner } = useAction();
  const [v, setV] = useState({ label: "", amount: "", deposit: "", isDefault: prices.length === 0 });
  return (
    <Card className="p-4">
      <h2 className="sr-only">Prices</h2>
      <p className="mb-3 text-sm text-muted">Enter only prices approved by the facility. No price is assumed.</p>
      {banner}
      <ul className="mb-3 flex flex-col gap-2 text-sm">
        {prices.map((p) => (
          <li key={p.id} className="flex items-center justify-between rounded-xl border border-line p-2.5">
            <span>{p.label} {p.is_default && <span className="text-xs text-ok">(default)</span>}</span>
            <span className="font-mono">₦{(p.amount_kobo / 100).toLocaleString("en-NG")}</span>
          </li>
        ))}
        {prices.length === 0 && <li className="text-muted">No prices set.</li>}
      </ul>
      <form className="grid gap-2 sm:grid-cols-4" onSubmit={(e) => {
        e.preventDefault();
        run(() => savePrice(facilityId, { label: v.label, amountNaira: Number(v.amount), depositNaira: v.deposit ? Number(v.deposit) : null, isDefault: v.isDefault, isActive: true }), "Price added.");
      }}>
        <Input aria-label="Label" placeholder="Label" value={v.label} onChange={(e) => setV({ ...v, label: e.target.value })} />
        <Input aria-label="Amount in naira" inputMode="decimal" placeholder="Amount ₦" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} />
        <Input aria-label="Deposit in naira" inputMode="decimal" placeholder="Deposit ₦ (optional)" value={v.deposit} onChange={(e) => setV({ ...v, deposit: e.target.value })} />
        <Button type="submit" variant="outline" disabled={pending || !v.label || !v.amount}>Add price</Button>
        <label className="flex items-center gap-2 text-sm sm:col-span-4"><input type="checkbox" className="size-4" checked={v.isDefault} onChange={(e) => setV({ ...v, isDefault: e.target.checked })} />Use as the default price for bookings</label>
      </form>
    </Card>
  );
}

export function ImageUploadForm({ facilityId, images }: { facilityId: string; images: { id: string; url: string | null; alt_text: string }[] }) {
  const { pending, run, banner } = useAction();
  return (
    <Card className="p-4">
      <h2 className="sr-only">Photos</h2>
      <p className="mb-3 text-sm text-muted">Use only photos you have permission to publish. JPG, PNG or WebP, up to 5 MB.</p>
      {banner}
      {images.length > 0 && (
        <ul className="mb-3 grid grid-cols-3 gap-2">
          {images.map((i) => (
            // eslint-disable-next-line @next/next/no-img-element -- storage URL
            <li key={i.id}>{i.url && <img src={i.url} alt={i.alt_text} className="aspect-video w-full rounded-lg object-cover" />}</li>
          ))}
        </ul>
      )}
      <form className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]" action={(fd) => run(() => uploadFacilityImage(facilityId, fd), "Uploaded.")}>
        <input name="file" type="file" accept="image/jpeg,image/png,image/webp" required aria-label="Image file" className="text-sm" />
        <Input name="alt" placeholder="Describe the photo" aria-label="Photo description" />
        <Button type="submit" variant="outline" disabled={pending}>Upload</Button>
      </form>
    </Card>
  );
}
