import Link from "next/link";
import { brand } from "@/lib/brand";

/** Original Floodlight mark: a mast with four lamps throwing light onto a pitch line. */
export function LogoMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <rect width="32" height="32" rx="9" fill="var(--signal)" />
      <g fill="var(--signal-ink)">
        <rect x="7" y="6" width="3.5" height="3.5" rx="1" />
        <rect x="11.5" y="6" width="3.5" height="3.5" rx="1" />
        <rect x="7" y="10.5" width="3.5" height="3.5" rx="1" />
        <rect x="11.5" y="10.5" width="3.5" height="3.5" rx="1" />
        <path d="M10.2 14.5h2.1l1.2 11.5h-4.5z" />
      </g>
      <path d="M16.5 8.5 26 24M16.5 12.5 24 25" stroke="var(--signal-ink)" strokeWidth="1.6" strokeLinecap="round" opacity="0.55" />
      <path d="M5 26.5h22" stroke="var(--signal-ink)" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ href = "/", compact = false }: { href?: string; compact?: boolean }) {
  return (
    <Link href={href} className="flex items-center gap-2.5" aria-label={`${brand.name} home`}>
      <LogoMark />
      <span className="flex flex-col leading-none">
        <span className="font-display text-[22px] tracking-wide">{compact ? brand.short : brand.name}</span>
        {!compact && <span className="mt-0.5 hidden text-[10px] font-medium uppercase tracking-[0.14em] text-muted sm:block">Sports facility booking</span>}
      </span>
    </Link>
  );
}
