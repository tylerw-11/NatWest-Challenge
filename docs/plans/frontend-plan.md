# Frontend plan: build the 10 designs feature by feature

Branch: `feature/web-frontend` (made from `main`; `main` is left alone). Owner: B. Sources: the PNGs in `design/` and the pact-frontend skill.

**How we work:** see Consistency rules below.

## Consistency rules (the same for every feature)

- **One feature, one branch, one checkpoint.** Features are never batched; each is approved on its own before the next one starts.
- **Branch:** `feature/web-NN-<name>` made from `feature/web-frontend`, for example `feature/web-01-foundation`.
- **Commit:** `[FE-NN] web: <change>`, for example `[FE-01] web: add colour tokens`. `FE-NN` is this plan's number. Map it to the project doc's F-ID when that tab can be read.
- **Merge:** after approval, `--no-ff` into `feature/web-frontend`, with the message `[FE-NN] merge: <feature>`.
- **Every handover to you looks the same:** what was built, the route to check, the design PNG to compare against, known gaps, and the next feature.
- **Before building, a brief in this fixed shape, then wait for "go":** 1) Goal: one line. 2) Branch. 3) Exactly what I'm doing, step by step, with the files I'll touch. 4) What you should expect to see: the route and a checklist to tick against the design PNG. 5) Out of scope, meaning what this feature deliberately leaves out. 6) Decisions or gaps that need your call.
- **After building, a handover in this fixed shape:** what was built, how to run it, the checklist again with results, gaps, and the next feature's brief.
- **Every screen is built the same way:** `app/<route>/page.tsx` composes shared components from `components/` and reads data through `lib/hooks.ts`. No screen-specific styling outside the tokens.

Every screen first renders from `web/mocks/*.json` (`USE_MOCKS=true`), holding the exact demo figures. When the engine is ready, switching to it is a one-line change in `lib/api.ts`.

## Tech stack (from pact-frontend)

| Concern | Choice |
| --- | --- |
| Framework | Next.js App Router with TypeScript; one route per screen |
| Styling | Tailwind, with every colour as a CSS variable switched by `data-colour-mode` on `<html>` |
| Primitives | shadcn/ui on Radix (checkbox, radio group, tabs, select) |
| Data | TanStack Query hooks (`lib/hooks.ts`) over fetch helpers (`lib/api.ts`), with every response parsed by Zod (`lib/contracts.ts`) |
| Motion and feedback | Motion for transitions, Sonner for toasts (Jade's alert), Vaul for sheets, `@number-flow/react` for the buffer tile |
| Charts | Hand-built SVG, 356×110; no chart library |
| Font | Atkinson Hyperlegible 400 and 700, loaded with `next/font` |
| Speech | Browser `speechSynthesis` for the read-aloud buttons |

## Features, in build order

Each row is one checkpoint for you to approve.

| # | Feature | Route | What you will see (matches the design) | Done when |
| --- | --- | --- | --- | --- |
| 1 | Foundation | `/dev/tokens` | Scaffolded app; colour, radius and spacing tokens; font; 390 px phone frame; Zod contracts; mocks; API layer | The swatch page shows every token in Standard, Colour-blind and High contrast |
| 2 | Component kit | `/dev/components` | TabHeader (title, read-aloud, optional settings button), SubHeader (back arrow and title), BottomNav (4 tabs, active in bold teal), HeroCard (eyebrow, 26 px headline, 72 px icon), ListCard (with `<details>`), TipCard (💡), Tile, Primary, Secondary and Danger buttons, Pill, Chip, drawn icons (sun, storm cloud, shield, rewind clock) | Each piece matches the PNGs, with 44 px targets and a visible focus ring |
| 3 | Weather (home) | `/` | "Hi Amara 👋", CLEAR hero "You're good until Thu 19 March", "This week" strip of 7 days with week arrows, STORM AHEAD card for Mon 23 March, tiles (buffer 6 days, 4 Pact rules on), "Why the storm? 3 bills, 1 week" See more, "Get ready for it" | Matches `1 Weather (home).png`; the storm card opens Time River |
| 4 | Time River | `/river` | STORM hero "1 in 3 chance of going short", "Most likely: £35 left"; chart "Your money, next 4 weeks" with a band, a dashed £0 line and a ringed 23 Mar point; pills ‹ Week, Payday, Week ›; "What causes this" with dates in red; tip "Save £15 on payday… drops to 1 in 8"; "Make a pact for this" | Matches `2 Time River.png`; every number comes from the mock |
| 5 | Rewind | `/rewind` | LAST 12 MONTHS hero "£214 extra, just for being short"; "Extra costs by month" area chart with Dec £38 marked; "Where it went" £118, £61 and £35; tip "kept about £96" | Matches `5 Rewind.png` |
| 6 | Pact | `/pact` | YOUR PROMISE hero; "In your words" text area with mic; "Your 4 rules" checkbox rows (when-label above, then-label below); note card with play button; "Agree to 4 rules"; 48-hour lock line | Matches `3 Pact.png`; nothing is saved until Agree is pressed |
| 7 | Storm mode | `/storm` | Peach background; "Storm mode" label and "Full app" link; storm illustration; "Fri 13 March · payday"; "A storm is 10 days away. You planned for this."; note card; "Move £15 to my buffer"; "Already working for you" chips (🍔 £12 left, ⏸️ Borrowing paused, 🤝 Jade knows); red outlined "🫂 I'm not okay" | Matches `4 Storm mode.png`; the move runs, Jade's toast shows, and back on `/` the 23rd reads "tight" (demo steps 5 to 7) |
| 8 | Support | `/support` | CHECK IN hero with 😊 😐 😟 mood buttons; Worried shows the calm-mode offer; "Talk to someone" tiles; debt-advice row; rows for Settings and Account | Matches `6 Support.png` |
| 9 | Settings | `/settings` | SubHeader "Make Pact work for you"; segmented tabs (📖 Reading, 🔔 Alerts, 🤝 People, 🎨 Colours); Reading panel with radio buttons, read-aloud checkbox and translation select; other panels kept minimal | Matches `7 Settings.png`; the Colours tab actually switches the tokens |
| 10 | Log in | `/login` | Language pill and read-aloud; centred shield hero "Your money weather…"; Face ID (primary); "Get a code" (secondary); "Continue as Amara (demo)"; two link rows; lock line at the bottom | Matches `8 Log in.png`; the demo link signs in and opens `/` |
| 11 | Sign-up step 2 | `/signup/2` | Progress bar 2 of 3; MAKE IT YOURS hero; Simple, Clear and Detailed example cards; options card; Next; "Skip for now" | Matches `9 Sign-up, step 2 of 3.png` (Should) |
| 12 | Account | `/account` | Profile hero with Edit; Logging in, Your bank, Where you're logged in and Your data cards (Delete in red with the 48-hour note); Log out | Matches `10 Account.png` (Should) |
| 13 | Polish | all | axe and keyboard pass, `prefers-reduced-motion`, `CAPTURE=true` 390×844 mode for the video | No axe errors on the demo path |

Features 1 to 10 are the Musts. 11 and 12 are Should. 13 runs after the 16:45 feature freeze.

## Rules I will hold each screen to

- Every £ amount, date and "1 in N" comes from a mock or engine field; none is typed into the page by hand. "Tight" is the label for the engine's `cloudy`.
- Colours come only from tokens. Radii are 24 (hero), 20 (card) or pill. Page padding is 20, with a gap of 16 between sections.
- Tab screens use TabHeader and BottomNav. Sub-screens use SubHeader and have no nav.
- Weather states use drawn icons plus a word. Emoji carry feeling only and are `aria-hidden` when a word sits beside them.
- Real `<button>`, `<a>`, `<details>` and `<label>` elements; no clickable divs.

## Timing

It is now about 15:25. Feature freeze is 16:45. Features 1 to 7 cover the seven-step demo, so they come first. If we fall behind, 8 to 10 become static layouts, and 11 and 12 slip to after the freeze (allowed only if every Must is done).

## Backups if something runs late

- Engine not ready: run the demo on mocks, and add `forecast_after.json` for step 7.
- Explain or parse failing: use template sentences and a pre-written `pact_draft.json`.
- Chart running late: show a 60-day row of weather icons and keep the "1 in 3" hero.
