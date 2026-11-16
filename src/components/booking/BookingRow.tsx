import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Chip } from "@/components/ui";
import { formatDate, formatDuration, formatNaira, formatRange, minutesBetween, parseRange } from "@/lib/format";
import { bookingHeadline } from "@/lib/status";
import type { Booking } from "@/lib/types";

export function BookingRow({ b, href }: { b: Booking; href: string }) {
  const tz = b.facilities?.timezone ?? "Africa/Lagos";
  const { start, end } = parseRange(b.period);
  const head = bookingHeadline(b);
  return (
    <li>
      <Link href={href} className="panel lift group flex items-center gap-3 p-3 sm:p-4">
        <div className="flex w-[60px] shrink-0 flex-col items-center justify-center rounded-2xl border border-line bg-bg py-2 text-center">
          <p className="font-display text-[19px] leading-none tabular text-signal">{formatRange(start, end, tz).split(" – ")[0]}</p>
          <p className="mt-1 text-[11px] text-muted">{formatDate(start, tz, "short")}</p>
          <p className="text-[10px] text-faint">{formatDuration(minutesBetween(start, end))}</p>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{b.facilities?.name}<span className="font-normal text-muted"> · {b.playing_surfaces?.name}</span></p>
          <p className="truncate text-sm text-muted">{b.activity_title ?? ([b.team_name, b.opponent_name].filter(Boolean).join(" vs ") || b.organizer_name)}</p>
          <div className="mt-1.5 flex flex-wrap gap-1 min-[400px]:hidden"><Chip tone={head.tone}>{head.label}</Chip>{b.is_test && <Chip tone="warn">TEST</Chip>}</div>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-faint"><span>{b.reference}</span>{b.amount_due_kobo != null && <span className={b.payment_status === "paid" || b.payment_status === "waived" ? "" : "text-signal"}>{formatNaira(b.amount_due_kobo)}{b.payment_status === "paid" ? " · paid" : b.payment_status === "waived" ? " · waived" : " · unpaid"}</span>}</p>
        </div>
        <div className="hidden flex-col items-end gap-1 min-[400px]:flex"><Chip tone={head.tone}>{head.label}</Chip>{b.is_test && <Chip tone="warn">TEST</Chip>}</div>
        <ChevronRight className="size-4 shrink-0 text-faint transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </Link>
    </li>
  );
}
