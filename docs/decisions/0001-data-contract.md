# Decision 0001: one data contract, one engine, one frontend base

Status: **implemented on `main`** (7 Nov, ~16:35). Items 1, 2, 3 (a to h), 5 and 6 are done; item 4's thresholds still need the team's confirmation. Jawad's extras (Could tier) are not ported. Linked from `README.md`, `CLAUDE.md` and `docs/plans/frontend-plan.md`.

### What changed on `main`

- `tyler`, `feature/web-frontend` (FE-01 to FE-03) and `frontend-mocks` merged. The 4 README/.gitignore/skill conflicts were resolved; the committed `engine/__pycache__/` and `engine/pact.sqlite3` were removed and are now ignored.
- Engine: (a) `YYYY-MM` rewind months; (b) `buffer_days`; (c) `/me` in the web shape, old fields kept; (d) demo seed of Jade (no rules: since FE-06 the demo creates them in step 4); `best_action` is `null` after the move; `GET /forecast` remembers a confirmed buffer move (demo step 7); a demo login resets the demo; the Pact parser now reads "Put £15 aside" as `move_to_buffer`.
- Web: (e) nullable `best_action`; (f) integer `horizon_days` and `paths`; (g) `active_from` and `change_requested_at` on `PactRule`; (h) the quieter-week mock is `+90`, and Weather says "£90 less"; `api.ts` serves mocks through `mockApi.ts` (item 5); "Get ready for it" only shows when there is a storm; the Grammarly hydration warning is silenced.
- Tests: 14 engine tests (demo flow, invariants, contract snapshot, benchmarks) and 112 web tests, including the engine's real responses parsed with the web contracts. Timings are in `docs/benchmarks.md`.
- Roh's FE-04 to FE-13 (all 10 screens, staged mock demo) merged on top. `api.ts` keeps Roh's staged demo and switches the read calls to `mockApi` only for a non-demo test scenario. Time River and Storm mode handle `best_action: null`.

### Next: backend integration (engine vs the app's calls)

| Call | App sends / expects | Engine today |
| --- | --- | --- |
| `POST /pact/parse` | returns `PactRule[]` (the 4 drafts) | returns `{ rules, rephrase_request }`, one rule |
| `POST /pact` | body `{ rules }` | body is a bare list |
| `POST /simulate` | `{ forecast, fired: [{ rule_id, action_kind, left_gbp }] }` | `{ forecast, fired_rules: [rule] }` |
| `POST /actions/move-to-buffer` | body `{ amount_gbp }` | also requires `confirmed: true` |
| `GET/POST /pact/note` | `{ text, duration_s }` | `{ transcript, audio_blob_ref }`, no GET |
| After the move | as of 13 March, `buffer_days` 8 | as of 10 March, `buffer_days` 7 |
| `GET /me` | optional `phone_masked`, `devices` | not sent | Needs a yes from A (engine), B (frontend) and C/D before Gate 2 (16:45).

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
