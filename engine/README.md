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
tests/           planned generator, forecast, and Pact parser coverage
requirements.txt backend dependencies
```

Run from the repository root with `uvicorn engine.main:app --reload`. `GET /forecast` returns the scripted demo; authenticated `POST /forecast` forecasts a supplied balance, income/payday schedule, and bill schedule.
