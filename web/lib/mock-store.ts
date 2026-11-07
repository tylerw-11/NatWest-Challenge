/**
 * In-browser stand-in for the engine's stored state while USE_MOCKS=true.
 * It survives page reloads within the tab (sessionStorage) so the demo can be
 * clicked through; Shift+R resets it (see PresenterKeys).
 */
import type { PactNote, PactRule, Settings } from "./contracts";
import settingsMock from "@/mocks/settings.json";
import pactMock from "@/mocks/pact.json";

export type ForecastStage = "base" | "simulated" | "after_move";

type State = {
  stage: ForecastStage;
  rules: PactRule[];
  note: PactNote | null;
  settings: Settings;
};

const KEY = "pact-demo-state";

const initial = (): State => ({
  stage: "base",
  rules: pactMock as PactRule[],
  note: null,
  settings: settingsMock as Settings,
});

let state: State | null = null;

function load(): State {
  if (state) return state;
  try {
    const raw = typeof window !== "undefined" ? window.sessionStorage.getItem(KEY) : null;
    state = raw ? (JSON.parse(raw) as State) : initial();
  } catch {
    state = initial();
  }
  return state;
}

export function getMockState(): State {
  return load();
}

export function setMockState(patch: Partial<State>) {
  state = { ...load(), ...patch };
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable: keep in memory */
  }
}

export function resetMockState() {
  state = initial();
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
