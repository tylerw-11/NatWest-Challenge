---
name: pact-contracts
description: Use when writing Pact engine endpoints, JSON schemas, Zod validators, Claude prompts and tool definitions, settings storage, or the synthetic data generator.
---

# Pact contracts

The engine (FastAPI, NumPy, pandas, SQLModel on SQLite) and the web app (Next.js) share one set of JSON contracts. Changing a contract requires updating `engine/contracts.py`, `web/lib/contracts.ts`, and the affected mock in `web/mocks` in the same commit. The full endpoint list, data model, and task list are in the doc "Pact: backend requirements" (T1 to T17, extensions BX1 to BX8).

## Types

- `Day`: `{ date, p_shortfall, state: "clear" | "cloudy" | "storm", p10, p50, p90, driver_ids[] }`. The UI labels `cloudy` as "tight".
- `Driver`: `{ id, label, amount_gbp, due_date | null, window: { start, end } | null, kind: "bill" | "income_dip" | "one_off" | "letter", source_note }`. `source_note` fills "See where these come from".
- `Forecast`: `{ id, as_of, horizon_days: 60, paths: 1000, days: Day[], drivers: Driver[], covered_until, best_action: { action_id, amount_gbp, date, p_after } }`
- `RewindMonth`: `{ month, extra_gbp }`; `RewindCategory`: `{ id, label, total_gbp, source_note }`
- `PactRule`: `{ id, trigger: { kind, threshold?, horizon_days?, buffer_days? }, action: { kind, ... }, when_label, then_label, confirmed }`
- `Settings`: `{ reading_level: "simple" | "clear" | "detailed", read_aloud, translation: null | lang, storm_lead_days: 14 | 7 | 0, storm_threshold, colour_mode: "standard" | "colour_blind" | "high_contrast", ally: { name, relation } | null, calm_mode, mood: "good" | "unsure" | "worried" | null }`
- `UIBlock`: discriminated union on `kind`: `hero`, `week_strip`, `storm_card`, `tile`, `chart`, `list_card`, `tip`, `rule_row`, `note`, `status_chip`
- Errors: `{ code, message_plain }`, with `message_plain` at reading age 9.

Trigger kinds: `storm_probability`, `buffer_below_days`, `user_not_okay`. Action kinds: `category_cap`, `credit_pause_hours`, `notify_ally`, `move_to_buffer`, `show_note`.

## Endpoints (summary)

| Method | Path | Returns |
| --- | --- | --- |
| POST | `/auth/demo`, `/auth/logout` | Session cookie / 204 |
| GET | `/me` | User, bank connection, onboarding_complete |
| GET / PUT | `/settings` | `Settings` |
| GET | `/forecast` | `Forecast` |
| GET | `/drivers/{day}` | `Driver[]` |
| GET | `/rewind` | `{ months: RewindMonth[12], categories: RewindCategory[], total_gbp, kept_with_pact_gbp }` |
| POST | `/pact/parse` | Draft `PactRule[]` |
| POST | `/pact`; PATCH / DELETE `/pact/{id}` | Stored rules; changes scheduled 48 hours ahead |
| POST | `/pact/note` | Stored note |
| POST | `/simulate?as_of=YYYY-MM-DD` | `Forecast` plus fired rules (demo fast-forward) |
| POST | `/actions/move-to-buffer` | Updated forecast |
| POST | `/explain` | `hero` or `tip` block at the user's reading level |
| GET / POST / DELETE | `/ally` | Ally record |

## Engine algorithms

1. `detect_recurring`: group by merchant label; recurring when gaps cluster at 7, 14, 28 to 31, or 365 days within 3 days.
2. `income_model`: bootstrap weekly earnings from the last 12 weeks; Universal Credit as a monthly payment reduced by 55p per £1 earned above the work allowance.
3. `simulate`: 1,000 paths over 60 days, fixed seed.
4. Weather mapping: under 0.10 clear, 0.10 to 0.30 cloudy, above 0.30 storm (threshold from `settings.storm_threshold`). Express probabilities to the UI as the nearest "1 in N".
5. `best_action`: test each allowed action on the next storm; return the largest fall in p_shortfall.
6. `triggers`: evaluate confirmed rules on every forecast; write `events` rows for any that fire.
7. `rewind`: replay 12 months with confirmed rules applied; report extra costs avoided.

## Synthetic generator (must reproduce the demo figures)

Seeded and deterministic. As of Tuesday 10 March 2026:

- Gig income £600 to £1,400 a month, Universal Credit, rent, payday Friday 13 March.
- 23 March storm, p_shortfall about 0.33, p50 about £35: council tax £118 due 23 Mar, phone renewal £45 due 22 Mar, earnings about £90 lower 16 to 22 Mar.
- `covered_until` = 19 March; 10 to 18 March clear, 19 to 22 March cloudy; buffer 6 days.
- Best action: move £15 to buffer on 13 March, p_after about 1 in 8.
- Rewind April 2025 to March 2026 monthly extras: 12, 8, 31, 15, 9, 24, 14, 10, 38, 27, 16, 10 (total £214). Categories: monthly insurance premium £118, overdraft interest £61 (22 days), pay-later late fees £35 (7 × £5). Kept with pact: about £96.

## Claude usage

- Pact parser: tool use with the `PactRule` schema as the tool input; it writes short `when_label` and `then_label` strings. Phrasings outside the closed action list return a rephrase request. Replace the ally's name with a placeholder before sending. Prompt in `engine/prompts/parse_pact.md`; tests in `engine/tests/pact_phrasings.json` (10 phrasings, 2 must be rejected).
- Explainer: input is a forecast ID, drivers, `reading_level`, and `translation`; output is a `hero` or `tip` block citing driver IDs. A post-check rejects any number absent from the inputs and falls back to a template sentence. Prompt in `engine/prompts/explain.md`.
- Strip names and account numbers before any request.
- Validate every response; on failure return a neutral fallback block and log the raw response.
- Cache by (forecast_id, reading_level, translation). From 16:45, `DEMO_CACHE=true` serves the demo path from `engine/demo_cache.json`.
