"use client";

// /dev/scenarios: pick a mock scenario and see what each call returns and what each
// screen should decide from it. The choice is saved in this browser, so any screen
// that reads through lib/mockApi.ts uses it. ?scenario=<name> in a URL still wins.
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Forecast, PactRule, Rewind, Settings, UIBlock, WeatherState } from "@/lib/contracts";
import { ApiError } from "@/lib/api";
import { applyColourMode } from "@/lib/colour-mode";
import { dayShort, gbp, oneInN, stateLabel } from "@/lib/format";
import { chooseScenario, mockApi, scenarioName } from "@/lib/mockApi";
import {
  bufferBand,
  coveredDays,
  daysBetween,
  firstStorm,
  inStormMode,
  shouldWarn,
  showCalmOffer,
} from "@/lib/thresholds";
import { cn } from "@/lib/utils";
import { APP_SCENARIOS } from "@/mocks/scenarios";

const NAMES = Object.keys(APP_SCENARIOS);
const GROUPS = [...new Set(NAMES.map((n) => APP_SCENARIOS[n].group))];

// Routes from docs/plans/frontend-plan.md
const SCREENS = [
  ["/", "Weather"],
  ["/river", "Time River"],
  ["/pact", "Pact"],
  ["/storm", "Storm mode"],
  ["/rewind", "Rewind"],
  ["/support", "Support"],
  ["/settings", "Settings"],
  ["/login", "Log in"],
  ["/signup/2", "Sign-up"],
  ["/account", "Account"],
] as const;

const RTL = new Set(["ar", "he", "fa", "ur"]);

type Result<T> = { status: "loading" } | { status: "ok"; data: T } | { status: "error"; code: string; message: string };
type Loaded = {
  forecast: Result<Forecast>;
  settings: Result<Settings>;
  rewind: Result<Rewind>;
  pact: Result<PactRule[]>;
  me: Result<unknown>;
  explain: Result<UIBlock>;
};
const LOADING: Loaded = {
  forecast: { status: "loading" },
  settings: { status: "loading" },
  rewind: { status: "loading" },
  pact: { status: "loading" },
  me: { status: "loading" },
  explain: { status: "loading" },
};

async function settle<T>(p: Promise<T>): Promise<Result<T>> {
  try {
    return { status: "ok", data: await p };
  } catch (e) {
    if (e instanceof ApiError) return { status: "error", code: e.code, message: e.message_plain };
    return { status: "error", code: "bad_mock", message: e instanceof Error ? e.message : String(e) };
  }
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const percent = (p: number) => `${+(p * 100).toFixed(2)}%`;

const STATE_CLASS: Record<WeatherState, string> = {
  clear: "bg-clear-hero text-clear-label",
  cloudy: "bg-tight-hero text-tight-label",
  storm: "bg-storm-hero text-storm-label border-storm-label",
};

const card = "rounded-[20px] border border-border bg-surface px-5 py-4";
const cardTitle = "mb-2 text-lg font-bold";
const row = "flex min-h-10 items-center justify-between gap-4 border-t border-divider py-1.5 first:border-t-0";

export default function ScenariosPage() {
  const [active, setActive] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Loaded>(LOADING);

  const load = useCallback(async (name: string) => {
    chooseScenario(name);
    const url = new URL(window.location.href);
    url.searchParams.set("scenario", name);
    window.history.replaceState(null, "", url);
    setActive(name);
    setLoaded(LOADING);
    const [forecast, settings, rewind, pact, me, explain] = await Promise.all([
      settle(mockApi.forecast()),
      settle(mockApi.settings()),
      settle(mockApi.rewind()),
      settle(mockApi.pact()),
      settle(mockApi.me()),
      settle(mockApi.explain()),
    ]);
    if (settings.status === "ok") applyColourMode(settings.data.colour_mode);
    setLoaded({ forecast, settings, rewind, pact, me, explain });
  }, []);

  useEffect(() => {
    const initial = scenarioName();
    void load(initial in APP_SCENARIOS ? initial : "demo");
    return () => applyColourMode("standard");
  }, [load]);

  const index = active ? NAMES.indexOf(active) : 0;
  const step = (by: number) => load(NAMES[(index + by + NAMES.length) % NAMES.length]);
  const sc = active ? APP_SCENARIOS[active] : null;
  const settings = loaded.settings.status === "ok" ? loaded.settings.data : null;
  const lang = settings?.translation ?? undefined;

  return (
    <main className="flex flex-col gap-4 px-5 py-6">
      <header>
        <p className="text-[13px] font-bold tracking-wider text-storm-label">DEV ONLY</p>
        <h1 className="text-[22px] font-bold">Mock scenarios</h1>
        <p className="mt-1 text-ink-2">
          Pick one and every screen that reads through <code>mockApi</code> uses it in this browser.
        </p>
      </header>

      <section className={card} aria-label="Choose a scenario">
        <label className="block font-bold" htmlFor="scenario">
          Scenario {active ? `(${index + 1} of ${NAMES.length})` : ""}
        </label>
        <select
          id="scenario"
          className="mt-2 block min-h-11 w-full rounded-full border border-border bg-bg px-4 font-mono text-sm"
          value={active ?? ""}
          onChange={(e) => load(e.target.value)}
        >
          {GROUPS.map((g) => (
            <optgroup key={g} label={g}>
              {NAMES.filter((n) => APP_SCENARIOS[n].group === g).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {sc ? <p className="mt-2 text-ink-2">{sc.note}</p> : null}
        <div className="mt-3 flex gap-2">
          <button type="button" className="min-h-11 flex-1 rounded-full border border-primary font-bold text-primary" onClick={() => step(-1)}>
            ‹ Previous
          </button>
          <button type="button" className="min-h-11 flex-1 rounded-full border border-primary font-bold text-primary" onClick={() => step(1)}>
            Next ›
          </button>
          <button type="button" className="min-h-11 rounded-full border border-border px-4 text-sm" onClick={() => load("demo")}>
            Demo
          </button>
        </div>
      </section>

      {sc && active ? (
        <>
          <section className={card}>
            <h2 className={cardTitle}>Uses</h2>
            <dl className="flex flex-wrap gap-2 text-sm">
              {(["forecast", "settings", "rewind", "rules", "me"] as const).map((k) => (
                <div key={k} className="flex gap-1 rounded-full border border-divider bg-bg px-3 py-1">
                  <dt className="text-ink-2">{k}</dt>
                  <dd className="font-bold">{sc[k]}</dd>
                </div>
              ))}
              {sc.latencyMs ? (
                <div className="flex gap-1 rounded-full border border-divider bg-bg px-3 py-1">
                  <dt className="text-ink-2">delay</dt>
                  <dd className="font-bold">{sc.latencyMs} ms</dd>
                </div>
              ) : null}
              {sc.fail?.map((f) => (
                <div key={f.path} className="flex gap-1 rounded-full border border-due px-3 py-1 text-due">
                  <dt>fails {f.path}</dt>
                  <dd className="font-bold">{f.error}</dd>
                </div>
              ))}
            </dl>
            <h3 className="mt-4 font-bold">Open a screen with this scenario</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {SCREENS.map(([href, label]) => (
                <Link
                  key={href}
                  href={`${href}?scenario=${active}`}
                  className="inline-flex min-h-11 items-center rounded-full border border-primary px-4 font-bold text-primary"
                >
                  {label}
                </Link>
              ))}
            </div>
            <p className="mt-2 text-[13px] text-ink-2">Screens that aren&apos;t built yet will 404.</p>
          </section>

          <section className={card}>
            <h2 className={cardTitle}>What each call returned</h2>
            <ul>
              {(Object.keys(loaded) as (keyof Loaded)[]).map((k) => {
                const r = loaded[k];
                return (
                  <li key={k} className={row}>
                    <span>{k}</span>
                    {r.status === "loading" ? (
                      <span className="text-ink-2">loading…</span>
                    ) : r.status === "ok" ? (
                      <b className="text-primary">OK</b>
                    ) : (
                      <span className="text-right text-due">
                        <b>{r.code}</b>: {r.message}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          {loaded.forecast.status === "ok" && settings ? <Decisions forecast={loaded.forecast.data} settings={settings} /> : null}
          {loaded.forecast.status === "ok" ? <DayGrid forecast={loaded.forecast.data} /> : null}

          {loaded.explain.status === "ok" ? (
            <section
              className={cn(card, loaded.explain.data.kind === "tip" && "bg-tint-teal")}
              lang={lang}
              dir={lang && RTL.has(lang) ? "rtl" : undefined}
            >
              <h2 className={cardTitle}>Explanation ({loaded.explain.data.kind})</h2>
              <ExplainBlock block={loaded.explain.data} />
              {lang ? <p className="mt-2 text-[13px] text-ink-2">Translation ({lang}) goes beside this; the English stays.</p> : null}
            </section>
          ) : null}

          {loaded.pact.status === "ok" ? <Rules rules={loaded.pact.data} /> : null}
          {loaded.rewind.status === "ok" ? <RewindCard rewind={loaded.rewind.data} /> : null}

          <section className={card}>
            <h2 className={cardTitle}>Raw data</h2>
            {(Object.keys(loaded) as (keyof Loaded)[]).map((k) => (
              <details key={k} className="border-t border-divider py-2 first:border-t-0">
                <summary className="flex min-h-8 cursor-pointer items-center font-bold">{k}</summary>
                <pre className="max-h-80 overflow-auto rounded-xl bg-bg p-3 text-xs">{JSON.stringify(loaded[k], null, 2)}</pre>
              </details>
            ))}
          </section>
        </>
      ) : (
        <p>Loading…</p>
      )}
    </main>
  );
}

function ExplainBlock({ block }: { block: UIBlock }) {
  if (block.kind === "hero")
    return (
      <>
        {block.eyebrow ? <p className="text-[13px] font-bold tracking-wider">{block.eyebrow}</p> : null}
        <p className="text-[22px] font-bold">{block.headline}</p>
        {block.body ? <p>{block.body}</p> : null}
      </>
    );
  if (block.kind === "tip")
    return (
      <p>
        <span aria-hidden="true">💡 </span>
        {block.text} {block.emphasis ? <b>{block.emphasis}</b> : null}
      </p>
    );
  return <pre className="text-xs">{JSON.stringify(block, null, 2)}</pre>;
}

function Decisions({ forecast, settings }: { forecast: Forecast; settings: Settings }) {
  const storm = firstStorm(forecast);
  const warn = shouldWarn(forecast, settings);
  const today = forecast.days[0]?.state ?? "clear";
  const covered = coveredDays(forecast);
  const ba = forecast.best_action;
  const rows: [string, React.ReactNode][] = [
    ["Weather hero", <StateWord key="hero" state={warn ? "storm" : today} />],
    ["Today", <StateWord key="today" state={today} />],
    [
      "First storm",
      storm
        ? `${dayShort(storm.date)} (${plural(daysBetween(forecast.as_of, storm.date), "day")} away), ${oneInN(storm.p_shortfall)}, most likely ${gbp(storm.p50)} left`
        : "none",
    ],
    ["Storm card", `${warn ? "show" : "hide"} (lead ${settings.storm_lead_days} days)`],
    ["Storm mode takes over", inStormMode(forecast) ? "yes" : "no"],
    ["Covered until", `${dayShort(forecast.covered_until)} (${plural(covered, "day")}, ${bufferBand(covered)})`],
    ["Best action", `${ba.action_id} ${gbp(ba.amount_gbp)} on ${dayShort(ba.date)} → ${oneInN(ba.p_after)}`],
    ["Storm threshold", `${settings.storm_threshold} (show the engine's state)`],
    ["Reading level", settings.reading_level],
    ["Colour mode", settings.colour_mode],
    ["Translation", settings.translation ?? "none"],
    ["Read aloud", settings.read_aloud ? "on" : "off"],
    ["Ally", settings.ally ? `${settings.ally.name} (${settings.ally.relation})` : "none"],
    ["Calm mode offer", showCalmOffer(settings) ? "show" : "hide"],
    ["Calm mode", settings.calm_mode ? "on" : "off"],
  ];
  return (
    <section className={card}>
      <h2 className={cardTitle}>What the screens should decide</h2>
      <ul>
        {rows.map(([k, v]) => (
          <li key={k} className={row}>
            <span>{k}</span>
            <b className="text-right">{v}</b>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StateWord({ state }: { state: WeatherState }) {
  const tone = state === "clear" ? "text-clear-label" : state === "cloudy" ? "text-tight-label" : "text-storm-label";
  return (
    <span className={tone}>
      {stateLabel(state)} ({state})
    </span>
  );
}

function DayGrid({ forecast }: { forecast: Forecast }) {
  const count = (s: WeatherState) => forecast.days.filter((d) => d.state === s).length;
  return (
    <section className={card}>
      <h2 className={cardTitle}>All {forecast.days.length} days</h2>
      <p className="text-[13px] text-ink-2">
        {count("clear")} fine, {count("cloudy")} tight, {count("storm")} storm. Hover or focus a day for its figures.
      </p>
      <ol className="mt-2 grid grid-cols-7 gap-1">
        {forecast.days.map((d) => {
          const label = `${dayShort(d.date)}: ${stateLabel(d.state)}, ${oneInN(d.p_shortfall)} chance of going short, most likely ${gbp(d.p50)}`;
          return (
            <li
              key={d.date}
              tabIndex={0}
              title={label}
              aria-label={label}
              className={cn("grid rounded-lg border border-transparent py-1 text-center text-[11px]", STATE_CLASS[d.state])}
            >
              <span className="text-sm font-bold">{Number(d.date.slice(8))}</span>
              <span className="font-bold" aria-hidden="true">
                {d.state === "clear" ? "F" : d.state === "cloudy" ? "T" : "S"}
              </span>
              <span className="tabular-nums" aria-hidden="true">
                {percent(d.p_shortfall)}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-[13px] text-ink-2">F fine (under 10%) · T tight (10% to threshold) · S storm (above)</p>
    </section>
  );
}

function Rules({ rules }: { rules: PactRule[] }) {
  return (
    <section className={card}>
      <h2 className={cardTitle}>Pact rules ({rules.length})</h2>
      {rules.length === 0 ? (
        <p className="text-ink-2">No rules yet: the Pact screen shows the empty text area.</p>
      ) : (
        <ul>
          {rules.map((r) => (
            <li key={r.id} className={row}>
              <span>
                <span className="block text-[13px] text-ink-2">{r.when_label}</span>
                {r.then_label}
              </span>
              <b>{r.confirmed ? "agreed" : "draft"}</b>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RewindCard({ rewind }: { rewind: Rewind }) {
  const max = Math.max(1, ...rewind.months.map((m) => m.extra_gbp));
  return (
    <section className={card}>
      <h2 className={cardTitle}>
        Rewind: {gbp(rewind.total_gbp)} extra, about {gbp(rewind.kept_with_pact_gbp)} kept with a pact
      </h2>
      <ol className="mb-3 grid h-28 grid-cols-12 items-end gap-1" aria-label="Extra costs by month">
        {rewind.months.map((m) => (
          <li key={m.month} className="flex h-full flex-col items-center justify-end gap-1">
            <span className="block w-full rounded-t-md bg-rewind-label" style={{ height: `${Math.max(2, (m.extra_gbp / max) * 100)}%` }} />
            <span className="text-[11px] text-ink-2" aria-hidden="true">
              {m.month.slice(5)}
            </span>
            <span className="sr-only">
              {m.month}: {gbp(m.extra_gbp)}
            </span>
          </li>
        ))}
      </ol>
      <ul>
        {rewind.categories.map((c) => (
          <li key={c.id} className={row}>
            <span>{c.label}</span>
            <b>{gbp(c.total_gbp)}</b>
          </li>
        ))}
      </ul>
    </section>
  );
}
