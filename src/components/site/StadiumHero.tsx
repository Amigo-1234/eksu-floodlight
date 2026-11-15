/** Original hero illustration: two floodlight masts throwing light onto a pitch in perspective. */
export function StadiumHero({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 600 420" className={className} aria-hidden="true" preserveAspectRatio="xMidYMax slice">
      <defs>
        <linearGradient id="beamL" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c6f135" stopOpacity="0.55" />
          <stop offset="1" stopColor="#c6f135" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="beamR" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f2f1ea" stopOpacity="0.35" />
          <stop offset="1" stopColor="#f2f1ea" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="grass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#103621" />
          <stop offset="1" stopColor="#0b100f" />
        </linearGradient>
      </defs>
      <polygon points="70,60 120,60 420,420 -60,420" fill="url(#beamL)" opacity="0.5" />
      <polygon points="490,50 540,50 650,420 200,420" fill="url(#beamR)" opacity="0.45" />
      <polygon points="150,250 450,250 600,420 0,420" fill="url(#grass)" />
      <g fill="none" stroke="#f2f1ea" strokeOpacity="0.5" strokeWidth="2">
        <polygon points="170,262 430,262 560,410 40,410" />
        <line x1="300" y1="262" x2="300" y2="410" />
        <ellipse cx="300" cy="320" rx="62" ry="22" />
        <polygon points="250,262 350,262 356,278 244,278" />
      </g>
      <g fill="#f2f1ea" fillOpacity="0.9">
        <rect x="88" y="66" width="10" height="190" />
        <rect x="514" y="56" width="10" height="200" />
      </g>
      <g>
        {[0, 1, 2].map((r) => [0, 1, 2, 3].map((c) => (
          <rect key={`l${r}${c}`} x={62 + c * 16} y={40 + r * 12} width="12" height="9" rx="2" fill="#c6f135" />
        )))}
        {[0, 1, 2].map((r) => [0, 1, 2, 3].map((c) => (
          <rect key={`r${r}${c}`} x={488 + c * 16} y={30 + r * 12} width="12" height="9" rx="2" fill="#f2f1ea" />
        )))}
      </g>
    </svg>
  );
}
