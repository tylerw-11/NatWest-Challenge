# Running Pact live (engine + app)

The app runs on mocks by default. This page is for running it against the real engine, with real login and a real person's numbers.

## Start both

```bash
# 1. Engine, from the repo root. --env-file loads .env (copy .env.example first).
pip install -r requirements.txt
uvicorn engine.main:app --reload --env-file .env          # http://localhost:8000, docs at /docs

# 2. App, with mocks off
cd web
USE_MOCKS=false NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev     # http://localhost:3000
```

On Windows PowerShell, set the variables first: `$env:USE_MOCKS="false"; $env:NEXT_PUBLIC_API_URL="http://localhost:8000"; npm run dev`.

Check the whole demo without a browser (run it twice; it must pass both times):

```bash
python scripts/dry_run.py --runs 2
```

## Logging in

| Button | What happens |
| --- | --- |
| **Continue as Amara (demo)** | `POST /auth/demo`. Amara's scripted demo, reset to Tue 10 March with no rules each time, so it can run twice in a row. |
| **Get a code by text or email** | `/login/code`. Enter an email and you get a 6-digit code (10 minutes, 5 tries, a new one after 30 seconds). A new email makes a new person, who goes to Sign-up step 2, then step 3 "Your money". Text messages are not built (SMS is Cut in the spec). |
| **Log in with Face ID** | A passkey (Face ID, Touch ID, Windows Hello or a phone). Turn it on first: log in with a code, then Account → Logging in → Turn on. |

### Email codes

Fill in `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` and `SMTP_FROM` in `.env`. Any SMTP service works: a Gmail or Outlook app password, SendGrid, Mailgun or Resend.

With no SMTP, set `PACT_DEV_CODES=true` to test locally. The code is then printed in the engine log and shown in the app as "Test mode". Never turn that on anywhere real: anyone could log in as any email. With neither set, "Send my code" answers "We can't send codes right now."

Set `PACT_SECRET` to a long random string so codes still work after the engine restarts.

### Passkeys (Face ID)

Passkeys only work in a browser over HTTPS or on `localhost`, and only for the host in `PACT_RP_ID` (default `localhost`). `FRONTEND_ORIGIN` must list the exact app address (default `http://localhost:3000`). To demo on a phone, serve both over HTTPS on one host name and set `PACT_RP_ID` to that name.

The session cookie is `Secure`. Chrome, Edge and Firefox accept it on `http://localhost`; any other host needs HTTPS.

## Read-aloud voice (ElevenLabs)

The read-aloud and play buttons ask the engine for an ElevenLabs voice (`POST /speech`, model `eleven_v3`, 74 languages). If that isn't possible, they use the browser's own voice instead, with no break.

The tone follows the moment, case by case (`engine/speech.py`, `delivery()`). The first rule that matches wins:

| Moment | Delivery |
| --- | --- |
| Their own pact note | warm, encouraging |
| Calm mode is on | calm, soft, slower (whatever the forecast says) |
| They said they feel worried | gentle, reassuring |
| A step that helped (money moved) | relieved, warm |
| Storm mode, or a storm on screen | reassuring, steady: serious but never frightening |
| Rewind (extra costs already paid) | empathetic, gentle |
| Tight | thoughtful, warm |
| Support, or mood "unsure" | gentle, warm |
| A fine week | warm, and cheerful if their mood is "good" |
| Log in, settings, account, sign-up | neutral |

The app sends the screen, the weather the screen is about, Storm mode, calm mode and the declared mood (`web/lib/voice-context.ts`). With a translation on, the language is left to auto-detect, because the screen holds both languages.

**How the key is used:**
- Only on the engine (`ELEVENLABS_API_KEY` in `.env`). It is never sent to the browser or logged.
- Only Pact's screen text and the person's own note are sent, after email addresses and long digit runs (accounts, sort codes, phones) are removed.
- Every clip is cached on disk (`engine/.speech_cache/`, ignored by git), so replaying a screen costs nothing.
- `ELEVENLABS_DAILY_CHARS` (3,000) and `ELEVENLABS_MONTHLY_CHARS` (9,000) keep it under the free tier's 10,000 characters a month.
- Each request is capped at 1,500 characters, must come from the Pact app's origin, and counts towards the 60-a-minute limit.
- The free tier asks for attribution: credit "Voice by ElevenLabs" in the demo and on the slides.

`NEXT_PUBLIC_VOICE=browser` turns the ElevenLabs voice off, for example for an offline rehearsal. Tests never call ElevenLabs.

## A real person's numbers

Sign-up step 3 ("Your money") saves `PUT /profile`: the money in the account today, pay (amount, next pay day, how often, whether it changes a lot) and bills. From then on:

- `GET /forecast` is their own 60-day Monte Carlo forecast (1,000 paths) from today, with the same fine, tight and storm rules as the demo.
- Weather, Time River and Storm mode show their dates, bills and chances.
- Rewind shows £0 for the last 12 months: Pact has no bank history for them, so it shows nothing rather than inventing figures.
- `best_action` is `null`. The model only knows pay and bills, not day-to-day spending, so it has no honest suggestion to make yet. The screens hide the suggestion.

A logged-out visitor is sent to Log in, and a person with no numbers yet is sent to Sign-up step 3 (`web/lib/api.ts`, `redirectFor`).

## Translation (whole app)

Choosing a language (on Log in before signing in, or in Settings and Sign-up step 2) translates every screen: buttons, labels, messages, errors and dates. Arabic, Urdu, Persian, Dari, Pashto, Sorani Kurdish and Hebrew switch the page to right-to-left. The choice is remembered in the browser and saved to the person's settings, and the read-aloud voice speaks the chosen language.

- `web/scripts/extract-strings.mjs` collects every English string into `web/public/i18n/en.json`.
- `web/public/i18n/<code>.json` holds the translations for each language. `web/scripts/check-translations.mjs` checks them.
- `web/lib/auto-translate.ts` swaps the text on screen and re-writes dates with `Intl`. It skips any entry whose `{0}` placeholders don't match, so a bad entry shows English rather than wrong text, and a missing language stays in English.
- The translations were written by Claude: they need a native-speaker check before launch. After adding UI text, run the extractor and translate the new strings.

## Not done yet: letter scanning

Photographing a bill to make it a dated event on the forecast needs an OCR or vision service (for example Claude with an `ANTHROPIC_API_KEY`). Until then, bills are added by hand in Sign-up step 3.

## Not done yet

- Text-message codes (Cut in the spec) and a real bank link (Open Banking needs a provider account and consent screens).
- Using Claude for the Pact parser and explanations: the engine uses a keyword parser and template sentences, and makes no Anthropic calls.
- Day-to-day spending in "Your money", which `best_action` needs for real people.
