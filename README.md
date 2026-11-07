# Pact

Pact is a money forecast in which your past self protects your future self. It shows the next 60 days as financial weather, and when a storm is coming it switches on the rules you set while things were calm. Built for the NatWest challenge at GreatUniHack 2026 (AI-Powered Financial Inclusion and Resilience).

## Where everything lives

| What | Where |
| --- | --- |
| Spec, backend requirements, frontend to-do, demo and video plan | [Project doc](https://claude.ai/artifact/EFY56L7ih5tMERddNTnXUN) (four tabs) |
| All 10 screen designs | [Design canvas: Pact: all screens](https://claude.ai/artifact/GGKCEgUqdVmutbaiQvgGPo) |
| NatWest brief | `docs/NatWest-brief.pdf` |
| Claude Code skills | `.claude/skills/` |

## Repo layout

```
.claude/skills/   shared Claude Code skills (load automatically from the repo root)
docs/             NatWest brief and links
engine/           FastAPI backend (built by tasks T1 to T11, T16)
web/              Next.js frontend (built by tasks F1 to F16)
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

These work once task T1 has scaffolded the apps.

```bash
# backend
cd engine && pip install -r requirements.txt && uvicorn main:app --reload

# frontend
cd web && npm install && npm run dev
```
