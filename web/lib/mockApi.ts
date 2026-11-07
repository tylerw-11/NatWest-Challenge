// Scenario-aware fake engine. forecast/rewind/settings/me/pactRules match lib/api.ts's `api`
// one for one, so a screen can switch to it with a one-line change in api.ts
// (see docs/decisions/0001-data-contract.md, decision 5). Every response is parsed
// with the same Zod contracts, so a bad mock fails the same way a bad engine would.
//
// Scenario order: ?scenario=<name> in the URL, then the one picked on /dev/scenarios
// (saved in this browser), then NEXT_PUBLIC_MOCK_SCENARIO, then "demo".
import { Forecast, Me, PactRule, PactRules, Rewind, Settings, UIBlock, type ActionKind } from "./contracts";
import { ApiError } from "./api";
import {
  APP_SCENARIOS,
  DEMO_RULES,
  ERRORS,
  EXPLAIN,
  FORECASTS,
  ME,
  PACT_RULES,
  REWINDS,
  SETTINGS,
  type AppScenario,
} from "@/mocks/scenarios";

export const SCENARIO_STORAGE_KEY = "pact.mockScenario";

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

export function scenarioName(): string {
  if (typeof window !== "undefined") {
    const fromUrl = new URLSearchParams(window.location.search).get("scenario");
    if (fromUrl) return fromUrl;
    try {
      const saved = window.localStorage.getItem(SCENARIO_STORAGE_KEY);
      if (saved) return saved;
    } catch {
      /* storage blocked */
    }
  }
  return process.env.NEXT_PUBLIC_MOCK_SCENARIO || "demo";
}

type State = {
  name: string;
  scenario: AppScenario;
  forecastKey: AppScenario["forecast"];
  settings: Settings;
  rules: PactRule[];
};

let state: State | null = null;

/** Load a scenario fresh (in memory only). Unknown names fall back to demo. */
export function resetMocks(name = scenarioName()): State {
  const known = name in APP_SCENARIOS ? name : "demo";
  const scenario = APP_SCENARIOS[known];
  state = {
    name: known,
    scenario,
    forecastKey: scenario.forecast,
    settings: clone(SETTINGS[scenario.settings]),
    rules: clone(PACT_RULES[scenario.rules]),
  };
  return state;
}

/** Load a scenario and remember it for every screen in this browser. */
export function chooseScenario(name: string): State {
  try {
    window.localStorage.setItem(SCENARIO_STORAGE_KEY, name);
  } catch {
    /* storage blocked: still switch for this page */
  }
  return resetMocks(name);
}

const s = (): State => state ?? resetMocks();

export function currentScenario() {
  return { name: s().name, ...s().scenario };
}

async function respond<T>(path: string, make: () => T): Promise<T> {
  const st = s();
  await new Promise((r) => setTimeout(r, st.scenario.latencyMs ?? 120));
  const fail = st.scenario.fail?.find((f) => path.startsWith(f.path));
  if (fail) {
    const e = ERRORS[fail.error];
    throw new ApiError(e.code, e.message_plain);
  }
  return make();
}

export const mockApi = {
  // Same names as `api` in lib/api.ts
  forecast: () => respond("/forecast", () => Forecast.parse(clone(FORECASTS[s().forecastKey]))),
  rewind: () => respond("/rewind", () => Rewind.parse(clone(REWINDS[s().scenario.rewind]))),
  settings: () => respond("/settings", () => Settings.parse(clone(s().settings))),

  me: () => respond("/me", () => Me.parse(clone(ME[s().scenario.me]))),
  pactRules: () => respond("/pact", () => PactRules.parse(clone(s().rules))),

  // Endpoints api.ts does not have yet
  putSettings: (patch: Partial<Settings>) =>
    respond("/settings", () => (s().settings = Settings.parse({ ...s().settings, ...patch }))),
  drivers: (day: string) =>
    respond(`/drivers/${day}`, () => {
      const f = FORECASTS[s().forecastKey];
      const ids = f.days.find((x) => x.date === day)?.driver_ids ?? [];
      return clone(f.drivers.filter((x) => ids.includes(x.id)));
    }),
  /** Free text to one draft rule from the closed list of five actions, or a rephrase error. */
  parsePact: (text: string) =>
    respond("/pact/parse", () => {
      const t = text.toLowerCase();
      const kind: ActionKind | null = /takeaway|spend|food/.test(t)
        ? "category_cap"
        : /wait|klarna|pay.?later|credit|borrow/.test(t)
          ? "credit_pause_hours"
          : /tell|sister|brother|friend|ally|not okay/.test(t)
            ? "notify_ally"
            : /aside|save|buffer|payday/.test(t)
              ? "move_to_buffer"
              : null;
      const pick = kind && DEMO_RULES.find((r) => r.action.kind === kind);
      if (!pick) throw new ApiError(ERRORS.rephrase.code, ERRORS.rephrase.message_plain);
      return [PactRule.parse({ ...clone(pick), id: `draft_${pick.id}`, confirmed: false })];
    }),
  agreePact: (rules: PactRule[]) =>
    respond("/pact", () => (s().rules = rules.map((r) => PactRule.parse({ ...r, confirmed: true })))),
  explain: () =>
    respond("/explain", () => {
      const f = FORECASTS[s().forecastKey];
      const block = f.days.some((x) => x.state === "storm") ? EXPLAIN[s().settings.reading_level] : EXPLAIN.fallback;
      return UIBlock.parse(clone(block));
    }),
  /** Demo step 5-7: moving £15 turns the 23 March storm tight. */
  moveToBuffer: (amount_gbp: number) =>
    respond("/actions/move-to-buffer", () => {
      if (s().forecastKey === "demo" && amount_gbp >= 15) s().forecastKey = "demo_after_buffer";
      return Forecast.parse(clone(FORECASTS[s().forecastKey]));
    }),
};

export type MockApi = typeof mockApi;
