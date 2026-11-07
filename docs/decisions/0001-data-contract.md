# Decision 0001: one data contract, one engine, one frontend base

Status: **proposed** (7 Nov, ~16:10, checked against FE-03). Needs a yes from A (engine), B (frontend) and C/D before Gate 2 (16:45).

## Why we need this

Four branches were each defining the same data in different ways:

| Branch | Owner | What it has |
| --- | --- | --- |
| `feature/web-frontend` | Roh (B) | Next.js app, tokens, `web/lib/contracts.ts`, `web/mocks/*.json`, `api.ts`, hooks |
| `tyler` | Tyler (A) | FastAPI engine with the planned `routers/` layout |
| `jawad` | Jawad | Plain-`http.server` engine with extras, plus its own `web/lib/contracts.ts` and mocks |
| `frontend-mocks` | William | Scenario mocks, thresholds, `/dev/scenarios` (now built on top of Roh's branch) |

## Evidence: real engine responses against Roh's contracts

Both engines were run locally and every response was parsed with `web/lib/contracts.ts` from `feature/web-frontend` as of FE-03 (which added `Forecast.buffer_days`, `Me` and `PactRules`).

| Call | Tyler (FastAPI) | Jawad (http.server) |
| --- | --- | --- |
| `GET /forecast` | ❌ only `buffer_days` missing | ❌ different shape: a dashboard bundle (`persona`, `forecast`, `explainer`…) with no `days` or `drivers` |
| `GET /settings` | ✅ pass | ❌ `reading_level: 9` (number), `mood: "calm"`, no `ally` |
| `GET /rewind` | ❌ `month: "April 2025"`, contract wants `"2025-04"` | ✅ pass |
| `GET /me` | ❌ sends `display_name`, `bank_connection`; contract wants `user`, `bank` | ❌ same mismatch |
| `GET /pact` | ✅ pass (but empty) | ❌ no such route |
| `POST /explain` | ✅ pass (`tip`) | ❌ uses `block_type`, not `kind` |
| `POST /pact/parse` | ✅ pass | ✅ pass |
| `POST /actions/move-to-buffer` | ❌ only `buffer_days` missing | ❌ same shape problem as `/forecast` |
| Stack in the spec (FastAPI + routers) | ✅ | ❌ |

Tyler's 4 failures are three small, additive fixes (send `buffer_days`, send `"YYYY-MM"`, reshape `/me`). Jawad's engine passes 2 of 8 and would need most responses rebuilt.

## Decisions

1. **Frontend base: Roh's `feature/web-frontend`.** Its `web/lib/contracts.ts` is the contract for the web app. Every other branch builds on it, not beside it. *(Done for `frontend-mocks`: my own contracts, scaffold and mocks were removed, and Roh's files win wherever we overlapped.)*
2. **Engine: Tyler's.** It already matches the contract and the planned layout. Jawad's extras (support check, calibration, CSV linear model) get ported into Tyler's routers as BX extensions *after* the demo path works. **Don't merge Jawad's `web/lib/contracts.ts` or `web/mocks/*`**: they would overwrite Roh's, and that is where the conflicts come from.
3. **Contract changes.** One `contract:` commit with additions only (allowed after 15:00), touching `engine/contracts.py`, `web/lib/contracts.ts` and the mocks:

   | # | Change | Why | Who |
   | --- | --- | --- | --- |
   | a | Engine sends rewind `month` as `"YYYY-MM"` | Tyler's `/rewind` fails the contract today | A |
   | b | Engine sends `Forecast.buffer_days` (Roh added it in FE-03; demo is 6) | Without it, `/forecast` and move-to-buffer fail and the Weather screen shows its fallback | A |
   | c | Engine's `/me` returns Roh's `Me` shape: `{ user: { name, email }, bank: { name, connected_until } \| null, onboarding_complete }` | Tyler sends `display_name` and `bank_connection` | A |
   | d | Engine seeds the demo: the 4 rules in `web/mocks/pact.json`, ally Jade (sister) | Today `/pact` returns `[]` and `ally: null`; the design shows 4 rules and "Jade knows" | A |
   | e | Make `best_action` nullable (`BestAction.nullable()`) | Tyler's `POST /forecast` returns `null`, and a forecast with no storm has nothing to suggest. Today one `null` fails the whole Weather screen | A + B |
   | f | `horizon_days` and `paths`: `z.number().int()` instead of literal 60 and 1000 | Tyler's `POST /forecast` accepts 1 to 60 days. The demo stays 60 and 1000 | B |
   | g | Add optional `active_from` and `change_requested_at` to `PactRule` | Tyler already sends them; the 48-hour lock line needs them | B |
   | h | `income_dip` `amount_gbp` is **positive** (the size of the dip); `kind` gives the direction | Tyler sends `90`, Roh's mock has `-90` | B (one mock line) |

   `rules_on_count` (from Jawad) isn't needed: the Weather tile can count `GET /pact`.

4. **Thresholds.** The engine rule stays as it is: fine below 0.10, tight from 0.10 up to `storm_threshold` (default 0.30, inclusive), storm above it. The UI shows the engine's `state` and never recomputes it. **Still to confirm** (live in `web/lib/thresholds.ts` and are easy to change):
   - Storm mode takes over when the storm is today or tomorrow.
   - Safety buffer band: 0 empty, under 7 low, under 14 ok, 14+ good.
   - Calm-mode offer: shown when mood is `worried` and calm mode is off.
   - Roh's `oneInN(0.97)` reads "1 in 1"; suggest "almost certain" from 0.95.
5. **Hooking up the mocks.** When Roh is ready, the mock branch in `web/lib/api.ts` calls `mockApi.forecast()` (and the same for `rewind`, `settings`, `me` and `pactRules`; same names, same demo data, which a test checks) instead of the static JSON. Then `?scenario=` and `/dev/scenarios` drive every screen. `USE_MOCKS=false` still goes to the engine.
6. **Merge order.**
   1. `frontend-mocks` → `feature/web-frontend` (B approves). It is a clean merge: the branch contains all of Roh's work and adds only new files.
   2. Tyler merges `main` into `tyler`, keeps `main`'s README and skills, combines the two `.gitignore` files, and deletes the committed `engine/__pycache__/` and `engine/pact.sqlite3`. Those 4 files currently conflict. Then `tyler` → `main`.
   3. The `contract:` commit (decision 3) after both, then `feature/web-frontend` → `main` at Gate 2.

## If we don't agree by 16:30

Fall back to the plan's Option B: run the demo on mocks only (`USE_MOCKS=true`, `/dev/scenarios` → `demo` then `demo_after_buffer`), which works today with no engine.
