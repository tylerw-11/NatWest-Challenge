/**
 * Shared chart (pact-frontend chart spec), used by Time River and Rewind.
 * SVG 356×110, dashed zero/base line, one 3 px primary line with round joins,
 * an uncertainty band (forecast) or area (history) at 12% primary, the key
 * point as a radius-8 circle with a 3 px storm ring. Axis text 12 px: start,
 * key point (bold, storm colour), end. role="img" + aria-label sentence.
 */
export type ChartPoint = { y: number; lo?: number; hi?: number };

const W = 356;
const H = 110;
const PAD_X = 10;
const PAD_Y = 12;

export function LineChart({
  points,
  keyIndex,
  mode,
  labels,
  ariaLabel,
  baseLabel,
}: {
  points: ChartPoint[];
  keyIndex?: number;
  mode: "band" | "area";
  labels: { start: string; key?: string; end: string };
  ariaLabel: string;
  /** Text at the right end of the dashed base line, e.g. "£0". */
  baseLabel?: string;
}) {
  const ys = points.flatMap((p) => [p.y, p.lo ?? p.y, p.hi ?? p.y]);
  const min = Math.min(0, ...ys);
  const max = Math.max(...ys);
  const span = max - min || 1;
  const x = (i: number) => PAD_X + (i * (W - PAD_X * 2)) / Math.max(1, points.length - 1);
  const y = (v: number) => PAD_Y + ((max - v) * (H - PAD_Y * 2)) / span;

  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join(" ");
  const fill =
    mode === "band"
      ? points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.hi ?? p.y).toFixed(1)}`).join(" ") +
        " " +
        points
          .map((p, i) => ({ p, i }))
          .reverse()
          .map(({ p, i }) => `L${x(i).toFixed(1)},${y(p.lo ?? p.y).toFixed(1)}`)
          .join(" ") +
        " Z"
      : `${line} L${x(points.length - 1).toFixed(1)},${y(min).toFixed(1)} L${x(0).toFixed(1)},${y(min).toFixed(1)} Z`;

  const keyPct = keyIndex !== undefined ? (x(keyIndex) / W) * 100 : undefined;

  return (
    <figure className="flex flex-col gap-1">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={ariaLabel} className="overflow-visible">
        <path d={fill} fill="var(--primary)" fillOpacity={0.12} />
        <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="var(--chart-base)" strokeWidth={1.5} strokeDasharray="5 5" />
        {baseLabel && (
          <text x={W} y={y(0) - 5} textAnchor="end" fontSize={12} fill="var(--ink-2)">
            {baseLabel}
          </text>
        )}
        <path d={line} fill="none" stroke="var(--primary)" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
        {keyIndex !== undefined && points[keyIndex] && (
          <circle
            cx={x(keyIndex)}
            cy={y(points[keyIndex].y)}
            r={8}
            fill="var(--storm-hero)"
            stroke="var(--storm-label)"
            strokeWidth={3}
          />
        )}
      </svg>
      <figcaption aria-hidden className="relative h-5 text-[12px] text-ink-2">
        <span className="absolute left-0">{labels.start}</span>
        {labels.key && keyPct !== undefined && keyPct > 12 && keyPct < 88 && (
          <span
            className="absolute -translate-x-1/2 font-bold whitespace-nowrap text-storm-label"
            style={{ left: `${keyPct}%` }}
          >
            {labels.key}
          </span>
        )}
        <span className="absolute right-0">{labels.end}</span>
      </figcaption>
    </figure>
  );
}
