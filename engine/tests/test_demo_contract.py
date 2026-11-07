"""The demo flow and the web contract, through the real API (decision 0001).

Runs the engine against a temporary SQLite file, checks the spec's demo figures and the
invariants, and writes every response to web-tests/fixtures/engine-responses.json so the
web tests can parse them with the frontend's Zod contracts (web/lib/contracts.ts).
"""
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from engine import database
from engine.generator import DEMO_RULES
from engine.main import app

ORIGIN = {"Origin": "http://localhost:3000"}
FIXTURE = Path(__file__).resolve().parents[2] / "web-tests" / "fixtures" / "engine-responses.json"
ALLOWED_ACTIONS = {"category_cap", "credit_pause_hours", "notify_ally", "move_to_buffer", "show_note"}


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "demo-test.sqlite3")
    # The session cookie is Secure, so talk to the app over https.
    with TestClient(app, base_url="https://testserver") as c:
        assert c.post("/auth/demo", headers=ORIGIN).status_code == 204
        yield c


def day(forecast: dict, iso: str) -> dict:
    return next(d for d in forecast["days"] if d["date"] == iso)


def test_step_1_and_2_weather_and_time_river(client):
    f = client.get("/forecast").json()
    assert f["as_of"] == "2026-03-10" and f["horizon_days"] == 60 and f["paths"] == 1000
    assert [day(f, f"2026-03-{n:02d}")["state"] for n in range(10, 19)] == ["clear"] * 9
    assert [day(f, f"2026-03-{n}")["state"] for n in range(19, 23)] == ["cloudy"] * 4
    storm = day(f, "2026-03-23")
    assert storm["state"] == "storm" and round(1 / storm["p_shortfall"]) == 3  # "1 in 3"
    assert storm["p50"] == 35
    causes = {d["label"]: d for d in f["drivers"] if d["id"] in storm["driver_ids"]}
    assert causes["Council tax"]["amount_gbp"] == 118 and causes["Council tax"]["due_date"] == "2026-03-23"
    assert causes["Phone renewal"]["amount_gbp"] == 45 and causes["Phone renewal"]["due_date"] == "2026-03-22"
    assert causes["Quieter week"]["window"] == {"start": "2026-03-16", "end": "2026-03-22"}
    assert causes["Quieter week"]["amount_gbp"] > 0  # decision 0001 (h): size of the dip
    assert f["covered_until"] == "2026-03-19" and f["buffer_days"] == 6
    assert f["best_action"] == {"action_id": "move_to_buffer", "amount_gbp": 15, "date": "2026-03-13", "p_after": 0.125}


def test_step_3_rewind(client):
    r = client.get("/rewind").json()
    assert [m["month"] for m in r["months"]] == [f"2025-{m:02d}" for m in range(4, 13)] + ["2026-01", "2026-02", "2026-03"]
    assert [m["extra_gbp"] for m in r["months"]] == [12, 8, 31, 15, 9, 24, 14, 10, 38, 27, 16, 10]
    assert r["total_gbp"] == sum(m["extra_gbp"] for m in r["months"]) == 214
    assert [c["total_gbp"] for c in r["categories"]] == [118, 61, 35]
    assert r["kept_with_pact_gbp"] == 96


def test_step_4_pact_rules_and_closed_action_list(client):
    assert client.get("/pact").json() == []  # the demo starts with no rules
    drafts = [{**r, "confirmed": False} for r in DEMO_RULES]
    saved = client.post("/pact", json=drafts, headers=ORIGIN).json()
    assert len(saved) == 4 and all(r["confirmed"] for r in saved)  # stored only once the user agrees
    assert {r["action"]["kind"] for r in client.get("/pact").json()} <= ALLOWED_ACTIONS
    rejected = client.post("/pact/parse", json={"text": "Invest everything in crypto"}, headers=ORIGIN)
    assert rejected.status_code == 422 and rejected.json()["code"] == "rephrase"
    draft = client.post("/pact/parse", json={"text": "Put £15 aside on payday"}, headers=ORIGIN).json()[0]
    assert draft["action"]["kind"] == "move_to_buffer" and draft["confirmed"] is False  # the user confirms


def test_steps_5_to_7_storm_mode_move_and_rerun(client):
    client.post("/pact", json=[{**r, "confirmed": False} for r in DEMO_RULES], headers=ORIGIN)  # step 4
    sim = client.post("/simulate?as_of=2026-03-13", headers=ORIGIN).json()
    assert any(f["action_kind"] == "notify_ally" for f in sim["fired"])  # Jade's alert
    assert next(f for f in sim["fired"] if f["action_kind"] == "category_cap")["left_gbp"] == 12  # £20 cap - £8 spent
    assert sim["forecast"]["as_of"] == "2026-03-13"  # payday, 10 days before the storm
    # Invariant 2: nothing moves without a confirmed button press.
    assert client.post("/actions/move-to-buffer", json={"amount_gbp": 15, "confirmed": False}, headers=ORIGIN).status_code == 400
    after = client.post("/actions/move-to-buffer", json={"amount_gbp": 15, "confirmed": True}, headers=ORIGIN).json()
    assert day(after, "2026-03-23")["state"] == "cloudy" and round(1 / day(after, "2026-03-23")["p_shortfall"]) == 8
    assert after["best_action"] is None and after["buffer_days"] == 8 and after["as_of"] == "2026-03-13"
    # Step 7: Weather re-runs and remembers the move.
    assert day(client.get("/forecast").json(), "2026-03-23")["state"] == "cloudy"
    # A new demo login starts fresh, so the demo can run twice in a row.
    client.post("/auth/demo", headers=ORIGIN)
    assert day(client.get("/forecast").json(), "2026-03-23")["state"] == "storm"


def test_me_settings_and_ally_match_the_web_contract(client):
    me = client.get("/me").json()
    assert me["user"] == {"name": "Amara", "email": "amara@example.com"}
    assert me["bank"] == {"name": "Demo bank", "connected_until": "2027-03-10"} and me["onboarding_complete"] is True
    s = client.get("/settings").json()
    assert s["ally"] == {"name": "Jade", "relation": "sister"}  # invariant 7
    assert s["storm_threshold"] == 0.3 and s["reading_level"] == "simple"


def test_write_contract_fixture(client):
    """Snapshot of real responses; web-tests/engine-contract.test.ts parses it with Zod."""
    responses = {
        "forecast": client.get("/forecast").json(),
        "rewind": client.get("/rewind").json(),
        "settings": client.get("/settings").json(),
        "me": client.get("/me").json(),
        "pactRules": client.get("/pact").json(),
        "explain": client.post("/explain", json={}, headers=ORIGIN).json(),
        "moveToBuffer": client.post("/actions/move-to-buffer", json={"amount_gbp": 15, "confirmed": True}, headers=ORIGIN).json(),
    }
    responses["me"].pop("created_at", None)  # changes every run; keep the snapshot stable
    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE.write_text(json.dumps(responses, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    assert all(v is not None for v in responses.values())
