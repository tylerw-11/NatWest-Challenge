# Benchmarks

Measured on Sat 7 Nov 2026, 16:25, on a Windows 11 laptop (Intel Core Ultra, Python 3.13, Node 22.18). The engine figures are from `engine/tests/test_benchmarks.py`, which fails if any p95 goes over its budget. Budgets are about 10× the measured p95, so they catch real slow-downs rather than noise.

## Engine

| What | Median | p95 | Budget (p95) |
| --- | --- | --- | --- |
| `make_forecast`: the scripted demo, 60 days | 0.15 ms | 0.23 ms | 5 ms |
| `forecast_from_customer_data`: Monte Carlo, 1,000 paths × 60 days, 2 incomes, 4 bills | 2.7 ms | 4.9 ms | 60 ms |
| `GET /forecast` through the API (session check, SQLite, JSON) | 7.9 ms | 16.4 ms | 125 ms |
| `POST /forecast` through the API, 1,000 paths × 60 days | 10.6 ms | 13.9 ms | 150 ms |

```bash
python -m pytest engine/tests/test_benchmarks.py -q -s   # from the repo root; -s prints the timings
```

## Frontend

`web-tests/contracts.bench.ts`, run with `npm run bench` in `web-tests/` (vitest bench).

| What | Mean | p99 | Throughput |
| --- | --- | --- | --- |
| `Forecast.parse`: Zod check of a 60-day forecast, done on every screen load | 0.058 ms | 0.19 ms | ~17,000 / s |
| Threshold decisions for one forecast (60 × `weatherState`, `shouldWarn`, `inStormMode`) | 0.0013 ms | 0.004 ms | ~780,000 / s |
| `resetMocks` + parse the two-storm forecast | 0.12 ms | 0.41 ms | ~8,000 / s |

## What this means for the demo

Everything the demo does finishes in well under a frame (16 ms), apart from the network itself. Waiting is never caused by the forecast. In mock mode, the only noticeable delay is the 120 ms latency `mockApi` adds on purpose, so loading states are visible; the `slow` scenario raises it to 2.5 s.
