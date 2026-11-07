// Dummy data for every frontend use case we can think of, so screens can be built
// and tested before the engine is wired in. Select one with ?scenario=<name> or
// NEXT_PUBLIC_MOCK_SCENARIO=<name> (see web/lib/mockApi.ts).
//
// "demo" reproduces the spec's demo figures exactly (Amara, as of Tue 10 March 2026).
// Every other scenario is a variation that hits a threshold, an edge, or a failure path.
import type { Day, Driver, Forecast, PactRule, Rewind, Settings } from "../lib/contracts";
import { weatherState, DEFAULT_STORM_THRESHOLD } from "../lib/thresholds";

const AS_OF = "2026-03-10";

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

type DayOverride = { p: number; p50?: number; p10?: number; p90?: number; driver_ids?: string[] };

/** Build 60 days: a base probability, plus per-date overrides. State always follows the threshold rule. */
function buildDays(
  asOf: string,
  overrides: Record<string, DayOverride>,
  opts: { baseP?: number; baseP50?: number; threshold?: number; horizon?: number } = {},
): Day[] {
  const { baseP = 0.04, baseP50 = 180, threshold = DEFAULT_STORM_THRESHOLD, horizon = 60 } = opts;
  return Array.from({ length: horizon }, (_, i) => {
    const date = addDays(asOf, i);
    const o = overrides[date];
    const p = o?.p ?? baseP;
    const p50 = o?.p50 ?? baseP50;
    return {
      date,
      p_shortfall: p,
      state: weatherState(p, threshold),
      p10: o?.p10 ?? Math.round(p50 - 166),
      p50,
      p90: o?.p90 ?? Math.round(p50 + 160),
      driver_ids: o?.driver_ids ?? [],
    };
  });
}

function range(start: string, end: string, o: DayOverride): Record<string, DayOverride> {
  const out: Record<string, DayOverride> = {};
  for (let d = start; d <= end; d = addDays(d, 1)) out[d] = o;
  return out;
}

// ---------- Drivers ----------
export const DEMO_DRIVERS: Driver[] = [
  { id: "council-tax-20260323", label: "Council tax", amount_gbp: 118, due_date: "2026-03-23", window: null, kind: "bill", source_note: "Council tax payment due on 23 March." },
  { id: "phone-20260322", label: "Phone renewal", amount_gbp: 45, due_date: "2026-03-22", window: null, kind: "bill", source_note: "Phone renewal due on 22 March." },
  { id: "quieter-week-20260316", label: "Quieter week", amount_gbp: 90, due_date: null, window: { start: "2026-03-16", end: "2026-03-22" }, kind: "income_dip", source_note: "Gig earnings may be lower from 16 to 22 March." },
];
const LETTER_DRIVER: Driver = { id: "letter-dwp-20260401", label: "Letter about Universal Credit", amount_gbp: 0, due_date: "2026-04-01", window: null, kind: "letter", source_note: "A letter says your payment may change from 1 April." };
const ONE_OFF_DRIVER: Driver = { id: "birthday-20260405", label: "Birthday present", amount_gbp: 60, due_date: "2026-04-05", window: null, kind: "one_off", source_note: "You added this yourself." };
const LONG_LABEL_DRIVER: Driver = { id: "long-1", label: "Monthly contents and buildings insurance premium (annual renewal)", amount_gbp: 1234.56, due_date: "2026-03-23", window: null, kind: "bill", source_note: "A very long label to test wrapping and truncation in list rows on a 390 px screen." };

const ALL_DEMO_IDS = DEMO_DRIVERS.map((d) => d.id);

// ---------- Forecasts ----------
function demoForecast(bufferMove = 0): Forecast {
  const stormP = bufferMove >= 15 ? 0.125 : 0.33;
  return {
    id: `demo-${AS_OF}-${bufferMove}`,
    as_of: AS_OF,
    starting_balance_gbp: 212,
    horizon_days: 60,
    paths: 1000,
    days: buildDays(AS_OF, {
      ...range("2026-03-19", "2026-03-22", { p: 0.16, p50: 95 }),
      "2026-03-23": { p: stormP, p10: -18, p50: bufferMove >= 15 ? 50 : 35, p90: 92, driver_ids: ALL_DEMO_IDS },
    }),
    drivers: DEMO_DRIVERS,
    covered_until: "2026-03-19",
    best_action: bufferMove >= 15 ? null : { action_id: "move_to_buffer", amount_gbp: 15, date: "2026-03-13", p_after: 0.125 },
  };
}

const f = (id: string, over: Partial<Forecast> & Pick<Forecast, "days">): Forecast => ({
  id,
  as_of: AS_OF,
  starting_balance_gbp: 212,
  horizon_days: over.days.length,
  paths: 1000,
  drivers: [],
  covered_until: addDays(AS_OF, over.days.length - 1),
  best_action: null,
  ...over,
});

export const FORECASTS = {
  /** Spec demo: clear 10-18, tight 19-22, storm 23 Mar (1 in 3), best action £15 -> 1 in 8. */
  demo: demoForecast(0),
  /** After "Move £15 to my buffer": 23 Mar drops to 0.125 = cloudy, no best action left. */
  demo_after_buffer: demoForecast(15),
  /** Nothing to worry about for 60 days. Weather hero clear, no storm card, no Time River warning. */
  all_clear: f("all-clear", { days: buildDays(AS_OF, {}, { baseP: 0.02, baseP50: 420 }) }),
  /** Tight but never a storm: storm card hidden, tight days in the strip. */
  tight_only: f("tight-only", {
    days: buildDays(AS_OF, range("2026-03-16", "2026-03-24", { p: 0.22, p50: 60, driver_ids: ["phone-20260322"] })),
    drivers: [DEMO_DRIVERS[1]],
    covered_until: "2026-03-15",
  }),
  /** Storm tomorrow -> Storm mode takes over. */
  storm_tomorrow: f("storm-tomorrow", {
    days: buildDays(AS_OF, { "2026-03-11": { p: 0.55, p10: -80, p50: -12, p90: 40, driver_ids: ALL_DEMO_IDS } }),
    drivers: DEMO_DRIVERS,
    covered_until: "2026-03-10",
    best_action: { action_id: "move_to_buffer", amount_gbp: 15, date: "2026-03-10", p_after: 0.4 },
  }),
  /** Storm today and already short at the median (p50 < 0). */
  storm_today: f("storm-today", {
    starting_balance_gbp: -25,
    days: buildDays(AS_OF, range("2026-03-10", "2026-03-13", { p: 0.92, p10: -140, p50: -25, p90: 10, driver_ids: ["council-tax-20260323"] })),
    drivers: [DEMO_DRIVERS[0]],
    covered_until: "2026-03-09",
    best_action: { action_id: "credit_pause_hours", amount_gbp: 0, date: "2026-03-10", p_after: 0.8 },
  }),
  /** Storm 20 days out: hidden at storm_lead_days 14 and 7, so hero stays clear. */
  storm_far: f("storm-far", {
    days: buildDays(AS_OF, { "2026-03-30": { p: 0.4, p50: 20, driver_ids: ["letter-dwp-20260401"] } }),
    drivers: [LETTER_DRIVER],
    covered_until: "2026-03-29",
  }),
  /** Storm exactly 7 days out: shown at lead 14 and 7, hidden at 0. */
  storm_in_7: f("storm-in-7", {
    days: buildDays(AS_OF, { "2026-03-17": { p: 0.34, p50: 30, driver_ids: ALL_DEMO_IDS } }),
    drivers: DEMO_DRIVERS,
    covered_until: "2026-03-16",
  }),
  /** Two separate storms: Time River must page between them; Weather shows the first. */
  two_storms: f("two-storms", {
    days: buildDays(AS_OF, {
      "2026-03-23": { p: 0.33, p50: 35, driver_ids: ALL_DEMO_IDS },
      "2026-04-23": { p: 0.48, p50: 5, driver_ids: ["letter-dwp-20260401", "birthday-20260405"] },
    }),
    drivers: [...DEMO_DRIVERS, LETTER_DRIVER, ONE_OFF_DRIVER],
    covered_until: "2026-03-22",
    best_action: { action_id: "move_to_buffer", amount_gbp: 15, date: "2026-03-13", p_after: 0.125 },
  }),
  /** Exact threshold edges. 0.0999 clear, 0.10 tight, 0.30 tight, 0.3001 storm, 1.0 storm, 0 clear. */
  boundaries: f("boundaries", {
    days: buildDays(AS_OF, {
      "2026-03-10": { p: 0 },
      "2026-03-11": { p: 0.0999 },
      "2026-03-12": { p: 0.1 },
      "2026-03-13": { p: 0.3 },
      "2026-03-14": { p: 0.3001 },
      "2026-03-15": { p: 1, p10: -300, p50: -150, p90: -20 },
      "2026-03-16": { p: 0.5 },
    }),
  }),
  /** Every driver kind, plus a very long label and big amount. Tests list rows and wrapping. */
  all_driver_kinds: f("all-driver-kinds", {
    days: buildDays(AS_OF, { "2026-03-23": { p: 0.6, p50: -40, driver_ids: [...ALL_DEMO_IDS, "long-1", "letter-dwp-20260401", "birthday-20260405"] } }),
    drivers: [...DEMO_DRIVERS, LONG_LABEL_DRIVER, LETTER_DRIVER, ONE_OFF_DRIVER],
    covered_until: "2026-03-22",
    best_action: { action_id: "move_to_buffer", amount_gbp: 15, date: "2026-03-13", p_after: 0.45 },
  }),
  /** Storm whose driver list is empty (engine had no explanation). Show a plain fallback line. */
  storm_no_drivers: f("storm-no-drivers", {
    days: buildDays(AS_OF, { "2026-03-20": { p: 0.35, p50: 25 } }),
    covered_until: "2026-03-19",
  }),
  /** Short horizon (customer forecast with fewer days). Charts must not assume 60. */
  short_horizon: f("short-horizon", { days: buildDays(AS_OF, { "2026-03-15": { p: 0.2 } }, { horizon: 14 }) }),
  /** Large balances: number formatting with commas, no overflow. */
  wealthy: f("wealthy", { starting_balance_gbp: 12_345.67, days: buildDays(AS_OF, {}, { baseP: 0, baseP50: 12_000 }) }),
} satisfies Record<string, Forecast>;

export type ForecastScenario = keyof typeof FORECASTS;

// ---------- Rewind ----------
const MONTHS = ["2025-04", "2025-05", "2025-06", "2025-07", "2025-08", "2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03"];
const DEMO_EXTRAS = [12, 8, 31, 15, 9, 24, 14, 10, 38, 27, 16, 10];

export const REWINDS = {
  /** Spec figures: total £214, kept with pact about £96. */
  demo: {
    months: MONTHS.map((month, i) => ({ month, extra_gbp: DEMO_EXTRAS[i] })),
    categories: [
      { id: "insurance-monthly", label: "Monthly insurance premium", total_gbp: 118, source_note: "Paying monthly instead of yearly cost £118 more." },
      { id: "overdraft-interest", label: "Overdraft interest", total_gbp: 61, source_note: "22 days in your overdraft." },
      { id: "pay-later-fees", label: "Pay-later late fees", total_gbp: 35, source_note: "7 late fees of £5." },
    ],
    total_gbp: 214,
    kept_with_pact_gbp: 96,
  },
  /** A good year: zero extra costs. Chart is flat; hero celebrates; no list rows. */
  zero: { months: MONTHS.map((month) => ({ month, extra_gbp: 0 })), categories: [], total_gbp: 0, kept_with_pact_gbp: 0 },
  /** One very bad month dominates the chart scale. */
  spike: {
    months: MONTHS.map((month, i) => ({ month, extra_gbp: i === 8 ? 310 : 5 })),
    categories: [{ id: "bank-charges", label: "Returned payment charges", total_gbp: 365, source_note: "Several payments bounced in December." }],
    total_gbp: 365,
    kept_with_pact_gbp: 250,
  },
} satisfies Record<string, Rewind>;

// ---------- Settings ----------
const BASE_SETTINGS: Settings = {
  reading_level: "simple",
  read_aloud: false,
  translation: null,
  storm_lead_days: 14,
  storm_threshold: 0.3,
  colour_mode: "standard",
  ally: null,
  calm_mode: false,
  mood: null,
};

export const SETTINGS = {
  default: BASE_SETTINGS,
  demo: { ...BASE_SETTINGS, ally: { name: "Femi", relation: "brother" } },
  detailed_reader: { ...BASE_SETTINGS, reading_level: "detailed" },
  clear_reader: { ...BASE_SETTINGS, reading_level: "clear" },
  read_aloud: { ...BASE_SETTINGS, read_aloud: true },
  translated_polish: { ...BASE_SETTINGS, translation: "pl" },
  translated_arabic_rtl: { ...BASE_SETTINGS, translation: "ar" },
  lead_7: { ...BASE_SETTINGS, storm_lead_days: 7 },
  lead_0: { ...BASE_SETTINGS, storm_lead_days: 0 },
  /** Lower threshold: more days count as storms. Use with the boundaries forecast. */
  sensitive_threshold: { ...BASE_SETTINGS, storm_threshold: 0.15 },
  colour_blind: { ...BASE_SETTINGS, colour_mode: "colour_blind" },
  high_contrast: { ...BASE_SETTINGS, colour_mode: "high_contrast" },
  worried: { ...BASE_SETTINGS, mood: "worried" },
  calm_mode_on: { ...BASE_SETTINGS, mood: "worried", calm_mode: true },
} satisfies Record<string, Settings>;

// ---------- Pact rules ----------
export const DEMO_RULES: PactRule[] = [
  { id: "r1", trigger: { kind: "storm_probability", threshold: 0.3, horizon_days: 14 }, action: { kind: "category_cap", category: "takeaway", amount_gbp: 20 }, when_label: "When a storm is coming", then_label: "Keep takeaways under £20 a week", confirmed: true },
  { id: "r2", trigger: { kind: "storm_probability", threshold: 0.3, horizon_days: 14 }, action: { kind: "credit_pause_hours", hours: 24 }, when_label: "When a storm is coming", then_label: "Wait 24 hours before pay-later", confirmed: true },
  { id: "r3", trigger: { kind: "user_not_okay" }, action: { kind: "notify_ally" }, when_label: "When I say I'm not okay", then_label: "Tell my ally", confirmed: true },
  { id: "r4", trigger: { kind: "buffer_below_days", buffer_days: 7 }, action: { kind: "move_to_buffer", amount_gbp: 15 }, when_label: "When my buffer is under a week", then_label: "Move £15 to my buffer on payday", confirmed: true },
];

export const PACT_RULES = {
  demo: DEMO_RULES,
  none: [] as PactRule[],
  /** Drafts from /pact/parse, not yet agreed: checkboxes start ticked, button reads "Agree to N rules". */
  drafts: DEMO_RULES.map((r) => ({ ...r, confirmed: false })),
  one: [DEMO_RULES[0]],
  /** A change waiting out the 48-hour delay. */
  pending_change: [{ ...DEMO_RULES[0], change_requested_at: "2026-03-09T18:00:00Z", active_from: "2026-03-11" }, ...DEMO_RULES.slice(1)],
} satisfies Record<string, PactRule[]>;

/** /pact/parse inputs to try in the text area, and what should happen. */
export const PACT_PHRASINGS = [
  { text: "When money's tight, stop me spending more than £20 on takeaways", expect: "category_cap" },
  { text: "Make me wait a day before using Klarna", expect: "credit_pause_hours" },
  { text: "Tell my brother if I say I'm not okay", expect: "notify_ally" },
  { text: "Put £15 aside on payday", expect: "move_to_buffer" },
  { text: "Remind me why I'm saving", expect: "show_note" },
  { text: "Invest everything in crypto", expect: "rejected" },
  { text: "Lend me £500", expect: "rejected" },
  { text: "", expect: "rejected" },
] as const;

export const PACT_NOTE = { text: "Future me: you've got this. Ring Femi before you spend.", audio_url: null as string | null };

// ---------- Explain blocks (dummy Claude output, no new figures) ----------
export const EXPLAIN = {
  simple: { kind: "hero", eyebrow: "STORM", headline: "Money may be tight on 23 March", body: "A few costs may land close together. See what causes this forecast.", driver_ids: ALL_DEMO_IDS },
  clear: { kind: "hero", eyebrow: "STORM", headline: "Money may be tight on 23 March", body: "These costs may land close together, so money could feel tight.", driver_ids: ALL_DEMO_IDS },
  detailed: { kind: "hero", eyebrow: "STORM", headline: "1 in 3 chance of going short on 23 March", body: "The listed costs and a quieter week may raise the chance of a shortfall.", driver_ids: ALL_DEMO_IDS },
  tip: { kind: "tip", body: "Moving £15 on 13 March makes it **1 in 8**.", driver_ids: [] },
  fallback: { kind: "tip", body: "We couldn't explain this one right now. See what causes this forecast below.", driver_ids: [] },
} as const;

// ---------- Me / account ----------
export const ME = {
  demo: { user: { id: "u-amara", first_name: "Amara" }, bank_connection: { name: "NatWest", connected: true, last_sync: "2026-03-10T07:30:00Z" }, onboarding_complete: true },
  new_user: { user: { id: "u-new", first_name: "Sam" }, bank_connection: null, onboarding_complete: false },
  bank_disconnected: { user: { id: "u-amara", first_name: "Amara" }, bank_connection: { name: "NatWest", connected: false, last_sync: "2026-02-28T07:30:00Z" }, onboarding_complete: true },
};

export const SESSIONS = [
  { id: "s1", device: "iPhone 15", place: "Manchester", last_seen: "2026-03-10T08:00:00Z", current: true },
  { id: "s2", device: "Chrome on Windows", place: "Manchester", last_seen: "2026-03-08T21:10:00Z", current: false },
];

/** Account deletion requested: shows the 48-hour cancel banner. */
export const DELETE_PENDING = { requested_at: "2026-03-09T12:00:00Z", deletes_at: "2026-03-11T12:00:00Z" };

// ---------- Errors (all at reading age 9) ----------
export const ERRORS = {
  network: { code: "network", message_plain: "We can't reach Pact right now. Check your internet and try again." },
  server: { code: "server_error", message_plain: "Something went wrong on our side. Please try again soon." },
  unauthorised: { code: "unauthorised", message_plain: "Please log in again." },
  rephrase: { code: "rephrase", message_plain: "We can't make that into a rule. Try something like \"Put £15 aside on payday\"." },
  bank_down: { code: "bank_unavailable", message_plain: "We can't see your bank right now, so this forecast may be out of date." },
};

// ---------- Named full-app scenarios (one switch sets everything) ----------
export type AppScenario = {
  forecast: ForecastScenario;
  settings: keyof typeof SETTINGS;
  rewind: keyof typeof REWINDS;
  rules: keyof typeof PACT_RULES;
  me: keyof typeof ME;
  /** Force a failure on these endpoints (by path prefix). */
  fail?: { path: string; error: keyof typeof ERRORS }[];
  /** Extra latency in ms for loading skeletons. */
  latencyMs?: number;
  note: string;
};

export const APP_SCENARIOS: Record<string, AppScenario> = {
  demo: { forecast: "demo", settings: "demo", rewind: "demo", rules: "demo", me: "demo", note: "Spec demo path, as of 10 March 2026." },
  demo_after_buffer: { forecast: "demo_after_buffer", settings: "demo", rewind: "demo", rules: "demo", me: "demo", note: "After tapping Move £15 to my buffer." },
  all_clear: { forecast: "all_clear", settings: "default", rewind: "zero", rules: "demo", me: "demo", note: "Calm 60 days; no storm card." },
  tight_only: { forecast: "tight_only", settings: "default", rewind: "demo", rules: "demo", me: "demo", note: "Tight days but no storm." },
  storm_mode: { forecast: "storm_tomorrow", settings: "demo", rewind: "demo", rules: "demo", me: "demo", note: "Storm tomorrow: Storm mode screen." },
  storm_today: { forecast: "storm_today", settings: "demo", rewind: "spike", rules: "demo", me: "demo", note: "Already short today." },
  storm_far_lead14: { forecast: "storm_far", settings: "default", rewind: "demo", rules: "demo", me: "demo", note: "Storm in 20 days: no warning yet." },
  storm_in_7_lead7: { forecast: "storm_in_7", settings: "lead_7", rewind: "demo", rules: "demo", me: "demo", note: "Storm in exactly 7 days with 7-day lead: warns." },
  storm_in_7_lead0: { forecast: "storm_in_7", settings: "lead_0", rewind: "demo", rules: "demo", me: "demo", note: "Same storm, lead 0: no warning." },
  two_storms: { forecast: "two_storms", settings: "demo", rewind: "demo", rules: "demo", me: "demo", note: "Two storms; Time River paging." },
  boundaries: { forecast: "boundaries", settings: "default", rewind: "demo", rules: "demo", me: "demo", note: "Exact 0.10 / 0.30 edges in the week strip." },
  boundaries_sensitive: { forecast: "boundaries", settings: "sensitive_threshold", rewind: "demo", rules: "demo", me: "demo", note: "Threshold 0.15: UI should trust engine state, not recompute." },
  all_driver_kinds: { forecast: "all_driver_kinds", settings: "demo", rewind: "demo", rules: "demo", me: "demo", note: "Every driver kind and a very long label." },
  storm_no_drivers: { forecast: "storm_no_drivers", settings: "demo", rewind: "demo", rules: "demo", me: "demo", note: "Storm with no causes listed." },
  short_horizon: { forecast: "short_horizon", settings: "default", rewind: "demo", rules: "demo", me: "demo", note: "14-day forecast." },
  wealthy: { forecast: "wealthy", settings: "default", rewind: "zero", rules: "none", me: "demo", note: "Big numbers; formatting." },
  new_user: { forecast: "demo", settings: "default", rewind: "zero", rules: "none", me: "new_user", note: "Onboarding: Sign-up, no rules, no bank." },
  drafts: { forecast: "demo", settings: "demo", rewind: "demo", rules: "drafts", me: "demo", note: "Pact screen with unagreed drafts." },
  pending_change: { forecast: "demo", settings: "demo", rewind: "demo", rules: "pending_change", me: "demo", note: "A rule change waiting 48 hours." },
  worried: { forecast: "demo", settings: "worried", rewind: "demo", rules: "demo", me: "demo", note: "Support: Worried shows the calm mode offer." },
  calm_mode: { forecast: "demo", settings: "calm_mode_on", rewind: "demo", rules: "demo", me: "demo", note: "Calm mode on." },
  detailed: { forecast: "demo", settings: "detailed_reader", rewind: "demo", rules: "demo", me: "demo", note: "Detailed reading level." },
  translated_rtl: { forecast: "demo", settings: "translated_arabic_rtl", rewind: "demo", rules: "demo", me: "demo", note: "Arabic beside English; dir=rtl." },
  colour_blind: { forecast: "demo", settings: "colour_blind", rewind: "demo", rules: "demo", me: "demo", note: "Colour-blind tokens (due #1B4F9C)." },
  high_contrast: { forecast: "demo", settings: "high_contrast", rewind: "demo", rules: "demo", me: "demo", note: "High contrast tokens." },
  bank_disconnected: { forecast: "demo", settings: "demo", rewind: "demo", rules: "demo", me: "bank_disconnected", note: "Bank link lost; stale banner." },
  slow: { forecast: "demo", settings: "demo", rewind: "demo", rules: "demo", me: "demo", latencyMs: 2500, note: "Loading skeletons." },
  offline: { forecast: "demo", settings: "demo", rewind: "demo", rules: "demo", me: "demo", fail: [{ path: "/", error: "network" }], note: "Every call fails: fallback cards." },
  forecast_500: { forecast: "demo", settings: "demo", rewind: "demo", rules: "demo", me: "demo", fail: [{ path: "/forecast", error: "server" }], note: "Only forecast fails." },
  explain_fails: { forecast: "demo", settings: "demo", rewind: "demo", rules: "demo", me: "demo", fail: [{ path: "/explain", error: "server" }], note: "Explain fails: template sentence." },
  parse_rejects: { forecast: "demo", settings: "demo", rewind: "demo", rules: "none", me: "demo", fail: [{ path: "/pact/parse", error: "rephrase" }], note: "Pact parser asks to rephrase." },
  logged_out: { forecast: "demo", settings: "demo", rewind: "demo", rules: "demo", me: "demo", fail: [{ path: "/me", error: "unauthorised" }], note: "Session expired: Log in screen." },
};
