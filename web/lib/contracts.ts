/**
 * Shared JSON contracts (pact-contracts skill). Mirrors engine/contracts.py.
 * A change here updates engine/contracts.py and the affected web/mocks file
 * in the same commit, prefixed `contract:`. After 15:00 add fields, never rename.
 */
import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

export const WeatherState = z.enum(["clear", "cloudy", "storm"]);
export type WeatherState = z.infer<typeof WeatherState>;

export const Day = z.object({
  date: isoDate,
  p_shortfall: z.number().min(0).max(1),
  state: WeatherState,
  p10: z.number(),
  p50: z.number(),
  p90: z.number(),
  driver_ids: z.array(z.string()),
});
export type Day = z.infer<typeof Day>;

export const DriverKind = z.enum(["bill", "income_dip", "one_off", "letter"]);

export const Driver = z.object({
  id: z.string(),
  label: z.string(),
  amount_gbp: z.number(),
  due_date: isoDate.nullable(),
  window: z.object({ start: isoDate, end: isoDate }).nullable(),
  kind: DriverKind,
  source_note: z.string(),
});
export type Driver = z.infer<typeof Driver>;

export const ActionKind = z.enum([
  "category_cap",
  "credit_pause_hours",
  "notify_ally",
  "move_to_buffer",
  "show_note",
]);
export type ActionKind = z.infer<typeof ActionKind>;

export const TriggerKind = z.enum([
  "storm_probability",
  "buffer_below_days",
  "user_not_okay",
]);
export type TriggerKind = z.infer<typeof TriggerKind>;

export const BestAction = z.object({
  action_id: ActionKind,
  amount_gbp: z.number(),
  date: isoDate,
  p_after: z.number().min(0).max(1),
});

export const Forecast = z.object({
  id: z.string(),
  as_of: isoDate,
  horizon_days: z.literal(60),
  paths: z.literal(1000),
  days: z.array(Day),
  drivers: z.array(Driver),
  covered_until: isoDate,
  /** Days the safety buffer covers (Weather tile). Added FE-03. */
  buffer_days: z.number(),
  best_action: BestAction,
});
export type Forecast = z.infer<typeof Forecast>;

export const RewindMonth = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "YYYY-MM"),
  extra_gbp: z.number(),
});
export type RewindMonth = z.infer<typeof RewindMonth>;

export const RewindCategory = z.object({
  id: z.string(),
  label: z.string(),
  total_gbp: z.number(),
  source_note: z.string(),
});
export type RewindCategory = z.infer<typeof RewindCategory>;

export const Rewind = z.object({
  months: z.array(RewindMonth).length(12),
  categories: z.array(RewindCategory),
  total_gbp: z.number(),
  kept_with_pact_gbp: z.number(),
});
export type Rewind = z.infer<typeof Rewind>;

export const PactRule = z.object({
  id: z.string(),
  trigger: z.object({
    kind: TriggerKind,
    threshold: z.number().optional(),
    horizon_days: z.number().optional(),
    buffer_days: z.number().optional(),
  }),
  action: z.object({ kind: ActionKind }).passthrough(),
  when_label: z.string(),
  then_label: z.string(),
  confirmed: z.boolean(),
});
export type PactRule = z.infer<typeof PactRule>;

/** GET /pact: the user's stored rules. Added FE-03. */
export const PactRules = z.array(PactRule);

/** GET /me. Shape added FE-03. */
export const Me = z.object({
  user: z.object({ name: z.string(), email: z.string() }),
  bank: z.object({ name: z.string(), connected_until: isoDate }).nullable(),
  onboarding_complete: z.boolean(),
  /** Added FE-12 (Account screen). */
  phone_masked: z.string().optional(),
  devices: z
    .array(z.object({ id: z.string(), label: z.string(), last_seen: z.string(), current: z.boolean() }))
    .optional(),
});
export type Me = z.infer<typeof Me>;

/** POST /pact/note and the stored note. Added FE-06. */
export const PactNote = z.object({ text: z.string(), duration_s: z.number() });
export type PactNote = z.infer<typeof PactNote>;

/** A confirmed rule that fired on a forecast. Added FE-07. */
export const FiredRule = z.object({
  rule_id: z.string(),
  action_kind: ActionKind,
  /** category_cap: money left in that category this week. */
  left_gbp: z.number().nullable(),
});
export type FiredRule = z.infer<typeof FiredRule>;

/** POST /simulate?as_of=YYYY-MM-DD (demo fast-forward). Added FE-07. */
export const SimulateResult = z.object({ forecast: Forecast, fired: z.array(FiredRule) });
export type SimulateResult = z.infer<typeof SimulateResult>;

export const ReadingLevel = z.enum(["simple", "clear", "detailed"]);
export type ReadingLevel = z.infer<typeof ReadingLevel>;

export const ColourMode = z.enum(["standard", "colour_blind", "high_contrast"]);
export type ColourMode = z.infer<typeof ColourMode>;

export const Mood = z.enum(["good", "unsure", "worried"]);

export const Settings = z.object({
  reading_level: ReadingLevel,
  read_aloud: z.boolean(),
  translation: z.string().nullable(),
  storm_lead_days: z.union([z.literal(14), z.literal(7), z.literal(0)]),
  storm_threshold: z.number(),
  colour_mode: ColourMode,
  ally: z.object({ name: z.string(), relation: z.string() }).nullable(),
  calm_mode: z.boolean(),
  mood: Mood.nullable(),
});
export type Settings = z.infer<typeof Settings>;

/** UI blocks: screens are composed of these, never chat transcripts. */
const HeroBlock = z.object({
  kind: z.literal("hero"),
  eyebrow: z.string().optional(),
  headline: z.string(),
  body: z.string().optional(),
  driver_ids: z.array(z.string()).optional(),
});
const TipBlock = z.object({
  kind: z.literal("tip"),
  text: z.string(),
  emphasis: z.string().optional(),
  driver_ids: z.array(z.string()).optional(),
});
const looseBlock = <K extends string>(kind: K) =>
  z.object({ kind: z.literal(kind) }).passthrough();

export const UIBlock = z.discriminatedUnion("kind", [
  HeroBlock,
  TipBlock,
  looseBlock("week_strip"),
  looseBlock("storm_card"),
  looseBlock("tile"),
  looseBlock("chart"),
  looseBlock("list_card"),
  looseBlock("rule_row"),
  looseBlock("note"),
  looseBlock("status_chip"),
]);
export type UIBlock = z.infer<typeof UIBlock>;

export const ApiErrorBody = z.object({
  code: z.string(),
  message_plain: z.string(),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBody>;
