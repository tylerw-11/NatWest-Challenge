# Frontend plan (owner B, branch `feature/web-frontend`)

Written 15:20, Saturday 7 November. Gate 1 (15:00) has passed with no code in `web/`, so this plan is built **mocks-first**: every screen renders from `web/mocks/*.json` with `USE_MOCKS=true`. When the engine lands, we swap the source. Feature freeze is **16:45** (about 85 minutes). Cutoff is 17:40.

The F-numbers in the project doc's Frontend to-do tab could not be read from this session. Match each phase below to its F-ID before you commit, and use the `[F#] web: change` format.

## Branching (gitflow, adapted to the team rule)

- Work on `feature/web-frontend`, branched from `main`. The team workflow merges to `main` and has no `develop` branch.
- For each screen, branch `feature/web-<screen>` off `feature/web-frontend`, or commit straight onto it if you are working alone.
- Merge `feature/web-frontend` into `main` **at least every 30 minutes**: at 15:50, 16:20 and 16:40. Run `npm run lint` first (and `pytest` once the engine exists).
- Contract changes go in their own `contract:` commit and touch `engine/contracts.py`, `web/lib/contracts.ts` and the mock together.
- After 16:45, commit only fixes on `hotfix/<thing>` branches off `main`.

## Phase 0: scaffold (15:20 to 15:35). Must

1. Run `npx create-next-app@latest web` with TypeScript, App Router and Tailwind, then add shadcn/ui, TanStack Query, Zod, Motion, Sonner, Vaul and `@number-flow/react`.
2. Put the tokens from pact-frontend into CSS variables in `app/globals.css`, keyed on `data-colour-mode` (standard first; colour-blind and high-contrast values are a Should). Add Atkinson Hyperlegible through `next/font`.
3. Add `lib/contracts.ts` with Zod for `Day`, `Driver`, `Forecast`, `RewindMonth`, `RewindCategory`, `PactRule`, `Settings`, `UIBlock` and the error shape, copied from pact-contracts.
4. In `lib/api.ts`, read `NEXT_PUBLIC_API_URL`, or the mocks when `USE_MOCKS=true`. Parse every response with Zod. `lib/hooks.ts` holds the TanStack Query hooks.
5. Add the mocks `forecast.json`, `rewind.json` and `settings.json` with the exact demo figures: 10 to 18 March clear, 19 to 22 March cloudy, 23 March storm at p about 0.33, `covered_until` 19 March, the three drivers (£118 on 23 Mar, £45 on 22 Mar, about £90 less from 16 to 22 Mar), and best action £15 on 13 March giving 1 in 8. For Rewind: the monthly figures 12, 8, 31, 15, 9, 24, 14, 10, 38, 27, 16, 10, a total of £214, and categories of £118, £61 and £35.
6. Make a 390 px app frame. `CAPTURE=true` locks it to 390×844.

**Commit, then merge to main.** This merge unblocks the engine team, who need `lib/contracts.ts` to mirror.

## Phase 1: shared components (15:35 to 15:50). Must

The components are TabHeader, SubHeader, BottomNav (76 px, four tabs), HeroCard (an eyebrow and a 72 px icon slot), ListCard (with a `<details>` "See where these come from"), TipCard, Tile, PrimaryButton and SecondaryButton (56 px and 52 px), a pill button, the drawn WeatherIcon (sun, cloud and storm, each paired with a word), and RiverChart (SVG 356×110, following the chart spec, with `role="img"` and an `aria-label`). Show all of them on `/dev/components`.

Helper: `oneInN(p)` returns the nearest "1 in N". `cloudy` maps to "tight" here and nowhere else.

## Phase 2: demo-path screens, in demo order (15:50 to 16:40). Must

| Demo step | Route | Blocks (from pact-frontend) | Data |
| --- | --- | --- | --- |
| 1 | `/` Weather | clear hero "good until Thu 19 March", 7-day strip with arrows, storm card for Mon 23 March, tiles (buffer 6 days, 4 rules), "Why the storm?", "Get ready for it" | `GET /forecast` |
| 2 | `/river` Time River | storm hero "1 in 3", chart with Week / Payday / Week pills, causes list with due dates in the due colour, tip | `/forecast`, `/drivers/{day}`, `POST /explain` |
| 3 | `/rewind` Rewind | rewind hero £214, area chart, "Where it went" list, tip (kept with pact about £96) | `GET /rewind` |
| 4 | `/pact` Pact | teal hero, text area with mic, four checkbox rule rows, note card, "Agree to 4 rules", 48-hour lock line | `POST /pact/parse`, `POST /pact`, `/pact/note` |
| 5–6 | `/storm` Storm mode | illustration, note, "Move £15 to my buffer", chips, "🫂 I'm not okay" | `POST /simulate?as_of=2026-03-13`, `POST /actions/move-to-buffer` |
| 7 | `/` again | 23 March now tight | refetch after the action |

The fast-forward in step 5 is a hidden presenter control, for example a key press or a `?as_of=` query. It calls `/simulate`, then routes to `/storm`. The ally toast "Jade was told" (Sonner) is a Should, but cheap.

Merge at 16:20 once Weather, Time River and Rewind work. Merge again at 16:40 with Pact and Storm.

## Phase 3: remaining Musts (only if Phase 2 is green by 16:30)

Support (mood check-in with three buttons, Talk to someone, Settings and Account rows), Settings (four segmented tabs, with Reading and Colours wired), Log in ("Continue as Amara (demo)" calls `POST /auth/demo`). Keep each minimal. A static layout counts.

## After 16:45 (fixes only)

Run axe and one keyboard pass per screen, fix copy against the copy rules, and set up `CAPTURE=true` for the video. Should items come next: Sign-up step 2, Account, colour-blind and high-contrast tokens, calm mode. Could items (FX1 to FX8) only if every Must is done.

## Fallbacks (Option B)

- Engine not ready by 16:20: ship on mocks, with `USE_MOCKS=true` for the demo. Add a second mock, `forecast_after.json`, so step 7 still shows 23 March as tight.
- `/explain` failing: use a fixed template sentence that holds only engine fields.
- Pact parser failing: show the four pre-written rule rows from a mock `pact_draft.json`, which the user still confirms.
- RiverChart running long: show a 60-day row of weather icons and keep the "1 in 3" hero.

## Checks before every commit

These come from pact-build-workflow. Every number comes from an engine or mock field. Colours come from tokens, and radii are 24, 20 or pill. Tab screens use TabHeader and BottomNav, and sub-screens use SubHeader. Copy uses fine, tight or storm and "1 in N". Buttons and links are real elements with 44 px targets. Contract changes travel with their mocks.

## Handover

At the end of each session, post the handover note from pact-build-workflow in the team chat.
