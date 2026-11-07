from datetime import date, datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from engine import database
from engine.forecast import forecast_from_customer_data
from engine.main import app


AS_OF = date(2026, 3, 10)


def test_fixed_pay_and_due_bill_change_projected_balance():
    forecast = forecast_from_customer_data(
        as_of=AS_OF,
        current_balance_gbp=200,
        incomes=[{"label": "Pay", "amount_gbp": 500, "next_pay_date": date(2026, 3, 13), "frequency": "monthly", "variability_pct": 0}],
        bills=[{"label": "Rent", "amount_gbp": 150, "due_date": date(2026, 3, 12), "frequency": "once"}],
        horizon_days=10,
        paths=100,
        seed=7,
    )

    assert forecast.starting_balance_gbp == 200
    assert forecast.days[1].date == date(2026, 3, 11)
    assert forecast.days[1].p50 == 200
    assert forecast.days[2].p50 == 50
    assert forecast.days[5].p50 == 550
    assert forecast.days[2].p_shortfall == 0
    assert forecast.covered_until == date(2026, 3, 19)
    assert {driver.label for driver in forecast.drivers} == {"Pay", "Rent"}


def test_recurring_monthly_bill_rolls_forward_from_a_past_due_date():
    forecast = forecast_from_customer_data(
        as_of=AS_OF,
        current_balance_gbp=300,
        incomes=[],
        bills=[{"label": "Rent", "amount_gbp": 100, "due_date": date(2026, 2, 28), "frequency": "monthly"}],
        horizon_days=30,
        paths=100,
        seed=7,
    )

    rent_drivers = [driver for driver in forecast.drivers if driver.label == "Rent"]
    assert [driver.due_date for driver in rent_drivers] == [date(2026, 3, 28)]
    assert forecast.days[17].p50 == 300
    assert forecast.days[18].p50 == 200


def test_variable_income_is_reproducible_and_changes_shortfall_chance():
    inputs = dict(
        as_of=AS_OF,
        current_balance_gbp=0,
        incomes=[{"label": "Gig pay", "amount_gbp": 10, "next_pay_date": date(2026, 3, 11), "frequency": "once", "variability_pct": 0.7}],
        bills=[{"label": "Bill", "amount_gbp": 10, "due_date": date(2026, 3, 11), "frequency": "once"}],
        horizon_days=2,
        paths=5000,
        seed=123,
    )
    first = forecast_from_customer_data(**inputs)
    second = forecast_from_customer_data(**inputs)

    assert first.model_dump() == second.model_dump()
    assert 0 < first.days[1].p_shortfall < 1
    assert first.days[1].p10 < first.days[1].p50 < first.days[1].p90
    assert "bill-1-2026-03-11" in first.days[1].driver_ids


def test_post_forecast_route_uses_customer_payload_and_temp_database(tmp_path, monkeypatch):
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "forecast-test.sqlite3")
    with TestClient(app) as client:
        now = datetime.now(timezone.utc)
        with database.connect() as db:
            db.execute("INSERT INTO sessions VALUES(?,?,?,?,?,?)", ("pytest-session", "amara", "Pytest", now.isoformat(), now.isoformat(), (now + timedelta(days=1)).isoformat()))
        client.cookies.set("pact_session", "pytest-session")
        response = client.post(
            "/forecast",
            headers={"Origin": "http://localhost:3000"},
            json={
                "as_of": "2026-03-10",
                "current_balance_gbp": 250,
                "incomes": [{"label": "Pay", "amount_gbp": 900, "next_pay_date": "2026-03-13", "frequency": "monthly", "variability_pct": 0}],
                "bills": [{"label": "Phone", "amount_gbp": 45, "due_date": "2026-03-12", "frequency": "once"}],
                "horizon_days": 10,
                "paths": 100,
                "seed": 99,
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["starting_balance_gbp"] == 250
    assert payload["days"][2]["p50"] == 205
    assert payload["days"][3]["p50"] == 1105
    assert payload["paths"] == 100
