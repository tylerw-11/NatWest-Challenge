---
name: pact-frontend
description: Use when building or styling any Pact screen or component, so every screen matches the approved 10-screen design: layout patterns, tokens, charts, emoji policy, and accessibility.
---

# Pact frontend

The approved design is the two canvases "Pact: screen designs for review" and "Pact: login, onboarding and account screens". Build to them exactly. The app is mobile-first in a 390 px frame; every screen is composed of typed blocks and no screen contains a chat transcript. Task list: "Pact: frontend to-do" (F1 to F16, extensions FX1 to FX8).

## Stack

Next.js (App Router), Tailwind, shadcn/ui on Radix primitives, TanStack Query, Motion for transitions, Sonner for toasts, Vaul for sheets, `@number-flow/react` for the buffer tile. Charts are hand-built SVG following the chart spec below.

## Tokens

| Token | Value | Use |
| --- | --- | --- |
| font | Atkinson Hyperlegible 400/700 | All text |
| bg | #F5F6F2 | App background |
| surface | #FFFFFF, border #DADDD6 | Cards |
| divider | #E6E8E3 | Rows inside cards |
| ink / ink-2 | #17201B / #4B5650 | Text / secondary text |
| primary | #0E5E52 | Buttons, active nav, links, chart line |
| tint-teal | #E1EFEC | Pact, Support, Log in, Sign-up, Account heroes; tip cards |
| clear | hero #DDEBF6, label #1B5E8A, sun #F6C453 / #C78A12 | Fine days |
| tight | #ECEEF0, label #48535C | Tight days |
| storm | hero #FCE7D6, label #9A3A00, storm-mode bg #FBF3EC | Storm days |
| rewind | hero #ECE8F5, label #5B4B8A | Rewind |
| due / alert | #B3261E; colour-blind mode #1B4F9C | Due dates, I'm not okay, Delete my account |

Every colour lives in CSS variables with Standard, Colour-blind friendly, and High contrast sets, selected by `data-colour-mode` on `<html>`. Radii: hero 24, card 20, pill = height / 2. Spacing: page padding 20, gap between sections 16.

## Layout patterns

- **Tab screens** (Weather, Pact, Rewind, Support): TabHeader with a 22 px bold title on the left and a 44 px round read-aloud button on the right (Weather also has a Settings button). BottomNav, 76 px: Weather, Pact, Rewind, Support, with the active item in primary and bold.
- **Sub-screens** (Time River, Settings, Sign-up, Account): SubHeader with a 44 px back arrow and a 16 px bold title. No bottom nav.
- **Storm mode**: its own mode on #FBF3EC; small "Storm mode" label and "Full app" link; 132 px storm illustration centred above the headline.
- **Log in**: language pill and read-aloud in the header; centred hero; no nav.
- **Hero card**: tinted, radius 24, padding 22 by 20; 72 px icon left (centred 96 px on Log in); an uppercase 13 px eyebrow (CLEAR, STORM, YOUR PROMISE, LAST 12 MONTHS, CHECK IN, MAKE IT YOURS, WELCOME TO PACT); a 26 px headline; one 16 px line.
- **List card**: white card, 18 px heading, one-line rows at least 40 px tall with label left in regular weight and value right in bold. Extra detail goes behind a `<details>` "See where these come from" or "See more".
- **Tip card**: tint-teal, radius 20, 💡 then one sentence with the key outcome in bold.
- **Buttons**: primary 56 px tall, radius 28, primary fill, 17 px bold white. Secondary 52 px, outlined. Small controls 44 px pills.

## Screens

| Screen | Blocks, top to bottom |
| --- | --- |
| Weather | Hero (clear), "This week" 7-day strip with week arrows, storm card (links to Time River), two tiles (Safety buffer, Pact rules on), "Why the storm?" details, primary button "Get ready for it" |
| Time River | Hero (storm, "1 in 3 chance of going short"), chart card with ‹ Week / Payday / Week › pills, "What causes this" list card with due dates in bold due colour, tip card, primary button |
| Pact | Hero (teal), text area with mic button, "Your 4 rules" card of checkbox rows, note card with play button, primary "Agree to 4 rules", lock line about the 48-hour change delay |
| Storm mode | Illustration, date line, headline, note card, primary "Move £15 to my buffer", "Already working for you" emoji chips, secondary "🫂 I'm not okay" in due colour |
| Rewind | Hero (rewind), chart card, "Where it went" list card, tip card |
| Support | Check-in hero with three mood buttons (😊 Good, 😐 Unsure, 😟 Worried); Worried reveals the calm mode offer; Talk to someone (💬 Message us, 📞 Book a call back); debt advice link; Settings row; Account row |
| Settings | Segmented tabs 📖 Reading, 🔔 Alerts, 🤝 People, 🎨 Colours; one panel at a time |
| Log in | Hero, Log in with Face ID (primary), Get a code by text or email (secondary), Continue as Amara (demo) link, New to Pact row, Trouble logging in row, lock line |
| Sign-up step 2 of 3 | Progress bar, hero, three example-sentence buttons (Simple, Clear, Detailed), options card (read-aloud, colours, translation), Next, Skip for now |
| Account | Profile hero, Logging in card, Your bank card, Where you're logged in card, Your data card (Delete in due colour, 48-hour note), Log out |

## Chart spec (Time River and Rewind share it)

White card, 15 px bold caption, SVG 356 by 110. Dashed zero or base line in #B9BEB6. Data as one primary line, 3 px, round joins. Uncertainty band (forecasts) or area under the line (history) in primary at 12 per cent opacity. The key point is a radius-8 circle filled #FCE7D6 with a 3 px #9A3A00 ring. Axis text 12 px: only the start, the key point (bold, storm colour), and the end. The SVG carries `role="img"` and an `aria-label` sentence.

## Emoji policy

Emoji carry feeling, never data: greeting (👋), note (💌), tip (💡), Storm chips (🍔 ⏸️ 🤝), I'm not okay (🫂), Support (💛 and moods), Settings tabs, Log in rows. Weather states use the drawn sun, cloud, and storm icons. Emoji are `aria-hidden` when a word sits beside them.

## Accessibility requirements

- Touch targets at least 44 px; visible 3 px primary focus ring.
- Colour never carries meaning alone: weather states pair an icon and a word; due dates pair a date.
- Settings > Colours switches tokens for Standard, Colour-blind friendly (due #1B4F9C), and High contrast.
- Reading level (Simple, Clear, Detailed) passes to every explain request. Read-aloud uses the browser speech synthesis API.
- Translation renders beside the English; the English stays on screen; set `lang` and `dir`.
- Real `<button>`, `<a>`, `<details>`, `<label>` elements; no clickable divs. Respect `prefers-reduced-motion`.
- Run axe DevTools and one keyboard-only pass per screen before 16:45.

## Related skills

Use pact-build-workflow for prompts and the review checklist, pact-contracts for data shapes, and pact-spec-guardian before starting any task.
