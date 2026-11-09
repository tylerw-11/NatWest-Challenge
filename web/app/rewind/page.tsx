"use client";

import { useState } from "react";
import { TabScreen } from "@/components/Screen";
import { HeroCard } from "@/components/HeroCard";
import { Card, ListCard, TipCard } from "@/components/Cards";
import { LineChart } from "@/components/LineChart";
import { BalanceTimelineChart } from "@/components/BalanceTimelineChart";
import { Pill } from "@/components/Buttons";
import { FallbackCard, Skeleton } from "@/components/Fallback";
import { RewindClockIcon } from "@/components/illustrations";
import { useForecast, useRewind } from "@/lib/hooks";
import { gbp } from "@/lib/format";
import type { Forecast, Rewind } from "@/lib/contracts";

const monthName = (ym: string, style: "short" | "long" = "short") =>
  new Date(`${ym}-15T12:00:00Z`).toLocaleDateString("en-GB", { month: style, timeZone: "UTC" });

function RewindBody({ rewind, forecast, forecastError }: { rewind: Rewind; forecast?: Forecast; forecastError: boolean }) {
  const peak = rewind.months.reduce((best, m, i) => (m.extra_gbp > rewind.months[best].extra_gbp ? i : best), 0);
  const [range, setRange] = useState<3 | 6 | 12>(3);
  const [startIndex, setStartIndex] = useState(Math.max(0, Math.min(rewind.months.length - 3, peak - 1)));
  const [selectedIndex, setSelectedIndex] = useState(peak);
  const count = Math.min(range, rewind.months.length);
  const maxStart = Math.max(0, rewind.months.length - count);
  const safeStart = Math.min(startIndex, maxStart);
  const visibleMonths = rewind.months.slice(safeStart, safeStart + count);
  const safeSelected = Math.max(safeStart, Math.min(rewind.months.length - 1, selectedIndex));
  const selectedMonth = rewind.months[safeSelected];
  const insurance = rewind.categories.find((c) => c.id === "cat_insurance_monthly");

  const zoomTo = (nextRange: 3 | 6 | 12) => {
    const nextCount = Math.min(nextRange, rewind.months.length);
    setRange(nextRange);
    setStartIndex(Math.max(0, Math.min(rewind.months.length - nextCount, safeSelected - Math.floor(nextCount / 2))));
  };
  const pan = (direction: -1 | 1) => {
    const step = Math.max(1, Math.floor(count * 0.75));
    const nextStart = Math.max(0, Math.min(maxStart, safeStart + direction * step));
    setStartIndex(nextStart);
    setSelectedIndex(Math.min(rewind.months.length - 1, nextStart + Math.floor(count / 2)));
  };
  const goToPeak = () => {
    setSelectedIndex(peak);
    setStartIndex(Math.max(0, Math.min(maxStart, peak - Math.floor(count / 2))));
  };

  return (
    <>
      <HeroCard
        tone="rewind"
        eyebrow="Last 12 months"
        headline={`${gbp(rewind.total_gbp)} extra, just for being short`}
        body={
          <>
            Not your fault. It costs more to have less. <span aria-hidden>💛</span>
          </>
        }
        icon={<RewindClockIcon />}
      >
      </HeroCard>

      <Card className="flex flex-col gap-4 px-5">
        <div>
          <h2 className="text-[17px] font-bold">Extra costs by month</h2>
          <p className="text-[14px] text-ink-2">Zoom in on a few months or pan across the year.</p>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Zoom extra-cost chart">
          {([3, 6, 12] as const).map((months) => (
            <Pill key={months} pressed={range === months} onClick={() => zoomTo(months)}>
              {months} months
            </Pill>
          ))}
        </div>
        <div
          className="touch-pan-y select-none"
        >
          <LineChart
            mode="area"
            points={visibleMonths.map((m) => ({ y: m.extra_gbp }))}
            keyIndex={safeSelected - safeStart}
              onPointSelect={(index) => setSelectedIndex(safeStart + index)}
              onPan={pan}
            pointAnnotation={gbp(selectedMonth.extra_gbp)}
            labels={{
              start: monthName(visibleMonths[0].month),
              key: `${monthName(selectedMonth.month)} · ${gbp(selectedMonth.extra_gbp)}`,
              end: monthName(visibleMonths[visibleMonths.length - 1].month),
            }}
            ariaLabel={`Extra costs by month from ${monthName(visibleMonths[0].month, "long")} to ${monthName(
              visibleMonths[visibleMonths.length - 1].month,
              "long",
            )}. Selected ${monthName(selectedMonth.month, "long")}: ${gbp(selectedMonth.extra_gbp)}. The peak was ${gbp(rewind.months[peak].extra_gbp)} in ${monthName(
              rewind.months[peak].month,
              "long",
            )}.`}
          />
        </div>
        <div className="grid grid-cols-3 gap-2" role="group" aria-label="Pan extra-cost chart">
          <Pill disabled={safeStart === 0} onClick={() => pan(-1)}>‹ Earlier</Pill>
          <Pill onClick={goToPeak}>Peak month</Pill>
          <Pill disabled={safeStart >= maxStart} onClick={() => pan(1)}>Later ›</Pill>
        </div>
      </Card>

      {forecast ? (
        <BalanceTimelineChart
          history={rewind.history ?? []}
          historyIsDemo={rewind.history_is_demo}
          forecast={forecast}
        />
      ) : (
        <Card>
          <h2 className="text-[17px] font-bold">Your projected balance</h2>
          <p className="mt-1 text-[14px] text-ink-2">
            {forecastError ? "Add your money details to see your future balance." : "Loading your forecast…"}
          </p>
        </Card>
      )}

      <ListCard
        heading="Where it went"
        rows={rewind.categories.map((c) => ({ id: c.id, label: c.label, value: gbp(c.total_gbp) }))}
        details={
          <ul className="flex flex-col gap-2">
            {rewind.categories.map((c) => (
              <li key={c.id}>
                <b>{c.label}:</b> {c.source_note}
              </li>
            ))}
          </ul>
        }
      />

      <TipCard>
        With your pact, you&apos;d have kept <b>about {gbp(rewind.kept_with_pact_gbp)}.</b>
        {insurance && <> Paying insurance yearly saves {gbp(insurance.total_gbp)} more.</>}
      </TipCard>
    </>
  );
}

export default function RewindPage() {
  const rewind = useRewind();
  const forecast = useForecast();
  return (
    <TabScreen title="Rewind">
      {rewind.isPending ? (
        <Skeleton />
      ) : rewind.isError ? (
        <FallbackCard error={rewind.error} onRetry={() => rewind.refetch()} />
      ) : (
        <RewindBody rewind={rewind.data} forecast={forecast.data} forecastError={forecast.isError} />
      )}
    </TabScreen>
  );
}
