"""Speed budgets for the engine. Each test times a hot path and fails if it goes over budget.

Budgets are about 10x the p95 measured on a Windows laptop on 7 Nov (see docs/benchmarks.md),
so they catch real regressions, not noise. Run with `-s` to print the timings; docs/benchmarks.md
records the latest run.
"""
import statistics
import time
from datetime import date

import pytest
from fastapi.testclient import TestClient

from engine import database
from engine.forecast import forecast_from_customer_data, make_forecast
from engine.main import app

ORIGIN = {"Origin": "http://localhost:3000"}

CUSTOMER = dict(
    as_of=date(2026, 3, 10),
    current_balance_gbp=240,
    incomes=[
        {"label": "Universal Credit", "amount_gbp": 420, "next_pay_date": date(2026, 3, 13), "frequency": "monthly", "variability_pct": 0.05},
        {"label": "Gig income", "amount_gbp": 180, "next_pay_date": date(2026, 3, 11), "frequency": "weekly", "variability_pct": 0.25},
    ],
    bills=[
        {"label": "Rent", "amount_gbp": 620, "due_date": date(2026, 4, 1), "frequency": "monthly"},
        {"label": "Phone", "amount_gbp": 45, "due_date": date(2026, 3, 22), "frequency": "monthly"},
        {"label": "Council tax", "amount_gbp": 118, "due_date": date(2026, 3, 23), "frequency": "monthly"},
        {"label": "Insurance", "amount_gbp": 9.83, "due_date": date(2026, 4, 6), "frequency": "monthly"},
    ],
    horizon_days=60,
    paths=1000,
    seed=2026,
)


def timed(fn, runs: int) -> list[float]:
    fn()  # warm up
    out = []
    for _ in range(runs):
        start = time.perf_counter()
        fn()
        out.append((time.perf_counter() - start) * 1000)
    return out


def report(name: str, ms: list[float], budget: float) -> None:
    p95 = sorted(ms)[max(0, int(len(ms) * 0.95) - 1)]
    print(f"\n[bench] {name}: median {statistics.median(ms):.2f} ms, p95 {p95:.2f} ms, budget {budget} ms (n={len(ms)})")
    assert p95 < budget, f"{name} p95 {p95:.1f} ms is over the {budget} ms budget"


def test_bench_demo_forecast():
    report("make_forecast (demo, 60 days)", timed(make_forecast, 50), budget=5)


def test_bench_customer_monte_carlo_1000_paths_60_days():
    report("forecast_from_customer_data (1,000 paths x 60 days)", timed(lambda: forecast_from_customer_data(**CUSTOMER), 20), budget=60)


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "bench.sqlite3")
    with TestClient(app, base_url="https://testserver") as c:
        c.post("/auth/demo", headers=ORIGIN)
        yield c


def test_bench_get_forecast_endpoint(client):
    # 40 calls stays under the 60 requests/minute rate limit.
    report("GET /forecast (API, with session and DB)", timed(lambda: client.get("/forecast"), 40), budget=125)


def test_bench_post_forecast_endpoint(client):
    body = {**CUSTOMER, "as_of": "2026-03-10"}
    for key in ("incomes", "bills"):
        body[key] = [{k: (v.isoformat() if isinstance(v, date) else v) for k, v in item.items()} for item in CUSTOMER[key]]
    report("POST /forecast (API, 1,000 paths x 60 days)", timed(lambda: client.post("/forecast", json=body, headers=ORIGIN), 10), budget=150)
