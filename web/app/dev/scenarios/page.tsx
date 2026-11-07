"use client";
// /dev/scenarios: pick a mock scenario for every screen, and preview what each screen
// should decide from it (hero state, warnings, Storm mode, buffer band, errors).
// The choice is saved in this browser, so every screen built on mockApi picks it up.
// ?scenario=<name> in any URL still wins over the saved choice.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Forecast, PactRule, Rewind, Settings } from "@/lib/contracts";
import { ApiError, chooseScenario, listScenarios, mockApi, scenarioName } from "@/lib/mockApi";
import {
  STATE_LABEL,
  bufferBand,
  coveredDays,
  daysBetween,
  firstStorm,
  heroState,
  inStormMode,
  oneInN,
  shouldWarn,
  showCalmOffer,
} from "@/lib/thresholds";
import { APP_SCENARIOS } from "@/mocks/scenarios";
import css from "./scenarios.module.css";

const GROUPS: { title: string; names: string[] }[] = [
  { title: "Demo path", names: ["demo", "demo_after_buffer", "storm_mode"] },
  { title: "Weather states", names: ["all_clear", "tight_only", "storm_today", "two_storms"] },
  { title: "Warning lead time", names: ["storm_far_lead14", "storm_in_7_lead7", "storm_in_7_lead0"] },
  { title: "Threshold edges", names: ["boundaries", "boundaries_sensitive"] },
  { title: "Data edge cases", names: ["all_driver_kinds", "storm_no_drivers", "short_horizon", "wealthy"] },
  { title: "People and settings", names: ["new_user", "worried", "calm_mode", "detailed", "translated_rtl", "colour_blind", "high_contrast", "bank_disconnected"] },
  { title: "Pact rules", names: ["drafts", "pending_change", "parse_rejects"] },
  { title: "Loading and errors", names: ["slow", "offline", "forecast_500", "explain_fails", "logged_out"] },
];

const SCREENS = [
  { href: "/", label: "Weather" },
  { href: "/time-river", label: "Time River" },
  { href: "/pact", label: "Pact" },
  { href: "/storm", label: "Storm mode" },
  { href: "/rewind", label: "Rewind" },
  { href: "/support", label: "Support" },
  { href: "/settings", label: "Settings" },
  { href: "/login", label: "Log in" },
  { href: "/signup", label: "Sign-up" },
  { href: "/account", label: "Account" },
];

const RTL = new Set(["ar", "he", "fa", "ur"]);

type Result<T> = { status: "loading" } | { status: "ok"; data: T } | { status: "error"; code: string; message: string };

type Loaded = {
  forecast: Result<Forecast>;
  settings: Result<Settings>;
  rewind: Result<Rewind>;
  rules: Result<PactRule[]>;
  me: Result<Awaited<ReturnType<typeof mockApi.me>>>;
  explain: Result<Awaited<ReturnType<typeof mockApi.explain>>>;
};

const LOADING: Loaded = {
  forecast: { status: "loading" },
  settings: { status: "loading" },
  rewind: { status: "loading" },
  rules: { status: "loading" },
  me: { status: "loading" },
  explain: { status: "loading" },
};

async function settle<T>(p: Promise<T>): Promise<Result<T>> {
  try {
    return { status: "ok", data: await p };
  } catch (e) {
    if (e instanceof ApiError) return { status: "error", code: e.body.code, message: e.body.message_plain };
    return { status: "error", code: "bad_mock", message: e instanceof Error ? e.message : String(e) };
  }
}

const gbp = (n: number) =>
  n.toLocaleString("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: n % 1 ? 2 : 0 });

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export default function ScenariosPage() {
  const all = useMemo(() => listScenarios(), []);
  const [active, setActive] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [loaded, setLoaded] = useState<Loaded>(LOADING);

  const load = useCallback(async (name: string) => {
    chooseScenario(name);
    const url = new URL(window.location.href);
    url.searchParams.set("scenario", name);
    window.history.replaceState(null, "", url);
    setActive(name);
    setLoaded(LOADING);
    const [forecast, settings, rewind, rules, me] = await Promise.all([
      settle(mockApi.getForecast()),
      settle(mockApi.getSettings()),
      settle(mockApi.getRewind()),
      settle(mockApi.getPact()),
      settle(mockApi.me()),
    ]);
    const explain = await settle(mockApi.explain(forecast.status === "ok" ? forecast.data.id : ""));
    setLoaded({ forecast, settings, rewind, rules, me, explain });
  }, []);

  useEffect(() => {
    const initial = scenarioName();
    void load(APP_SCENARIOS[initial] ? initial : "demo");
  }, [load]);

  const grouped = useMemo(() => {
    const listed = new Set(GROUPS.flatMap((g) => g.names));
    const extra = all.map((s) => s.name).filter((n) => !listed.has(n));
    const groups = extra.length ? [...GROUPS, { title: "Other", names: extra }] : GROUPS;
    const q = filter.trim().toLowerCase();
    return groups
      .map((g) => ({
        ...g,
        names: g.names.filter((n) => APP_SCENARIOS[n] && (!q || n.includes(q) || APP_SCENARIOS[n].note.toLowerCase().includes(q))),
      }))
      .filter((g) => g.names.length);
  }, [all, filter]);

  const sc = active ? APP_SCENARIOS[active] : null;
  const settings = loaded.settings.status === "ok" ? loaded.settings.data : null;
  const lang = settings?.translation ?? undefined;

  return (
    <div className={css.page}>
      <header className={css.top}>
        <div>
          <p className={css.eyebrow}>DEV ONLY</p>
          <h1 className={css.title}>Mock scenarios</h1>
          <p className={css.sub}>
            Pick one and every screen that reads from <code>mockApi</code> uses it in this browser. A{" "}
            <code>?scenario=</code> in a URL wins over this choice.
          </p>
        </div>
        <button type="button" className={css.secondary} onClick={() => load("demo")}>
          Reset to demo
        </button>
      </header>

      <div className={css.layout}>
        <nav className={css.picker} aria-label="Scenarios">
          <label className={css.filterLabel}>
            Filter
            <input
              className={css.filter}
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="storm, error, colour…"
            />
          </label>
          {grouped.map((g) => (
            <section key={g.title} className={css.group}>
              <h2 className={css.groupTitle}>{g.title}</h2>
              <ul className={css.list}>
                {g.names.map((n) => (
                  <li key={n}>
                    <button
                      type="button"
                      className={css.option}
                      aria-pressed={n === active}
                      onClick={() => load(n)}
                    >
                      <span className={css.optionName}>{n}</span>
                      <span className={css.optionNote}>{APP_SCENARIOS[n].note}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </nav>

        <main
          className={css.preview}
          data-colour-mode={settings?.colour_mode ?? "standard"}
          aria-live="polite"
          aria-busy={loaded.forecast.status === "loading"}
        >
          {sc && active ? (
            <>
              <section className={css.card}>
                <h2 className={css.cardTitle}>{active}</h2>
                <p className={css.note}>{sc.note}</p>
                <dl className={css.chips}>
                  <Chip k="forecast" v={sc.forecast} />
                  <Chip k="settings" v={sc.settings} />
                  <Chip k="rewind" v={sc.rewind} />
                  <Chip k="rules" v={sc.rules} />
                  <Chip k="me" v={sc.me} />
                  {sc.latencyMs ? <Chip k="latency" v={`${sc.latencyMs} ms`} /> : null}
                  {sc.fail?.map((f) => <Chip key={f.path} k={`fails ${f.path}`} v={f.error} alert />)}
                </dl>
                <div className={css.screens}>
                  {SCREENS.map((s) => (
                    <a key={s.href} className={css.pill} href={`${s.href}?scenario=${active}`}>
                      {s.label}
                    </a>
                  ))}
                </div>
                <p className={css.small}>Screen links open with this scenario. They 404 until each screen is built.</p>
              </section>

              <Endpoints loaded={loaded} />

              {loaded.forecast.status === "ok" && settings ? (
                <Decisions forecast={loaded.forecast.data} settings={settings} />
              ) : null}

              {loaded.forecast.status === "ok" ? <DayGrid forecast={loaded.forecast.data} /> : null}

              {loaded.explain.status === "ok" ? (
                <section className={css.card} lang={lang} dir={lang && RTL.has(lang) ? "rtl" : undefined}>
                  <h2 className={css.cardTitle}>Explanation block ({loaded.explain.data.kind})</h2>
                  {"headline" in loaded.explain.data ? (
                    <p className={css.headline}>{loaded.explain.data.headline}</p>
                  ) : null}
                  <p>{loaded.explain.data.body}</p>
                  {lang ? <p className={css.small}>Translation ({lang}) renders beside this; the English stays on screen.</p> : null}
                </section>
              ) : null}

              {loaded.rules.status === "ok" ? <Rules rules={loaded.rules.data} /> : null}
              {loaded.rewind.status === "ok" ? <RewindCard rewind={loaded.rewind.data} /> : null}

              <section className={css.card}>
                <h2 className={css.cardTitle}>Raw data</h2>
                {(Object.keys(loaded) as (keyof Loaded)[]).map((k) => (
                  <details key={k} className={css.raw}>
                    <summary>{k}</summary>
                    <pre>{JSON.stringify(loaded[k], null, 2)}</pre>
                  </details>
                ))}
              </section>
            </>
          ) : (
            <p>Loading…</p>
          )}
        </main>
      </div>
    </div>
  );
}

function Chip({ k, v, alert }: { k: string; v: string; alert?: boolean }) {
  return (
    <div className={alert ? `${css.chip} ${css.chipAlert}` : css.chip}>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}

function Endpoints({ loaded }: { loaded: Loaded }) {
  return (
    <section className={css.card}>
      <h2 className={css.cardTitle}>What each call returned</h2>
      <ul className={css.rows}>
        {(Object.keys(loaded) as (keyof Loaded)[]).map((k) => {
          const r = loaded[k];
          return (
            <li key={k} className={css.row}>
              <span>{k}</span>
              {r.status === "loading" ? (
                <span className={css.muted}>loading…</span>
              ) : r.status === "ok" ? (
                <b className={css.ok}>OK</b>
              ) : (
                <span className={css.err}>
                  <b>{r.code}</b>: {r.message}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Decisions({ forecast, settings }: { forecast: Forecast; settings: Settings }) {
  const storm = firstStorm(forecast);
  const hero = heroState(forecast, settings);
  const covered = coveredDays(forecast);
  const rows: [string, React.ReactNode][] = [
    ["Weather hero", <StateWord key="h" state={hero} />],
    ["Today", <StateWord key="t" state={forecast.days[0]?.state ?? "clear"} />],
    [
      "First storm",
      storm ? `${shortDate(storm.date)} (${plural(daysBetween(forecast.as_of, storm.date), "day")} away), ${oneInN(storm.p_shortfall)} chance of going short` : "none",
    ],
    ["Warn the user (storm card)", `${shouldWarn(forecast, settings) ? "yes" : "no"} (lead ${settings.storm_lead_days} days)`],
    ["Storm mode takes over", inStormMode(forecast) ? "yes" : "no"],
    ["Covered until", `${shortDate(forecast.covered_until)} (${plural(covered, "day")}, ${bufferBand(covered)})`],
    [
      "Best action",
      forecast.best_action
        ? `${forecast.best_action.action_id} ${gbp(forecast.best_action.amount_gbp)} on ${shortDate(forecast.best_action.date)} → ${oneInN(forecast.best_action.p_after)}`
        : "none (hide the button)",
    ],
    ["Starting balance", forecast.starting_balance_gbp != null ? gbp(forecast.starting_balance_gbp) : "not given"],
    ["Storm threshold", `${settings.storm_threshold} (UI shows the engine's state, never recomputes)`],
    ["Reading level", settings.reading_level],
    ["Colour mode", settings.colour_mode],
    ["Translation", settings.translation ?? "none"],
    ["Ally", settings.ally ? `${settings.ally.name} (${settings.ally.relation})` : "none"],
    ["Calm mode offer (Support)", showCalmOffer(settings) ? "show" : "hide"],
    ["Calm mode", settings.calm_mode ? "on" : "off"],
  ];
  return (
    <section className={css.card}>
      <h2 className={css.cardTitle}>What the screens should decide</h2>
      <ul className={css.rows}>
        {rows.map(([k, v]) => (
          <li key={k} className={css.row}>
            <span>{k}</span>
            <b>{v}</b>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StateWord({ state }: { state: Forecast["days"][number]["state"] }) {
  return (
    <span className={css[`state_${state}`]}>
      {STATE_LABEL[state].word} ({state})
    </span>
  );
}

function DayGrid({ forecast }: { forecast: Forecast }) {
  const counts = forecast.days.reduce<Record<string, number>>((a, d) => ((a[d.state] = (a[d.state] ?? 0) + 1), a), {});
  return (
    <section className={css.card}>
      <h2 className={css.cardTitle}>All {forecast.days.length} days</h2>
      <p className={css.small}>
        {counts.clear ?? 0} fine, {counts.cloudy ?? 0} tight, {counts.storm ?? 0} storm. Hover or focus a day for its figures.
      </p>
      <ol className={css.grid}>
        {forecast.days.map((d) => {
          const chance = oneInN(d.p_shortfall) ?? "no chance";
          const label = `${shortDate(d.date)}: ${STATE_LABEL[d.state].word}, ${chance} of going short, middle guess ${gbp(d.p50)}`;
          return (
            <li key={d.date} className={`${css.day} ${css[`day_${d.state}`]}`} title={label} tabIndex={0} aria-label={label}>
              <span className={css.dayDate}>{new Date(`${d.date}T00:00:00Z`).getUTCDate()}</span>
              <span className={css.dayState} aria-hidden="true">
                {d.state === "clear" ? "F" : d.state === "cloudy" ? "T" : "S"}
              </span>
              <span className={css.dayP} aria-hidden="true">
                {+(d.p_shortfall * 100).toFixed(2)}%
              </span>
            </li>
          );
        })}
      </ol>
      <p className={css.small}>F fine (under 10%) · T tight (10% to threshold) · S storm (above threshold)</p>
    </section>
  );
}

function Rules({ rules }: { rules: PactRule[] }) {
  return (
    <section className={css.card}>
      <h2 className={css.cardTitle}>Pact rules ({rules.length})</h2>
      {rules.length === 0 ? (
        <p className={css.muted}>No rules yet: Pact screen shows the empty text area.</p>
      ) : (
        <ul className={css.rows}>
          {rules.map((r) => (
            <li key={r.id} className={css.row}>
              <span>
                {r.when_label}, {r.then_label.toLowerCase()}
                {r.change_requested_at ? <span className={css.small}> · change waits 48 hours (from {r.active_from})</span> : null}
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
    <section className={css.card}>
      <h2 className={css.cardTitle}>
        Rewind: {gbp(rewind.total_gbp)} extra, {gbp(rewind.kept_with_pact_gbp)} kept with a pact
      </h2>
      <ol className={css.bars} aria-label="Extra costs by month">
        {rewind.months.map((m) => (
          <li key={m.month} className={css.barItem}>
            <span className={css.bar} style={{ height: `${(m.extra_gbp / max) * 100}%` }} />
            <span className={css.barLabel}>{m.month.slice(5)}</span>
            <span className={css.srOnly}>
              {m.month}: {gbp(m.extra_gbp)}
            </span>
          </li>
        ))}
      </ol>
      <ul className={css.rows}>
        {rewind.categories.map((c) => (
          <li key={c.id} className={css.row}>
            <span>{c.label}</span>
            <b>{gbp(c.total_gbp)}</b>
          </li>
        ))}
      </ul>
    </section>
  );
}
