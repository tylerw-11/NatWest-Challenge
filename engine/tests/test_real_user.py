"""A real person: email-code login, their own numbers, their own forecast; passkeys; the Pact parser."""
import base64
import json
from datetime import date
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from engine import database, mailer
from engine.main import app

ORIGIN = {"Origin": "http://localhost:3000"}
WEB_MOCKS = Path(__file__).resolve().parents[2] / "web" / "mocks"
PROFILE = {
    "current_balance_gbp": 120,
    "incomes": [{"label": "Pay", "amount_gbp": 900, "next_pay_date": date.today().replace(day=28).isoformat() if date.today().day < 28 else date.today().isoformat(), "frequency": "monthly", "variability_pct": 0.25}],
    "bills": [{"label": "Rent", "amount_gbp": 650, "due_date": date.today().isoformat(), "frequency": "monthly"}],
}


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "real-user.sqlite3")
    for key in ("SMTP_HOST", "SMTP_FROM"):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv("PACT_DEV_CODES", "true")
    with TestClient(app, base_url="https://testserver") as c:
        yield c


def login_with_code(client, email="sam.taylor@example.com") -> dict:
    sent = client.post("/auth/code/request", json={"email": email}, headers=ORIGIN)
    assert sent.status_code == 202
    return client.post("/auth/code/verify", json={"email": email, "code": sent.json()["dev_code"]}, headers=ORIGIN).json()


def test_code_login_new_person_then_their_own_forecast(client):
    assert login_with_code(client) == {"new_user": True}
    me = client.get("/me").json()
    assert me["user"] == {"name": "Sam", "email": "sam.taylor@example.com"} and me["onboarding_complete"] is False
    assert client.get("/forecast").json()["code"] == "no_profile"
    assert client.put("/profile", json=PROFILE, headers=ORIGIN).status_code == 200
    f = client.get("/forecast").json()
    assert f["as_of"] == date.today().isoformat() and len(f["days"]) == 60
    assert {d["label"] for d in f["drivers"]} >= {"Pay", "Rent"}
    assert f["days"][0]["state"] == "storm"  # £120 in the account, £650 rent due today
    assert client.get("/me").json()["onboarding_complete"] is True
    r = client.get("/rewind").json()
    assert r["total_gbp"] == 0 and len(r["months"]) == 12  # no made-up history for a real person
    # Logging in again with the same email is the same person, not a new one.
    client.cookies.clear()
    client.post("/auth/logout", headers=ORIGIN)
    with database.connect() as db:
        db.execute("UPDATE login_codes SET last_sent_at=NULL")
    assert login_with_code(client) == {"new_user": False}


def test_code_errors_are_plain_and_rate_limited(client):
    assert client.post("/auth/code/request", json={"email": "not-an-email"}, headers=ORIGIN).json()["code"] == "invalid_email"
    client.post("/auth/code/request", json={"email": "a@b.co"}, headers=ORIGIN)
    assert client.post("/auth/code/request", json={"email": "a@b.co"}, headers=ORIGIN).status_code == 429
    for _ in range(5):
        assert client.post("/auth/code/verify", json={"email": "a@b.co", "code": "000000"}, headers=ORIGIN).json()["code"] in {"wrong_code"}
    assert client.post("/auth/code/verify", json={"email": "a@b.co", "code": "000000"}, headers=ORIGIN).json()["code"] == "too_many_attempts"
    assert client.post("/auth/code/verify", json={"email": "x@y.co", "code": "123456"}, headers=ORIGIN).json()["code"] == "code_expired"


def test_real_email_is_sent_and_code_not_returned(client, monkeypatch):
    sent = {}
    monkeypatch.setenv("SMTP_HOST", "smtp.example.com")
    monkeypatch.setenv("SMTP_FROM", "Pact <pact@example.com>")
    monkeypatch.setattr(mailer, "send_login_code", lambda to, code: sent.update(to=to, code=code))
    body = client.post("/auth/code/request", json={"email": "Jo@Example.com"}, headers=ORIGIN).json()
    assert "dev_code" not in body and sent["to"] == "jo@example.com" and len(sent["code"]) == 6
    assert client.post("/auth/code/verify", json={"email": "jo@example.com", "code": sent["code"]}, headers=ORIGIN).json() == {"new_user": True}


def test_no_email_and_no_test_mode_refuses_politely(client, monkeypatch):
    monkeypatch.setenv("PACT_DEV_CODES", "false")
    assert client.post("/auth/code/request", json={"email": "a@b.co"}, headers=ORIGIN).json()["code"] == "email_not_set_up"


def test_passkey_options_and_unknown_device(client):
    options = client.post("/auth/passkey/login/options", headers=ORIGIN).json()
    assert options["rpId"] == "localhost" and options["userVerification"] == "required" and options["challenge"]
    client_data = base64.urlsafe_b64encode(json.dumps({"type": "webauthn.get", "challenge": options["challenge"], "origin": "http://localhost:3000"}).encode()).decode().rstrip("=")
    unknown = {"id": "bm90LWEtcmVhbC1rZXk", "rawId": "bm90LWEtcmVhbC1rZXk", "type": "public-key", "response": {"clientDataJSON": client_data, "authenticatorData": "", "signature": ""}}
    r = client.post("/auth/passkey/login/verify", json={"credential": unknown}, headers=ORIGIN)
    assert r.status_code == 404 and r.json()["code"] == "passkey_unknown"
    # Registering needs a session; with one, the options name this person.
    assert client.post("/auth/passkey/register/options", headers=ORIGIN).status_code == 401
    login_with_code(client, "kim@example.com")
    reg = client.post("/auth/passkey/register/options", headers=ORIGIN).json()
    assert reg["rp"]["id"] == "localhost" and reg["user"]["name"] == "kim@example.com"
    assert reg["authenticatorSelection"]["residentKey"] == "required"
    bad = client.post("/auth/passkey/register/verify", json={"credential": {"response": {"clientDataJSON": "e30"}}}, headers=ORIGIN)
    assert bad.status_code == 400


def test_demo_sentence_parses_to_the_four_draft_rules(client):
    client.post("/auth/demo", headers=ORIGIN)
    starter = "When things get tight, keep takeaways to £20 a week, stop me borrowing for 2 days, tell Jade, and save £15 on payday."
    drafts = client.post("/pact/parse", json={"text": starter}, headers=ORIGIN).json()
    expected = json.loads((WEB_MOCKS / "pact_draft.json").read_text(encoding="utf-8"))
    pick = lambda rules: [(r["id"], r["action"]["kind"], r["when_label"], r["then_label"], r["confirmed"]) for r in rules]  # noqa: E731
    assert pick(drafts) == pick(expected)
    saved = client.post("/pact", json={"rules": drafts}, headers=ORIGIN).json()  # the app's body shape
    assert len(saved) == 4 and all(r["confirmed"] for r in saved)
    assert len(client.post("/pact", json={"rules": drafts}, headers=ORIGIN).json()) == 4  # saving twice is safe
    assert len(client.get("/pact").json()) == 4


def test_note_round_trip(client):
    client.post("/auth/demo", headers=ORIGIN)
    assert client.get("/pact/note").json()["duration_s"] == 18  # the demo note
    client.post("/pact/note", json={"text": "Future me: you've got this.", "duration_s": 6}, headers=ORIGIN)
    assert client.get("/pact/note").json() == {"text": "Future me: you've got this.", "duration_s": 6}


def test_two_people_saving_the_same_rule_keep_their_own(client):
    """Review fix: rule ids are a global key, so one person's save must never take over another's rule."""
    client.post("/auth/demo", headers=ORIGIN)
    starter = "When things get tight, keep takeaways to £20 a week, stop me borrowing for 2 days, tell Jade, and save £15 on payday."
    drafts = client.post("/pact/parse", json={"text": starter}, headers=ORIGIN).json()
    client.post("/pact", json={"rules": drafts}, headers=ORIGIN)
    amara_cookie = client.cookies.get("pact_session")
    login_with_code(client, "lee@example.com")
    mine = client.post("/pact", json={"rules": client.post("/pact/parse", json={"text": "keep takeaways to £20 a week"}, headers=ORIGIN).json()}, headers=ORIGIN).json()
    assert len(mine) == 1 and mine[0]["id"] != "rule_takeaway_cap"
    client.cookies.set("pact_session", amara_cookie)
    assert len(client.get("/pact").json()) == 4  # Amara still has all four
    bad = client.post("/pact", json={"rules": [{"action": {"kind": "show_note"}}]}, headers=ORIGIN)
    assert bad.status_code == 422 and bad.json()["code"] == "invalid_rules"
