import type { ReactNode } from "react";
import { CircleAlert, MapPin } from "lucide-react";
import { Chip, DevFixtureBadge, cx } from "@/components/ui";
import { LogoMark } from "@/components/brand/Logo";
import { brand } from "@/lib/brand";
import { formatDate, formatDuration, formatNaira, formatTime, minutesBetween, parseRange } from "@/lib/format";
import { ACTIVITY_TYPE_LABEL, APPROVAL_LABEL, bookingHeadline, paymentChip, ticketKind, type TicketKind } from "@/lib/status";
import type { PassInfo } from "@/lib/bookings";
import type { Booking, Receipt } from "@/lib/types";

const KIND_LABEL: Record<TicketKind, string> = { request: "Booking request", receipt: "Booking receipt", pass: "Entry pass" };

function Item({ label, children, wide = false, mono = false }: { label: string; children: ReactNode; wide?: boolean; mono?: boolean }) {
  return (
    <div className={cx("min-w-0", wide && "col-span-2")}>
      <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">{label}</dt>
      <dd className={cx("mt-0.5 text-[14px] font-semibold leading-snug", mono && "font-mono font-medium")}>{children}</dd>
    </div>
  );
}

/**
 * Compact boarding-pass style ticket. Three clearly different variants:
 * a muted "request" (pending), an amber "receipt" (confirmed) and an amber
 * "entry pass" with its QR in its own section below the perforation.
 * Booking, payment and entry status are always shown separately.
 */
export function BookingTicket({ booking: b, receipt, pass }: { booking: Booking; receipt: Receipt | null; pass: PassInfo }) {
  const tz = b.facilities?.timezone ?? "Africa/Lagos";
  const { start, end } = parseRange(b.period);
  const head = bookingHeadline(b);
  const kind = ticketKind(b.status, pass.available);
  const lit = kind !== "request";
  const pay = paymentChip(b.payment_status, b.is_test);
  const teams = [b.team_name, b.opponent_name].filter(Boolean).join(" vs ");
  const duration = formatDuration(minutesBetween(start, end));

  return (
    <article aria-label={`${KIND_LABEL[kind]} ${b.reference}`}
      className={cx("ticket print-plain mx-auto w-full max-w-md overflow-hidden rounded-[24px] bg-surface", lit ? "glow-ring" : "border border-line-strong")}>
      {/* Header strip */}
      <div className={cx("relative overflow-hidden px-4 pb-4 pt-3.5 sm:px-5",
        lit ? "bg-[linear-gradient(135deg,#ffd166,#ffc53d_45%,#ff9f1c)] text-signal-ink" : "bg-raised text-ink")}>
        <div className="pitch-lines pointer-events-none absolute inset-0 opacity-40" aria-hidden="true" />
        <div className="relative flex items-center justify-between gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.16em]">
          <span className="flex min-w-0 items-center gap-1.5"><LogoMark size={18} plain={lit} /><span className="truncate">{brand.name}</span></span>
          <span className={cx("shrink-0 rounded-full px-2 py-0.5", lit ? "bg-signal-ink text-signal" : "border border-line-strong text-muted")}>{KIND_LABEL[kind]}</span>
        </div>
        <p className="font-display relative mt-3 text-[22px] leading-tight sm:text-2xl">{b.facilities?.name}</p>
        <p className={cx("relative mt-0.5 flex flex-wrap items-center gap-x-1 text-[13px]", lit ? "text-signal-ink/80" : "text-muted")}>
          {b.playing_surfaces?.name}
          {b.facilities?.location_label && <><span aria-hidden="true">·</span><MapPin className="size-3" aria-hidden="true" />{b.facilities.location_label}</>}
        </p>
      </div>

      {/* When — three equal columns, sized to scan at a glance (not to fill the screen). */}
      <dl className="grid grid-cols-[1.25fr_1fr_0.8fr] divide-x divide-line border-b border-line text-center">
        <div className="px-2 py-3">
          <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">Date</dt>
          <dd className="mt-1 text-[14px] font-bold leading-tight">{formatDate(start, tz, "short")}</dd>
        </div>
        <div className="px-2 py-3">
          <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">Time</dt>
          <dd className="font-display mt-1 text-[19px] leading-none tabular text-signal">{formatTime(start, tz)}<span className="text-[13px] text-muted">–{formatTime(end, tz)}</span></dd>
        </div>
        <div className="px-2 py-3">
          <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">Length</dt>
          <dd className="mt-1 text-[14px] font-bold leading-tight">{duration}</dd>
        </div>
      </dl>

      <div className="flex flex-col gap-3.5 px-4 py-4 sm:px-5">
        {b.is_test && (
          <p className="rounded-xl border border-warn/50 bg-warn/[0.08] px-3 py-1.5 text-center font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-warn">
            Test booking · not a real reservation
          </p>
        )}
        {b.facilities?.is_dev_fixture && <DevFixtureBadge />}
        <div className="flex flex-wrap gap-1.5">
          <Chip tone={head.tone}>{head.label}</Chip>
          <Chip tone={pay.tone}>{pay.label}</Chip>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Item label="Reference" mono><span className="text-[15px] tracking-[0.08em] text-signal">{b.reference}</span></Item>
          {receipt
            ? <Item label="Receipt no." mono>{receipt.receipt_number}</Item>
            : <Item label="Approval">{APPROVAL_LABEL[b.approval_status]}</Item>}
          <Item label="Organiser">{b.organizer_name}</Item>
          <Item label="Activity">{ACTIVITY_TYPE_LABEL[b.activity_type]}</Item>
          {b.activity_title && <Item label="Title" wide>{b.activity_title}</Item>}
          {teams && <Item label="Teams" wide>{teams}</Item>}
          {b.amount_due_kobo != null && <Item label="Amount" mono>{formatNaira(b.amount_due_kobo)}<span className="font-sans text-xs font-normal text-muted"> / session</span></Item>}
          {receipt && <Item label="Approval">{APPROVAL_LABEL[b.approval_status]}</Item>}
        </dl>

        {kind === "receipt" && (
          <p className="rounded-xl border border-line bg-bg px-3 py-2 text-xs text-muted">
            This facility hasn&apos;t enabled digital entry passes. This receipt confirms your reservation; follow the facility&apos;s instructions on arrival.
          </p>
        )}
        {kind === "request" && !["cancelled", "rejected", "expired"].includes(b.status) && (
          <p className="rounded-xl border border-line bg-bg px-3 py-2 text-xs text-muted">
            Not confirmed yet — your receipt appears here once staff confirm it.
          </p>
        )}
        {b.decision_reason && b.status === "rejected" && <p className="text-sm text-danger">Reason: {b.decision_reason}</p>}
        {b.cancellation_reason && b.status === "cancelled" && <p className="text-sm text-muted">Cancellation note: {b.cancellation_reason}</p>}
      </div>

      {pass.available && (
        <>
          <div className="ticket-notch h-5 border-b border-dashed border-line-strong" aria-hidden="true" />
          <section aria-label="Entry pass QR code" className="flex flex-col items-center gap-3 px-4 pb-5 pt-4 sm:px-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">Show this at the gate</p>
            {/* QR keeps a white quiet zone and a fixed physical size so phone cameras read it reliably. */}
            <div className="ticket-qr rounded-2xl bg-white p-2.5 shadow-[0_0_40px_-12px_rgb(255_197_61/0.55)]" role="img" aria-label={`QR entry credential for booking ${b.reference}`}>
              <div className="size-[clamp(176px,52vw,208px)] [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: pass.qrSvg }} />
            </div>
            <p className="font-mono text-xs tracking-[0.12em] text-muted">{b.reference}</p>
            {!pass.liveGateAdmission && (
              <p className="flex items-start gap-2 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
                <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                Gate check-in is in test mode: this pass is verified at the gate but is not yet an entry authorization. Follow on-site instructions.
              </p>
            )}
          </section>
        </>
      )}

      {b.facilities?.entry_instructions && lit && (
        <div className="border-t border-line px-4 py-3 text-sm sm:px-5">
          <p className="eyebrow">On arrival</p>
          <p className="mt-1 whitespace-pre-line text-ink/90">{b.facilities.entry_instructions}</p>
        </div>
      )}
      <p className="border-t border-line px-4 py-2.5 text-[11px] leading-snug text-faint sm:px-5">
        Times in West Africa Time. Not proof of payment unless payment shows “Paid”.
      </p>
    </article>
  );
}
