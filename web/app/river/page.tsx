"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SubScreen } from "@/components/Screen";
import { HeroCard } from "@/components/HeroCard";
import { Card, ListCard, TipCard } from "@/components/Cards";
import { Button, Pill } from "@/components/Buttons";
import { LineChart } from "@/components/LineChart";
import { BalanceHistoryChart } from "@/components/BalanceHistoryChart";
import { FallbackCard, Skeleton } from "@/components/Fallback";
import { StormCloudIcon, SunIcon } from "@/components/illustrations";
import { useForecast, useRewind } from "@/lib/hooks";
import { dayLong, dayShort, gbp, oneInN, stateEyebrow, stateLabel } from "@/lib/format";
import type { Forecast } from "@/lib/contracts";

type RangeDays = 7 | 28 | 60;

const RANGE_OPTIONS: { days: RangeDays; label: string }[] = [
  { days: 7, label: "1 week" },
  { days: 28, label: "4 weeks" },
  { days: 60, label: "60 days" },
];

function weekdayDay(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", timeZone: "UTC" });
}

function River({ forecast, initialDay }: { forecast: Forecast; initialDay?: string }) {
  const rewind = useRewind();
  const first = forecast.days[0].date;
  const firstStorm = forecast.days.find((d) => d.state === "storm")?.date;
  const [selected, setSelected] = useState(initialDay ?? firstStorm ?? first);
  const [range, setRange] = useState<RangeDays>(7);
  const [startIndex, setStartIndex] = useState(() => {
    const selectedIndex = forecast.days.findIndex((d) => d.date === (initialDay ?? firstStorm ?? first));
    return Math.max(0, Math.min(forecast.days.length - 7, selectedIndex - 3));
  });
  const [showPast, setShowPast] = useState(false);
  const best = forecast.best_action; // null when there is nothing to suggest (decision 0001 e)
  const payday = best?.date;

  const index = forecast.days.findIndex((d) => d.date === selected);
  const day = forecast.days[index] ?? forecast.days[0];
  const drivers = forecast.drivers.filter((d) => day.driver_ids.includes(d.id));
  const visibleCount = Math.min(range, forecast.days.length);
  const maxStart = Math.max(0, forecast.days.length - visibleCount);
  const safeStart = Math.min(startIndex, maxStart);
  const windowDays = forecast.days.slice(safeStart, safeStart + visibleCount);
  const inWindow = index >= safeStart && index < safeStart + visibleCount;
  const firstTime = Date.parse(`${windowDays[0].date}T00:00:00Z`);
  const lastTime = Date.parse(`${windowDays[windowDays.length - 1].date}T00:00:00Z`);
  const billRisk = forecast.drivers.flatMap((driver) => {
    if (driver.kind !== "bill" || !driver.due_date) return [];
    const dueDay = forecast.days.find((candidate) => candidate.date === driver.due_date);
    if (!dueDay || dueDay.p10 >= 0) return [];
    const dueTime = Date.parse(`${driver.due_date}T00:00:00Z`);
    const windowStart = dueTime - 14 * 24 * 60 * 60 * 1000;
    const span = lastTime - firstTime || 1;
    if (dueTime < firstTime || dueTime > lastTime || windowStart > lastTime) return [];
    return [{ start: Math.max(0, (windowStart - firstTime) / span), end: Math.min(1, (dueTime - firstTime) / span) }];
  });
  const tone = day.state === "clear" ? "clear" : day.state === "cloudy" ? "tight" : "storm";

  const move = (n: number) => {
    const nextIndex = Math.max(0, Math.min(forecast.days.length - 1, index + n));
    const next = forecast.days[nextIndex];
    setSelected(next.date);
    if (nextIndex < safeStart || nextIndex >= safeStart + visibleCount) {
      setStartIndex(Math.max(0, Math.min(maxStart, nextIndex - Math.floor(visibleCount / 2))));
    }
  };

  const zoomTo = (nextRange: RangeDays) => {
    const count = Math.min(nextRange, forecast.days.length);
    setRange(nextRange);
    setShowPast(false);
    setStartIndex(Math.max(0, Math.min(forecast.days.length - count, index - Math.floor(count / 2))));
  };

  const pan = (direction: -1 | 1) => {
    const nextStart = Math.max(0, Math.min(maxStart, safeStart + direction * 7));
    setStartIndex(nextStart);
    setShowPast(false);
    const focusIndex = Math.min(forecast.days.length - 1, nextStart + Math.floor(visibleCount / 2));
    setSelected(forecast.days[focusIndex].date);
  };

  const jumpToNow = () => {
    setStartIndex(0);
    setShowPast(false);
    setSelected(first);
  };

  return (
    <SubScreen title={dayLong(day.date)} backHref="/">
      <HeroCard
        tone={tone}
        eyebrow={stateEyebrow(day.state)}
        headline={day.state === "clear" ? "Looks fine" : `${oneInN(day.p_shortfall)} chance of going short`}
        body={`Most likely: ${gbp(day.p50)} left`}
        icon={day.state === "clear" ? <SunIcon /> : <StormCloudIcon />}
      />

      <Card className="flex flex-col gap-4 px-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-[17px] font-bold">Balance outlook</h2>
            <p className="text-[14px] text-ink-2">Estimated balance · shading shows possible outcomes; red fade marks at-risk bills, darker near the due date</p>
          </div>
          <p className="rounded-full bg-tint-teal px-3 py-1 text-[14px] font-bold">
            Now: {gbp(forecast.starting_balance_gbp ?? forecast.days[0].p50)}
          </p>
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Choose forecast range">
          <Pill pressed={showPast} onClick={() => setShowPast(true)}>Past</Pill>
          {RANGE_OPTIONS.map((option) => (
            <Pill key={option.days} pressed={!showPast && range === option.days} onClick={() => zoomTo(option.days)}>
              {option.label}
            </Pill>
          ))}
        </div>

        {showPast ? (
          rewind.isPending ? (
            <p className="text-[14px] text-ink-2" role="status">Loading past balance…</p>
          ) : rewind.isError ? (
            <p className="text-[14px] text-ink-2" role="status">Past balances could not be loaded.</p>
          ) : (
            <BalanceHistoryChart
              history={rewind.data.history ?? []}
              isDemo={rewind.data.history_is_demo}
              compact
            />
          )
        ) : (
          <>
            <div
              className="touch-pan-y select-none"
              aria-label="Drag or swipe to pan through the forecast"
            >
              <LineChart
                mode="band"
                estimated
                points={windowDays.map((d) => ({ y: d.p50, lo: d.p10, hi: d.p90 }))}
                keyIndex={inWindow ? index - safeStart : undefined}
                nowIndex={safeStart === 0 ? 0 : undefined}
                labels={{
                  start: safeStart === 0 ? "Now" : dayShort(windowDays[0].date),
                  key: inWindow ? dayShort(day.date) : undefined,
                  end: dayShort(windowDays[windowDays.length - 1].date),
                }}
                baseLabel="£0"
                onPointSelect={(pointIndex) => setSelected(windowDays[pointIndex].date)}
                onPan={pan}
                pointAnnotation={inWindow ? gbp(day.p50) : undefined}
                riskIntervals={billRisk}
                ariaLabel={`Balance outlook from ${dayLong(windowDays[0].date)} to ${dayLong(windowDays[windowDays.length - 1].date)}. On ${dayLong(day.date)} it is ${stateLabel(day.state)}: ${oneInN(
                  day.p_shortfall,
                )} chance of going short, most likely ${gbp(day.p50)} left.`}
              />
            </div>
            <div className="grid grid-cols-3 gap-2" role="group" aria-label="Pan through forecast">
              <Pill disabled={safeStart === 0} onClick={() => pan(-1)}>‹ Earlier</Pill>
              <Pill onClick={jumpToNow}>Now</Pill>
              <Pill disabled={safeStart >= maxStart} onClick={() => pan(1)}>Later ›</Pill>
            </div>
            <div className="grid grid-cols-3 gap-2" role="group" aria-label="Select a date">
              <Pill onClick={() => move(-7)} aria-label="Select a day one week earlier">Day −7</Pill>
              <Pill pressed={!!payday && selected === payday} disabled={!payday} onClick={() => {
                if (!payday) return;
                const paydayIndex = forecast.days.findIndex((d) => d.date === payday);
                setSelected(payday);
                if (paydayIndex < safeStart || paydayIndex >= safeStart + visibleCount) {
                  setStartIndex(Math.max(0, Math.min(maxStart, paydayIndex - Math.floor(visibleCount / 2))));
                }
              }}>
                Payday
              </Pill>
              <Pill onClick={() => move(7)} aria-label="Select a day one week later">Day +7</Pill>
            </div>
            <p className="text-center text-[13px] text-ink-2">Drag, swipe, or use Earlier and Later to move through time.</p>
          </>
        )}
      </Card>

      {drivers.length > 0 ? (
        <ListCard
          heading="What causes this"
          rows={drivers.map((d) => ({
            id: d.id,
            label: `${d.label} · ${gbp(d.amount_gbp)}`,
            value: d.due_date
              ? `Due ${dayShort(d.due_date)}`
              : d.window
                ? `${Number(d.window.start.slice(8))} to ${dayShort(d.window.end)}`
                : "",
            due: true,
          }))}
          details={
            <ul className="flex flex-col gap-2">
              {drivers.map((d) => (
                <li key={d.id}>
                  <b>{d.label}:</b> {d.source_note}
                </li>
              ))}
            </ul>
          }
        />
      ) : (
        <Card>
          <p className="text-[16px]">Nothing big is due around this day.</p>
        </Card>
      )}

      {day.state !== "clear" && best && (
        <TipCard>
          Save {gbp(best.amount_gbp)} on payday ({weekdayDay(best.date)}).{" "}
          <b>The storm drops to {oneInN(best.p_after)}.</b>
        </TipCard>
      )}

      <Button href="/pact">Make a pact for this</Button>
    </SubScreen>
  );
}

function RiverPage() {
  const params = useSearchParams();
  const forecast = useForecast();
  if (forecast.isPending)
    return (
      <SubScreen title="Time River" backHref="/">
        <Skeleton />
      </SubScreen>
    );
  if (forecast.isError)
    return (
      <SubScreen title="Time River" backHref="/">
        <FallbackCard error={forecast.error} onRetry={() => forecast.refetch()} />
      </SubScreen>
    );
  return <River forecast={forecast.data} initialDay={params.get("day") ?? undefined} />;
}

export default function Page() {
  return (
    <Suspense>
      <RiverPage />
    </Suspense>
  );
}
