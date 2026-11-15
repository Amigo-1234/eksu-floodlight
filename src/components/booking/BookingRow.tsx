import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Chip } from "@/components/ui";
import { formatDate, formatRange, parseRange } from "@/lib/format";
import { bookingHeadline } from "@/lib/status";
import type { Booking } from "@/lib/types";

export function BookingRow({ b, href }: { b: Booking; href: string }) {
  const tz = b.facilities?.timezone ?? "Africa/Lagos";
  const { start, end } = parseRange(b.period);
  const head = bookingHeadline(b);
  return (
    <li>
      <Link href={href} className="panel lift group flex items-center gap-3 p-3.5 sm:p-4">
        <div className="flex w-[68px] shrink-0 flex-col items-center justify-center rounded-2xl border border-line bg-bg py-2 text-center">
          <p className="font-display text-[22px] leading-none tabular text-signal">{formatRange(start, end, tz).split(" – ")[0]}</p>
          <p className="mt-1 text-[11px] text-muted">{formatDate(start, tz, "short")}</p>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{b.facilities?.name}<span className="font-normal text-muted"> · {b.playing_surfaces?.name}</span></p>
          <p className="truncate text-sm text-muted">{b.activity_title ?? ([b.team_name, b.opponent_name].filter(Boolean).join(" vs ") || b.organizer_name)}</p>
          <p className="mt-1 font-mono text-xs text-faint">{b.reference}</p>
        </div>
        <Chip tone={head.tone}>{head.label}</Chip>
        <ChevronRight className="size-4 shrink-0 text-faint transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </Link>
    </li>
  );
}
