# Decision 0001: one data contract, one engine, one frontend base

Status: **proposed** (7 Nov, ~16:00). Needs a yes from A (engine), B (frontend) and C/D before Gate 2 (16:45).

## Why we need this

Four branches were each defining the same data in different ways:

| Branch | Owner | What it has |
| --- | --- | --- |
| `feature/web-frontend` | Roh (B) | Next.js app, tokens, `web/lib/contracts.ts`, `web/mocks/*.json`, `api.ts`, hooks |
| `tyler` | Tyler (A) | FastAPI engine with the planned `routers/` layout |
| `jawad` | Jawad | Plain-`http.server` engine with extras, plus its own `web/lib/contracts.ts` and mocks |
| `frontend-mocks` | William | Scenario mocks, thresholds, `/dev/scenarios` (now built on top of Roh's branch) |

## Evidence: real engine responses against Roh's contracts

Both engines were run locally and every response was parsed with `web/lib/contracts.ts` from `feature/web-frontend`.

| Call | Tyler (FastAPI) | Jawad (http.server) |
| --- | --- | --- |
| `GET /forecast` | ✅ pass | ❌ different shape: a dashboard bundle (`persona`, `forecast`, `explainer`…) with no `days` or `drivers` |
| `GET /settings` | ✅ pass | ❌ `reading_level: 9` (number), `mood: "calm"`, no `ally` |
| `GET /rewind` | ❌ `month: "April 2025"`, contract wants `"2025-04"` | ✅ pass |
| `POST /explain` | ✅ pass (`tip`) | ❌ uses `block_type`, not `kind` |
| `POST /pact/parse` | ✅ pass | ✅ pass |
| `POST /actions/move-to-buffer` | ✅ pass | ❌ same shape problem as `/forecast` |
| Stack in the spec (FastAPI + routers) | ✅ | ❌ |

Tyler's engine passes 5 of 6 calls, with one small fix needed. Jawad's passes 2 of 6, and making it fit would mean reshaping most of its responses.

## Decisions

1. **Frontend base: Roh's `feature/web-frontend`.** Its `web/lib/contracts.ts` is the contract for the web app. Every other branch builds on it, not beside it. *(Done for `frontend-mocks`: my own contracts, scaffold and mocks were removed, and Roh's files win wherever we overlapped.)*
2. **Engine: Tyler's.** It already matches the contract and the planned layout. Jawad's extras (support check, calibration, CSV linear model, `buffer_days`, `rules_on_count`) get ported into Tyler's routers as BX extensions *after* the demo path works. **Don't merge Jawad's `web/lib/contracts.ts` or `web/mocks/*`**: they would overwrite Roh's, and that is where the conflicts come from.
3. **Contract changes.** One `contract:` commit with additions only (allowed after 15:00), touching `engine/contracts.py`, `web/lib/contracts.ts` and the mocks:

   | # | Change | Why | Who |
   | --- | --- | --- | --- |
   | a | Rewind `month` sent as `"YYYY-MM"` | Tyler's `/rewind` fails the contract today | A |
   | b | Add `buffer_days: int` and `rules_on_count: int` to `Forecast` (optional) | Weather tiles show "6 days" and "4 Pact rules on"; neither can be worked out from today's fields (covered_until gives 10 days) | A + B |
   | c | Make `best_action` nullable (`BestAction.nullable()`) | Tyler's `POST /forecast` returns `null`, and a forecast with no storm has nothing to suggest. Today one `null` fails the whole Weather screen | A + B |
   | d | `horizon_days` and `paths`: `z.number().int()` instead of literal 60 and 1000 | Tyler's `POST /forecast` accepts 1 to 60 days. Keep 60 and 1000 in the demo | B |
   | e | Add optional `active_from` and `change_requested_at` to `PactRule` | Tyler already sends them; the 48-hour lock line needs them | B |
   | f | `income_dip` `amount_gbp` is **positive** (the size of the dip); `kind` gives the direction | Tyler sends `90`, Roh's mock has `-90` | B (one mock line) |
   | g | Tyler's `/pact` and `/settings` seed the demo: 4 rules, ally Jade (sister) | Today they return `[]` and `ally: null`; the design shows 4 rules and "Jade knows" | A |

4. **Thresholds.** The engine rule stays as it is: fine below 0.10, tight from 0.10 up to `storm_threshold` (default 0.30, inclusive), storm above it. The UI shows the engine's `state` and never recomputes it. **Still to confirm** (live in `web/lib/thresholds.ts` and are easy to change):
   - Storm mode takes over when the storm is today or tomorrow.
   - Safety buffer band: 0 empty, under 7 low, under 14 ok, 14+ good.
   - Calm-mode offer: shown when mood is `worried` and calm mode is off.
   - Roh's `oneInN(0.97)` reads "1 in 1"; suggest "almost certain" from 0.95.
5. **Hooking up the mocks.** When Roh is ready, the mock branch in `web/lib/api.ts` calls `mockApi.forecast()` (and the same for rewind and settings) instead of the static JSON. Then `?scenario=` and `/dev/scenarios` drive every screen. `USE_MOCKS=false` still goes to the engine.
6. **Merge order.**
   1. `frontend-mocks` → `feature/web-frontend` (B approves). It is a clean merge: the branch contains all of Roh's work and adds only new files.
   2. Tyler merges `main` into `tyler`, keeps `main`'s README and skills, combines the two `.gitignore` files, and deletes the committed `engine/__pycache__/` and `engine/pact.sqlite3`. Those 4 files currently conflict. Then `tyler` → `main`.
   3. The `contract:` commit (decision 3) after both, then `feature/web-frontend` → `main` at Gate 2.

## If we don't agree by 16:30

Fall back to the plan's Option B: run the demo on mocks only (`USE_MOCKS=true`, `/dev/scenarios` → `demo` then `demo_after_buffer`), which works today with no engine.
