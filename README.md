# Pact

Pact is a money forecast in which your past self protects your future self. It shows the next 60 days as financial weather, and when a storm is coming it switches on the rules you set while things were calm. Built for the NatWest challenge at GreatUniHack 2026 (AI-Powered Financial Inclusion and Resilience).

## Where everything lives

| What | Where |
| --- | --- |
| Spec, backend requirements, frontend to-do, demo and video plan | [Project doc](https://claude.ai/artifact/EFY56L7ih5tMERddNTnXUN) (four tabs) |
| All 10 screen designs | [Design canvas: Pact: all screens](https://claude.ai/artifact/GGKCEgUqdVmutbaiQvgGPo) |
| NatWest brief | `docs/NatWest-brief.pdf` |
| Claude Code skills | `.claude/skills/` |
| Frontend plan (features FE-01 to FE-13) | `docs/plans/frontend-plan.md` |
| Team decisions (data contract, which engine, merge order) | `docs/decisions/` |
| Speed budgets and latest timings | `docs/benchmarks.md` |
| Running live: real login (email code, Face ID), a real person's numbers, the ElevenLabs voice | `docs/integration.md` |
| Dev pages: tokens, components, mock scenarios | `/dev/tokens`, `/dev/components`, `/dev/scenarios` |

## Repo layout

```
.claude/skills/   shared Claude Code skills (load automatically from the repo root)
design/           the 10 approved screen designs (PNG)
docs/             NatWest brief, links, plans/, decisions/
engine/           FastAPI backend (tasks T1 to T11, T16); tests and benchmarks in engine/tests/
web/              Next.js frontend (tasks F1 to F16; see docs/plans/frontend-plan.md)
web-tests/        vitest checks for web/: mocks, thresholds, and the engine's real responses against the web contracts
```

## Getting started

1. Clone the repo and start Claude Code in the repo root, so the four Pact skills load.
2. Copy `.env.example` to `.env` and add your Anthropic API key.
3. Pick your task from the project doc (T, F, or V number) and paste its prompt.
4. Follow the pact-build-workflow skill: one task per session, commit as `[ID] area: change`, merge to main at least every 30 minutes.

## Gates (Saturday 7 November)

| Time | Gate |
| --- | --- |
| 15:00 | Gate 1: engine forecast renders on Weather and Time River with an explanation |
| 16:45 | Gate 2: feature freeze; the seven-step demo runs end to end twice |
| 17:40 | Cutoff: rehearsed, video exported, backup recording saved |

## Run commands

```bash
# backend: http://localhost:8000 (API docs at /docs). Run from the repo root.
pip install -r requirements.txt && uvicorn engine.main:app --reload --env-file .env

# frontend: http://localhost:3000, with mock scenarios at /dev/scenarios
cd web && npm install && npm run dev
```

## Tests and benchmarks

Run all of these before merging to `main`. All must pass.

```bash
python -m pytest engine/tests -q          # engine: demo flow, invariants, contract snapshot, speed budgets
cd web && npm run lint && npx tsc --noEmit && npm run build
cd web-tests && npm install && npm test   # mocks, thresholds, engine responses vs web contracts
cd web-tests && npm run bench             # frontend timings (see docs/benchmarks.md)
```

`python scripts/dry_run.py --runs 2` runs the seven-step demo twice, plus a new real person, against a running engine (see `docs/integration.md`).

Run `pytest` before `web-tests`: it writes `web-tests/fixtures/engine-responses.json`, the real engine responses that the web tests check against `web/lib/contracts.ts`.

With `USE_MOCKS=true` (the default) the web app runs without the engine. Pick a scenario (storm tomorrow, threshold edges, offline, colour-blind…) on `/dev/scenarios` or add `?scenario=<name>` to any URL; the list is in `web/mocks/README.md`.
