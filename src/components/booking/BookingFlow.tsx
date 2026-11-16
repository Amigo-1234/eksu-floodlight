"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type FormEvent, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarDays, Check, ChevronLeft, Loader2, RefreshCw } from "lucide-react";
import { Button, Card, Chip, Field, Input, Notice, Select, Skeleton, Textarea, cx } from "@/components/ui";
import { loadAvailability, submitBooking } from "@/app/(customer)/actions";
import { bookingDetailsSchema, type BookingDetails } from "@/lib/validation";
import { addDays, dayLabel, formatDate, formatNaira, formatRange, formatTime } from "@/lib/format";
import { ACTIVITY_TYPE_LABEL, PAYMENT_MODE_LABEL, SLOT_STATE } from "@/lib/status";
import type { AvailabilitySlot, BookingPolicy } from "@/lib/types";

type Props = {
  facility: { id: string; name: string; timezone: string; rules: string | null };
  policy: BookingPolicy;
  surfaces: { id: string; name: string }[];
  price: { label: string; amount_kobo: number; deposit_kobo: number | null } | null;
  today: string;
  profile: { name: string; phone: string; email: string };
};

const STEPS = ["Date", "Time", "Details", "Review"] as const;

function nextStepsText(policy: BookingPolicy): string[] {
  const out: string[] = [];
  if (policy.approval_mode === "required") out.push("Facility staff review your request and approve or decline it.");
  switch (policy.payment_mode) {
    case "free": out.push("No payment is required for this facility."); break;
    case "unconfigured":
      out.push("This facility hasn't set its payment policy yet. Your request is saved and staff will confirm what happens next. It is not confirmed until they do.");
      break;
    case "offline": out.push("Payment is made at the facility and recorded by staff before your booking is confirmed."); break;
    case "online": case "hybrid": case "deposit":
      out.push("A payment is required before your booking is confirmed. You'll see the payment step in your booking."); break;
  }
  if (policy.approval_mode === "automatic" && policy.payment_mode === "free") out.push("Your booking is confirmed straight away.");
  out.push("Your booking reference and receipt stay in My Bookings — you can come back to them any time.");
  return out;
}

export function BookingFlow({ facility, policy, surfaces, price, today, profile }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [day, setDay] = useState(today);
  const [surfaceId, setSurfaceId] = useState(surfaces[0]?.id ?? "");
  const [slots, setSlots] = useState<AvailabilitySlot[] | null>(null);
  const [slotError, setSlotError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AvailabilitySlot | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const [submitting, startSubmitting] = useTransition();
  const [idemKey, setIdemKey] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const horizon = Math.min(policy.max_advance_days ?? 21, 60);
  const days = useMemo(() => Array.from({ length: horizon + 1 }, (_, i) => addDays(today, i)), [today, horizon]);

  const form = useForm<BookingDetails>({
    resolver: zodResolver(bookingDetailsSchema),
    defaultValues: {
      activityType: "friendly", activityTitle: "", teamName: "", opponentName: "", purpose: "",
      organizerName: profile.name, organizerPhone: profile.phone, organizerEmail: profile.email, notes: "", publicListing: false,
    },
  });
  const activityType = useWatch({ control: form.control, name: "activityType" });

  const refresh = useCallback((d: string) => {
    setSlotError(null);
    startLoading(async () => {
      const r = await loadAvailability(facility.id, d);
      if (r.ok) setSlots(r.data);
      else { setSlots([]); setSlotError(r.error); }
    });
  }, [facility.id]);

  useEffect(() => { headingRef.current?.focus(); }, [step]);

  const surfaceSlots = (slots ?? []).filter((s) => s.surface_id === surfaceId);
  const freeCount = surfaceSlots.filter((s) => s.state === "available").length;
  const pick = (s: AvailabilitySlot) => { setSelected(s); setIdemKey(null); setSubmitError(null); setStep(2); };

  const onDetails = (e: FormEvent) => form.handleSubmit(() => { setIdemKey(crypto.randomUUID()); setStep(3); })(e);

  const submit = () => {
    if (!selected) return;
    setSubmitError(null);
    const details = form.getValues();
    startSubmitting(async () => {
      const r = await submitBooking({
        surfaceId: selected.surface_id, start: selected.slot_start,
        idempotencyKey: idemKey ?? crypto.randomUUID(), details,
      });
      if (r.ok) {
        router.push(`/booking/confirmation/${r.data.id}`);
        return;
      }
      setSubmitError(r.error);
      if (r.code && ["SLOT_TAKEN", "SLOT_BLOCKED", "SLOT_IN_PAST", "NOTICE_TOO_SHORT", "INVALID_SLOT"].includes(r.code)) {
        setSelected(null);
        setStep(1);
        refresh(day);
      }
    });
  };

  const amount = price && policy.payment_mode !== "free" ? (policy.payment_mode === "deposit" ? price.deposit_kobo ?? price.amount_kobo : price.amount_kobo) : null;

  return (
    <div className="mt-6">
      {/* Stepper */}
      <ol className="mb-6 grid grid-cols-4 gap-2" aria-label="Booking steps">
        {STEPS.map((label, i) => (
          <li key={label}>
            <button type="button" disabled={i > step || submitting} onClick={() => setStep(i)}
              aria-current={i === step ? "step" : undefined}
              className={cx("flex w-full flex-col gap-2 text-left text-xs font-bold transition-colors",
                i === step ? "text-ink" : i < step ? "text-signal" : "text-faint")}>
              <span className={cx("h-1.5 rounded-full transition-all duration-500", i < step ? "bg-signal" : i === step ? "bg-signal shadow-[0_0_14px_var(--signal)]" : "bg-line")} aria-hidden="true" />
              <span className="flex items-center gap-1">{i < step && <Check className="size-3" aria-hidden="true" />}{label}</span>
            </button>
          </li>
        ))}
      </ol>

      {submitError && step !== 3 && <Notice tone="danger" className="mb-4">{submitError}</Notice>}

      {/* Step 1 — Date */}
      {step === 0 && (
        <section aria-labelledby="step-h" className="animate-rise">
          <h2 id="step-h" ref={headingRef} tabIndex={-1} className="font-display mb-4 text-3xl">Pick a date</h2>
          <div className="-mx-4 overflow-x-auto px-4 pb-2">
            <ul className="flex gap-2">
              {days.map((d) => {
                const l = dayLabel(d);
                const on = d === day;
                return (
                  <li key={d}>
                    <button type="button" onClick={() => setDay(d)} aria-pressed={on}
                      className={cx("flex h-[84px] w-[66px] flex-col items-center justify-center gap-1 rounded-[20px] border transition-all duration-200 active:scale-95",
                        on ? "border-transparent bg-[linear-gradient(180deg,#ffd166,#ffc53d_50%,#ff9f1c)] text-signal-ink shadow-[0_12px_30px_-10px_rgb(255_197_61/0.8)]" : "border-line bg-surface hover:-translate-y-0.5 hover:border-signal/40")}>
                      <span className="font-mono text-[10px] font-medium uppercase tracking-[0.12em]">{d === today ? "Today" : l.weekday}</span>
                      <span className="font-display text-[28px] leading-none tabular">{l.day}</span>
                      <span className="text-[11px]">{l.month}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="mt-3 flex items-center gap-2 text-sm text-muted">
            <CalendarDays className="size-4" aria-hidden="true" />
            <label htmlFor="date-input">Or choose a date</label>
            <input id="date-input" type="date" min={today} max={days[days.length - 1]} value={day}
              onChange={(e) => e.target.value && setDay(e.target.value)}
              className="h-10 rounded-xl border border-line-strong bg-[#090b0f] px-3 text-ink" />
          </div>
          <div className="mt-6 flex justify-end">
            <Button size="lg" onClick={() => { refresh(day); setStep(1); }}>See times for {formatDate(`${day}T12:00:00Z`, "UTC", "short")}</Button>
          </div>
        </section>
      )}

      {/* Step 2 — Time */}
      {step === 1 && (
        <section aria-labelledby="step-h" className="animate-rise">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <h2 id="step-h" ref={headingRef} tabIndex={-1} className="font-display text-3xl">Choose a time</h2>
              <p className="text-sm text-muted">{formatDate(`${day}T12:00:00Z`, "UTC")} · {policy.slot_minutes}-minute slots</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => refresh(day)} disabled={loading} aria-label="Refresh availability">
              <RefreshCw className={cx("size-4", loading && "animate-spin")} aria-hidden="true" />
            </Button>
          </div>

          {surfaces.length > 1 && (
            <div role="tablist" aria-label="Playing area" className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
              {surfaces.map((s) => (
                <button key={s.id} role="tab" aria-selected={s.id === surfaceId} onClick={() => setSurfaceId(s.id)}
                  className={cx("h-10 shrink-0 rounded-full border px-4 text-sm font-bold transition-colors",
                    s.id === surfaceId ? "border-signal/60 bg-signal/[0.14] text-signal" : "border-line-strong text-muted hover:text-ink")}>
                  {s.name}
                </button>
              ))}
            </div>
          )}

          <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-hidden="true">
            <span className="flex items-center gap-1.5"><span className="size-3 rounded-md border border-signal bg-signal/20" />Free</span>
            <span className="flex items-center gap-1.5"><span className="size-3 rounded-md border border-dashed border-warn" />Requested</span>
            <span className="flex items-center gap-1.5"><span className="size-3 rounded-md border border-line bg-bg" />Booked / closed</span>
          </div>

          {slotError && <Notice tone="danger" className="mb-3">{slotError}</Notice>}
          {slots === null || (loading && slots.length === 0) ? (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-[74px] rounded-[20px]" />)}</div>
          ) : surfaceSlots.length === 0 ? (
            <Notice tone="info">The facility is closed on this day.</Notice>
          ) : (
            <>
              <p className="mb-3 text-sm font-bold" aria-live="polite"><span className="text-signal">{freeCount}</span> of {surfaceSlots.length} slots free</p>
              <ul className="stagger grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {surfaceSlots.map((s, i) => {
                  const meta = SLOT_STATE[s.state];
                  const label = `${formatRange(s.slot_start, s.slot_end, facility.timezone)}, ${meta.label}`;
                  return (
                    <li key={s.slot_start} style={{ "--i": Math.min(i, 12) } as CSSProperties}>
                      {meta.bookable ? (
                        <button type="button" onClick={() => pick(s)} aria-label={`Book ${label}`}
                          className="group relative flex h-[74px] w-full flex-col items-start justify-center overflow-hidden rounded-[20px] border border-signal/45 bg-signal/[0.06] px-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-signal hover:bg-signal/[0.12] hover:shadow-[0_14px_30px_-14px_rgb(255_197_61/0.8)] active:scale-[0.97]">
                          <span className="absolute right-3 top-3 size-1.5 rounded-full bg-signal shadow-[0_0_10px_var(--signal)]" aria-hidden="true" />
                          <span className="font-display text-[26px] leading-none tabular">{formatTime(s.slot_start, facility.timezone)}</span>
                          <span className="mt-1 text-xs font-bold text-signal">Free · until {formatTime(s.slot_end, facility.timezone)}</span>
                        </button>
                      ) : (
                        <div aria-label={label} role="img"
                          className={cx("flex h-[74px] w-full flex-col items-start justify-center rounded-[20px] px-4",
                            s.state === "requested" ? "border border-dashed border-warn/60 bg-warn/[0.04] text-ink/80" : "border border-line bg-bg/60 text-faint line-through decoration-faint/40")}>
                          <span className="font-display text-[26px] leading-none tabular">{formatTime(s.slot_start, facility.timezone)}</span>
                          <span className="text-xs">{meta.label}</span>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          <div className="mt-6 flex justify-between">
            <Button variant="ghost" onClick={() => setStep(0)}><ChevronLeft className="size-4" aria-hidden="true" />Date</Button>
          </div>
        </section>
      )}

      {/* Step 3 — Details */}
      {step === 2 && selected && (
        <form onSubmit={onDetails} noValidate className="animate-rise flex flex-col gap-4" aria-labelledby="step-h">
          <h2 id="step-h" ref={headingRef} tabIndex={-1} className="font-display text-3xl">Booking details</h2>
          <Card className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm text-muted">{facility.name} · {surfaces.find((s) => s.id === selected.surface_id)?.name}</p>
              <p className="font-display text-2xl tabular">{formatRange(selected.slot_start, selected.slot_end, facility.timezone)}</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setStep(1)}>Change</Button>
          </Card>

          <Field id="activityType" label="Activity" error={form.formState.errors.activityType?.message}>
            <Select id="activityType" {...form.register("activityType")}>
              {Object.entries(ACTIVITY_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          <Field id="activityTitle" label={activityType === "competition" ? "Competition name" : "Title (optional)"}
            error={form.formState.errors.activityTitle?.message}>
            <Input id="activityTitle" placeholder={activityType === "competition" ? "e.g. Inter-Faculty Cup, quarter-final" : "e.g. Weekly training"}
              aria-invalid={!!form.formState.errors.activityTitle} {...form.register("activityTitle")} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="teamName" label="Your team (optional)" error={form.formState.errors.teamName?.message}>
              <Input id="teamName" {...form.register("teamName")} />
            </Field>
            <Field id="opponentName" label="Opponent (optional)" error={form.formState.errors.opponentName?.message}>
              <Input id="opponentName" {...form.register("opponentName")} />
            </Field>
          </div>
          <Field id="purpose" label="Purpose (optional)" error={form.formState.errors.purpose?.message}>
            <Input id="purpose" placeholder="What's the booking for?" {...form.register("purpose")} />
          </Field>

          <fieldset className="panel flex flex-col gap-4 p-5">
            <legend className="eyebrow px-1">Organiser</legend>
            <Field id="organizerName" label="Full name" error={form.formState.errors.organizerName?.message}>
              <Input id="organizerName" autoComplete="name" aria-invalid={!!form.formState.errors.organizerName} {...form.register("organizerName")} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="organizerPhone" label="Phone" error={form.formState.errors.organizerPhone?.message}>
                <Input id="organizerPhone" type="tel" autoComplete="tel" inputMode="tel" aria-invalid={!!form.formState.errors.organizerPhone} {...form.register("organizerPhone")} />
              </Field>
              <Field id="organizerEmail" label="Email" error={form.formState.errors.organizerEmail?.message}>
                <Input id="organizerEmail" type="email" autoComplete="email" aria-invalid={!!form.formState.errors.organizerEmail} {...form.register("organizerEmail")} />
              </Field>
            </div>
            <p className="text-xs text-muted">Only you and the facility&apos;s staff can see contact details.</p>
          </fieldset>

          <Field id="notes" label="Notes for the facility (optional)" error={form.formState.errors.notes?.message}>
            <Textarea id="notes" rows={3} {...form.register("notes")} />
          </Field>
          <label className="panel flex cursor-pointer items-start gap-3 p-4 text-sm transition-colors hover:border-signal/40">
            <input type="checkbox" className="mt-0.5 size-5 accent-[var(--signal)]" {...form.register("publicListing")} />
            <span><strong>List on the public schedule</strong><br /><span className="text-muted">Shows the activity and team names (never contact details) once confirmed.</span></span>
          </label>

          <div className="flex justify-between gap-3">
            <Button type="button" variant="ghost" onClick={() => setStep(1)}><ChevronLeft className="size-4" aria-hidden="true" />Time</Button>
            <Button type="submit" size="lg">Review booking</Button>
          </div>
        </form>
      )}

      {/* Step 4 — Review */}
      {step === 3 && selected && (
        <section aria-labelledby="step-h" className="animate-rise flex flex-col gap-4">
          <h2 id="step-h" ref={headingRef} tabIndex={-1} className="font-display text-3xl">Review &amp; submit</h2>
          {submitError && <Notice tone="danger">{submitError}</Notice>}
          <Card className="overflow-hidden">
            <div className="relative overflow-hidden border-b border-line bg-[linear-gradient(135deg,rgb(255_197_61/0.16),transparent_60%)] p-5">
              <p className="text-sm text-muted">{facility.name} · {surfaces.find((s) => s.id === selected.surface_id)?.name}</p>
              <p className="font-display mt-1 text-4xl tabular text-signal">{formatRange(selected.slot_start, selected.slot_end, facility.timezone)}</p>
              <p className="text-sm">{formatDate(selected.slot_start, facility.timezone)}</p>
            </div>
            <dl className="divide-y divide-line text-sm">
              {([
                ["Activity", ACTIVITY_TYPE_LABEL[form.getValues("activityType")]],
                ["Title", form.getValues("activityTitle")],
                ["Teams", [form.getValues("teamName"), form.getValues("opponentName")].filter(Boolean).join(" vs ")],
                ["Purpose", form.getValues("purpose")],
                ["Organiser", form.getValues("organizerName")],
                ["Contact", [form.getValues("organizerPhone"), form.getValues("organizerEmail")].filter(Boolean).join(" · ")],
                ["Public listing", form.getValues("publicListing") ? "Yes" : "No"],
                ["Payment", policy.payment_mode === "unconfigured" ? "Method to be confirmed — nothing is charged now" : PAYMENT_MODE_LABEL[policy.payment_mode]],
                ["Price", amount != null ? `${formatNaira(amount)}${policy.payment_mode === "deposit" ? " deposit" : ` for ${policy.slot_minutes === 60 ? "1 hour" : `${policy.slot_minutes} min`}`}` : ""],
              ] as const).filter(([, v]) => v).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 px-4 py-2.5">
                  <dt className="text-muted">{k}</dt><dd className="text-right font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card className="p-4">
            <p className="mb-2 text-sm font-semibold">What happens next</p>
            <ul className="flex flex-col gap-1.5 text-sm text-muted">
              {nextStepsText(policy).map((t) => <li key={t} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-signal" aria-hidden="true" />{t}</li>)}
            </ul>
          </Card>
          {facility.rules && (
            <details className="panel group p-4 text-sm">
              <summary className="flex items-center justify-between font-bold">Facility rules<span className="text-signal transition-transform duration-200 group-open:rotate-45" aria-hidden="true">+</span></summary>
              <p className="details-body mt-2 whitespace-pre-line text-muted">{facility.rules}</p>
            </details>
          )}

          <div className="flex items-center justify-between gap-3">
            <Button variant="ghost" onClick={() => setStep(2)} disabled={submitting}><ChevronLeft className="size-4" aria-hidden="true" />Details</Button>
            <Button size="lg" onClick={submit} disabled={submitting} className="min-w-44">
              {submitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {policy.approval_mode === "required" || policy.payment_mode !== "free" ? "Submit request" : "Confirm booking"}
            </Button>
          </div>
          <p className="text-center text-xs text-muted">The slot is checked again on the server when you submit. <Chip>No charge is taken on this screen</Chip></p>
        </section>
      )}
    </div>
  );
}
