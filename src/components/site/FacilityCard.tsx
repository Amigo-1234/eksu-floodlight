import Link from "next/link";
import { ArrowUpRight, MapPin } from "lucide-react";
import { Chip } from "@/components/ui";
import { facilityImageUrl, type FacilityCardData } from "@/lib/data";
import { PAYMENT_MODE_LABEL } from "@/lib/status";

/** Pitch diagram used when a facility has no photo yet (never a stock photo). */
export function PitchArt({ sport, className = "" }: { sport?: string; className?: string }) {
  const court = sport === "basketball" || sport === "volleyball" || sport === "tennis" || sport === "handball";
  const k = court ? "court" : "grass";
  return (
    <svg viewBox="0 0 320 160" className={className} role="img" aria-label={`${sport ?? "Sports"} facility illustration`} preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={`turf-${k}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={court ? "#1d2a3a" : "#153f27"} />
          <stop offset="1" stopColor={court ? "#121b26" : "#0d2a1a"} />
        </linearGradient>
        <radialGradient id={`glow-${k}`} cx="0.5" cy="0" r="0.9">
          <stop offset="0" stopColor="#c6f135" stopOpacity="0.28" />
          <stop offset="1" stopColor="#c6f135" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="320" height="160" fill={`url(#turf-${k})`} />
      {!court && Array.from({ length: 8 }, (_, i) => (
        <rect key={i} x={i * 40} width="20" height="160" fill="#ffffff" opacity="0.025" />
      ))}
      <rect width="320" height="160" fill={`url(#glow-${k})`} />
      <g fill="none" stroke="#f2f1ea" strokeOpacity="0.45" strokeWidth="1.5">
        <rect x="20" y="16" width="280" height="128" rx="2" />
        <line x1="160" y1="16" x2="160" y2="144" />
        <circle cx="160" cy="80" r={court ? 14 : 20} />
        {court ? (
          <>
            <path d="M20 46 h34 a34 34 0 0 1 0 68 h-34" />
            <path d="M300 46 h-34 a34 34 0 0 0 0 68 h34" />
          </>
        ) : (
          <>
            <rect x="20" y="48" width="30" height="64" />
            <rect x="270" y="48" width="30" height="64" />
          </>
        )}
      </g>
    </svg>
  );
}

export function FacilityCard({ f }: { f: FacilityCardData }) {
  const img = facilityImageUrl(f.cover_image_path);
  const sport = f.sport_categories?.slug;
  return (
    <Link href={`/facilities/${f.slug}`}
      className="group animate-rise flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface transition-colors hover:border-signal/60">
      <div className="relative aspect-[2/1] overflow-hidden bg-raised">
        {img
          // eslint-disable-next-line @next/next/no-img-element -- Supabase public storage URL, sized by CSS
          ? <img src={img} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" loading="lazy" />
          : <PitchArt sport={sport} className="h-full w-full" />}
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          {f.readiness.bookable && f.freeToday !== null && (
            <Chip tone={f.freeToday > 0 ? "signal" : "muted"}>{f.freeToday > 0 ? `${f.freeToday} free today` : "Full today"}</Chip>
          )}
          {!f.readiness.bookable && <Chip tone="muted">Bookings not open yet</Chip>}
        </div>
      </div>
      <div className="h-1 bg-pitch" aria-hidden="true" />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-display text-[26px]">{f.name}</h3>
          <ArrowUpRight className="mt-1 size-5 shrink-0 text-muted transition-colors group-hover:text-signal" aria-hidden="true" />
        </div>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
          <span>{f.sport_categories?.name ?? "Sport"}</span>
          {f.location_label && (<span className="inline-flex items-center gap-1"><MapPin className="size-3.5" aria-hidden="true" />{f.location_label}</span>)}
          {f.surfaces > 1 && <span>{f.surfaces} playing areas</span>}
        </p>
        <div className="mt-auto flex flex-wrap gap-1.5 pt-2">
          {f.policy?.slot_minutes && <Chip>{f.policy.slot_minutes}-minute slots</Chip>}
          {f.policy && <Chip>{f.policy.approval_mode === "required" ? "Staff approval" : "Instant confirmation"}</Chip>}
          {f.policy && f.policy.payment_mode !== "unconfigured" && <Chip>{PAYMENT_MODE_LABEL[f.policy.payment_mode]}</Chip>}
          {f.is_dev_fixture && <Chip tone="warn">Dev fixture</Chip>}
        </div>
      </div>
    </Link>
  );
}
