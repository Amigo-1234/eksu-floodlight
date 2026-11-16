import { CircleAlert, MapPin } from "lucide-react";
import { Chip, DevFixtureBadge } from "@/components/ui";
import { LogoMark } from "@/components/brand/Logo";
import { brand } from "@/lib/brand";
import { formatDate, formatNaira, formatRange, parseRange } from "@/lib/format";
import { ACTIVITY_TYPE_LABEL, APPROVAL_LABEL, bookingHeadline, PAYMENT_LABEL } from "@/lib/status";
import type { PassInfo } from "@/lib/bookings";
import type { Booking, Receipt } from "@/lib/types";

/** Premium ticket-style receipt. Booking, payment and entry status are always shown separately. */
export function BookingTicket({ booking: b, receipt, pass }: { booking: Booking; receipt: Receipt | null; pass: PassInfo }) {
  const tz = b.facilities?.timezone ?? "Africa/Lagos";
  const { start, end } = parseRange(b.period);
  const head = bookingHeadline(b);
  const confirmed = b.status === "confirmed" || b.status === "checked_in" || b.status === "completed";
  const teams = [b.team_name, b.opponent_name].filter(Boolean).join(" vs ");

  return (
    <article aria-label={`Booking ${b.reference}`} className={`print-plain mx-auto w-full max-w-md overflow-hidden rounded-[28px] bg-surface ${confirmed ? "glow-ring" : "border border-line-strong"}`}>
      <div className={`relative overflow-hidden ${confirmed ? "bg-[linear-gradient(135deg,#ffd166,#ffc53d_45%,#ff9f1c)] text-signal-ink" : "bg-raised text-ink"}`}>
        <div className="pitch-lines pointer-events-none absolute inset-0 opacity-50" aria-hidden="true" />
        <div className="relative flex items-center justify-between px-5 pt-4 font-mono text-[10.5px] font-medium uppercase tracking-[0.18em]">
          <span className="flex items-center gap-2"><LogoMark size={20} plain={confirmed} />{brand.name}</span>
          <span>{confirmed ? (pass.available ? "Entry pass" : "Booking receipt") : "Booking request"}</span>
        </div>
        <div className="relative px-5 pb-6 pt-4">
          <p className="font-display text-[68px] leading-[0.85] tracking-[-0.05em] tabular">{formatRange(start, end, tz).split(" – ")[0]}</p>
          <p className="mt-1 text-sm font-semibold">{formatDate(start, tz)} · until {formatRange(start, end, tz).split(" – ")[1]}</p>
          <p className="font-display mt-4 text-[26px] leading-none">{b.facilities?.name}</p>
          <p className="mt-1 flex items-center gap-1 text-sm opacity-80">
            {b.playing_surfaces?.name}{b.facilities?.location_label && <><span aria-hidden="true">·</span><MapPin className="size-3.5" aria-hidden="true" />{b.facilities.location_label}</>}
          </p>
        </div>
      </div>

      <div className="ticket-notch h-6 border-b border-dashed border-line" aria-hidden="true" />

      <div className="flex flex-col gap-4 px-5 pb-5 pt-2">
        {b.facilities?.is_dev_fixture && <DevFixtureBadge />}
        <div className="flex flex-wrap gap-2">
          <Chip tone={head.tone}>{head.label}</Chip>
          <Chip tone={b.payment_status === "paid" ? "ok" : b.payment_status === "pending" || b.payment_status === "failed" ? "warn" : "muted"}>
            {PAYMENT_LABEL[b.payment_status]}
          </Chip>
        </div>

        {pass.available ? (
          <div className="flex flex-col items-center gap-3">
            <div className="relative rounded-[22px] bg-white p-3 shadow-[0_0_60px_-10px_rgb(255_197_61/0.5)]" aria-label="Entry pass QR code" role="img">
              <span className="pointer-events-none absolute -inset-2 rounded-[28px] border-2 border-dashed border-signal/40" aria-hidden="true" />
              <div className="size-[220px] [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: pass.qrSvg }} />
            </div>
            {!pass.liveGateAdmission && (
              <p className="flex items-start gap-2 rounded-xl border border-warn/40 bg-warn/10 p-3 text-xs text-warn">
                <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                Gate check-in is in test mode. This pass is verified at the gate but is not yet an entry authorization — follow the facility&apos;s on-site instructions.
              </p>
            )}
          </div>
        ) : confirmed ? (
          <p className="rounded-2xl border border-line bg-bg p-3 text-xs text-muted">
            This facility hasn&apos;t enabled digital entry passes. This receipt confirms your reservation; follow the facility&apos;s instructions on arrival.
          </p>
        ) : (
          <p className="rounded-xl border border-line bg-bg p-3 text-xs text-muted">
            No entry pass yet. A receipt is issued once this booking is confirmed.
          </p>
        )}

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div className="col-span-2">
            <dt className="text-xs text-muted">Booking reference</dt>
            <dd className="font-mono text-xl tracking-[0.1em] text-signal">{b.reference}</dd>
          </div>
          {receipt && (
            <div className="col-span-2"><dt className="text-xs text-muted">Receipt number</dt><dd className="font-mono">{receipt.receipt_number}</dd></div>
          )}
          <div><dt className="text-xs text-muted">Organiser</dt><dd className="font-medium">{b.organizer_name}</dd></div>
          <div><dt className="text-xs text-muted">Activity</dt><dd className="font-medium">{ACTIVITY_TYPE_LABEL[b.activity_type]}</dd></div>
          {b.activity_title && <div className="col-span-2"><dt className="text-xs text-muted">Title</dt><dd className="font-medium">{b.activity_title}</dd></div>}
          {teams && <div className="col-span-2"><dt className="text-xs text-muted">Teams</dt><dd className="font-medium">{teams}</dd></div>}
          <div><dt className="text-xs text-muted">Approval</dt><dd className="font-medium">{APPROVAL_LABEL[b.approval_status]}</dd></div>
          {b.amount_due_kobo != null && <div><dt className="text-xs text-muted">Amount due</dt><dd className="font-mono">{formatNaira(b.amount_due_kobo)}</dd></div>}
        </dl>

        {b.facilities?.entry_instructions && confirmed && (
          <div className="rounded-2xl border border-line bg-bg p-4 text-sm">
            <p className="eyebrow">On arrival</p>
            <p className="mt-1 whitespace-pre-line">{b.facilities.entry_instructions}</p>
          </div>
        )}
        {b.decision_reason && b.status === "rejected" && <p className="text-sm text-danger">Reason: {b.decision_reason}</p>}
        {b.cancellation_reason && b.status === "cancelled" && <p className="text-sm text-muted">Cancellation note: {b.cancellation_reason}</p>}
        <p className="text-[11px] text-faint">Times in West Africa Time. A booking receipt is not proof of payment unless payment shows “Paid”.</p>
      </div>
    </article>
  );
}
