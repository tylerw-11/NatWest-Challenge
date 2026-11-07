// UI threshold decisions in one place, so every screen decides the same way.
// Wording ("1 in N", fine/tight/storm) lives in lib/format.ts; this file only decides.
// The weather rule mirrors the engine (engine/forecast.py): screens show the engine's
// `state` and never recompute it. weatherState() is for mocks and tests.
import type { Day, Forecast, Settings, WeatherState } from "./contracts";

export const CLEAR_BELOW = 0.1; // p < 0.10 -> clear ("fine")
export const DEFAULT_STORM_THRESHOLD = 0.3; // p <= threshold -> cloudy ("tight"); above -> storm

export function weatherState(p: number, threshold = DEFAULT_STORM_THRESHOLD): WeatherState {
  if (p < CLEAR_BELOW) return "clear";
  if (p <= threshold) return "cloudy";
  return "storm";
}

export function daysBetween(fromIso: string, toIso: string): number {
  const utc = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  return Math.round((utc(toIso) - utc(fromIso)) / 86_400_000);
}

export function firstStorm(f: Forecast): Day | null {
  return f.days.find((d) => d.state === "storm") ?? null;
}

/**
 * Show the storm card / warning? storm_lead_days 14 or 7 = warn that many days ahead;
 * 0 = only on the day itself.
 */
export function shouldWarn(f: Forecast, s: Pick<Settings, "storm_lead_days">): boolean {
  const storm = firstStorm(f);
  return !!storm && daysBetween(f.as_of, storm.date) <= s.storm_lead_days;
}

/** Storm mode takes over the app when the storm is today or tomorrow. (Team to confirm.) */
export const STORM_MODE_WITHIN_DAYS = 1;
export function inStormMode(f: Forecast): boolean {
  const storm = firstStorm(f);
  return !!storm && daysBetween(f.as_of, storm.date) <= STORM_MODE_WITHIN_DAYS;
}

/** Days from as_of to covered_until, both counted. */
export function coveredDays(f: Forecast): number {
  return Math.max(0, daysBetween(f.as_of, f.covered_until) + 1);
}

/** Safety buffer tile band. (Team to confirm the cut-offs.) */
export type BufferBand = "empty" | "low" | "ok" | "good";
export function bufferBand(days: number): BufferBand {
  if (days <= 0) return "empty";
  if (days < 7) return "low";
  if (days < 14) return "ok";
  return "good";
}

/** Support: "Worried" reveals the calm mode offer unless calm mode is already on. */
export function showCalmOffer(s: Pick<Settings, "mood" | "calm_mode">): boolean {
  return s.mood === "worried" && !s.calm_mode;
}

/** Pact changes and account deletion wait 48 hours. */
export const CHANGE_DELAY_HOURS = 48;
