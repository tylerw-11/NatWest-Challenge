"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SubScreen } from "@/components/Screen";
import { HeroCard } from "@/components/HeroCard";
import { Card, ListCard, TipCard } from "@/components/Cards";
import { Button, Pill } from "@/components/Buttons";
import { LineChart } from "@/components/LineChart";
import { FallbackCard, Skeleton } from "@/components/Fallback";
import { StormCloudIcon, SunIcon } from "@/components/illustrations";
import { useForecast } from "@/lib/hooks";
import { dayLong, dayShort, gbp, oneInN, stateEyebrow, stateLabel } from "@/lib/format";
import type { Forecast } from "@/lib/contracts";

const WINDOW = 28; // "Your money, next 4 weeks"

function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function weekdayDay(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", timeZone: "UTC" });
}

function River({ forecast, initialDay }: { forecast: Forecast; initialDay?: string }) {
  const first = forecast.days[0].date;
  const last = forecast.days[forecast.days.length - 1].date;
  const firstStorm = forecast.days.find((d) => d.state === "storm")?.date;
  const [selected, setSelected] = useState(initialDay ?? firstStorm ?? first);
  const best = forecast.best_action; // null when there is nothing to suggest (decision 0001 e)
  const payday = best?.date;

  const index = forecast.days.findIndex((d) => d.date === selected);
  const day = forecast.days[index] ?? forecast.days[0];
  const drivers = forecast.drivers.filter((d) => day.driver_ids.includes(d.id));
  const windowDays = forecast.days.slice(0, WINDOW);
  const inWindow = index >= 0 && index < WINDOW;
  const tone = day.state === "clear" ? "clear" : day.state === "cloudy" ? "tight" : "storm";

  const move = (n: number) => {
    const next = addDays(selected, n);
    if (next >= first && next <= last) setSelected(next);
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
        <h2 className="text-[15px] font-bold">Your money, next 4 weeks</h2>
        <LineChart
          mode="band"
          points={windowDays.map((d) => ({ y: d.p50, lo: d.p10, hi: d.p90 }))}
          keyIndex={inWindow ? index : undefined}
          labels={{ start: "Today", key: dayShort(day.date), end: dayShort(windowDays[windowDays.length - 1].date) }}
          baseLabel="£0"
          ariaLabel={`Your money over the next 4 weeks. On ${dayLong(day.date)} it is ${stateLabel(day.state)}: ${oneInN(
            day.p_shortfall,
          )} chance of going short, most likely ${gbp(day.p50)} left.`}
        />
        <div className="grid grid-cols-3 gap-3" role="group" aria-label="Choose a day">
          <Pill onClick={() => move(-7)} aria-label="One week earlier">‹ Week</Pill>
          <Pill pressed={!!payday && selected === payday} disabled={!payday} onClick={() => payday && setSelected(payday)}>
            Payday
          </Pill>
          <Pill onClick={() => move(7)} aria-label="One week later">Week ›</Pill>
        </div>
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
