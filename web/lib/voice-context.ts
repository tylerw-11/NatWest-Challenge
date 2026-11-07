/**
 * What the voice needs to know about the moment on screen, so ElevenLabs can match its tone
 * (engine/speech.py chooses the delivery). api.ts records the latest forecast and settings;
 * read-aloud reads them when someone presses a read-aloud or play button.
 */
import type { Forecast, Settings } from "./contracts";
import { shouldWarn } from "./thresholds";

let lastForecast: Forecast | null = null;
let lastSettings: Settings | null = null;

export function rememberForecast<T extends Forecast>(f: T): T {
  lastForecast = f;
  return f;
}

export function rememberSettings<T extends Settings>(s: T): T {
  lastSettings = s;
  return s;
}

export type VoiceKind = "page" | "note" | "success";

export type VoiceContext = {
  screen: string;
  weather: "clear" | "cloudy" | "storm" | null;
  storm_mode: boolean;
  calm_mode: boolean;
  mood: "good" | "unsure" | "worried" | null;
  kind: VoiceKind;
};

const SCREENS: Record<string, string> = {
  "": "weather",
  river: "river",
  storm: "storm",
  rewind: "rewind",
  pact: "pact",
  support: "support",
  settings: "settings",
  login: "login",
  signup: "signup",
  account: "account",
};

/** The screen, the weather it is about, and what the person chose (calm mode, mood). */
export function voiceContext(kind: VoiceKind = "page"): VoiceContext {
  const first = typeof window === "undefined" ? "" : window.location.pathname.split("/")[1] ?? "";
  const screen = SCREENS[first] ?? "other";
  const f = lastForecast;
  const s = lastSettings;
  let weather: VoiceContext["weather"] = null;
  if (f && ["weather", "river", "storm"].includes(screen)) {
    const anyStorm = f.days.some((d) => d.state === "storm");
    if (screen === "storm") weather = "storm";
    else if (screen === "river") weather = anyStorm ? "storm" : f.days[0]?.state ?? null;
    else weather = s && shouldWarn(f, s) ? "storm" : f.days[0]?.state ?? null;
  }
  return {
    screen,
    weather,
    storm_mode: screen === "storm",
    calm_mode: s?.calm_mode ?? false,
    mood: s?.mood ?? null,
    kind,
  };
}

/** The language on screen (the whole app is translated when one is chosen), for the voice. */
export function voiceLanguage(): string {
  return currentLanguage() ?? "en";
}

/** The chosen language: settings first, then the one picked before logging in (localStorage). */
export function currentLanguage(): string | null {
  if (lastSettings) return lastSettings.translation ?? null;
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem("pact.language");
  } catch {
    return null;
  }
}
