"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import { cx } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { addDays, dayLabel, formatTime } from "@/lib/format";
import type { AvailabilitySlot, SlotState } from "@/lib/types";

/** Public, name-free view of which sessions are free, requested or booked. */
const LOOK: Record<SlotState, { label: string; cls: string }> = {
  available: { label: "Free", cls: "border-signal/50 bg-signal/[0.07] text-ink" },
  requested: { label: "Requested", cls: "border-dashed border-warn/60 bg-warn/[0.05] text-ink/80" },
  booked: { label: "Booked", cls: "border-line bg-raised text-muted" },
  blocked: { label: "Closed", cls: "border-line bg-bg text-faint" },
  past: { label: "Passed", cls: "border-line bg-bg text-faint" },
  too_soon: { label: "Booking closed", cls: "border-line bg-bg text-faint" },
  too_far: { label: "Not open yet", cls: "border-line bg-bg text-faint" },
};

type Props = {
  facility: { id: string; name: string; slug: string; timezone: string };
  today: string;
  initial: AvailabilitySlot[];
  canBook: boolean;
  days?: number;
  showTitle?: boolean;
};

export function SessionBoard({ facility, today, initial, canBook, days = 7, showTitle = true }: Props) {
  const [day, setDay] = useState(today);
  const [slots, setSlots] = useState<AvailabilitySlot[] | null>(initial);
  const [lastDay, setLastDay] = useState(today);

  if (day !== lastDay) { setLastDay(day); setSlots(day === today ? initial : null); }

  useEffect(() => {
    if (day === today) return;
    let live = true;
    supabaseBrowser().rpc("facility_availability", { p_facility: facility.id, p_day: day })
      .then(({ data }) => { if (live) setSlots((data as AvailabilitySlot[]) ?? []); });
    return () => { live = false; };
  }, [day, today, facility.id]);

  const dates = Array.from({ length: days }, (_, i) => addDays(today, i));
  const counts = (slots ?? []).reduce<Record<string, number>>((m, s) => ({ ...m, [s.state]: (m[s.state] ?? 0) + 1 }), {});

  return (
    <div className="panel min-w-0 max-w-full overflow-hidden p-4 sm:p-5">
      {showTitle && (
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Live schedule</p>
            <h3 className="font-display mt-1 text-2xl">{facility.name}</h3>
          </div>
          <Link href={`/facilities/${facility.slug}`} className="text-sm font-bold text-signal">Details</Link>
        </div>
      )}

      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:-mx-5 sm:px-5" role="tablist" aria-label="Choose a day">
        {dates.map((d) => {
          const l = dayLabel(d);
          const on = d === day;
          return (
            <button key={d} type="button" role="tab" aria-selected={on} onClick={() => setDay(d)}
              className={cx("flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl border text-xs font-bold transition-colors",
                on ? "border-signal bg-signal text-signal-ink" : "border-line text-muted hover:border-signal/40 hover:text-ink")}>
              <span className="font-mono text-[9.5px] uppercase tracking-[0.1em]">{d === today ? "Today" : l.weekday}</span>
              <span className="font-display text-lg leading-none">{l.day}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] font-semibold text-muted" aria-live="polite">
        {slots === null ? <span>Loading…</span> : slots.length === 0 ? <span>Closed this day.</span> : (
          <>
            <span><span className="text-signal">{counts.available ?? 0}</span> free</span>
            <span>{counts.requested ?? 0} requested</span>
            <span>{counts.booked ?? 0} booked</span>
          </>
        )}
      </div>

      <ul className="stagger mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(slots ?? Array.from({ length: 8 }, () => null)).map((s, i) => (
          <li key={s?.slot_start ?? i} style={{ "--i": Math.min(i, 10) } as CSSProperties}>
            {s ? (
              <div className={cx("flex h-[62px] flex-col justify-center rounded-2xl border px-3", LOOK[s.state].cls)}>
                <span className="font-display text-lg leading-none tabular">
                  {formatTime(s.slot_start, facility.timezone)}<span className="text-xs font-normal text-muted">–{formatTime(s.slot_end, facility.timezone)}</span>
                </span>
                <span className="mt-1 flex items-center gap-1 text-[11px] font-bold">
                  {s.state === "booked" && <Lock className="size-3" aria-hidden="true" />}
                  {s.state === "available" && <span className="size-1.5 rounded-full bg-signal shadow-[0_0_8px_var(--signal)]" aria-hidden="true" />}
                  {LOOK[s.state].label}
                </span>
              </div>
            ) : <div className="shimmer h-[62px] rounded-2xl" aria-hidden="true" />}
          </li>
        ))}
      </ul>

      <p className="mt-3 text-[11px] text-faint">
        {canBook ? <Link href={`/book/${facility.id}`} className="font-bold text-signal">Book a free session →</Link> : "Names are never shown. Booking opens to everyone soon."}
      </p>
    </div>
  );
}
