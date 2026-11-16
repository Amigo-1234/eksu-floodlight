import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Chip, EmptyState, buttonClass } from "@/components/ui";
import { ArtEmpty } from "@/components/brand/Illustrations";
import { getPublicSchedule, type ScheduleItem } from "@/lib/data";
import { addDays, dayLabel, formatDate, formatRange, isYmd, todayInTz } from "@/lib/format";
import { activityLabel, ACTIVITY_TYPE_LABEL } from "@/lib/status";
import type { ActivityStatus, ActivityType } from "@/lib/types";

export const metadata: Metadata = { title: "Schedule" };
export const dynamic = "force-dynamic";

function lagosMidnightIso(ymd: string) {
  // Africa/Lagos is UTC+1 all year (no DST).
  return new Date(`${ymd}T00:00:00+01:00`).toISOString();
}

export default async function SchedulePage(props: PageProps<"/schedule">) {
  const { from } = await props.searchParams;
  const today = todayInTz();
  const start = isYmd(from) ? from : today;
  const end = addDays(start, 7);
  let items: ScheduleItem[] = [];
  let failed = false;
  try {
    items = await getPublicSchedule(lagosMidnightIso(start), lagosMidnightIso(end));
  } catch {
    failed = true;
  }
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const byDay = new Map<string, ScheduleItem[]>();
  for (const it of items) {
    const key = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date(it.starts_at));
    byDay.set(key, [...(byDay.get(key) ?? []), it]);
  }

  return (
    <div className="mx-auto w-full max-w-4xl page-pad">
      <p className="eyebrow flex items-center gap-2"><span className="live-dot size-1.5 rounded-full bg-signal" aria-hidden="true" />On the fields</p>
      <h1 className="font-display t-display mt-2">What&apos;s <span className="text-beam">on.</span></h1>
      <p className="mt-2 max-w-xl text-muted">
        Confirmed bookings whose organisers chose to list them publicly. Live and full-time status appear only when facility staff record them.
      </p>

      <div className="mt-6 flex items-center justify-between gap-3">
        <Link href={`/schedule?from=${addDays(start, -7)}`} className={buttonClass("outline", "md")}>
          <ChevronLeft className="size-4" aria-hidden="true" />Earlier
        </Link>
        <p className="text-sm font-medium tabular">{formatDate(lagosMidnightIso(start), undefined, "short")} – {formatDate(lagosMidnightIso(addDays(end, -1)), undefined, "short")}</p>
        <Link href={`/schedule?from=${end}`} className={buttonClass("outline", "md")}>
          Later<ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      </div>

      <div className="mt-6">
        {failed ? (
          <EmptyState title="Couldn't load the schedule" body="Please refresh the page in a moment." />
        ) : items.length === 0 ? (
          <EmptyState art={<ArtEmpty className="h-28 w-auto" />} title="Quiet week on the fields" body="No publicly listed games or sessions in these dates. Teams can choose to list their bookings here." />
        ) : (
          <ol className="flex flex-col gap-6">
            {days.filter((d) => byDay.has(d)).map((d) => {
              const l = dayLabel(d);
              return (
                <li key={d}>
                  <h2 className="font-display mb-2 flex items-baseline gap-2 text-2xl">
                    {d === today ? "Today" : l.weekday} <span className="text-base text-muted">{l.day} {l.month}</span>
                  </h2>
                  <ul className="flex flex-col gap-2">
                    {byDay.get(d)!.map((m) => {
                      const st = activityLabel(m.activity_status as ActivityStatus);
                      const showScore = m.home_score != null && m.away_score != null;
                      return (
                        <li key={m.booking_id} className="panel lift grid grid-cols-[72px_minmax(0,1fr)] gap-3 p-4">
                          <div className="font-display text-2xl tabular text-signal">{formatRange(m.starts_at, m.ends_at).split(" – ")[0]}</div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                              <span>{ACTIVITY_TYPE_LABEL[m.activity_type as ActivityType]}</span>
                              <span aria-hidden="true">·</span>
                              <Link href={`/facilities/${m.facility_slug}`} className="hover:text-ink">{m.facility_name}{m.surface_name ? ` · ${m.surface_name}` : ""}</Link>
                              {st && <Chip tone={st.tone} live={st.label === "LIVE"}>{st.label}</Chip>}
                            </div>
                            <p className="mt-1 truncate font-semibold">
                              {m.activity_title ?? ([m.team_name, m.opponent_name].filter(Boolean).join(" vs ") || "Booked session")}
                            </p>
                            {showScore && (
                              <p className="font-display mt-1 text-2xl tabular">{m.home_score} – {m.away_score}</p>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
