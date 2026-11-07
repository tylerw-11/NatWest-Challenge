# Engine tests

Run from the repository root: `python -m pytest engine/tests -q` (add `-s` to print benchmark timings).

| File | What it checks |
| --- | --- |
| `test_forecast.py` | Customer-data Monte Carlo: schedules, recurring bills, reproducible seeds, `POST /forecast` |
| `test_demo_contract.py` | The seven-step demo through the real API (figures from the spec), invariants 2, 3 and 7, demo reset on login. Writes `web-tests/fixtures/engine-responses.json` for the web contract test |
| `test_benchmarks.py` | Speed budgets for the demo forecast, the 1,000-path Monte Carlo and both forecast endpoints (see `docs/benchmarks.md`) |

Every test uses its own temporary SQLite file, so the tests never touch `engine/pact.sqlite3`.
