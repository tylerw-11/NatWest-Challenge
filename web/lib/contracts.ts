// Zod mirror of engine/contracts.py (origin/tyler, "Implemented engine").
// Contract rule: change engine/contracts.py, this file, and the affected mock in one commit.
import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const WeatherState = z.enum(["clear", "cloudy", "storm"]);
export type WeatherState = z.infer<typeof WeatherState>;

export const DriverKind = z.enum(["bill", "income_dip", "one_off", "letter"]);

export const Driver = z.object({
  id: z.string(),
  label: z.string(),
  amount_gbp: z.number(),
  due_date: isoDate.nullable().optional(),
  window: z.object({ start: isoDate, end: isoDate }).nullable().optional(),
  kind: DriverKind,
  source_note: z.string(),
});
export type Driver = z.infer<typeof Driver>;

export const Day = z.object({
  date: isoDate,
  p_shortfall: z.number().min(0).max(1),
  state: WeatherState,
  p10: z.number(),
  p50: z.number(),
  p90: z.number(),
  driver_ids: z.array(z.string()).default([]),
});
export type Day = z.infer<typeof Day>;

export const ActionKind = z.enum([
  "category_cap",
  "credit_pause_hours",
  "notify_ally",
  "move_to_buffer",
  "show_note",
]);
export type ActionKind = z.infer<typeof ActionKind>;

export const BestAction = z.object({
  action_id: ActionKind,
  amount_gbp: z.number(),
  date: isoDate,
  p_after: z.number().min(0).max(1),
});
export type BestAction = z.infer<typeof BestAction>;

export const Forecast = z.object({
  id: z.string(),
  as_of: isoDate,
  starting_balance_gbp: z.number().nullable().optional(),
  horizon_days: z.number().int().default(60),
  paths: z.number().int().default(1000),
  days: z.array(Day),
  drivers: z.array(Driver),
  covered_until: isoDate,
  best_action: BestAction.nullable().optional(),
});
export type Forecast = z.infer<typeof Forecast>;

export const RewindMonth = z.object({ month: z.string(), extra_gbp: z.number() });
export const RewindCategory = z.object({
  id: z.string(),
  label: z.string(),
  total_gbp: z.number(),
  source_note: z.string(),
});
export const Rewind = z.object({
  months: z.array(RewindMonth).length(12),
  categories: z.array(RewindCategory),
  total_gbp: z.number(),
  kept_with_pact_gbp: z.number(),
});
export type Rewind = z.infer<typeof Rewind>;

export const TriggerKind = z.enum(["storm_probability", "buffer_below_days", "user_not_okay"]);

export const PactRule = z.object({
  id: z.string(),
  trigger: z
    .object({
      kind: TriggerKind,
      threshold: z.number().optional(),
      horizon_days: z.number().optional(),
      buffer_days: z.number().optional(),
    })
    .passthrough(),
  action: z.object({ kind: ActionKind }).passthrough(),
  when_label: z.string(),
  then_label: z.string(),
  confirmed: z.boolean().default(false),
  active_from: isoDate.nullable().optional(),
  change_requested_at: z.string().nullable().optional(),
});
export type PactRule = z.infer<typeof PactRule>;

export const ReadingLevel = z.enum(["simple", "clear", "detailed"]);
export type ReadingLevel = z.infer<typeof ReadingLevel>;
export const ColourMode = z.enum(["standard", "colour_blind", "high_contrast"]);
export const Mood = z.enum(["good", "unsure", "worried"]);

export const Settings = z.object({
  reading_level: ReadingLevel.default("simple"),
  read_aloud: z.boolean().default(false),
  translation: z.string().nullable().default(null),
  storm_lead_days: z.union([z.literal(14), z.literal(7), z.literal(0)]).default(14),
  storm_threshold: z.number().min(0).max(1).default(0.3),
  colour_mode: ColourMode.default("standard"),
  ally: z.object({ name: z.string(), relation: z.string() }).nullable().default(null),
  calm_mode: z.boolean().default(false),
  mood: Mood.nullable().default(null),
});
export type Settings = z.infer<typeof Settings>;

export const ErrorBody = z.object({ code: z.string(), message_plain: z.string() });
export type ErrorBody = z.infer<typeof ErrorBody>;
