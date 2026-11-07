// Dummy data for every frontend use case, so screens can be tested before the engine is wired.
// Pick one on /dev/scenarios, or add ?scenario=<name> to any URL.
//
// "demo" IS web/mocks/forecast.json, rewind.json, settings.json, pact.json and me.json (Roh's, with the spec figures);
// every other scenario is a variation that hits a threshold, an edge, or a failure path.
// Everything here must pass lib/contracts.ts (tests in /web-tests check it).
import type { Driver, Forecast, Me, PactRule, Rewind, Settings, UIBlock } from "../lib/contracts";
import { DEFAULT_STORM_THRESHOLD, weatherState } from "../lib/thresholds";
import forecastJson from "./forecast.json";
import rewindJson from "./rewind.json";
import settingsJson from "./settings.json";
import meJson from "./me.json";
import pactJson from "./pact.json";

const demoForecast = forecastJson as Forecast;
const demoRewind = rewindJson as Rewind;
const demoSettings = settingsJson as Settings;
const demoMe = meJson as Me;
const demoRules = pactJson as PactRule[];
const AS_OF = demoForecast.as_of; // 2026-03-10

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

type DayOverride = { p: number; p10?: number; p50?: number; p90?: number; driver_ids?: string[] };

/** 60 days from AS_OF: a base chance plus per-date overrides. State follows the engine rule. */
function buildDays(overrides: Record<string, DayOverride>, baseP = 0.04, baseP50 = 180) {
  return Array.from({ length: 60 }, (_, i) => {
    const date = addDays(AS_OF, i);
    const o = overrides[date];
    const p = o?.p ?? baseP;
    const p50 = o?.p50 ?? baseP50;
    return {
      date,
      p_shortfall: p,
      state: weatherState(p, DEFAULT_STORM_THRESHOLD),
      p10: o?.p10 ?? Math.round(p50 - 90),
      p50,
      p90: o?.p90 ?? Math.round(p50 + 90),
      driver_ids: o?.driver_ids ?? [],
    };
  });
}

function range(start: string, end: string, o: DayOverride): Record<string, DayOverride> {
  const out: Record<string, DayOverride> = {};
  for (let d = start; d <= end; d = addDays(d, 1)) out[d] = o;
  return out;
}

/** Same rule as the engine: the day before the first day at or above 10%, else the last day. */
function coveredUntil(days: { date: string; p_shortfall: number }[]): string {
  const first = days.find((d) => d.p_shortfall >= 0.1);
  return first ? addDays(first.date, -1) : days[days.length - 1].date;
}

// ---------- Drivers (ids match forecast.json) ----------
const [COUNCIL_TAX, PHONE, QUIET_WEEK] = ["drv_council_tax", "drv_phone_renewal", "drv_quiet_week"].map(
  (id) => demoForecast.drivers.find((d) => d.id === id)!,
);
const DEMO_IDS = [QUIET_WEEK.id, PHONE.id, COUNCIL_TAX.id];
const LETTER: Driver = { id: "drv_uc_letter", label: "Letter about Universal Credit", amount_gbp: 0, due_date: "2026-04-01", window: null, kind: "letter", source_note: "A letter says your payment may change from 1 April." };
const ONE_OFF: Driver = { id: "drv_birthday", label: "Birthday present", amount_gbp: 60, due_date: "2026-04-05", window: null, kind: "one_off", source_note: "You added this yourself." };
const LONG_LABEL: Driver = { id: "drv_long", label: "Contents and buildings insurance premium (annual renewal)", amount_gbp: 1234.56, due_date: "2026-03-23", window: null, kind: "bill", source_note: "A very long label to test wrapping in list rows on a 390 px screen." };


function forecast(id: string, days: ReturnType<typeof buildDays>, extra: Partial<Forecast> = {}): Forecast {
  return { id, as_of: AS_OF, horizon_days: 60, paths: 1000, days, drivers: [], covered_until: coveredUntil(days), buffer_days: 6, best_action: null, ...extra };
}

export const FORECASTS = {
  /** The spec demo: fine 10-18, tight 19-22, storm 23 Mar at 1 in 3, £15 move -> 1 in 8. */
  demo: demoForecast,
  /** Demo step 7, after "Move £15 to my buffer": 23 March drops to 0.125, so it reads tight. */
  demo_after_buffer: {
    ...demoForecast,
    id: `${demoForecast.id}_after_buffer`,
    buffer_days: demoForecast.buffer_days + 1,
    best_action: null, // same as the engine: nothing left to suggest
    days: demoForecast.days.map((d) =>
      d.date === "2026-03-23" ? { ...d, p_shortfall: 0.125, state: "cloudy" as const, p10: -42, p50: 50, p90: 142 } : d,
    ),
  },
  all_clear: forecast("fc_all_clear", buildDays({}, 0.02, 420), { buffer_days: 21 }),
  tight_only: forecast("fc_tight_only", buildDays(range("2026-03-16", "2026-03-24", { p: 0.22, p50: 60, driver_ids: [PHONE.id] })), { drivers: [PHONE], buffer_days: 4 }),
  storm_tomorrow: forecast("fc_storm_tomorrow", buildDays({ "2026-03-11": { p: 0.55, p10: -80, p50: -12, p90: 40, driver_ids: DEMO_IDS } }), {
    drivers: [COUNCIL_TAX, PHONE, QUIET_WEEK],
    buffer_days: 1,
    best_action: { action_id: "move_to_buffer", amount_gbp: 15, date: "2026-03-10", p_after: 0.4 },
  }),
  storm_today: forecast("fc_storm_today", buildDays(range("2026-03-10", "2026-03-13", { p: 0.92, p10: -140, p50: -25, p90: 10, driver_ids: [COUNCIL_TAX.id] })), {
    drivers: [COUNCIL_TAX],
    buffer_days: 0,
    best_action: { action_id: "credit_pause_hours", amount_gbp: 0, date: "2026-03-10", p_after: 0.8 },
  }),
  storm_far: forecast("fc_storm_far", buildDays({ "2026-03-30": { p: 0.4, p50: 20, driver_ids: [LETTER.id] } }), { drivers: [LETTER], buffer_days: 14 }),
  storm_in_7: forecast("fc_storm_in_7", buildDays({ "2026-03-17": { p: 0.34, p50: 30, driver_ids: DEMO_IDS } }), { drivers: [COUNCIL_TAX, PHONE, QUIET_WEEK] }),
  two_storms: forecast(
    "fc_two_storms",
    buildDays({
      "2026-03-23": { p: 0.33, p50: 35, driver_ids: DEMO_IDS },
      "2026-04-23": { p: 0.48, p50: 5, driver_ids: [LETTER.id, ONE_OFF.id] },
    }),
    { drivers: [COUNCIL_TAX, PHONE, QUIET_WEEK, LETTER, ONE_OFF], best_action: demoForecast.best_action },
  ),
  /** Exact edges: 0 and 0.0999 fine; 0.10 and 0.30 tight; 0.3001, 1 and 0.5 storm. */
  boundaries: forecast(
    "fc_boundaries",
    buildDays({
      "2026-03-10": { p: 0 },
      "2026-03-11": { p: 0.0999 },
      "2026-03-12": { p: 0.1 },
      "2026-03-13": { p: 0.3 },
      "2026-03-14": { p: 0.3001 },
      "2026-03-15": { p: 1, p10: -300, p50: -150, p90: -20 },
      "2026-03-16": { p: 0.5 },
    }),
  ),
  all_driver_kinds: forecast("fc_all_driver_kinds", buildDays({ "2026-03-23": { p: 0.6, p50: -40, driver_ids: [...DEMO_IDS, LONG_LABEL.id, LETTER.id, ONE_OFF.id] } }), {
    drivers: [COUNCIL_TAX, PHONE, QUIET_WEEK, LONG_LABEL, LETTER, ONE_OFF],
    best_action: { action_id: "move_to_buffer", amount_gbp: 15, date: "2026-03-13", p_after: 0.45 },
  }),
  storm_no_drivers: forecast("fc_storm_no_drivers", buildDays({ "2026-03-20": { p: 0.35, p50: 25 } })),
  wealthy: forecast("fc_wealthy", buildDays({}, 0, 12_345.67), { buffer_days: 90 }),
} satisfies Record<string, Forecast>;

// ---------- Rewind ----------
export const REWINDS = {
  demo: demoRewind,
  /** A good year: nothing extra. Flat chart, no list rows. */
  zero: { ...demoRewind, months: demoRewind.months.map((m) => ({ ...m, extra_gbp: 0 })), categories: [], total_gbp: 0, kept_with_pact_gbp: 0 },
  /** One very bad month sets the chart scale. */
  spike: {
    ...demoRewind,
    months: demoRewind.months.map((m, i) => ({ ...m, extra_gbp: i === 8 ? 310 : 5 })),
    categories: [{ id: "cat_returned_payments", label: "Returned payment charges", total_gbp: 365, source_note: "Several payments bounced in December." }],
    total_gbp: 365,
    kept_with_pact_gbp: 250,
  },
} satisfies Record<string, Rewind>;

// ---------- Settings ----------
const base: Settings = { ...demoSettings, read_aloud: false, ally: null };
export const SETTINGS = {
  demo: demoSettings,
  no_ally: base,
  detailed_reader: { ...demoSettings, reading_level: "detailed" },
  clear_reader: { ...demoSettings, reading_level: "clear" },
  translated_polish: { ...demoSettings, translation: "pl" },
  translated_arabic_rtl: { ...demoSettings, translation: "ar" },
  lead_7: { ...demoSettings, storm_lead_days: 7 },
  lead_0: { ...demoSettings, storm_lead_days: 0 },
  /** Lower threshold. The UI must still show the engine's state, not recompute it. */
  sensitive_threshold: { ...demoSettings, storm_threshold: 0.15 },
  colour_blind: { ...demoSettings, colour_mode: "colour_blind" },
  high_contrast: { ...demoSettings, colour_mode: "high_contrast" },
  worried: { ...demoSettings, mood: "worried" },
  calm_mode_on: { ...demoSettings, mood: "worried", calm_mode: true },
} satisfies Record<string, Settings>;

// ---------- Pact rules (demo = Roh's web/mocks/pact.json) ----------
export const DEMO_RULES: PactRule[] = demoRules;

export const PACT_RULES = {
  demo: DEMO_RULES,
  none: [] as PactRule[],
  /** Drafts from /pact/parse, not yet agreed. */
  drafts: DEMO_RULES.map((r) => ({ ...r, confirmed: false })),
  one: [DEMO_RULES[0]],
  /** A change waiting out the 48 hours (the lock line on the Pact screen). */
  pending_change: [{ ...DEMO_RULES[0], active_from: "2026-03-08", change_requested_at: "2026-03-09T18:00:00Z" }, ...DEMO_RULES.slice(1)],
} satisfies Record<string, PactRule[]>;

/** What to type into the Pact text area, and what should come back. */
export const PACT_PHRASINGS = [
  { text: "When money's tight, stop me spending more than £20 on takeaways", expect: "category_cap" },
  { text: "Make me wait a day before using Klarna", expect: "credit_pause_hours" },
  { text: "Tell my sister if I say I'm not okay", expect: "notify_ally" },
  { text: "Put £15 aside on payday", expect: "move_to_buffer" },
  { text: "Remind me why I'm saving", expect: "show_note" },
  { text: "Invest everything in crypto", expect: "rejected" },
  { text: "Lend me £500", expect: "rejected" },
] as const;

// ---------- Explain blocks (dummy Claude output: no figures that are not in the forecast) ----------
export const EXPLAIN = {
  simple: { kind: "hero", eyebrow: "STORM", headline: "Money may be tight on 23 March", body: "A few costs land close together. See what causes this.", driver_ids: DEMO_IDS },
  clear: { kind: "hero", eyebrow: "STORM", headline: "Money may be tight on 23 March", body: "Council tax and your phone renewal land in a quieter week, so money could run short.", driver_ids: DEMO_IDS },
  detailed: { kind: "hero", eyebrow: "STORM", headline: "1 in 3 chance of going short on 23 March", body: "Council tax (£118) and your phone renewal (£45) fall in a week when earnings are usually £90 lower.", driver_ids: DEMO_IDS },
  tip: { kind: "tip", text: "Save £15 on payday and the chance drops to", emphasis: "1 in 8", driver_ids: [] },
  fallback: { kind: "tip", text: "We couldn't explain this one right now. See what causes it below." },
} satisfies Record<string, UIBlock>;

// ---------- /me (demo = Roh's web/mocks/me.json) ----------
export const ME = {
  demo: demoMe,
  new_user: { user: { name: "Sam", email: "sam@example.com" }, bank: null, onboarding_complete: false },
  /** Bank consent ran out before as_of: show the reconnect prompt. */
  bank_disconnected: { ...demoMe, bank: { name: "Demo bank", connected_until: "2026-03-01" } },
} satisfies Record<string, Me>;

// ---------- Errors (reading age 9) ----------
export const ERRORS = {
  network: { code: "network", message_plain: "We could not load this right now. Please try again." },
  server: { code: "server_error", message_plain: "Something went wrong on our side. Please try again soon." },
  unauthorised: { code: "sign_in_required", message_plain: "Please sign in to use Pact." },
  rephrase: { code: "rephrase", message_plain: "We can't make that into a rule. Try something like \"Put £15 aside on payday\"." },
};

// ---------- Named app scenarios: one switch sets every endpoint ----------
export type AppScenario = {
  group: string;
  note: string;
  forecast: keyof typeof FORECASTS;
  settings: keyof typeof SETTINGS;
  rewind: keyof typeof REWINDS;
  rules: keyof typeof PACT_RULES;
  me: keyof typeof ME;
  /** Make calls fail whose path starts with this. */
  fail?: { path: string; error: keyof typeof ERRORS }[];
  /** Extra delay, for loading states. */
  latencyMs?: number;
};

const d = { forecast: "demo", settings: "demo", rewind: "demo", rules: "demo", me: "demo" } as const;

export const APP_SCENARIOS: Record<string, AppScenario> = {
  demo: { ...d, group: "Demo path", note: "Spec demo, as of Tue 10 March 2026 (Roh's web/mocks/*.json)." },
  demo_after_buffer: { ...d, forecast: "demo_after_buffer", group: "Demo path", note: "After Move £15 to my buffer: 23 March reads tight." },
  storm_mode: { ...d, forecast: "storm_tomorrow", group: "Demo path", note: "Storm tomorrow: Storm mode takes over." },

  all_clear: { ...d, forecast: "all_clear", rewind: "zero", group: "Weather states", note: "60 fine days: no storm card." },
  tight_only: { ...d, forecast: "tight_only", group: "Weather states", note: "Tight days but no storm." },
  storm_today: { ...d, forecast: "storm_today", rewind: "spike", group: "Weather states", note: "Already short today (p50 below £0)." },
  two_storms: { ...d, forecast: "two_storms", group: "Weather states", note: "Two storms: Time River paging." },

  storm_far: { ...d, forecast: "storm_far", group: "Warning lead time", note: "Storm in 20 days: no warning yet." },
  storm_in_7_lead7: { ...d, forecast: "storm_in_7", settings: "lead_7", group: "Warning lead time", note: "Storm in exactly 7 days, 7-day lead: warns." },
  storm_in_7_lead0: { ...d, forecast: "storm_in_7", settings: "lead_0", group: "Warning lead time", note: "Same storm, lead 0: no warning." },

  boundaries: { ...d, forecast: "boundaries", group: "Threshold edges", note: "0.0999 / 0.10 / 0.30 / 0.3001 in the first week." },
  boundaries_sensitive: { ...d, forecast: "boundaries", settings: "sensitive_threshold", group: "Threshold edges", note: "Threshold 0.15 in settings: show the engine's state anyway." },

  all_driver_kinds: { ...d, forecast: "all_driver_kinds", group: "Data edge cases", note: "Every cause kind, a long label, a £1,234.56 bill." },
  storm_no_drivers: { ...d, forecast: "storm_no_drivers", group: "Data edge cases", note: "Storm with no causes listed." },
  wealthy: { ...d, forecast: "wealthy", rewind: "zero", rules: "none", group: "Data edge cases", note: "Big balances: number formatting." },

  new_user: { ...d, settings: "no_ally", rewind: "zero", rules: "none", me: "new_user", group: "People and settings", note: "Onboarding: no bank, no rules, no ally." },
  worried: { ...d, settings: "worried", group: "People and settings", note: "Support: Worried shows the calm mode offer." },
  calm_mode: { ...d, settings: "calm_mode_on", group: "People and settings", note: "Calm mode already on." },
  detailed: { ...d, settings: "detailed_reader", group: "People and settings", note: "Detailed reading level." },
  translated_rtl: { ...d, settings: "translated_arabic_rtl", group: "People and settings", note: "Arabic beside English, dir=rtl." },
  colour_blind: { ...d, settings: "colour_blind", group: "People and settings", note: "Colour-blind tokens (due turns blue)." },
  high_contrast: { ...d, settings: "high_contrast", group: "People and settings", note: "High contrast tokens." },
  bank_disconnected: { ...d, me: "bank_disconnected", group: "People and settings", note: "Bank consent ran out on 1 March." },

  drafts: { ...d, rules: "drafts", group: "Pact rules", note: "Four unagreed drafts on the Pact screen." },
  no_rules: { ...d, rules: "none", group: "Pact rules", note: "No rules yet: empty Pact screen." },
  pending_change: { ...d, rules: "pending_change", group: "Pact rules", note: "A rule change waiting out the 48 hours." },
  parse_rejects: { ...d, rules: "none", fail: [{ path: "/pact/parse", error: "rephrase" }], group: "Pact rules", note: "The parser asks to rephrase." },

  slow: { ...d, latencyMs: 2500, group: "Loading and errors", note: "2.5 s delay: loading states." },
  offline: { ...d, fail: [{ path: "/", error: "network" }], group: "Loading and errors", note: "Every call fails: fallback cards." },
  forecast_500: { ...d, fail: [{ path: "/forecast", error: "server" }], group: "Loading and errors", note: "Only the forecast fails." },
  explain_fails: { ...d, fail: [{ path: "/explain", error: "server" }], group: "Loading and errors", note: "Explain fails: template sentence." },
  logged_out: { ...d, fail: [{ path: "/", error: "unauthorised" }], group: "Loading and errors", note: "Session expired: Log in screen." },
};
