import type { WeatherState } from "./contracts";

/** Probability to the nearest "1 in N" (invariant 6). 0.33 → "1 in 3". */
export function oneInN(p: number): string {
  if (p <= 0) return "almost no chance";
  const n = Math.max(1, Math.round(1 / p));
  return `1 in ${n}`;
}

/** The engine says `cloudy`; the UI says "tight". The only place this maps. */
export function stateLabel(state: WeatherState): "fine" | "tight" | "storm" {
  return state === "clear" ? "fine" : state === "cloudy" ? "tight" : "storm";
}

/** Eyebrow word on hero cards. */
export function stateEyebrow(state: WeatherState): string {
  return state === "clear" ? "CLEAR" : state === "cloudy" ? "TIGHT" : "STORM";
}

export function gbp(amount: number): string {
  const sign = amount < 0 ? "−" : "";
  const abs = Math.abs(amount);
  return `${sign}£${Number.isInteger(abs) ? abs : abs.toFixed(2)}`;
}

const parse = (iso: string) => new Date(`${iso}T12:00:00Z`);

/** "Thu 19 March" */
export function dayLong(iso: string): string {
  return parse(iso).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

/** "23 Mar" */
export function dayShort(iso: string): string {
  return parse(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** "Tu" style two-letter weekday, as on the week strip. */
export function weekdayTwo(iso: string): string {
  return parse(iso)
    .toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })
    .slice(0, 2);
}
