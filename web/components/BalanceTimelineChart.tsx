"use client";

import { useState } from "react";
import { Card } from "@/components/Cards";
import { Pill } from "@/components/Buttons";
import { LineChart } from "@/components/LineChart";
import { dayLong, gbp, oneInN } from "@/lib/format";
import type { BalanceHistoryPoint, Forecast } from "@/lib/contracts";

const RANGES = [
  { days: 30, label: "1 month" },
  { days: 90, label: "3 months" },
  { days: 180, label: "6 months" },
  { days: 500, label: "All" },
] as const;

type TimelinePoint = {
  date: string;
  balance_gbp: number;
  low_gbp: number;
  high_gbp: number;
  estimated: boolean;
  p_shortfall?: number;
};

const monthLabel = (iso: string) => {
  const date = new Date(`${iso.slice(0, 7)}-15T12:00:00Z`);
  const month = date.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
  return iso.slice(5, 7) === "01" ? `${month} '${iso.slice(2, 4)}` : month;
};

export function BalanceTimelineChart({
  history,
  historyIsDemo = false,
  forecast,
}: {
  history: BalanceHistoryPoint[];
  historyIsDemo?: boolean;
  forecast: Forecast;
}) {
  const historical: TimelinePoint[] = history
    .filter((point, index) => index % 7 === 0 || index === history.length - 1)
    .filter((point) => point.date < forecast.as_of)
    .map((point) => ({
      date: point.date,
      balance_gbp: point.balance_gbp,
      low_gbp: point.balance_gbp,
      high_gbp: point.balance_gbp,
      estimated: false,
    }));
  const projected: TimelinePoint[] = forecast.days
    .filter((day, index) => index % 7 === 0 || index === forecast.days.length - 1)
    .map((day) => ({
      date: day.date,
      balance_gbp: day.p50,
      low_gbp: day.p10,
      high_gbp: day.p90,
      estimated: true,
      p_shortfall: day.p_shortfall,
    }));
  const points = [...historical, ...projected];
  const estimateStart = historical.length;
  const stormPoint = points.findIndex((point) => point.estimated && forecast.days.find((day) => day.date === point.date)?.state === "storm");
  const firstEstimate = historical.length;
  const initialSelected = stormPoint >= 0 ? stormPoint : firstEstimate;
  const initialRange = 30;
  const initialCount = Math.min(points.length, Math.ceil(initialRange / 7));
  const [range, setRange] = useState<number>(initialRange);
  const [startIndex, setStartIndex] = useState(Math.max(0, Math.min(points.length - initialCount, initialSelected - Math.floor(initialCount / 2))));
  const [selectedIndex, setSelectedIndex] = useState(initialSelected);

  const countForRange = (days: number) => days >= 500 ? points.length : Math.min(points.length, Math.ceil(days / 7));
  const count = countForRange(range);
  const maxStart = Math.max(0, points.length - count);
  const safeStart = Math.min(startIndex, maxStart);
  const visible = points.slice(safeStart, safeStart + count);
  const safeSelected = Math.max(safeStart, Math.min(points.length - 1, selectedIndex));
  const selected = points[safeSelected];
  const selectedOffset = safeSelected - safeStart;
  const estimateOffset = estimateStart - safeStart;
  const estimateIsVisible = estimateOffset >= 0 && estimateOffset < visible.length;
  const allVisibleAreEstimates = safeStart >= estimateStart;
  const nowOffset = estimateIsVisible ? estimateOffset : undefined;
  const firstTime = Date.parse(`${visible[0].date}T00:00:00Z`);
  const lastTime = Date.parse(`${visible[visible.length - 1].date}T00:00:00Z`);
  const riskIntervals = forecast.drivers.flatMap((driver) => {
    if (driver.kind !== "bill" || !driver.due_date) return [];
    const dueDay = forecast.days.find((day) => day.date === driver.due_date);
    if (!dueDay || dueDay.p10 >= 0) return [];
    const dueTime = Date.parse(`${driver.due_date}T00:00:00Z`);
    const windowStart = dueTime - 14 * 24 * 60 * 60 * 1000;
    const span = lastTime - firstTime || 1;
    if (dueTime < firstTime || dueTime > lastTime || windowStart > lastTime) return [];
    return [{
      start: Math.max(0, (windowStart - firstTime) / span),
      end: Math.min(1, (dueTime - firstTime) / span),
    }];
  });
  const ticks = visible.flatMap((point, index) => {
    const month = point.date.slice(0, 7);
    if (index > 0 && visible[index - 1].date.slice(0, 7) === month) return [];
    return [{ position: visible.length > 1 ? (index / (visible.length - 1)) * 100 : 0, label: monthLabel(point.date) }];
  });

  const zoomTo = (days: number) => {
    const nextCount = countForRange(days);
    setRange(days);
    setStartIndex(Math.max(0, Math.min(points.length - nextCount, safeSelected - Math.floor(nextCount / 2))));
  };

  const pan = (direction: -1 | 1) => {
    const step = Math.max(1, Math.floor(count * 0.75));
    const nextStart = Math.max(0, Math.min(maxStart, safeStart + direction * step));
    setStartIndex(nextStart);
    setSelectedIndex(Math.min(points.length - 1, nextStart + Math.floor(count / 2)));
  };

  const selectPoint = (visibleIndex: number) => setSelectedIndex(safeStart + visibleIndex);
  const goToNow = () => {
    const now = estimateStart;
    const nextCount = countForRange(90);
    setRange(90);
    setStartIndex(Math.max(0, Math.min(points.length - nextCount, now - Math.floor(nextCount / 2))));
    setSelectedIndex(now);
  };

  return (
    <Card className="flex flex-col gap-4 px-5">
      <div>
        <h2 className="text-[17px] font-bold">Balance history and forecast</h2>
        <p className="text-[14px] text-ink-2">Solid line: past balance. Dashed line: estimated future. Shading shows possible outcomes; red fade marks at-risk bills, darker near the due date.</p>
      </div>
      {historyIsDemo && <p className="rounded-xl bg-bg px-3 py-2 text-[13px] text-ink-2">Past balances are fictional demo data; the dashed forecast is a projection.</p>}
      <p className="w-fit rounded-full bg-tint-teal px-3 py-1 text-[14px] font-bold">
        {dayLong(selected.date)} · {selected.estimated ? "most likely " : "balance "}{gbp(selected.balance_gbp)}
        {selected.estimated && selected.p_shortfall !== undefined ? ` · ${oneInN(selected.p_shortfall)} chance of going short` : ""}
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Zoom balance timeline">
        {RANGES.map((option) => (
          <Pill key={option.days} pressed={range === option.days} onClick={() => zoomTo(option.days)}>
            {option.label}
          </Pill>
        ))}
      </div>
      <div
        className="touch-pan-y select-none"
      >
        <LineChart
          mode="band"
          points={visible.map((point) => ({ y: point.balance_gbp, lo: point.low_gbp, hi: point.high_gbp }))}
          keyIndex={selectedOffset}
          nowIndex={nowOffset}
          estimated={allVisibleAreEstimates}
          estimatedFromIndex={estimateIsVisible ? estimateOffset : undefined}
          labels={{
            start: monthLabel(visible[0].date),
            key: dayLong(selected.date),
            end: monthLabel(visible[visible.length - 1].date),
          }}
          ticks={ticks}
          baseLabel="£0"
          onPointSelect={selectPoint}
          onPan={pan}
          pointAnnotation={gbp(selected.balance_gbp)}
          riskIntervals={riskIntervals}
          ariaLabel={`Balance timeline from ${dayLong(visible[0].date)} to ${dayLong(visible[visible.length - 1].date)}. Past points are recorded balances; future points are estimates. Selected ${dayLong(selected.date)}: ${selected.estimated ? `most likely ${gbp(selected.balance_gbp)}` : gbp(selected.balance_gbp)}.`}
        />
      </div>
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Pan balance timeline">
        <Pill disabled={safeStart === 0} onClick={() => pan(-1)}>‹ Earlier</Pill>
        <Pill onClick={goToNow}>Now</Pill>
        <Pill disabled={safeStart >= maxStart} onClick={() => pan(1)}>Later ›</Pill>
      </div>
      <p className="text-center text-[13px] text-ink-2">Click a point to inspect its balance. Use the range buttons to zoom and Earlier or Later to pan.</p>
    </Card>
  );
}
