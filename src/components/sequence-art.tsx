// Original Pacific swell contours: layered waves echo both ocean currents and sequencing traces.
export function SequenceArt({ id = "sequence" }: { id?: string }) {
  return <svg className="sequence-art" viewBox="0 0 1400 800" fill="none" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={`${id}-surface`} x1="200" y1="800" x2="1080" y2="250" gradientUnits="userSpaceOnUse">
        <stop stopColor="#031326" /><stop offset=".5" stopColor="#0b4279" /><stop offset="1" stopColor="#2583ad" />
      </linearGradient>
      <linearGradient id={`${id}-edge`} x1="0" y1="600" x2="1400" y2="280" gradientUnits="userSpaceOnUse">
        <stop stopColor="#1763a4" stopOpacity="0" /><stop offset=".5" stopColor="#439cd1" /><stop offset="1" stopColor="#a5d8ed" />
      </linearGradient>
      <radialGradient id={`${id}-glow`}><stop stopColor="#146ab5" stopOpacity=".3" /><stop offset="1" stopColor="#061322" stopOpacity="0" /></radialGradient>
    </defs>
    <ellipse cx="1040" cy="490" rx="650" ry="370" fill={`url(#${id}-glow)`} />
    <g className="sequence-ribbons">
      {Array.from({ length: 32 }, (_, i) => {
        const y = 280 + i * 13;
        const wave = `M -100 ${y + 250} C 180 ${y + 330}, 365 ${y + 190}, 610 ${y + 100} S 1030 ${y - 150}, 1500 ${y + 40}`;
        return <path key={i} d={`${wave} L 1500 960 L -100 960 Z`} fill={`url(#${id}-surface)`} fillOpacity=".16" stroke={`url(#${id}-edge)`} strokeWidth={i % 8 === 0 ? 1.6 : .7} opacity={.3 + i / 55} />;
      })}
    </g>
    <g opacity=".18">{Array.from({length: 9}, (_, i) => <path key={i} d={`M -80 ${640+i*18} C 390 ${370+i*22}, 890 ${820+i*8}, 1480 ${440+i*19}`} stroke={`url(#${id}-edge)`} strokeWidth="1" />)}</g>
  </svg>;
}
