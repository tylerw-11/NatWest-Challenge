---
name: pact-build-workflow
description: Use for any Pact build session (frontend, backend, or demo video): picking a task, prompting, contract changes, review checklist, commits, fallbacks, and handover.
---

# Pact build workflow

This skill keeps four people and their Claude sessions consistent until the 17:40 cutoff. It works with pact-spec-guardian (scope and gates), pact-contracts (data and endpoints), and pact-frontend (design).

## Task lists

All task lists are tabs in the project doc "Pact: GreatUniHack 2026 project spec and 5-hour build plan"; the screens are on the canvas "Pact: all screens".

| List | Doc | IDs |
| --- | --- | --- |
| Backend and integration | Backend requirements tab, Build to-do | T1 to T17; extensions BX1 to BX8 |
| Frontend | Frontend to-do tab | F1 to F16; extensions FX1 to FX8 |
| Demo and video | Demo and video tab | V1 to V8 |

Every task has an owner (A engine, B frontend, C AI, D product), an Option A, an Option B fallback, a done-when check, and a prompt to paste.

## Start of every session

1. Name the task ID and its owner letter.
2. Run the pact-spec-guardian check: screen, scope tier, invariants, gate.
3. Pull main and run both apps: `uvicorn engine.main:app --reload` and `npm run dev` in `/web`.
4. One task per session. A second task starts a new session.

## Repo layout

```
/engine
  main.py            FastAPI app and routers
  contracts.py       Pydantic models (mirror of web/lib/contracts.ts)
  generator.py       seeded synthetic data
  forecast.py        engine algorithms
  routers/           auth, forecast, pact, rewind, settings, ally, account
  prompts/           explain.md, parse_pact.md
  tests/
/web
  app/               routes, one per screen
  components/        shared components only
  lib/contracts.ts   Zod schemas
  lib/api.ts         typed fetch helpers
  lib/hooks.ts       TanStack Query hooks
  mocks/             forecast.json, rewind.json, settings.json
/.claude/skills      the four Pact skills
```

Flags: `USE_MOCKS=true` (web reads `/web/mocks`), `DEMO_CACHE=true` (engine serves cached Claude responses), `CAPTURE=true` (web renders at 390 by 844 for video capture).

## Contract changes

1. Change `engine/contracts.py`, `web/lib/contracts.ts`, and the affected mock in one commit.
2. Prefix the commit `contract:` and post one line in the team chat naming the type and field.
3. Never rename a field after 15:00; add a new one.

## Prompt templates

Fill the brackets and paste into Claude Code.

**New endpoint**
```text
Task [ID]. Using the pact-contracts skill, add [METHOD] [PATH] returning [TYPE]. Put it in engine/routers/[file].py, validate input and output with the Pydantic models, return errors as { code, message_plain } at reading age 9, and add tests in engine/tests/. Do not change other endpoints.
```

**New component**
```text
Task [ID]. Using the pact-frontend skill, build [Component] in web/components with props [props]. Use only theme tokens, real buttons and links, 44 px targets, and the three colour modes. Add it to /dev/components.
```

**New screen**
```text
Task [ID]. Build the [Screen] screen exactly as the pact-frontend skill's screen table and the design canvas describe, using only shared components. Fetch [endpoints] through web/lib/api.ts, validate with Zod, show the fallback card on failure, and respect USE_MOCKS.
```

**Bug fix**
```text
Task [ID]. Bug: [what happens] when [steps]. Expected: [what should happen]. Find the cause, fix it with the smallest change, and add a test that fails before the fix.
```

**Claude prompt file**
```text
Task [ID]. Write engine/prompts/[name].md: role, inputs, output schema, the closed list of allowed actions or blocks, reading-level rules, and three examples. The model must never produce a figure that is absent from its inputs.
```

## Review checklist (before every commit)

- [ ] Every number on screen comes from an engine field; Claude text contains no new figures.
- [ ] Pact actions are from the closed list of five.
- [ ] Colours come from theme tokens; radii are 24 (hero), 20 (card), or pill.
- [ ] Tab screens use TabHeader and BottomNav; sub-screens use SubHeader.
- [ ] Copy is at the Simple reading level, uses fine, tight, or storm, and says "1 in N".
- [ ] Buttons and links are real elements with 44 px targets and visible focus.
- [ ] Contracts, mocks, and tests changed together where a type changed.
- [ ] No names or account numbers in any Claude request.

## Commits and merging

- Message format: `[ID] area: change`, for example `[T4] engine: add best_action` or `[F5] web: time river chart`.
- Merge to main at least every 30 minutes; run `pytest` and `npm run lint` first.
- Integration checks at 15:00 (Gate 1) and 16:45 (Gate 2): everyone stops, merges, and runs the demo path together.

## Fallbacks

If Option A is not working 20 minutes before its gate, switch to Option B, note it in the task, and tell the team. After 16:45, only Option B paths, bug fixes, copy, accessibility fixes, caching, and extensions whose owner has finished every must task are allowed.

## Handover note (end of every session)

Post in the team chat:

```text
[ID] status: done | blocked | switched to B
Changed: [files]
Contract changes: [none | type.field]
Next: [one line]
```
