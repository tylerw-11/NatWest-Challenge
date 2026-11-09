"use client";

import { useState } from "react";
import { Card } from "@/components/Cards";
import { Pill } from "@/components/Buttons";
import { LineChart } from "@/components/LineChart";
import { dayLong, gbp } from "@/lib/format";
import type { BalanceHistoryPoint } from "@/lib/contracts";

const RANGES = [
  { weeks: 4, label: "1 month" },
  { weeks: 13, label: "3 months" },
  { weeks: 52, label: "12 months" },
] as const;

const monthLabel = (iso: string, style: "short" | "long" = "short") =>
  new Date(`${iso.slice(0, 7)}-15T12:00:00Z`).toLocaleDateString("en-GB", { month: style, timeZone: "UTC" });
const monthYear = (iso: string) =>
  new Date(`${iso.slice(0, 7)}-15T12:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });

export function BalanceHistoryChart({
  history,
  isDemo = false,
  compact = false,
}: {
  history: BalanceHistoryPoint[];
  isDemo?: boolean;
  compact?: boolean;
}) {
  const weekly = history.filter((_, index) => index % 7 === 0 || index === history.length - 1);
  const [range, setRange] = useState<number>(4);
  const [selectedIndex, setSelectedIndex] = useState(Math.max(0, weekly.length - 1));
  const [startIndex, setStartIndex] = useState(Math.max(0, weekly.length - 4));

  if (history.length === 0) {
    return (
      <Card>
        <h2 className="text-[17px] font-bold">Past balance</h2>
        <p className="mt-1 text-[14px] text-ink-2">There is no historical balance data to show yet.</p>
      </Card>
    );
  }

  const count = Math.min(range, weekly.length);
  const maxStart = Math.max(0, weekly.length - count);
  const safeStart = Math.min(startIndex, maxStart);
  const visible = weekly.slice(safeStart, safeStart + count);
  const safeSelected = Math.max(safeStart, Math.min(weekly.length - 1, selectedIndex));
  const selected = weekly[safeSelected];
  const selectedOffset = safeSelected - safeStart;

  const zoomTo = (weeks: number) => {
    const nextCount = Math.min(weeks, weekly.length);
    const nextStart = Math.max(0, Math.min(weekly.length - nextCount, safeSelected - Math.floor(nextCount / 2)));
    setRange(weeks);
    setStartIndex(nextStart);
  };

  const pan = (direction: -1 | 1) => {
    const step = Math.max(1, Math.floor(count * 0.75));
    const nextStart = Math.max(0, Math.min(maxStart, safeStart + direction * step));
    setStartIndex(nextStart);
    setSelectedIndex(Math.min(weekly.length - 1, nextStart + Math.floor(count / 2)));
  };

  const goToLatest = () => {
    const weeks = Math.min(13, weekly.length);
    setRange(13);
    setStartIndex(Math.max(0, weekly.length - weeks));
    setSelectedIndex(weekly.length - 1);
  };

  const latestOffset = weekly.length - 1 - safeStart;
  const ticks = visible.flatMap((point, index) => {
    const month = point.date.slice(0, 7);
    if (index > 0 && visible[index - 1].date.slice(0, 7) === month) return [];
    return [{ position: visible.length > 1 ? (index / (visible.length - 1)) * 100 : 0, label: monthLabel(point.date) }];
  });

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-[17px] font-bold">Past balance</h2>
        <p className="text-[14px] text-ink-2">
          Weekly balance points · {monthYear(visible[0].date)} to {monthYear(visible[visible.length - 1].date)}
        </p>
      </div>
      {isDemo && <p className="rounded-xl bg-bg px-3 py-2 text-[13px] text-ink-2">Fictional demo history generated from sample transactions.</p>}
      <p className="w-fit rounded-full bg-tint-teal px-3 py-1 text-[14px] font-bold">
        {dayLong(selected.date)} · {gbp(selected.balance_gbp)}
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Zoom historical balance range">
        {RANGES.map((option) => (
            <Pill key={option.weeks} pressed={range === option.weeks} onClick={() => zoomTo(option.weeks)}>
            {option.label}
          </Pill>
        ))}
      </div>
      <div
        className="touch-pan-y select-none"
      >
        <LineChart
          mode="area"
          points={visible.map((point) => ({ y: point.balance_gbp }))}
          keyIndex={selectedOffset}
          nowIndex={latestOffset >= 0 && latestOffset < count ? latestOffset : undefined}
          labels={{
            start: monthLabel(visible[0].date, "long"),
            key: `${monthLabel(selected.date, "long")} · ${gbp(selected.balance_gbp)}`,
            end: monthLabel(visible[visible.length - 1].date, "long"),
          }}
          ticks={ticks}
          baseLabel="£0"
          onPointSelect={(index) => setSelectedIndex(safeStart + index)}
          onPan={pan}
          pointAnnotation={gbp(selected.balance_gbp)}
          ariaLabel={`Past daily balance from ${dayLong(visible[0].date)} to ${dayLong(visible[visible.length - 1].date)}. On ${dayLong(selected.date)} the closing balance was ${gbp(selected.balance_gbp)}.${isDemo ? " Fictional demo data." : ""}`}
        />
      </div>
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Pan through balance history">
        <Pill disabled={safeStart === 0} onClick={() => pan(-1)}>‹ Earlier</Pill>
        <Pill onClick={goToLatest}>Latest</Pill>
        <Pill disabled={safeStart >= maxStart} onClick={() => pan(1)}>Later ›</Pill>
      </div>
      {!compact && <p className="text-center text-[13px] text-ink-2">Use the range buttons to zoom. Drag, swipe, or use Earlier and Later to pan.</p>}
    </div>
  );
}
