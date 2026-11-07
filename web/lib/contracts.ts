/**
 * Shared Zod contracts for Pact (/web/lib/contracts.ts).
 * Matches `.claude/skills/pact-contracts/SKILL.md` and `/engine/contracts.py` 1-to-1.
 */

import { z } from "zod";

export const WeatherStateSchema = z.enum(["clear", "cloudy", "storm"]);
export const DriverKindSchema = z.enum(["bill", "income_dip", "one_off", "letter"]);
export const TriggerKindSchema = z.enum([
  "storm_probability",
  "buffer_below_days",
  "user_not_okay",
]);
export const ActionKindSchema = z.enum([
  "category_cap",
  "credit_pause_hours",
  "notify_ally",
  "move_to_buffer",
  "show_note",
]);
export const ReadingLevelSchema = z.enum(["simple", "clear", "detailed"]);
export const ColourModeSchema = z.enum(["standard", "colour_blind", "high_contrast"]);
export const MoodStateSchema = z.enum(["good", "unsure", "worried"]);

export const ErrorResponseSchema = z.object({
  code: z.string(),
  message_plain: z.string(),
});

export const DateWindowSchema = z.object({
  start: z.string(),
  end: z.string(),
});

export const DriverSchema = z.object({
  id: z.string(),
  label: z.string(),
  amount_gbp: z.number(),
  due_date: z.string().nullable(),
  window: DateWindowSchema.nullable(),
  kind: DriverKindSchema,
  source_note: z.string(),
});

export const DaySchema = z.object({
  date: z.string(),
  p_shortfall: z.number().min(0).max(1),
  state: WeatherStateSchema,
  p10: z.number(),
  p50: z.number(),
  p90: z.number(),
  driver_ids: z.array(z.string()),
});

export const BestActionSchema = z.object({
  action_id: z.string(),
  amount_gbp: z.number(),
  date: z.string(),
  p_after: z.number(),
});

export const ForecastSchema = z.object({
  id: z.string(),
  as_of: z.string(),
  horizon_days: z.literal(60).or(z.number().int()),
  paths: z.literal(1000).or(z.number().int()),
  days: z.array(DaySchema),
  drivers: z.array(DriverSchema),
  covered_until: z.string(),
  best_action: BestActionSchema,
  buffer_days: z.number().int().optional(),
  rules_on_count: z.number().int().optional(),
});

export const RewindMonthSchema = z.object({
  month: z.string(),
  extra_gbp: z.number(),
});

export const RewindCategorySchema = z.object({
  id: z.string(),
  label: z.string(),
  total_gbp: z.number(),
  source_note: z.string(),
});

export const RewindResponseSchema = z.object({
  months: z.array(RewindMonthSchema).length(12),
  categories: z.array(RewindCategorySchema),
  total_gbp: z.number(),
  kept_with_pact_gbp: z.number(),
});

export const PactTriggerSchema = z.object({
  kind: TriggerKindSchema,
  threshold: z.number().optional(),
  horizon_days: z.number().int().optional(),
  buffer_days: z.number().int().optional(),
});

export const PactRuleSchema = z.object({
  id: z.string(),
  trigger: PactTriggerSchema,
  action: z.record(z.any()),
  when_label: z.string(),
  then_label: z.string(),
  confirmed: z.boolean(),
  active_from: z.string().nullable().optional(),
  change_requested_at: z.string().nullable().optional(),
});

export const AllySummarySchema = z.object({
  name: z.string(),
  relation: z.string(),
  contact: z.string().nullable().optional(),
  status: z.enum(["active", "revoked"]).default("active"),
});

export const SettingsSchema = z.object({
  reading_level: ReadingLevelSchema,
  read_aloud: z.boolean(),
  translation: z.string().nullable(),
  storm_lead_days: z.union([z.literal(14), z.literal(7), z.literal(0)]),
  storm_threshold: z.number(),
  colour_mode: ColourModeSchema,
  ally: AllySummarySchema.nullable(),
  calm_mode: z.boolean(),
  mood: MoodStateSchema.nullable(),
});

export const UIBlockSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("hero"),
    eyebrow: z.string().optional(),
    headline: z.string(),
    body: z.string(),
    translation_text: z.string().nullable().optional(),
    driver_ids: z.array(z.string()).default([]),
  }),
  z.object({
    kind: z.literal("tip"),
    body: z.string(),
    translation_text: z.string().nullable().optional(),
    driver_ids: z.array(z.string()).default([]),
  }),
  z.object({
    kind: z.literal("week_strip"),
    data: z.record(z.any()).optional(),
  }),
  z.object({
    kind: z.literal("storm_card"),
    data: z.record(z.any()).optional(),
  }),
  z.object({
    kind: z.literal("tile"),
    data: z.record(z.any()).optional(),
  }),
  z.object({
    kind: z.literal("chart"),
    data: z.record(z.any()).optional(),
  }),
  z.object({
    kind: z.literal("list_card"),
    data: z.record(z.any()).optional(),
  }),
  z.object({
    kind: z.literal("rule_row"),
    data: z.record(z.any()).optional(),
  }),
  z.object({
    kind: z.literal("note"),
    data: z.record(z.any()).optional(),
  }),
  z.object({
    kind: z.literal("status_chip"),
    data: z.record(z.any()).optional(),
  }),
]);

export type Day = z.infer<typeof DaySchema>;
export type Driver = z.infer<typeof DriverSchema>;
export type Forecast = z.infer<typeof ForecastSchema>;
export type RewindMonth = z.infer<typeof RewindMonthSchema>;
export type RewindCategory = z.infer<typeof RewindCategorySchema>;
export type RewindResponse = z.infer<typeof RewindResponseSchema>;
export type PactRule = z.infer<typeof PactRuleSchema>;
export type Settings = z.infer<typeof SettingsSchema>;
export type UIBlock = z.infer<typeof UIBlockSchema>;
