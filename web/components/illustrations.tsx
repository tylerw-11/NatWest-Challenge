/**
 * Hand-drawn SVG weather and hero icons (pact-frontend: weather states use
 * drawn icons, never emoji). All are decorative: the word beside them carries
 * the meaning, so they are aria-hidden.
 */
type Props = { size?: number; className?: string };

export function SunIcon({ size = 72, className }: Props) {
  const rays = Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4);
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" aria-hidden className={className}>
      {rays.map((a) => (
        <line
          key={a}
          x1={36 + Math.cos(a) * 24}
          y1={36 + Math.sin(a) * 24}
          x2={36 + Math.cos(a) * 31}
          y2={36 + Math.sin(a) * 31}
          stroke="var(--sun-ring)"
          strokeWidth={4.5}
          strokeLinecap="round"
        />
      ))}
      <circle cx={36} cy={36} r={15} fill="var(--sun)" stroke="var(--sun-ring)" strokeWidth={4} />
    </svg>
  );
}

/** Small sun for the week strip: dashes instead of full rays. */
export function SunSmallIcon({ size = 24, className }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className={className}>
      {[
        [12, 1.5, 12, 4],
        [12, 20, 12, 22.5],
        [1.5, 12, 4, 12],
        [20, 12, 22.5, 12],
      ].map(([x1, y1, x2, y2]) => (
        <line key={`${x1}-${y1}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--sun-ring)" strokeWidth={1.8} strokeLinecap="round" />
      ))}
      <circle cx={12} cy={12} r={5.5} fill="var(--sun)" stroke="var(--sun-ring)" strokeWidth={1.6} />
    </svg>
  );
}

export function StormCloudIcon({
  size = 72,
  className,
  rain = true,
}: Props & { rain?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" aria-hidden className={className}>
      <path
        d="M20 44h33a11 11 0 0 0 0-22 15 15 0 0 0-28-3 12 12 0 0 0-5 25z"
        fill="var(--cloud)"
        stroke="var(--cloud-ink)"
        strokeWidth={3.5}
        strokeLinejoin="round"
      />
      {rain && (
        <g stroke="var(--rain)" strokeWidth={3.5} strokeLinecap="round">
          <line x1={23} y1={51} x2={21} y2={56} />
          <line x1={28} y1={58} x2={26} y2={63} />
          <line x1={48} y1={51} x2={46} y2={56} />
          <line x1={44} y1={58} x2={42} y2={63} />
        </g>
      )}
      <path
        d="M37 44l-6 11h8l-5 11"
        fill="none"
        stroke="var(--bolt)"
        strokeWidth={4.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Pact hero: shield with a tick, in primary. */
export function ShieldTickIcon({ size = 72, className }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" aria-hidden className={className}>
      <path
        d="M36 8l22 8v17c0 15-10 25-22 31-12-6-22-16-22-31V16z"
        fill="var(--tint-teal)"
        stroke="var(--primary)"
        strokeWidth={5}
        strokeLinejoin="round"
      />
      <path d="M26 36l7 7 14-15" fill="none" stroke="var(--primary)" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Log in hero: shield with the sun inside. */
export function ShieldSunIcon({ size = 96, className }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" aria-hidden className={className}>
      <path
        d="M36 6l22 8v19c0 15-10 25-22 32-12-7-22-17-22-32V14z"
        fill="var(--surface)"
        stroke="var(--primary)"
        strokeWidth={4}
        strokeLinejoin="round"
      />
      {[0, 90, 180, 270].map((deg) => (
        <line
          key={deg}
          x1={36}
          y1={20}
          x2={36}
          y2={24}
          stroke="var(--sun-ring)"
          strokeWidth={3}
          strokeLinecap="round"
          transform={`rotate(${deg} 36 33)`}
        />
      ))}
      <circle cx={36} cy={33} r={7} fill="var(--sun)" stroke="var(--sun-ring)" strokeWidth={2.5} />
    </svg>
  );
}

/** Rewind hero: a clock with a back-turning arrow, in the rewind label colour. */
export function RewindClockIcon({ size = 72, className }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" aria-hidden className={className}>
      <path
        d="M12 36a24 24 0 1 0 7-17"
        fill="none"
        stroke="var(--rewind-label)"
        strokeWidth={6}
        strokeLinecap="round"
      />
      <path d="M17 8v12h12" fill="none" stroke="var(--rewind-label)" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M36 24v13l8 8" fill="none" stroke="var(--rewind-label)" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
