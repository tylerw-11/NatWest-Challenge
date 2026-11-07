"use client";

import NumberFlow from "@number-flow/react";
import { TabScreen } from "@/components/Screen";
import { HeroCard } from "@/components/HeroCard";
import { WeekStrip } from "@/components/WeekStrip";
import { StormCard } from "@/components/StormCard";
import { Tile } from "@/components/Cards";
import { Button } from "@/components/Buttons";
import { FallbackCard, Skeleton } from "@/components/Fallback";
import { StormCloudIcon, SunIcon } from "@/components/illustrations";
import { useForecast, useMe, usePactRules } from "@/lib/hooks";
import { dayLong, dayShort, gbp, stateEyebrow } from "@/lib/format";
import type { Driver, Forecast } from "@/lib/contracts";

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/** "2 bills, 1 quieter week": counted from the storm day's drivers. */
function causeSummary(drivers: Driver[]) {
  const bills = drivers.filter((d) => d.kind === "bill" || d.kind === "letter").length;
  const dips = drivers.filter((d) => d.kind === "income_dip").length;
  const oneOffs = drivers.filter((d) => d.kind === "one_off").length;
  return [
    bills && plural(bills, "bill", "bills"),
    dips && plural(dips, "quieter week", "quieter weeks"),
    oneOffs && plural(oneOffs, "one-off cost", "one-off costs"),
  ]
    .filter(Boolean)
    .join(", ");
}

function driverLine(d: Driver) {
  const when = d.due_date
    ? `due ${dayShort(d.due_date)}`
    : d.window
      ? `${dayShort(d.window.start)} to ${dayShort(d.window.end)}`
      : "";
  // Income dips are a positive size of dip (decision 0001 h), so say "less".
  const amount = d.kind === "income_dip" ? `${gbp(Math.abs(d.amount_gbp))} less` : gbp(d.amount_gbp);
  return `${d.label} · ${amount}${when ? `, ${when}` : ""}`;
}

function WeatherBody({ forecast, ruleCount }: { forecast: Forecast; ruleCount: number }) {
  const today = forecast.days[0];
  const storm = forecast.days.find((d) => d.state === "storm");
  const stormDrivers = storm
    ? forecast.drivers.filter((d) => storm.driver_ids.includes(d.id))
    : [];
  const calmWeek = forecast.days.slice(0, 7).every((d) => d.state === "clear");

  return (
    <>
      <HeroCard
        tone={today.state === "clear" ? "clear" : today.state === "cloudy" ? "tight" : "storm"}
        eyebrow={stateEyebrow(today.state)}
        headline={`You're good until ${dayLong(forecast.covered_until)}`}
        body={calmWeek ? "Enjoy a calm week." : "Some days ahead are tight."}
        icon={today.state === "clear" ? <SunIcon /> : <StormCloudIcon />}
      />

      <WeekStrip days={forecast.days} />

      {storm && <StormCard date={storm.date} />}

      <div className="flex gap-4">
        <Tile
          label="Safety buffer"
          value={<NumberFlow value={forecast.buffer_days} suffix={forecast.buffer_days === 1 ? " day" : " days"} />}
        />
        <Tile label="Pact rules on" value={ruleCount} />
      </div>

      {storm && stormDrivers.length > 0 && (
        <details className="rounded-card border border-border bg-surface px-5">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 text-[17px] [&::-webkit-details-marker]:hidden">
            <span>
              Why the storm? <b>{causeSummary(stormDrivers)}</b>
            </span>
            <span className="shrink-0 font-bold text-primary">See more</span>
          </summary>
          <ul className="border-t border-divider pt-2 pb-4 text-[16px]">
            {stormDrivers.map((d) => (
              <li key={d.id} className="py-1.5">
                {driverLine(d)}
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* "It" is the storm: with no storm there is nothing to get ready for. */}
      {storm ? <Button href="/pact">Get ready for it</Button> : null}
    </>
  );
}

export default function WeatherPage() {
  const forecast = useForecast();
  const me = useMe();
  const rules = usePactRules();
  const ruleCount = rules.data?.filter((r) => r.confirmed).length ?? 0;

  return (
    <TabScreen title={me.data ? `Hi ${me.data.user.name}` : "Hi"} emoji="👋" showSettings>
      {forecast.isPending ? (
        <Skeleton />
      ) : forecast.isError ? (
        <FallbackCard error={forecast.error} onRetry={() => forecast.refetch()} />
      ) : (
        <WeatherBody forecast={forecast.data} ruleCount={ruleCount} />
      )}
    </TabScreen>
  );
}
