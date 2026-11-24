import type { Metadata } from "next";
import { ArtSearch } from "@/components/brand/Illustrations";
import Link from "next/link";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import { ButtonLink, Chip, EmptyState, Notice } from "@/components/ui";
import { PageHeader } from "@/components/admin/PageHeader";
import { FacilitySwitcher } from "@/components/admin/FacilitySwitcher";
import { pickFacility, requireAdmin } from "@/lib/admin";
import { BOOKING_SELECT } from "@/lib/bookings";
import { formatDate, formatNaira, formatRange, isYmd, parseRange } from "@/lib/format";
import { bookingHeadline, PAYMENT_LABEL } from "@/lib/status";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Booking } from "@/lib/types";

export const metadata: Metadata = { title: "Bookings" };
export const dynamic = "force-dynamic";

const VIEWS = [
  { key: "pending", label: "Awaiting decision" },
  { key: "receipts", label: "Receipts to check" },
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Past" },
  { key: "cancelled", label: "Cancelled / declined" },
  { key: "all", label: "All" },
] as const;

export default async function AdminBookings(props: PageProps<"/admin/bookings">) {
  const ctx = await requireAdmin("/admin/bookings");
  const sp = await props.searchParams;
  const facility = pickFacility(ctx, sp.facility);
  const view = VIEWS.find((v) => v.key === sp.view)?.key ?? (isYmd(sp.date) ? "all" : "upcoming");
  const date = isYmd(sp.date) ? sp.date : null;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 60) : "";
  const ids = facility ? [facility] : ctx.facilities.map((f) => f.id);

  const supabase = await createSupabaseServerClient();
  const nowIso = new Date().toISOString();
  let query = supabase.from("bookings").select(BOOKING_SELECT).in("facility_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  if (view === "pending") query = query.eq("status", "pending").eq("approval_status", "pending");
  if (view === "receipts") query = query.eq("status", "pending").eq("proof_status", "submitted");
  if (view === "upcoming") query = query.in("status", ["pending", "confirmed", "checked_in"]).not("period", "sl", `[${nowIso},${nowIso}]`);
  if (view === "past") query = query.in("status", ["confirmed", "checked_in", "completed", "no_show"]).rangeLt("period", `[${nowIso},${nowIso}]`);
  if (view === "cancelled") query = query.in("status", ["cancelled", "rejected", "expired"]);
  if (date) {
    const s = new Date(`${date}T00:00:00+01:00`).toISOString();
    const e = new Date(new Date(s).getTime() + 86400_000).toISOString();
    query = query.overlaps("period", `[${s},${e})`);
  }
  if (q) {
    const safe = q.replace(/[%,()]/g, " ");
    query = query.or(`reference.ilike.%${safe}%,organizer_name.ilike.%${safe}%,team_name.ilike.%${safe}%,opponent_name.ilike.%${safe}%`);
  }
  const { data, error } = await query.order("period", { ascending: view !== "past" && view !== "cancelled" }).limit(150);
  const bookings = (data ?? []) as Booking[];
  const qs = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const base: Record<string, string | null> = { facility, view, date, q: q || null, ...patch };
    for (const [k, v] of Object.entries(base)) if (v) p.set(k, v);
    return `/admin/bookings?${p.toString()}`;
  };

  return (
    <>
      <PageHeader title="Bookings" description="Search, review and manage reservations for your facilities."
        actions={<>
          <Suspense><FacilitySwitcher facilities={ctx.facilities} /></Suspense>
          <ButtonLink href={`/admin/bookings/new${facility ? `?facility=${facility}` : ""}`} size="sm"><Plus className="size-4" aria-hidden="true" />New booking</ButtonLink>
        </>} />

      <div className="mb-4 flex flex-col gap-3">
        <nav aria-label="Booking views" className="-mx-4 flex gap-1 overflow-x-auto px-4">
          {VIEWS.map((v) => (
            <Link key={v.key} href={qs({ view: v.key, date: null })} aria-current={v.key === view && !date ? "page" : undefined}
              className="shrink-0 rounded-full border border-line px-3.5 py-1.5 text-sm font-medium aria-[current=page]:border-ink aria-[current=page]:bg-ink aria-[current=page]:text-bg">
              {v.label}
            </Link>
          ))}
        </nav>
        <form className="flex flex-wrap gap-2" action="/admin/bookings">
          {facility && <input type="hidden" name="facility" value={facility} />}
          <input type="hidden" name="view" value={view} />
          <label className="sr-only" htmlFor="q">Search</label>
          <input id="q" name="q" defaultValue={q} placeholder="Reference, organiser or team"
            className="h-11 min-w-0 basis-full rounded-xl border border-line bg-surface px-3 text-base sm:basis-auto sm:flex-1 sm:text-sm" />
          <label className="sr-only" htmlFor="date">Date</label>
          <input id="date" name="date" type="date" defaultValue={date ?? ""} className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-base sm:flex-none sm:text-sm" />
          <button className="h-11 shrink-0 rounded-xl bg-ink px-5 text-sm font-semibold text-bg">Filter</button>
        </form>
      </div>

      {error ? <Notice tone="danger">Couldn&apos;t load bookings.</Notice> : bookings.length === 0 ? (
        <EmptyState art={<ArtSearch className="h-28 w-auto" />} title="No bookings here" body="Nothing matches these filters yet." />
      ) : (
        <>
        {/* Phones: one card per booking instead of a sideways-scrolling table. */}
        <ul className="flex flex-col gap-2 md:hidden">
          {bookings.map((b) => {
            const { start, end } = parseRange(b.period);
            const h = bookingHeadline(b);
            return (
              <li key={b.id}>
                <Link href={`/admin/bookings/${b.id}`} className="panel lift flex flex-col gap-2 p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold tabular">{formatDate(start, undefined, "short")} · {formatRange(start, end)}</p>
                      <p className="truncate text-sm text-muted">{b.facilities?.name} · {b.playing_surfaces?.name}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1"><Chip tone={h.tone}>{h.label}</Chip>{b.is_test && <Chip tone="warn">TEST</Chip>}</div>
                  </div>
                  <p className="truncate text-sm">{b.organizer_name}{b.source !== "customer" && <span className="ml-1 text-xs text-muted">({b.source === "walk_in" ? "walk-in" : "staff"})</span>}
                    {(b.activity_title || b.team_name) && <span className="text-muted"> · {b.activity_title ?? [b.team_name, b.opponent_name].filter(Boolean).join(" vs ")}</span>}</p>
                  <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
                    <span className="font-mono text-ink/80">{b.reference}</span>
                    {b.amount_due_kobo != null && <span className="font-mono">{formatNaira(b.amount_due_kobo)}</span>}
                    <span>{PAYMENT_LABEL[b.payment_status]}</span>
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="hidden overflow-x-auto panel md:block">
          <table className="data-table min-w-[820px]">
            <thead className="border-b border-line text-left text-xs text-muted">
              <tr>
                <th className="px-3 py-2.5 font-medium">When</th>
                <th className="px-3 py-2.5 font-medium">Facility</th>
                <th className="px-3 py-2.5 font-medium">Organiser / activity</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 font-medium">Amount</th>
                <th className="px-3 py-2.5 font-medium">Payment</th>
                <th className="px-3 py-2.5 font-medium">Ref</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {bookings.map((b) => {
                const { start, end } = parseRange(b.period);
                const h = bookingHeadline(b);
                return (
                  <tr key={b.id} className="hover:bg-raised">
                    <td className="px-3 py-2.5 tabular">
                      <Link href={`/admin/bookings/${b.id}`} className="font-semibold hover:underline">{formatDate(start, undefined, "short")}</Link>
                      <div className="text-muted">{formatRange(start, end)}</div>
                    </td>
                    <td className="px-3 py-2.5">{b.facilities?.name}<div className="text-muted">{b.playing_surfaces?.name}</div></td>
                    <td className="max-w-64 px-3 py-2.5">
                      <div className="truncate font-medium">{b.organizer_name}{b.source !== "customer" && <span className="ml-1 text-xs text-muted">({b.source === "walk_in" ? "walk-in" : "staff"})</span>}</div>
                      <div className="truncate text-muted">{b.activity_title ?? [b.team_name, b.opponent_name].filter(Boolean).join(" vs ")}</div>
                    </td>
                    <td className="px-3 py-2.5"><div className="flex flex-wrap gap-1"><Chip tone={h.tone}>{h.label}</Chip>{b.is_test && <Chip tone="warn">TEST</Chip>}</div></td>
                    <td className="px-3 py-2.5 font-mono tabular">{b.amount_due_kobo != null ? formatNaira(b.amount_due_kobo) : <span className="text-faint">—</span>}</td>
                    <td className="px-3 py-2.5 text-muted">{PAYMENT_LABEL[b.payment_status]}</td>
                    <td className="px-3 py-2.5 font-mono text-xs">{b.reference}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}
    </>
  );
}
