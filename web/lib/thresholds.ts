// Every threshold the UI relies on, in one place.
// These mirror the engine (engine/forecast.py) so the frontend can be tested without it.
// The UI should still show the engine's `state` field; these helpers exist for
// checks, mocks, and derived UI decisions (warn or not, which copy, which tile).
import type { Day, Forecast, Settings, WeatherState } from "./contracts";

export const CLEAR_BELOW = 0.1; // p < 0.10 -> clear
export const DEFAULT_STORM_THRESHOLD = 0.3; // p <= threshold -> cloudy, p > threshold -> storm

/** Same rule as the engine: clear < 0.10 <= cloudy <= threshold < storm. */
export function weatherState(p: number, threshold = DEFAULT_STORM_THRESHOLD): WeatherState {
  if (p < CLEAR_BELOW) return "clear";
  if (p <= threshold) return "cloudy";
  return "storm";
}

/** The words the UI uses. The contract says `cloudy`; the screen says "tight". */
export const STATE_LABEL: Record<WeatherState, { word: string; eyebrow: string }> = {
  clear: { word: "fine", eyebrow: "CLEAR" },
  cloudy: { word: "tight", eyebrow: "TIGHT" },
  storm: { word: "storm", eyebrow: "STORM" },
};

/** Nearest "1 in N". Returns null when there is no chance at all. */
export function oneInN(p: number): string | null {
  if (!(p > 0)) return null;
  if (p >= 0.95) return "almost certain";
  const n = Math.max(2, Math.round(1 / p));
  return `1 in ${n}`;
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.UTC(+fromIso.slice(0, 4), +fromIso.slice(5, 7) - 1, +fromIso.slice(8, 10));
  const b = Date.UTC(+toIso.slice(0, 4), +toIso.slice(5, 7) - 1, +toIso.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

export function firstStorm(f: Forecast): Day | null {
  return f.days.find((d) => d.state === "storm") ?? null;
}

export function worstDay(f: Forecast): Day | null {
  return f.days.reduce<Day | null>((w, d) => (!w || d.p_shortfall > w.p_shortfall ? d : w), null);
}

/**
 * Should the storm card or Storm mode warn the user?
 * storm_lead_days: 14 or 7 = warn that many days ahead; 0 = only on the day itself.
 */
export function shouldWarn(f: Forecast, s: Pick<Settings, "storm_lead_days">): boolean {
  const storm = firstStorm(f);
  if (!storm) return false;
  return daysBetween(f.as_of, storm.date) <= s.storm_lead_days;
}

/** Storm mode takes over the app when the storm is today or tomorrow. */
export const STORM_MODE_WITHIN_DAYS = 1;
export function inStormMode(f: Forecast): boolean {
  const storm = firstStorm(f);
  return !!storm && daysBetween(f.as_of, storm.date) <= STORM_MODE_WITHIN_DAYS;
}

/** Hero state on Weather: today's state, unless a warned storm is coming. */
export function heroState(f: Forecast, s: Pick<Settings, "storm_lead_days">): WeatherState {
  if (shouldWarn(f, s)) return "storm";
  return f.days[0]?.state ?? "clear";
}

/** Days the buffer covers from as_of (inclusive) to covered_until (inclusive). */
export function coveredDays(f: Forecast): number {
  return Math.max(0, daysBetween(f.as_of, f.covered_until) + 1);
}

/** Safety buffer tile band. */
export type BufferBand = "empty" | "low" | "ok" | "good";
export function bufferBand(days: number): BufferBand {
  if (days <= 0) return "empty";
  if (days < 7) return "low";
  if (days < 14) return "ok";
  return "good";
}

/** Support: "Worried" reveals the calm mode offer; calm mode hides charts and figures. */
export function showCalmOffer(s: Pick<Settings, "mood" | "calm_mode">): boolean {
  return s.mood === "worried" && !s.calm_mode;
}

/** The p50 line goes below zero on this day (the UI may want a stronger chart marker). */
export function medianGoesShort(d: Day): boolean {
  return d.p50 < 0;
}

/** Pact changes and account deletion wait 48 hours. */
export const CHANGE_DELAY_HOURS = 48;
export const MAX_RULES = 4;
