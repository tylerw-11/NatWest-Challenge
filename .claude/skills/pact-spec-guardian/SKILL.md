---
name: pact-spec-guardian
description: Use before any Pact (GreatUniHack 2026) build task to check it against the spec's invariants, scope tiers, gates, and the 17:40 cutoff, and to block scope creep.
---

# Pact spec guardian

Pact is a forecasting app in which a user's past self protects their future self. The sources of truth are the project doc "Pact: GreatUniHack 2026 project spec and 5-hour build plan" (tabs: Spec and plan, Backend requirements, Frontend to-do, Demo and video) and the design canvas "Pact: all screens" (10 screens). If this skill disagrees with them, they win; ask the team to update this skill.

## Run this check before every task

1. Name the screen the task belongs to: Weather, Time River, Pact, Storm mode, Rewind, Support, Settings, Log in, Sign-up, or Account.
2. Look up its tier in the scope table. A Cut item gets a one-line refusal and a pointer to the roadmap slide.
3. Check the task against the seven invariants. A violation blocks the task until it is redesigned.
4. Check the clock against the gates. After 16:45, accept bug fixes, accessibility fixes, copy, and caching; refuse new features.

## Invariants

1. The Python engine computes every number. Claude never writes a figure into UI text; UI blocks reference engine IDs.
2. The AI proposes and the user confirms every action. Nothing moves money or changes a setting without a confirmed rule row or button press.
3. Pact actions come from a closed list: `category_cap`, `credit_pause_hours`, `notify_ally`, `move_to_buffer`, `show_note`. Anything else is rejected and the user is asked to rephrase.
4. Vulnerability is declared by the user and never inferred. The Support mood check-in asks; the app never labels.
5. The trusted ally receives storm alerts only. The ally never sees spending or moves money. Removing the ally takes one tap.
6. Every forecast shows its chance of going short as a frequency ("1 in 3") and its causes.
7. The demo runs on synthetic data for Amara (24, Manchester, care leaver, gig delivery rider on Universal Credit; trusted person Jade, her sister). Names and account numbers never reach Claude.

## Scope tiers

| Tier | Items |
| --- | --- |
| Must | Synthetic generator with the planted 23 March storm; forecast engine; Weather home with one-week strip; Time River with simplified chart and causes; Pact setup with parser and rule rows; Storm mode with note, one action, and I'm not okay; Rewind with line chart and fee rows; Support hub with mood check-in; Settings with four tabs (Reading, Alerts, People, Colours); Log in with the demo button |
| Should | Mocked ally notification; calm mode toggle; colour-blind and high-contrast colour modes wired to tokens; Sign-up step 2 and Account screens |
| Could | Extensions BX1 to BX8 (Backend requirements tab) and FX1 to FX8 (Frontend to-do tab) |
| Cut | SMS; BSL; real money movement |

## Gates (Saturday 7 November)

| Time | Gate | Pass condition |
| --- | --- | --- |
| 15:00 | Gate 1 | A forecast from the engine renders in the Weather strip and the Time River chart with a Claude explanation |
| 16:45 | Gate 2, feature freeze | The seven-step demo flow runs end to end twice without a reload |
| 17:40 | Cutoff | Rehearsed twice; video exported; backup recording saved |

## Demo flow (the acceptance test)

1. Amara opens Weather on Tuesday 10 March: clear week, storm card for Monday 23 March.
2. Time River shows 1 in 3 chance of going short and three causes: council tax £118 (due 23 Mar), phone renewal £45 (due 22 Mar), quieter week (16 to 22 Mar).
3. Rewind shows £214 in extra costs over 12 months: monthly insurance premium £118, overdraft interest £61, pay-later late fees £35.
4. She sets a pact; Claude produces four rules; she agrees to them.
5. The presenter fast-forwards to Friday 13 March, payday, 10 days before the storm.
6. Storm mode shows her note and one button that moves £15 to her buffer; Jade's notification appears.
7. Weather re-runs and 23 March drops from storm to tight.

A task that does not move one of these steps closer to working before Gate 2 is deprioritised.

## Copy rules

- Simple reading level by default: short words, one idea per line.
- Risk appears as fine, tight, or storm, and as "1 in N".
- Warm, non-judgemental tone ("Not your fault. It costs more to have less.").
- Product language is guidance. Avoid "advice" and "recommend" in UI text.
