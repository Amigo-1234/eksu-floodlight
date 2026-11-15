import Link from "next/link";
import { brand } from "@/lib/brand";

/**
 * EKSU Floodlight mark — "Beam".
 * A tilted floodlight head throws an amber beam down onto a pitch centre line.
 * Original artwork (no university insignia). Works from 16px (favicon) up.
 * The same geometry lives in src/app/icon.svg for the favicon.
 */
export function LogoMark({ size = 36, className = "", plain = false }: { size?: number; className?: string; plain?: boolean }) {
  const id = `fl-mark-${size}`;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1c202b" />
          <stop offset="1" stopColor="#08090d" />
        </linearGradient>
        <linearGradient id={`${id}-beam`} x1="0.2" y1="0" x2="0.75" y2="1">
          <stop offset="0" stopColor="#ffd166" stopOpacity="0.95" />
          <stop offset="1" stopColor="#ff9f1c" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}-lamp`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff1c2" />
          <stop offset="1" stopColor="#ffc53d" />
        </linearGradient>
      </defs>
      {!plain && <rect x="0.75" y="0.75" width="46.5" height="46.5" rx="14" fill={`url(#${id}-bg)`} stroke="#ffc53d" strokeOpacity="0.32" strokeWidth="1.5" />}
      <path d="M17.5 19.5 25 16.8 39 37.2 19.6 37.2Z" fill={`url(#${id}-beam)`} />
      <g transform="rotate(-18 17.5 14)">
        <rect x="9.5" y="9.5" width="16" height="9" rx="2.8" fill={`url(#${id}-lamp)`} />
        <circle cx="13.6" cy="14" r="1.55" fill="#2a1d00" opacity="0.55" />
        <circle cx="17.5" cy="14" r="1.55" fill="#2a1d00" opacity="0.55" />
        <circle cx="21.4" cy="14" r="1.55" fill="#2a1d00" opacity="0.55" />
      </g>
      <path d="M9 37.2h30" stroke="#f5f3ee" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M19.2 37.2a4.8 4.8 0 0 1 9.6 0" fill="none" stroke="#f5f3ee" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

/** Full lockup: mark + "EKSU" eyebrow + "Floodlight" wordmark. */
export function Logo({ href = "/", compact = false, size = 36 }: { href?: string; compact?: boolean; size?: number }) {
  return (
    <Link href={href} className="group flex items-center gap-2.5" aria-label={`${brand.name} home`}>
      <span className="transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-105">
        <LogoMark size={size} />
      </span>
      <span className="flex flex-col leading-none">
        {!compact && <span className="font-mono text-[9.5px] font-medium tracking-[0.32em] text-signal">EKSU</span>}
        <span className="font-display text-[21px] tracking-[-0.04em]">
          {compact ? <><span className="text-signal">EKSU</span> Floodlight</> : "Floodlight"}
        </span>
      </span>
    </Link>
  );
}
