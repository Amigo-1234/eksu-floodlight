// Formatting helpers. All times are shown in the facility's timezone
// (Africa/Lagos by default), never the viewer's device timezone.

export const DEFAULT_TZ = "Africa/Lagos";

export function formatTime(iso: string, tz = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz })
    .format(new Date(iso));
}

export function formatDate(iso: string, tz = DEFAULT_TZ, style: "long" | "short" = "long"): string {
  return new Intl.DateTimeFormat("en-GB", style === "long"
    ? { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: tz }
    : { weekday: "short", day: "numeric", month: "short", timeZone: tz }).format(new Date(iso));
}

export function formatDateTime(iso: string, tz = DEFAULT_TZ): string {
  return `${formatDate(iso, tz, "short")} · ${formatTime(iso, tz)}`;
}

export function formatRange(startIso: string, endIso: string, tz = DEFAULT_TZ): string {
  return `${formatTime(startIso, tz)} – ${formatTime(endIso, tz)}`;
}

/** YYYY-MM-DD for "today" in a timezone. */
export function todayInTz(tz = DEFAULT_TZ, offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86400000);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function isYmd(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}

export function dayLabel(ymd: string): { weekday: string; day: string; month: string } {
  const dt = new Date(`${ymd}T12:00:00Z`);
  return {
    weekday: new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" }).format(dt),
    day: String(dt.getUTCDate()),
    month: new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }).format(dt),
  };
}

export function formatNaira(kobo: number | null | undefined): string {
  if (kobo == null) return "—";
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", minimumFractionDigits: 0, maximumFractionDigits: 2 })
    .format(kobo / 100);
}

/** Parses a Postgres tstzrange literal like ["2026-11-15 10:00:00+00","2026-11-15 11:00:00+00"). */
export function parseRange(range: string): { start: string; end: string } {
  const m = range.match(/^[[(]"?([^",]+)"?,"?([^")\]]+)"?[)\]]$/);
  if (!m) throw new Error(`Unrecognised range: ${range}`);
  const norm = (s: string) => new Date(s.trim().replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00")).toISOString();
  return { start: norm(m[1]), end: norm(m[2]) };
}

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
