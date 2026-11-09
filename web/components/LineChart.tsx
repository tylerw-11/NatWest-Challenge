"use client";

import { useId, useRef } from "react";

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
  nowIndex,
  mode,
  estimated = false,
  estimatedFromIndex,
  labels,
  ticks,
  ariaLabel,
  baseLabel,
  onPointSelect,
  onPan,
  pointAnnotation,
  riskIntervals = [],
}: {
  points: ChartPoint[];
  keyIndex?: number;
  nowIndex?: number;
  mode: "band" | "area";
  /** Draw forecast estimates with a dashed line to distinguish them from history. */
  estimated?: boolean;
  /** Split one timeline into solid historical data and a dashed prospective segment. */
  estimatedFromIndex?: number;
  labels: { start: string; key?: string; end: string };
  /** Optional evenly positioned x-axis annotations, used for monthly timeline labels. */
  ticks?: { position: number; label: string }[];
  ariaLabel: string;
  onPointSelect?: (index: number) => void;
  /** Pan only after a deliberate horizontal drag; taps always select a point first. */
  onPan?: (direction: -1 | 1) => void;
  /** Short value to show next to the selected point. */
  pointAnnotation?: string;
  /** Normalized horizontal ranges where bill-related debt risk increases toward the end. */
  riskIntervals?: { start: number; end: number }[];
  /** Text at the right end of the dashed base line, e.g. "£0". */
  baseLabel?: string;
}) {
  const pointerStart = useRef<number | null>(null);
  const dragged = useRef(false);
  const riskId = useId().replace(/:/g, "");
  const ys = points.flatMap((p) => [p.y, p.lo ?? p.y, p.hi ?? p.y]);
  const min = Math.min(0, ...ys);
  const max = Math.max(...ys);
  const span = max - min || 1;
  const x = (i: number) => PAD_X + (i * (W - PAD_X * 2)) / Math.max(1, points.length - 1);
  const y = (v: number) => PAD_Y + ((max - v) * (H - PAD_Y * 2)) / span;

  const lineFor = (from: number, to: number) =>
    points.slice(from, to).map((p, offset) => {
      const i = from + offset;
      return `${offset ? "L" : "M"}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`;
    }).join(" ");
  const line = lineFor(0, points.length);
  const historicalLine = estimatedFromIndex !== undefined ? lineFor(0, estimatedFromIndex + 1) : estimated ? "" : line;
  const prospectiveLine = estimatedFromIndex !== undefined ? lineFor(estimatedFromIndex, points.length) : estimated ? line : "";
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
  const annotationWidth = 92;
  const annotationHeight = 24;
  const annotationX = keyIndex !== undefined && x(keyIndex) + 12 + annotationWidth <= W
    ? x(keyIndex) + 12
    : keyIndex !== undefined ? Math.max(0, x(keyIndex) - annotationWidth - 12) : 0;
  const pointY = keyIndex !== undefined ? y(points[keyIndex]?.y ?? 0) : 0;
  const placeAnnotationAbove = pointY > PAD_Y + annotationHeight + 8 || pointY + 10 + annotationHeight > H - PAD_Y;
  const annotationY = Math.max(0, Math.min(H - annotationHeight, placeAnnotationAbove ? pointY - annotationHeight - 8 : pointY + 10));

  return (
    <figure className="flex flex-col gap-1">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={ariaLabel}
        className={`overflow-visible ${onPointSelect ? "cursor-crosshair" : ""}`}
        tabIndex={onPointSelect ? 0 : undefined}
        onPointerDown={(event) => {
          if (!onPan) return;
          pointerStart.current = event.clientX;
          dragged.current = false;
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerUp={(event) => {
          if (pointerStart.current === null) return;
          const distance = event.clientX - pointerStart.current;
          pointerStart.current = null;
          if (Math.abs(distance) > 40) {
            dragged.current = true;
            onPan?.(distance > 0 ? -1 : 1);
          }
        }}
        onPointerCancel={() => { pointerStart.current = null; dragged.current = false; }}
        onWheel={(event) => {
          if (onPan && Math.abs(event.deltaX) > 30 && Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
            onPan(event.deltaX > 0 ? 1 : -1);
          }
        }}
        onClick={(event) => {
          if (dragged.current) {
            dragged.current = false;
            return;
          }
          if (!onPointSelect || points.length === 0) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          const svgX = ((event.clientX - bounds.left) / bounds.width) * W;
          const relativeX = Math.max(0, Math.min(1, (svgX - PAD_X) / (W - PAD_X * 2)));
          onPointSelect(Math.round(relativeX * (points.length - 1)));
        }}
        onKeyDown={(event) => {
          if (!onPointSelect || keyIndex === undefined) return;
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            onPointSelect(Math.max(0, keyIndex - 1));
          } else if (event.key === "ArrowRight") {
            event.preventDefault();
            onPointSelect(Math.min(points.length - 1, keyIndex + 1));
          }
        }}
      >
        <defs>
          {riskIntervals.map((interval, index) => (
            <linearGradient key={index} id={`${riskId}-bill-risk-${index}`} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="var(--due)" stopOpacity="0.02" />
              <stop offset="100%" stopColor="var(--due)" stopOpacity="0.28" />
            </linearGradient>
          ))}
        </defs>
        <path d={fill} fill="var(--primary)" fillOpacity={0.12} className="chart-fade" />
        {riskIntervals.map((interval, index) => {
          const left = Math.max(0, Math.min(1, interval.start));
          const right = Math.max(0, Math.min(1, interval.end));
          if (right <= left) return null;
          const x1 = x(left * Math.max(0, points.length - 1));
          const x2 = x(right * Math.max(0, points.length - 1));
          return <rect key={index} x={x1} y={PAD_Y} width={Math.max(1, x2 - x1)} height={H - PAD_Y * 2} fill={`url(#${riskId}-bill-risk-${index})`} pointerEvents="none" />;
        })}
        <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="var(--chart-base)" strokeWidth={1.5} strokeDasharray="5 5" />
        {baseLabel && (
          <text x={W} y={y(0) - 5} textAnchor="end" fontSize={12} fill="var(--ink-2)">
            {baseLabel}
          </text>
        )}
        {nowIndex !== undefined && points[nowIndex] && (
          <line
            x1={x(nowIndex)}
            x2={x(nowIndex)}
            y1={PAD_Y}
            y2={H - PAD_Y}
            stroke="var(--ink-2)"
            strokeWidth={1.5}
            strokeDasharray="3 4"
            opacity={0.7}
          />
        )}
        {historicalLine && (
          <path
            d={historicalLine}
            pathLength={1}
            fill="none"
            stroke="var(--primary)"
            strokeWidth={3}
            strokeLinejoin="round"
            strokeLinecap="round"
            className="chart-draw"
          />
        )}
        {prospectiveLine && (
          <path
            d={prospectiveLine}
            fill="none"
            stroke="var(--primary)"
            strokeWidth={3}
            strokeLinejoin="round"
            strokeLinecap="round"
            className="chart-draw-estimated"
          />
        )}
        {keyIndex !== undefined && points[keyIndex] && (
          <g pointerEvents="none">
            <circle
              cx={x(keyIndex)}
              cy={y(points[keyIndex].y)}
              r={8}
              fill="var(--storm-hero)"
              stroke="var(--storm-label)"
              strokeWidth={3}
              className="chart-dot"
            />
            {pointAnnotation && (
              <g>
                <rect x={annotationX} y={annotationY} width={annotationWidth} height={annotationHeight} rx={8} fill="var(--storm-label)" />
                <text x={annotationX + annotationWidth / 2} y={annotationY + 16} textAnchor="middle" fontSize={12} fontWeight={700} fill="white">
                  {pointAnnotation}
                </text>
              </g>
            )}
          </g>
        )}
      </svg>
      <figcaption aria-hidden className="relative h-5 text-[12px] text-ink-2">
        {ticks ? (
          ticks.map((tick, i) => (
            <span
              key={`${tick.label}-${i}`}
              className="absolute whitespace-nowrap"
              style={{
                left: `${tick.position}%`,
                transform: tick.position === 0 ? undefined : tick.position === 100 ? "translateX(-100%)" : "translateX(-50%)",
              }}
            >
              {tick.label}
            </span>
          ))
        ) : (
          <>
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
          </>
        )}
      </figcaption>
    </figure>
  );
}
