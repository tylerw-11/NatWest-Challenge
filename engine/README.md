# engine

FastAPI backend for Pact. `main.py` creates the FastAPI app and mounts the route modules. `database.py` owns the SQLite connection and schema; `dependencies.py` provides session, settings, and event helpers.

## Layout

```text
main.py          FastAPI app and router registration
contracts.py     Pydantic request and response models
generator.py     seeded synthetic data for Amara
forecast.py      demo forecast and customer-data Monte Carlo model
database.py      SQLite schema and startup seed
dependencies.py  session, settings, and event helpers
routers/         auth, forecast, pact, rewind, settings, ally, account, explain
prompts/         explain.md, parse_pact.md
tests/           forecast model, demo flow + contract snapshot, speed budgets
requirements.txt backend dependencies
```

Run from the repository root with `uvicorn engine.main:app --reload`. `GET /forecast` returns the scripted demo; authenticated `POST /forecast` forecasts a supplied balance, income/payday schedule, and bill schedule.

Run the pytest suite from the repository root with `.venv\Scripts\python.exe -m pytest engine\tests -q`. It also writes `web-tests/fixtures/engine-responses.json`, which the web tests parse with the frontend contracts.

## Demo behaviour (decision 0001)

- `POST /auth/demo` seeds Amara: ally Jade (sister) and settings matching `web/mocks/settings.json`. She starts with no rules, as in `web/mocks/pact.json`: demo step 4 creates them with `POST /pact`. Each demo login also clears earlier buffer moves, so the seven-step demo can run twice in a row.
- `GET /forecast` includes `buffer_days` (6 in the demo) and applies any confirmed `POST /actions/move-to-buffer`: after £15, 23 March drops from storm (1 in 3) to tight (1 in 8), `buffer_days` becomes 7 and `best_action` becomes `null`.
- `GET /rewind` months are `YYYY-MM`. `GET /me` adds `user` and `bank` in the web contract's shape and keeps the older fields.
- Income-dip drivers have a positive `amount_gbp` (the size of the dip).

FastAPI and SQLite backend for the GreatUniHack Pact demo.

## Run locally on Windows

From the repository root (`NatWest-Challenge`):

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn engine.main:app --reload
```

PowerShell activation is optional. Calling the virtual environment's Python directly avoids execution-policy issues with `Activate.ps1`.

Start Uvicorn from the repository root so Python can import the `engine` package. `engine/requirements.txt` mirrors the root dependency list for tools that install from the backend folder.

The API listens on `http://localhost:8000`; interactive API docs are at `/docs`. Set `FRONTEND_ORIGIN` to the exact web origin when it differs from `http://localhost:3000`, and `PACT_DB` to select a SQLite file. The demo session cookie is HTTP-only, Secure, and SameSite=Lax. Chrome and Firefox treat `http://localhost` as secure and accept it; other hosts need HTTPS. Tests use an `https://testserver` base URL for the same reason.

`POST /auth/demo` seeds/uses Amara's synthetic account. Forecasts, drivers, and rewind figures come from the engine. The SQLite database is created at startup and synthetic transactions are generated deterministically. State-changing requests require a matching `Origin`; API traffic is limited to 60 requests per minute per session (or client address before sign-in).

### Forecasting customer cash flow

`POST /forecast` accepts a balance as of the start of a date, income/payday schedules, and dated bills. It simulates daily balances for up to 60 days. Income can have a relative variability (for example `0.10` means a 10% standard deviation); bills are fixed. The seed makes the same input reproducible. A shortfall is defined as an end-of-day balance below £0. `GET /forecast` remains the seeded Amara demo forecast.

Example request body for `POST /forecast`:

```json
{
  "as_of": "2026-03-10",
  "current_balance_gbp": 240,
  "incomes": [
    { "label": "Pay", "amount_gbp": 900, "next_pay_date": "2026-03-13", "frequency": "monthly", "variability_pct": 0 },
    { "label": "Gig income", "amount_gbp": 180, "next_pay_date": "2026-03-11", "frequency": "weekly", "variability_pct": 0.25 }
  ],
  "bills": [
    { "label": "Phone", "amount_gbp": 45, "due_date": "2026-03-22", "frequency": "monthly" },
    { "label": "Council tax", "amount_gbp": 118, "due_date": "2026-03-23", "frequency": "monthly" }
  ],
  "horizon_days": 60,
  "paths": 1000,
  "seed": 2026
}
```

The output includes a shortfall probability and p10/p50/p90 projected balances for each day, plus the dated income and bill drivers. This is a Monte Carlo cash-flow model, not a trained model; forecast quality depends on the schedules and income variability supplied.

Run mock-data tests from the repository root with `\.venv\Scripts\python.exe -m pytest engine\tests -q`.

## Current implementation notes

The demo forecast and rewind use deterministic planted figures so the scripted March 2026 flow is repeatable. The API currently uses safe template text for explanations and a limited keyword parser for Pact drafts; it does not send requests to Anthropic. Email/text code delivery, passkey verification, bank-provider integration, audio transcription, and scheduled deletion execution need external services or follow-up work. The ally is a stored contact and storm notification event, with no ally login or spending data access.
