"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Loader2, XCircle } from "lucide-react";
import { Button, Field, Notice, Textarea, cx } from "@/components/ui";
import { cancelMyBooking, loadAvailability, rescheduleMyBooking } from "@/app/(customer)/actions";
import { addDays, dayLabel, formatTime } from "@/lib/format";
import type { AvailabilitySlot } from "@/lib/types";

type Props = {
  bookingId: string;
  facilityId: string;
  timezone: string;
  canCancel: boolean;
  cancelHint: string;
  canReschedule: boolean;
  today: string;
};

export function ManageBooking({ bookingId, facilityId, timezone, canCancel, cancelHint, canReschedule, today }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<"none" | "cancel" | "move">("none");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [day, setDay] = useState(today);
  const [slots, setSlots] = useState<AvailabilitySlot[] | null>(null);

  const openDay = (d: string) => {
    setDay(d);
    setSlots(null);
    loadAvailability(facilityId, d).then((r) => setSlots(r.ok ? r.data : []));
  };

  const doCancel = () => start(async () => {
    setError(null);
    const r = await cancelMyBooking(bookingId, reason);
    if (!r.ok) return setError(r.error);
    setMode("none");
    router.refresh();
  });

  const doMove = (s: AvailabilitySlot) => start(async () => {
    setError(null);
    const r = await rescheduleMyBooking(bookingId, s.surface_id, s.slot_start);
    if (!r.ok) return setError(r.error);
    setMode("none");
    router.refresh();
  });

  if (!canCancel && !canReschedule) {
    return <p className="text-sm text-muted">{cancelHint}</p>;
  }

  return (
    <div className="no-print flex flex-col gap-3">
      {error && <Notice tone="danger">{error}</Notice>}
      {mode === "none" && (
        <div className="grid grid-cols-2 gap-3">
          {canReschedule && <Button variant="outline" onClick={() => { setMode("move"); openDay(day); }}><CalendarClock className="size-4" aria-hidden="true" />Change time</Button>}
          {canCancel && <Button variant="danger" onClick={() => setMode("cancel")}><XCircle className="size-4" aria-hidden="true" />Cancel</Button>}
        </div>
      )}
      {mode === "cancel" && (
        <div className="flex flex-col gap-3 rounded-2xl border border-danger/40 p-4">
          <p className="text-sm">{cancelHint}</p>
          <Field id="cancel-reason" label="Reason (optional)">
            <Textarea id="cancel-reason" rows={2} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setMode("none")} disabled={pending}>Keep booking</Button>
            <Button variant="danger" onClick={doCancel} disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}Cancel booking
            </Button>
          </div>
        </div>
      )}
      {mode === "move" && (
        <div className="flex flex-col gap-3 rounded-2xl border border-line p-4">
          <p className="text-sm font-semibold">Pick a new time</p>
          <div className="-mx-4 overflow-x-auto px-4">
            <ul className="flex gap-2">
              {Array.from({ length: 14 }, (_, i) => addDays(today, i)).map((d) => {
                const l = dayLabel(d);
                return (
                  <li key={d}>
                    <button type="button" onClick={() => openDay(d)} aria-pressed={d === day}
                      className={cx("flex h-16 w-14 flex-col items-center justify-center rounded-xl border text-xs",
                        d === day ? "border-signal bg-signal text-signal-ink" : "border-line bg-surface")}>
                      {l.weekday}<span className="font-display text-xl">{l.day}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          {slots === null ? <p className="text-sm text-muted"><Loader2 className="mr-1 inline size-4 animate-spin" aria-hidden="true" />Loading…</p> : (
            <ul className="grid grid-cols-3 gap-2">
              {slots.filter((s) => s.state === "available").map((s) => (
                <li key={`${s.surface_id}${s.slot_start}`}>
                  <button type="button" disabled={pending} onClick={() => doMove(s)}
                    className="w-full rounded-xl border-2 border-signal/80 p-2 text-left">
                    <span className="font-display block text-xl tabular">{formatTime(s.slot_start, timezone)}</span>
                    <span className="block truncate text-[11px] text-muted">{s.surface_name}</span>
                  </button>
                </li>
              ))}
              {slots.filter((s) => s.state === "available").length === 0 && <li className="col-span-3 text-sm text-muted">No free slots on this day.</li>}
            </ul>
          )}
          <Button variant="ghost" onClick={() => setMode("none")} className="self-end">Close</Button>
        </div>
      )}
    </div>
  );
}
