# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

Pact: a GreatUniHack 2026 (NatWest challenge) forecasting app in which a user's past self protects their future self. The brief is `docs/NatWest-brief.pdf`; the 10 approved screen designs are PNGs in `design/` (build to them exactly). `web/` is the Next.js app (built feature by feature on `feature/web-frontend`; plan in `docs/plans/frontend-plan.md`). The engine is on the `tyler` branch until it merges. Team decisions, including which engine and the contract fixes still open, are in `docs/decisions/` (start with `0001-data-contract.md`).

The detailed rules live in four skills. Read the relevant one before starting a task, because they are the team's working agreement:

| Skill | Covers |
| --- | --- |
| `pact-spec-guardian` | Run before every task: screen, scope tier (Must/Should/Could/Cut), seven invariants, time gates, demo flow, copy rules |
| `pact-build-workflow` | Task IDs (T/BX, F/FX, V), prompt templates, review checklist, commits, fallbacks, handover note |
| `pact-contracts` | Shared JSON types, endpoints, engine algorithms, demo figures the generator must reproduce, Claude usage |
| `pact-frontend` | Design tokens, layout patterns, the 10 screens, chart spec, emoji policy, accessibility |

The skills live in `.claude/skills/<name>/SKILL.md` and load automatically.

External sources of truth (they override the skills), linked in `docs/LINKS.md`: the project doc (tabs: Spec and plan, Backend requirements, Frontend to-do with F1–F16/FX1–FX8, Demo and video) and the design canvas "Pact: all screens". Task IDs and their prompts come from that doc.

## Commands

```bash
uvicorn engine.main:app --reload   # engine (FastAPI), from repo root (T1 chose this; see engine/main.py)
cd web && npm run dev              # web (Next.js)
pytest                             # engine tests (engine/tests/)
pytest engine/tests/test_x.py::test_name   # single test
cd web && npm run lint             # run with pytest before every merge to main
cd web-tests && npm test           # mock + threshold checks (needs web/node_modules)
```

Setup: copy `.env.example` to `.env` (holds `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_API_URL=http://localhost:8000`, `FRONTEND_ORIGIN`, `BANK_PROVIDER=synthetic`). Flags: `USE_MOCKS=true` (web reads `web/mocks/*.json` instead of the engine), `DEMO_CACHE=true` (engine serves cached Claude responses from `engine/demo_cache.json`), `CAPTURE=true` (web renders at 390×844 for video capture).

## Architecture

Two apps sharing one set of JSON contracts:

- **`/engine`**: Python (FastAPI, NumPy, pandas, SQLModel on SQLite). `generator.py` makes seeded synthetic data for the demo persona; `forecast.py` runs a 1,000-path, 60-day Monte Carlo simulation and maps each day's shortfall probability to clear/cloudy/storm; `routers/` holds one module per area; `prompts/` holds the Claude prompts (`explain.md`, `parse_pact.md`).
- **`/web`**: Next.js App Router, one route per screen, Tailwind plus shadcn/ui, TanStack Query (`lib/hooks.ts`) over typed fetch helpers (`lib/api.ts`) validated with Zod (`lib/contracts.ts`). Screens are composed of typed `UIBlock`s, never chat transcripts. Charts are hand-built SVG.
- **Mocks and thresholds**: `web/mocks/*.json` hold the exact demo figures. `web/mocks/scenarios.ts` builds 31 test scenarios on top of them, served by `web/lib/mockApi.ts` (same call names as `api`) and chosen on `/dev/scenarios` or with `?scenario=<name>`. Threshold decisions (storm warning lead time, Storm mode, buffer band, calm offer) live in `web/lib/thresholds.ts`; wording ("1 in N", fine/tight/storm) lives in `web/lib/format.ts`. Add a scenario there rather than editing the demo JSON.
- **Contracts**: `engine/contracts.py` (Pydantic) mirrors `web/lib/contracts.ts` (Zod). A type change updates both files and the affected mock in `web/mocks` in one commit prefixed `contract:`. After 15:00 on demo day, add fields instead of renaming them.
- **Claude's role**: it parses free-text pacts into `PactRule`s (tool use, closed action list) and explains forecasts as `hero`/`tip` blocks. It never computes numbers. A post-check rejects any figure absent from the inputs. Names and account numbers are stripped before every request. Responses are cached by (forecast_id, reading_level, translation).

## Rules that are easy to break

- Every number shown comes from an engine field. Claude text holds no new figures.
- Pact actions come from a closed list: `category_cap`, `credit_pause_hours`, `notify_ally`, `move_to_buffer`, `show_note`. Triggers: `storm_probability`, `buffer_below_days`, `user_not_okay`.
- The AI proposes; the user confirms every action. Vulnerability is declared by the user, never inferred. The ally receives storm alerts only.
- Show risk as "1 in N" with its causes. The engine state `cloudy` is labelled "tight" in the UI.
- The synthetic generator must reproduce the exact demo figures in `pact-contracts` (the 23 March storm, the £214 Rewind total, and so on). The seven-step demo flow in `pact-spec-guardian` is the acceptance test.
- Commit format: `[ID] area: change`, e.g. `[T4] engine: add best_action`. Merge to `main` at least every 30 minutes; after the 16:45 feature freeze only fixes, copy, accessibility and caching.
