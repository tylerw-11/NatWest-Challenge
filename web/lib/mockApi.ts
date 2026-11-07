// In-memory fake of the engine. Same function names the real web/lib/api.ts should export,
// so screens can swap between them with USE_MOCKS. Every response is Zod-validated,
// so a bad mock fails loudly instead of rendering wrong numbers.
//
// Pick a scenario:  ?scenario=storm_mode  in the URL, or NEXT_PUBLIC_MOCK_SCENARIO=storm_mode.
// List them all:    listScenarios()
import {
  ErrorBody,
  Forecast,
  PactRule,
  Rewind,
  Settings,
  type Driver,
} from "./contracts";
import {
  APP_SCENARIOS,
  ERRORS,
  EXPLAIN,
  FORECASTS,
  ME,
  PACT_NOTE,
  PACT_RULES,
  REWINDS,
  SESSIONS,
  SETTINGS,
  DEMO_RULES,
  type AppScenario,
} from "../mocks/scenarios";

export class ApiError extends Error {
  constructor(public body: ErrorBody, public status: number) {
    super(body.message_plain);
  }
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

export const SCENARIO_STORAGE_KEY = "pact.mockScenario";

function envScenario(): string | undefined {
  try {
    // Written out in full so Next.js can inline it at build time.
    return process.env.NEXT_PUBLIC_MOCK_SCENARIO;
  } catch {
    return undefined;
  }
}

/** Order: ?scenario= in the URL, then the one picked on /dev/scenarios, then the env var, then demo. */
export function scenarioName(): string {
  if (typeof window !== "undefined") {
    const q = new URLSearchParams(window.location.search).get("scenario");
    if (q) return q;
    try {
      const saved = window.localStorage.getItem(SCENARIO_STORAGE_KEY);
      if (saved) return saved;
    } catch {
      /* storage blocked: fall through */
    }
  }
  return envScenario() || "demo";
}

/** Remember a scenario for every screen in this browser (used by /dev/scenarios). */
export function chooseScenario(name: string): State {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(SCENARIO_STORAGE_KEY, name);
    } catch {
      /* storage blocked: still switch for this page */
    }
  }
  return resetMocks(name);
}

type State = {
  name: string;
  scenario: AppScenario;
  forecastKey: AppScenario["forecast"];
  settings: Settings;
  rules: PactRule[];
  ally: Settings["ally"];
};

let state: State | null = null;

export function resetMocks(name = scenarioName()): State {
  const scenario = APP_SCENARIOS[name] ?? APP_SCENARIOS.demo;
  const settings = clone(SETTINGS[scenario.settings]);
  state = {
    name: APP_SCENARIOS[name] ? name : "demo",
    scenario,
    forecastKey: scenario.forecast,
    settings,
    rules: clone(PACT_RULES[scenario.rules]),
    ally: settings.ally,
  };
  return state;
}

function s(): State {
  return state ?? resetMocks();
}

export function listScenarios() {
  return Object.entries(APP_SCENARIOS).map(([name, sc]) => ({ name, ...sc }));
}

export function currentScenario(): { name: string; scenario: AppScenario } {
  const st = s();
  return { name: st.name, scenario: st.scenario };
}

async function respond<T>(path: string, make: () => T): Promise<T> {
  const st = s();
  const delay = st.scenario.latencyMs ?? 150;
  await new Promise((r) => setTimeout(r, delay));
  const fail = st.scenario.fail?.find((x) => path.startsWith(x.path));
  if (fail) {
    const status = fail.error === "unauthorised" ? 401 : fail.error === "rephrase" ? 422 : fail.error === "network" ? 0 : 500;
    throw new ApiError(ERRORS[fail.error], status);
  }
  return make();
}

const plusHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

export const mockApi = {
  authDemo: () => respond("/auth/demo", () => undefined),
  logout: () => respond("/auth/logout", () => undefined),
  me: () => respond("/me", () => clone(ME[s().scenario.me])),

  getSettings: () => respond("/settings", () => Settings.parse(clone(s().settings))),
  putSettings: (patch: Partial<Settings>) =>
    respond("/settings", () => {
      s().settings = Settings.parse({ ...s().settings, ...patch });
      return clone(s().settings);
    }),

  getForecast: () => respond("/forecast", () => Forecast.parse(clone(FORECASTS[s().forecastKey]))),
  getDrivers: (day: string): Promise<Driver[]> =>
    respond(`/drivers/${day}`, () => {
      const fc = FORECASTS[s().forecastKey];
      const ids = fc.days.find((d) => d.date === day)?.driver_ids ?? [];
      return clone(fc.drivers.filter((d) => ids.includes(d.id)));
    }),

  getRewind: () => respond("/rewind", () => Rewind.parse(clone(REWINDS[s().scenario.rewind]))),

  parsePact: (text: string) =>
    respond("/pact/parse", () => {
      const t = text.toLowerCase();
      const pick =
        /takeaway|spend|food|cap/.test(t) ? DEMO_RULES[0]
        : /wait|klarna|pay.?later|credit/.test(t) ? DEMO_RULES[1]
        : /tell|brother|sister|friend|ally|not okay/.test(t) ? DEMO_RULES[2]
        : /aside|save|buffer|payday/.test(t) ? DEMO_RULES[3]
        : null;
      if (!pick) throw new ApiError(ERRORS.rephrase, 422);
      return [PactRule.parse({ ...clone(pick), id: `draft-${Date.now()}`, confirmed: false })];
    }),
  getPact: () => respond("/pact", () => clone(s().rules)),
  agreePact: (rules: PactRule[]) =>
    respond("/pact", () => {
      s().rules = rules.map((r) => PactRule.parse({ ...r, confirmed: true }));
      return clone(s().rules);
    }),
  /** Changes and deletes wait 48 hours: the rule stays on with change_requested_at set. */
  patchPact: (id: string, patch: Partial<PactRule>) =>
    respond(`/pact/${id}`, () => {
      const r = s().rules.find((x) => x.id === id);
      if (!r) throw new ApiError({ code: "not_found", message_plain: "We can't find that rule." }, 404);
      Object.assign(r, { change_requested_at: new Date().toISOString(), active_from: plusHours(48).slice(0, 10), pending: patch });
      return clone(r);
    }),
  deletePact: (id: string) => mockApi.patchPact(id, { confirmed: false }),
  saveNote: (text: string) => respond("/pact/note", () => ({ ...PACT_NOTE, text })),
  getNote: () => respond("/pact/note", () => clone(PACT_NOTE)),

  /** Demo fast-forward. Jumps to the storm-tomorrow forecast and reports which rules fired. */
  simulate: (_asOf: string) =>
    respond("/simulate", () => {
      s().forecastKey = "storm_tomorrow";
      return { forecast: Forecast.parse(clone(FORECASTS.storm_tomorrow)), fired_rule_ids: s().rules.filter((r) => r.confirmed && r.trigger.kind === "storm_probability").map((r) => r.id) };
    }),
  moveToBuffer: (amount_gbp: number) =>
    respond("/actions/move-to-buffer", () => {
      if (s().forecastKey === "demo" && amount_gbp >= 15) s().forecastKey = "demo_after_buffer";
      return Forecast.parse(clone(FORECASTS[s().forecastKey]));
    }),

  explain: (_forecastId: string) =>
    respond("/explain", () => {
      const fc = FORECASTS[s().forecastKey];
      if (!fc.days.some((d) => d.state === "storm")) return clone(EXPLAIN.fallback);
      return clone(EXPLAIN[s().settings.reading_level]);
    }),

  getAlly: () => respond("/ally", () => clone(s().ally)),
  setAlly: (ally: { name: string; relation: string }) => respond("/ally", () => (s().ally = ally)),
  deleteAlly: () => respond("/ally", () => void (s().ally = null)),

  getSessions: () => respond("/account/sessions", () => clone(SESSIONS)),
  exportAccount: () => respond("/account/export", () => ({ url: "data:application/json,{}" })),
  deleteAccount: () => respond("/account/delete", () => ({ requested_at: new Date().toISOString(), deletes_at: plusHours(48) })),
  cancelDelete: () => respond("/account/delete/cancel", () => undefined),
};

export type MockApi = typeof mockApi;
