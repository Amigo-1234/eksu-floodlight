import Link from "next/link";
import { ArrowUpRight, Clock3, MapPin, ShieldCheck, Zap } from "lucide-react";
import { Chip } from "@/components/ui";
import { facilityImageUrl, type FacilityCardData } from "@/lib/data";
import { formatDuration, formatNaira } from "@/lib/format";

/** Night-pitch artwork used when a facility has no photo yet (never a stock photo). */
export function PitchArt({ sport, className = "" }: { sport?: string; className?: string }) {
  const court = sport === "basketball" || sport === "volleyball" || sport === "tennis" || sport === "handball";
  const k = court ? "court" : "grass";
  return (
    <svg viewBox="0 0 320 160" className={className} role="img" aria-label={`${sport ?? "Sports"} facility illustration`} preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={`turf-${k}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={court ? "#1a2233" : "#0f2a1e"} />
          <stop offset="1" stopColor="#07080b" />
        </linearGradient>
        <radialGradient id={`key-${k}`} cx="0.15" cy="-0.1" r="1">
          <stop offset="0" stopColor="#ffc53d" stopOpacity="0.38" />
          <stop offset="0.6" stopColor="#ffc53d" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`rim-${k}`} cx="0.95" cy="0" r="0.8">
          <stop offset="0" stopColor="#6ae4ff" stopOpacity="0.22" />
          <stop offset="1" stopColor="#6ae4ff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="320" height="160" fill={`url(#turf-${k})`} />
      {!court && Array.from({ length: 8 }, (_, i) => <rect key={i} x={i * 40} width="20" height="160" fill="#ffffff" opacity="0.022" />)}
      <rect width="320" height="160" fill={`url(#key-${k})`} />
      <rect width="320" height="160" fill={`url(#rim-${k})`} />
      <g fill="none" stroke="#f5f3ee" strokeOpacity="0.38" strokeWidth="1.5">
        <rect x="24" y="20" width="272" height="120" rx="3" />
        <line x1="160" y1="20" x2="160" y2="140" />
        <circle cx="160" cy="80" r={court ? 14 : 20} />
        {court ? (
          <>
            <path d="M24 48 h32 a32 32 0 0 1 0 64 h-32" />
            <path d="M296 48 h-32 a32 32 0 0 0 0 64 h32" />
          </>
        ) : (
          <>
            <rect x="24" y="50" width="30" height="60" />
            <rect x="266" y="50" width="30" height="60" />
          </>
        )}
      </g>
      <circle cx="160" cy="80" r="3" fill="#ffc53d" />
    </svg>
  );
}

export function FacilityCard({ f }: { f: FacilityCardData }) {
  const img = facilityImageUrl(f.cover_image_path);
  const sport = f.sport_categories?.slug;
  const free = f.readiness.bookable ? f.freeToday : null;
  return (
    <Link href={`/facilities/${f.slug}`} className="panel lift group flex h-full flex-col overflow-hidden">
      <div className="relative aspect-[16/9] overflow-hidden">
        {img
          // eslint-disable-next-line @next/next/no-img-element -- Supabase public storage URL, sized by CSS
          ? <img src={img} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" loading="lazy" />
          : <PitchArt sport={sport} className="h-full w-full transition-transform duration-500 group-hover:scale-[1.04]" />}
        <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/10 to-transparent" aria-hidden="true" />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          <Chip tone="muted" className="!bg-black/50 backdrop-blur">{f.sport_categories?.name ?? "Sport"}</Chip>
          {f.is_dev_fixture && <Chip tone="warn">Dev fixture</Chip>}
        </div>
        <div className="absolute right-3 top-3">
          {free !== null && free !== undefined ? (
            <Chip tone={free > 0 ? "signal" : "muted"} live={free > 0} className={free > 0 ? "!bg-black/60 backdrop-blur" : "!bg-black/50 backdrop-blur"}>
              {free > 0 ? `${free} free today` : "Full today"}
            </Chip>
          ) : !f.readiness.bookable ? <Chip tone="muted" className="!bg-black/50 backdrop-blur">Opening soon</Chip> : null}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5 pt-3">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-display text-[22px] leading-tight sm:text-[24px]">{f.name}</h3>
          <span className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full border border-line-strong text-muted transition-all duration-300 group-hover:rotate-45 group-hover:border-signal/60 group-hover:bg-signal group-hover:text-signal-ink">
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </span>
        </div>
        {f.location_label && <p className="-mt-1 flex items-center gap-1.5 text-sm text-muted"><MapPin className="size-3.5" aria-hidden="true" />{f.location_label}</p>}
        {f.policy?.payment_mode === "free"
          ? <p className="font-display text-xl text-signal">Free</p>
          : f.slotPriceKobo != null && (
            <p className="flex items-baseline gap-1.5">
              <span className="font-display text-2xl text-signal tabular">{formatNaira(f.slotPriceKobo)}</span>
              <span className="text-xs font-semibold text-muted">{f.policy?.slot_minutes ? `/ ${formatDuration(f.policy.slot_minutes)} session` : "per session"}</span>
            </p>
          )}
        <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1.5 border-t border-line pt-3 text-[12.5px] font-semibold text-muted">
          {f.policy?.slot_minutes && <span className="inline-flex items-center gap-1.5"><Clock3 className="size-3.5 text-signal" aria-hidden="true" />{formatDuration(f.policy.slot_minutes)} sessions</span>}
          {f.policy && (
            <span className="inline-flex items-center gap-1.5">
              {f.policy.approval_mode === "required"
                ? <><ShieldCheck className="size-3.5 text-glow" aria-hidden="true" />Staff approval</>
                : <><Zap className="size-3.5 text-glow" aria-hidden="true" />Instant confirm</>}
            </span>
          )}
          {f.surfaces > 1 && <span>{f.surfaces} areas</span>}
        </div>
      </div>
    </Link>
  );
}
