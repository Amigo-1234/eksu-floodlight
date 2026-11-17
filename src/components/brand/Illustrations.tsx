/**
 * EKSU Floodlight illustration set — original, lightweight inline SVGs in the
 * "Night Session" style: dark shapes, amber floodlight key light, ice rim
 * light, soft glows. All decorative (aria-hidden); motion classes live in
 * globals.css and respect prefers-reduced-motion.
 */
import type { CSSProperties } from "react";

type P = { className?: string };

const AMBER = "#ffc53d";
const AMBER_2 = "#ff9f1c";
const ICE = "#6ae4ff";
// Ink follows the theme via currentColor (set from --art-ink on each <svg>);
// panels use --art-panel-*. Inline styles keep this working in every engine.
const INK = "currentColor";
const ART: CSSProperties = { color: "var(--art-ink)" };

function Defs({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={`${id}-amber`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffe08a" />
        <stop offset="1" stopColor={AMBER_2} />
      </linearGradient>
      <radialGradient id={`${id}-halo`} cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor={AMBER} stopOpacity="0.45" />
        <stop offset="1" stopColor={AMBER} stopOpacity="0" />
      </radialGradient>
      <radialGradient id={`${id}-ice`} cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor={ICE} stopOpacity="0.35" />
        <stop offset="1" stopColor={ICE} stopOpacity="0" />
      </radialGradient>
      <linearGradient id={`${id}-panel`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" style={{ stopColor: "var(--art-panel-a)" }} />
        <stop offset="1" style={{ stopColor: "var(--art-panel-b)" }} />
      </linearGradient>
    </defs>
  );
}

/* ------------------------------------------------------------------ hero */

/** Night stadium: two floodlight towers, swaying beams, a pitch in perspective. */
export function HeroScene({ className = "" }: P) {
  const stars = [[80, 60], [160, 30], [250, 90], [340, 40], [470, 70], [560, 28], [650, 80], [720, 46], [120, 140], [700, 150], [410, 120]];
  return (
    <svg viewBox="0 0 800 600" className={className} aria-hidden="true" preserveAspectRatio="xMidYMax slice">
      <defs>
        <linearGradient id="hs-beamA" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#ffe08a" stopOpacity="0.55" />
          <stop offset="0.6" stopColor={AMBER} stopOpacity="0.12" />
          <stop offset="1" stopColor={AMBER} stopOpacity="0" />
        </linearGradient>
        <linearGradient id="hs-beamB" x1="1" y1="0" x2="0.6" y2="1">
          <stop offset="0" stopColor="#d8f7ff" stopOpacity="0.4" />
          <stop offset="0.6" stopColor={ICE} stopOpacity="0.08" />
          <stop offset="1" stopColor={ICE} stopOpacity="0" />
        </linearGradient>
        <linearGradient id="hs-turf" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0f2a1e" />
          <stop offset="1" stopColor="#050608" />
        </linearGradient>
        <radialGradient id="hs-spot" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={AMBER} stopOpacity="0.5" />
          <stop offset="1" stopColor={AMBER} stopOpacity="0" />
        </radialGradient>
        <filter id="hs-blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6" /></filter>
      </defs>

      {stars.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 1.6 : 1.1} fill={INK} className="twinkle" style={{ animationDelay: `${i * 0.37}s` }} />
      ))}

      {/* stands silhouette */}
      <path d="M0 330 Q200 290 400 300 T800 320 V400 H0Z" fill="#0b0d12" />
      <path d="M0 345 Q200 308 400 318 T800 336" stroke={INK} strokeOpacity="0.06" fill="none" />

      {/* beams */}
      <polygon className="beam" points="118,118 168,108 560,600 -40,600" fill="url(#hs-beamA)" />
      <polygon className="beam beam-slow" points="640,104 690,114 840,600 300,600" fill="url(#hs-beamB)" />

      {/* pitch */}
      <polygon points="200,380 600,380 800,600 0,600" fill="url(#hs-turf)" />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <polygon key={i} points={`${200 + i * 66.6},380 ${233 + i * 66.6},380 ${i * 133 + 66},600 ${i * 133},600`} fill={INK} opacity="0.025" />
      ))}
      <g fill="none" stroke={INK} strokeOpacity="0.42" strokeWidth="2">
        <polygon points="222,392 578,392 744,590 56,590" />
        <line x1="400" y1="392" x2="400" y2="590" />
        <ellipse cx="400" cy="468" rx="78" ry="26" />
        <polygon points="330,392 470,392 478,410 322,410" />
      </g>
      <ellipse cx="400" cy="470" rx="120" ry="40" fill="url(#hs-spot)" />
      <circle cx="400" cy="462" r="9" fill={INK} />
      <path d="M394 458 l6 -3 l6 3 l-2 7 h-8z" fill="#0b0d12" opacity="0.55" />

      {/* towers */}
      <g fill="#151821">
        <rect x="136" y="128" width="9" height="210" />
        <rect x="660" y="122" width="9" height="216" />
      </g>
      <g filter="url(#hs-blur)" opacity="0.9">
        <rect x="104" y="92" width="74" height="40" rx="8" fill={AMBER} />
        <rect x="628" y="86" width="74" height="40" rx="8" fill="#bff3ff" />
      </g>
      <g>
        {[0, 1, 2].map((r) => [0, 1, 2, 3].map((c) => (
          <rect key={`a${r}${c}`} x={108 + c * 17} y={96 + r * 11} width="13" height="8" rx="2" fill={r === 1 && c === 2 ? "#fff8e0" : AMBER} />
        )))}
        {[0, 1, 2].map((r) => [0, 1, 2, 3].map((c) => (
          <rect key={`b${r}${c}`} x={632 + c * 17} y={90 + r * 11} width="13" height="8" rx="2" fill={r === 0 && c === 1 ? "#ffffff" : "#d8f7ff"} />
        )))}
      </g>
    </svg>
  );
}

/* ------------------------------------------------------------- empty states */

/** Generic empty state: a quiet pitch with a training cone and corner flag. */
export function ArtEmpty({ className = "" }: P) {
  return (
    <svg style={ART} viewBox="0 0 200 130" className={className} aria-hidden="true">
      <Defs id="ae" />
      <ellipse cx="100" cy="70" rx="90" ry="55" fill="url(#ae-halo)" />
      <rect x="22" y="38" width="156" height="78" rx="12" fill="url(#ae-panel)" stroke={INK} strokeOpacity="0.12" />
      <g fill="none" stroke={INK} strokeOpacity="0.35" strokeWidth="1.6">
        <rect x="32" y="48" width="136" height="58" rx="3" />
        <line x1="100" y1="48" x2="100" y2="106" />
        <circle cx="100" cy="77" r="11" />
      </g>
      <path d="M62 102 l9 -26 l9 26z" fill="url(#ae-amber)" />
      <rect x="58" y="101" width="26" height="4" rx="2" fill={AMBER_2} />
      <line x1="145" y1="104" x2="145" y2="66" stroke={INK} strokeWidth="2" strokeLinecap="round" />
      <path d="M145 66 l16 6 l-16 6z" fill={ICE} />
    </svg>
  );
}

/** No bookings yet: a blank ticket with a smiling ball. */
export function ArtTicket({ className = "" }: P) {
  return (
    <svg style={ART} viewBox="0 0 200 130" className={className} aria-hidden="true">
      <Defs id="at" />
      <ellipse cx="100" cy="66" rx="88" ry="54" fill="url(#at-halo)" />
      <g transform="rotate(-6 100 66)">
        <path d="M34 34h132a8 8 0 0 1 8 8v12a10 10 0 0 0 0 20v12a8 8 0 0 1-8 8H34a8 8 0 0 1-8-8V74a10 10 0 0 0 0-20V42a8 8 0 0 1 8-8z"
          fill="url(#at-panel)" stroke={AMBER} strokeOpacity="0.55" strokeWidth="1.5" />
        <line x1="128" y1="40" x2="128" y2="88" stroke={INK} strokeOpacity="0.3" strokeDasharray="3 4" />
        <rect x="44" y="48" width="56" height="7" rx="3.5" fill={INK} opacity="0.75" />
        <rect x="44" y="62" width="38" height="6" rx="3" fill={INK} opacity="0.3" />
        <rect x="44" y="74" width="46" height="6" rx="3" fill={INK} opacity="0.3" />
        <circle cx="151" cy="64" r="12" fill={INK} />
        <circle cx="147" cy="61.5" r="1.4" fill="#0b0d12" />
        <circle cx="155" cy="61.5" r="1.4" fill="#0b0d12" />
        <path d="M146.5 67 q4.5 4 9 0" stroke="#0b0d12" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      </g>
      <g fill={AMBER}><path d="M168 24l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" /><circle cx="30" cy="104" r="2.5" /></g>
    </svg>
  );
}

/** No results: magnifier over a ball. */
export function ArtSearch({ className = "" }: P) {
  return (
    <svg style={ART} viewBox="0 0 200 130" className={className} aria-hidden="true">
      <Defs id="as" />
      <ellipse cx="100" cy="66" rx="80" ry="52" fill="url(#as-ice)" />
      <circle cx="92" cy="60" r="30" fill="url(#as-panel)" stroke={INK} strokeOpacity="0.4" strokeWidth="3" />
      <circle cx="92" cy="60" r="14" fill={INK} opacity="0.9" />
      <path d="M86 55 l6 -3 l6 3 l-2 7 h-8z" fill="#0b0d12" opacity="0.5" />
      <line x1="114" y1="82" x2="138" y2="106" stroke={AMBER} strokeWidth="9" strokeLinecap="round" />
      <path d="M150 30 q6 -10 14 -2 q4 5 -6 10 q-4 3 -3 8" stroke={AMBER} strokeWidth="3" fill="none" strokeLinecap="round" />
      <circle cx="155" cy="54" r="2.4" fill={AMBER} />
    </svg>
  );
}

/** Admin empty: a clipboard with a rising bar chart. */
export function ArtClipboard({ className = "" }: P) {
  return (
    <svg style={ART} viewBox="0 0 200 130" className={className} aria-hidden="true">
      <Defs id="ac" />
      <ellipse cx="100" cy="66" rx="86" ry="54" fill="url(#ac-halo)" />
      <rect x="62" y="20" width="76" height="98" rx="10" fill="url(#ac-panel)" stroke={INK} strokeOpacity="0.2" />
      <rect x="84" y="14" width="32" height="12" rx="5" fill={INK} opacity="0.8" />
      <g fill="url(#ac-amber)">
        <rect x="76" y="80" width="10" height="24" rx="3" />
        <rect x="95" y="66" width="10" height="38" rx="3" />
        <rect x="114" y="52" width="10" height="52" rx="3" />
      </g>
      <path d="M74 60 L94 48 L106 54 L128 36" stroke={ICE} strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="128" cy="36" r="3.5" fill={ICE} />
    </svg>
  );
}

/* --------------------------------------------------------------- auth / 404 */

/** Auth art: a floodlight head pouring light onto a ball and a whistle. */
export function ArtLamp({ className = "" }: P) {
  return (
    <svg style={ART} viewBox="0 0 320 320" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="al-beam" x1="0.2" y1="0" x2="0.6" y2="1">
          <stop offset="0" stopColor="#ffe08a" stopOpacity="0.75" />
          <stop offset="1" stopColor={AMBER} stopOpacity="0" />
        </linearGradient>
        <radialGradient id="al-floor" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={AMBER} stopOpacity="0.4" />
          <stop offset="1" stopColor={AMBER} stopOpacity="0" />
        </radialGradient>
        <filter id="al-blur"><feGaussianBlur stdDeviation="8" /></filter>
      </defs>
      <polygon className="beam" points="96,96 150,80 300,300 70,300" fill="url(#al-beam)" />
      <ellipse cx="190" cy="280" rx="120" ry="26" fill="url(#al-floor)" />
      <g transform="rotate(-20 110 80)">
        <rect x="60" y="56" width="104" height="52" rx="14" fill={AMBER} filter="url(#al-blur)" opacity="0.8" />
        <rect x="60" y="56" width="104" height="52" rx="14" style={{ fill: "var(--art-panel-a)" }} stroke={AMBER} strokeOpacity="0.6" strokeWidth="2" />
        {[0, 1, 2].map((c) => [0, 1].map((r) => (
          <circle key={`${c}${r}`} cx={86 + c * 26} cy={72 + r * 20} r="8" fill={r === 0 && c === 1 ? "#fff8e0" : AMBER} />
        )))}
      </g>
      <circle cx="196" cy="252" r="24" fill={INK} />
      <path d="M186 244 l10 -6 l10 6 l-3 12 h-14z" fill="#0b0d12" opacity="0.5" />
      <g transform="translate(236 252)">
        <rect x="0" y="-8" width="30" height="18" rx="9" fill={ICE} />
        <rect x="-10" y="-4" width="14" height="9" rx="3" fill={ICE} />
        <circle cx="16" cy="1" r="4" fill="#0b0d12" opacity="0.5" />
      </g>
      <g fill={INK}><circle cx="250" cy="70" r="2" className="twinkle" /><circle cx="280" cy="120" r="1.5" className="twinkle" style={{ animationDelay: "1s" }} /><circle cx="40" cy="200" r="1.6" className="twinkle" style={{ animationDelay: "2s" }} /></g>
    </svg>
  );
}

/** 404: the ball rolled out of play. */
export function ArtLost({ className = "" }: P) {
  return (
    <svg style={ART} viewBox="0 0 240 150" className={className} aria-hidden="true">
      <Defs id="ao" />
      <ellipse cx="120" cy="80" rx="110" ry="62" fill="url(#ao-halo)" />
      <g fill="none" stroke={INK} strokeOpacity="0.35" strokeWidth="2">
        <rect x="20" y="30" width="140" height="90" rx="4" />
        <line x1="90" y1="30" x2="90" y2="120" />
        <circle cx="90" cy="75" r="16" />
      </g>
      <path d="M150 80 q20 -26 40 -6 q10 10 22 6" stroke={AMBER} strokeWidth="2" strokeDasharray="2 6" strokeLinecap="round" fill="none" />
      <g className="floaty">
        <circle cx="214" cy="82" r="13" fill={INK} />
        <path d="M208 78 l6 -3 l6 3 l-2 7 h-8z" fill="#0b0d12" opacity="0.5" />
      </g>
      <text x="196" y="52" fill={AMBER} fontSize="14" fontWeight="800" fontFamily="sans-serif">?</text>
    </svg>
  );
}

/* --------------------------------------------------------- success / verdicts */

/** Booking success: a pass with a glowing check and falling confetti. */
export function ArtSuccess({ className = "" }: P) {
  const bits = [[40, 20, AMBER], [70, 10, ICE], [130, 14, AMBER], [160, 24, "#3ee08f"], [100, 6, INK], [180, 10, AMBER_2], [20, 34, ICE]] as const;
  return (
    <svg style={ART} viewBox="0 0 200 140" className={className} aria-hidden="true">
      <Defs id="su" />
      <ellipse cx="100" cy="80" rx="90" ry="56" fill="url(#su-halo)" />
      <g className="confetti">
        {bits.map(([x, y, c], i) => <rect key={i} x={x} y={y} width="6" height="10" rx="2" fill={c} style={{ "--i": i } as CSSProperties} />)}
      </g>
      <g className="pop-in">
        <path d="M46 46h108a8 8 0 0 1 8 8v12a10 10 0 0 0 0 20v12a8 8 0 0 1-8 8H46a8 8 0 0 1-8-8V86a10 10 0 0 0 0-20V54a8 8 0 0 1 8-8z"
          fill="url(#su-panel)" stroke={AMBER} strokeOpacity="0.6" strokeWidth="1.5" />
        <circle cx="100" cy="76" r="20" fill="url(#su-amber)" />
        <path d="M91 76 l6 6 l12 -13" stroke="#170f00" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="100" cy="76" r="20" fill="none" stroke={AMBER} strokeWidth="2" className="ring-out" />
      </g>
    </svg>
  );
}

/** Gate verdict ring: valid (check) or rejected (cross). */
export function ArtVerdict({ ok, className = "" }: P & { ok: boolean }) {
  const c = ok ? "#3ee08f" : "#ff5c72";
  return (
    <svg style={ART} viewBox="0 0 120 120" className={className} aria-hidden="true">
      <circle cx="60" cy="60" r="44" fill={c} opacity="0.12" />
      <circle cx="60" cy="60" r="44" fill="none" stroke={c} strokeWidth="3" className="ring-out" />
      <circle cx="60" cy="60" r="34" fill={c} className="pop-in" />
      {ok
        ? <path d="M45 60 l10 10 l20 -22" stroke="#04140b" strokeWidth="7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        : <path d="M48 48 l24 24 M72 48 l-24 24" stroke="#1a0307" strokeWidth="7" strokeLinecap="round" />}
    </svg>
  );
}
