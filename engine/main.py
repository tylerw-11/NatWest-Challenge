"""Pact demo API. All forecast figures are produced by the engine."""
from __future__ import annotations

import json
import os
import secrets
import sqlite3
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from fastapi import Cookie, Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

if __package__:
    from .contracts import CustomerForecastRequest, Forecast, PactRule, Settings
    from .forecast import DRIVERS, forecast_from_customer_data, make_forecast
    from .generator import REWIND_MONTHS, generate_transactions
else:
    from contracts import CustomerForecastRequest, Forecast, PactRule, Settings
    from forecast import DRIVERS, forecast_from_customer_data, make_forecast
    from generator import REWIND_MONTHS, generate_transactions

DB_PATH = Path(os.getenv("PACT_DB", Path(__file__).with_name("pact.sqlite3")))
ALLOWED_ACTIONS = {"category_cap", "credit_pause_hours", "notify_ally", "move_to_buffer", "show_note"}
app = FastAPI(title="Pact Engine", version="0.1.0")
origins = [x.strip() for x in os.getenv("FRONTEND_ORIGIN", "http://localhost:3000").split(",") if x.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True, allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"], allow_headers=["Content-Type", "X-Requested-With"])
_request_times: dict[str, list[float]] = {}


@app.middleware("http")
async def security_and_rate_limit(request: Request, call_next):
    if request.method in {"POST", "PUT", "PATCH", "DELETE"} and request.url.path not in {"/auth/demo", "/auth/logout"}:
        origin = request.headers.get("origin")
        if not origin or origin.rstrip("/") not in {x.rstrip("/") for x in origins}:
            return JSONResponse(status_code=403, content={"code": "origin_not_allowed", "message_plain": "This request did not come from Pact."})
    key = request.cookies.get("pact_session") or (request.client.host if request.client else "unknown")
    now = time.monotonic()
    recent = [t for t in _request_times.get(key, []) if now - t < 60]
    if len(recent) >= 60:
        return JSONResponse(status_code=429, content={"code": "rate_limited", "message_plain": "Please wait a moment and try again."})
    recent.append(now)
    _request_times[key] = recent
    return await call_next(request)


def connect() -> sqlite3.Connection:
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    return db


def init_db() -> None:
    with connect() as db:
        db.executescript("""
        PRAGMA foreign_keys=ON;
        CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, display_name TEXT NOT NULL, contact TEXT, created_at TEXT NOT NULL, deletion_requested_at TEXT);
        CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), device_label TEXT, created_at TEXT, last_seen_at TEXT, expires_at TEXT);
        CREATE TABLE IF NOT EXISTS settings(user_id TEXT PRIMARY KEY REFERENCES users(id), value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS transactions(id INTEGER PRIMARY KEY, user_id TEXT NOT NULL, date TEXT NOT NULL, amount_gbp REAL NOT NULL, merchant_label TEXT NOT NULL, category TEXT, is_recurring INTEGER DEFAULT 0);
        CREATE TABLE IF NOT EXISTS pact_rules(id TEXT PRIMARY KEY, user_id TEXT NOT NULL, value TEXT NOT NULL, confirmed_at TEXT, change_requested_at TEXT);
        CREATE TABLE IF NOT EXISTS pact_notes(id TEXT PRIMARY KEY, user_id TEXT NOT NULL, transcript TEXT, audio_blob_ref TEXT, recorded_at TEXT);
        CREATE TABLE IF NOT EXISTS allies(id TEXT PRIMARY KEY, user_id TEXT UNIQUE NOT NULL, name TEXT NOT NULL, relation TEXT NOT NULL, contact TEXT, status TEXT NOT NULL DEFAULT 'active', created_at TEXT);
        CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS support_needs(id TEXT PRIMARY KEY, user_id TEXT NOT NULL, text TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS explainer_cache(cache_key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS login_codes(contact TEXT PRIMARY KEY, code_hash TEXT, expires_at TEXT, attempts INTEGER DEFAULT 0, last_sent_at TEXT);
        CREATE TABLE IF NOT EXISTS passkeys(id TEXT PRIMARY KEY, user_id TEXT NOT NULL, credential_id TEXT NOT NULL, public_key TEXT NOT NULL, sign_count INTEGER DEFAULT 0, label TEXT);
        CREATE TABLE IF NOT EXISTS bank_connections(id TEXT PRIMARY KEY, user_id TEXT NOT NULL, provider TEXT, consent_expires_at TEXT, status TEXT);
        """)
        db.execute("INSERT OR IGNORE INTO users(id,display_name,created_at) VALUES('amara','Amara',?)", (datetime.now(timezone.utc).isoformat(),))
        db.execute("INSERT OR IGNORE INTO settings(user_id,value) VALUES('amara',?)", (Settings().model_dump_json(),))
        db.execute("INSERT OR IGNORE INTO bank_connections(id,user_id,provider,consent_expires_at,status) VALUES('demo-bank','amara','Demo bank','2027-03-10','connected')")
        if db.execute("SELECT COUNT(*) FROM transactions WHERE user_id='amara'").fetchone()[0] == 0:
            db.executemany("INSERT INTO transactions(user_id,date,amount_gbp,merchant_label,category) VALUES('amara',?,?,?,?)", [(t['date'], t['amount_gbp'], t['merchant_label'], t['category']) for t in generate_transactions()])


@app.on_event("startup")
def startup() -> None:
    init_db()


@app.exception_handler(HTTPException)
async def http_error(_request, exc: HTTPException):
    detail = exc.detail
    if isinstance(detail, dict) and "code" in detail:
        body = detail
    else:
        body = {"code": "request_error", "message_plain": str(detail)}
    return JSONResponse(status_code=exc.status_code, content=body)


def fail(status: int, code: str, message: str):
    raise HTTPException(status_code=status, detail={"code": code, "message_plain": message})


def current_user(pact_session: str | None = Cookie(default=None)) -> str:
    if not pact_session:
        fail(401, "sign_in_required", "Please sign in to use Pact.")
    now = datetime.now(timezone.utc)
    with connect() as db:
        row = db.execute("SELECT user_id FROM sessions WHERE id=? AND expires_at>?", (pact_session, now.isoformat())).fetchone()
        if row is None:
            fail(401, "session_expired", "Please sign in again.")
        db.execute("UPDATE sessions SET last_seen_at=?, expires_at=? WHERE id=?", (now.isoformat(), (now + timedelta(days=30)).isoformat(), pact_session))
        return row["user_id"]


def settings_for(user_id: str) -> Settings:
    with connect() as db:
        row = db.execute("SELECT value FROM settings WHERE user_id=?", (user_id,)).fetchone()
    return Settings.model_validate_json(row["value"]) if row else Settings()


class TextInput(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


class NoteInput(BaseModel):
    transcript: str = Field(default="", max_length=4000)
    audio_blob_ref: str | None = None


class MoveInput(BaseModel):
    amount_gbp: float = Field(gt=0, le=500)
    confirmed: bool


class AllyInput(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    relation: str = Field(min_length=1, max_length=80)
    contact: str | None = Field(default=None, max_length=200)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/auth/demo", status_code=204)
def demo_login(response: Response):
    session = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    with connect() as db:
        db.execute("INSERT INTO sessions VALUES(?,?,?,?,?,?)", (session, "amara", "Demo device", now.isoformat(), now.isoformat(), (now + timedelta(days=30)).isoformat()))
    response.set_cookie("pact_session", session, httponly=True, secure=True, samesite="lax", max_age=30 * 86400, path="/")


@app.post("/auth/logout", status_code=204)
def logout(response: Response, pact_session: str | None = Cookie(default=None)):
    if pact_session:
        with connect() as db:
            db.execute("DELETE FROM sessions WHERE id=?", (pact_session,))
    response.delete_cookie("pact_session", path="/")


@app.get("/me")
def me(user_id: str = Depends(current_user)):
    with connect() as db:
        user = dict(db.execute("SELECT id,display_name,contact,created_at FROM users WHERE id=?", (user_id,)).fetchone())
        bank = db.execute("SELECT provider,consent_expires_at,status FROM bank_connections WHERE user_id=?", (user_id,)).fetchone()
    user["bank_connection"] = dict(bank) if bank else None
    user["onboarding_complete"] = True
    return user


@app.get("/settings", response_model=Settings)
def get_settings(user_id: str = Depends(current_user)):
    return settings_for(user_id)


@app.put("/settings", response_model=Settings)
def put_settings(body: Settings, user_id: str = Depends(current_user)):
    with connect() as db:
        db.execute("INSERT INTO settings(user_id,value) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET value=excluded.value", (user_id, body.model_dump_json()))
    return body


@app.post("/support-needs", status_code=201)
def save_support_need(body: TextInput, user_id: str = Depends(current_user)):
    with connect() as db:
        db.execute("INSERT INTO support_needs VALUES(?,?,?,?)", (secrets.token_hex(12), user_id, body.text, datetime.now(timezone.utc).isoformat()))
    return {"saved": True}


@app.get("/forecast", response_model=Forecast)
def forecast(user_id: str = Depends(current_user)):
    return make_forecast(threshold=settings_for(user_id).storm_threshold)


@app.post("/forecast", response_model=Forecast)
def forecast_customer_data(body: CustomerForecastRequest, user_id: str = Depends(current_user)):
    """Forecast from the customer's balance, pay schedule, and due bills."""
    settings = settings_for(user_id)
    return forecast_from_customer_data(
        as_of=body.as_of,
        current_balance_gbp=body.current_balance_gbp,
        incomes=[item.model_dump() for item in body.incomes],
        bills=[item.model_dump() for item in body.bills],
        horizon_days=body.horizon_days,
        paths=body.paths,
        threshold=settings.storm_threshold,
        seed=body.seed,
    )


@app.get("/drivers/{day}")
def drivers(day: date, _user_id: str = Depends(current_user)):
    f = make_forecast()
    return [x for x in f.drivers if x.due_date == day or x.window and x.window["start"] <= day <= x.window["end"]]


@app.get("/rewind")
def rewind(_user_id: str = Depends(current_user)):
    labels = ["April 2025", "May 2025", "June 2025", "July 2025", "August 2025", "September 2025", "October 2025", "November 2025", "December 2025", "January 2026", "February 2026", "March 2026"]
    return {"months": [{"month": m, "extra_gbp": v} for m, v in zip(labels, REWIND_MONTHS)], "categories": [
        {"id": "insurance", "label": "Monthly insurance premium", "total_gbp": 118, "source_note": "Monthly payments cost more than paying yearly."},
        {"id": "overdraft", "label": "Overdraft interest", "total_gbp": 61, "source_note": "Interest across 22 days in the overdraft."},
        {"id": "pay-later", "label": "Pay-later late fees", "total_gbp": 35, "source_note": "Seven late fees of £5 each."}], "total_gbp": 214, "kept_with_pact_gbp": 96}


def new_rule(raw: dict, confirmed: bool) -> PactRule:
    action = raw.get("action", {})
    if action.get("kind") not in ALLOWED_ACTIONS:
        fail(422, "action_not_allowed", "Please say that another way. I can only use the actions in Pact.")
    return PactRule(id=raw.get("id") or secrets.token_hex(8), trigger=raw.get("trigger", {"kind": "storm_probability", "threshold": .3}), action=action, when_label=raw.get("when_label", "When money may be tight"), then_label=raw.get("then_label", "Show my Pact"), confirmed=confirmed)


@app.post("/pact/parse")
def parse_pact(body: TextInput, user_id: str = Depends(current_user)):
    # Deterministic safe fallback. ANTHROPIC_API_KEY can be wired later; numbers never come from a model.
    text = body.text.lower()
    if any(term in text for term in ("transfer money", "invest", "pay someone", "buy crypto")):
        return {"rules": [], "rephrase_request": "Please say that another way. I can only use the actions in Pact."}
    kind, label = ("move_to_buffer", "Move money to my buffer") if any(x in text for x in ("save", "buffer", "put aside")) else ("show_note", "Show my note")
    amount = 15.0
    import re
    match = re.search(r"£\s*(\d+(?:\.\d{1,2})?)", body.text)
    if match:
        amount = float(match.group(1))
    rule = new_rule({"action": {"kind": kind, **({"amount_gbp": amount} if kind == "move_to_buffer" else {})}, "trigger": {"kind": "storm_probability", "threshold": .3}, "when_label": "When a storm is coming", "then_label": label}, False)
    return {"rules": [rule], "rephrase_request": None}


@app.post("/pact", status_code=201)
def create_pact(body: list[PactRule], user_id: str = Depends(current_user)):
    saved = []
    with connect() as db:
        for item in body:
            rule = new_rule(item.model_dump(mode="json"), True)
            rule.active_from = date.today()
            db.execute("INSERT INTO pact_rules VALUES(?,?,?,?,?)", (rule.id, user_id, rule.model_dump_json(), datetime.now(timezone.utc).isoformat(), None))
            saved.append(rule)
    return saved


@app.get("/pact")
def list_pacts(user_id: str = Depends(current_user)):
    with connect() as db:
        return [json.loads(x["value"]) for x in db.execute("SELECT value FROM pact_rules WHERE user_id=?", (user_id,))]


@app.patch("/pact/{rule_id}")
def update_pact(rule_id: str, body: PactRule, user_id: str = Depends(current_user)):
    with connect() as db:
        row = db.execute("SELECT value FROM pact_rules WHERE id=? AND user_id=?", (rule_id, user_id)).fetchone()
        if not row:
            fail(404, "rule_not_found", "That rule could not be found.")
        old = json.loads(row["value"])
        old["pending_change"] = body.model_dump(mode="json")
        old["change_requested_at"] = datetime.now(timezone.utc).isoformat()
        db.execute("UPDATE pact_rules SET value=?,change_requested_at=? WHERE id=?", (json.dumps(old), old["change_requested_at"], rule_id))
    return {"scheduled_for": (datetime.now(timezone.utc) + timedelta(hours=48)).isoformat(), "rule": old}


@app.delete("/pact/{rule_id}")
def delete_pact(rule_id: str, user_id: str = Depends(current_user)):
    with connect() as db:
        row = db.execute("SELECT value FROM pact_rules WHERE id=? AND user_id=?", (rule_id, user_id)).fetchone()
        if not row:
            fail(404, "rule_not_found", "That rule could not be found.")
        value = json.loads(row["value"])
        value["pending_delete"] = True
        at = datetime.now(timezone.utc).isoformat()
        db.execute("UPDATE pact_rules SET value=?,change_requested_at=? WHERE id=?", (json.dumps(value), at, rule_id))
    return {"scheduled_for": (datetime.now(timezone.utc) + timedelta(hours=48)).isoformat()}


@app.post("/pact/note", status_code=201)
def save_note(body: NoteInput, user_id: str = Depends(current_user)):
    note_id = secrets.token_hex(8)
    with connect() as db:
        db.execute("INSERT INTO pact_notes VALUES(?,?,?,?,?)", (note_id, user_id, body.transcript, body.audio_blob_ref, datetime.now(timezone.utc).isoformat()))
    return {"id": note_id, "transcript": body.transcript}


def event(user_id: str, kind: str, payload: dict[str, Any]) -> None:
    with connect() as db:
        db.execute("INSERT INTO events VALUES(?,?,?,?,?)", (secrets.token_hex(12), user_id, kind, json.dumps(payload), datetime.now(timezone.utc).isoformat()))


def apply_scheduled_changes(user_id: str):
    now = datetime.now(timezone.utc)
    with connect() as db:
        rows = db.execute("SELECT id,value,change_requested_at FROM pact_rules WHERE user_id=? AND change_requested_at IS NOT NULL", (user_id,)).fetchall()
        for row in rows:
            requested = datetime.fromisoformat(row["change_requested_at"])
            if now >= requested + timedelta(hours=48):
                value = json.loads(row["value"])
                if value.pop("pending_delete", False):
                    db.execute("DELETE FROM pact_rules WHERE id=?", (row["id"],))
                else:
                    value.update(value.pop("pending_change", {}))
                    value["change_requested_at"] = None
                    db.execute("UPDATE pact_rules SET value=?,change_requested_at=NULL WHERE id=?", (json.dumps(value), row["id"]))


@app.post("/simulate")
def simulate(as_of: date, user_id: str = Depends(current_user)):
    apply_scheduled_changes(user_id)
    f = make_forecast(as_of=as_of, threshold=settings_for(user_id).storm_threshold)
    with connect() as db:
        rules = [json.loads(x["value"]) for x in db.execute("SELECT value FROM pact_rules WHERE user_id=?", (user_id,))]
    fired = []
    for rule in rules:
        if rule.get("confirmed") and not rule.get("pending_delete"):
            fired.append(rule)
            event(user_id, "rule_fired", {"rule_id": rule["id"], "date": as_of.isoformat(), "action": rule["action"]})
            if rule["action"]["kind"] == "notify_ally":
                event(user_id, "ally_notified", {"message": "Amara asked us to tell you money may be tight around 23 March. You can't see her spending."})
    storm = next((d for d in f.days if d.state == "storm"), None)
    if storm:
        event(user_id, "storm_started", {"date": storm.date.isoformat(), "p_shortfall": storm.p_shortfall})
    return {"forecast": f, "fired_rules": fired}


@app.post("/actions/move-to-buffer")
def move_to_buffer(body: MoveInput, user_id: str = Depends(current_user)):
    if not body.confirmed:
        fail(400, "confirmation_required", "Tap to confirm before moving money to your buffer.")
    event(user_id, "buffer_moved", {"amount_gbp": body.amount_gbp, "confirmed": True})
    return make_forecast(buffer_move=body.amount_gbp, threshold=settings_for(user_id).storm_threshold)


@app.post("/explain")
def explain(body: dict[str, Any], user_id: str = Depends(current_user)):
    level = settings_for(user_id).reading_level
    translation = settings_for(user_id).translation
    forecast_id = str(body.get("forecast_id", "demo-2026-03-10-0"))
    drivers = [d.model_dump(mode="json") for d in DRIVERS]
    cache_key = json.dumps([forecast_id, level, translation], separators=(",", ":"))
    with connect() as db:
        cached = db.execute("SELECT value FROM explainer_cache WHERE cache_key=?", (cache_key,)).fetchone()
    if cached:
        return json.loads(cached["value"])
    # Keep fallback copy free of figures; figures remain engine fields.
    copy = {"simple": "A few costs may land close together. See what causes this forecast.", "clear": "These costs may land close together, so money could feel tight.", "detailed": "The listed costs and a quieter week may raise the chance of a shortfall."}[level]
    block = {"kind": "tip", "text": copy, "driver_ids": [d.id for d in DRIVERS], "translation": None}
    if translation:
        block["translation"] = copy
    with connect() as db:
        db.execute("INSERT OR REPLACE INTO explainer_cache VALUES(?,?)", (cache_key, json.dumps(block)))
    return block


@app.get("/ally")
def get_ally(user_id: str = Depends(current_user)):
    with connect() as db:
        row = db.execute("SELECT name,relation,contact,status FROM allies WHERE user_id=?", (user_id,)).fetchone()
    return dict(row) if row else None


@app.post("/ally", status_code=201)
def put_ally(body: AllyInput, user_id: str = Depends(current_user)):
    with connect() as db:
        db.execute("INSERT INTO allies VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET name=excluded.name,relation=excluded.relation,contact=excluded.contact,status='active'", (secrets.token_hex(8), user_id, body.name, body.relation, body.contact, "active", datetime.now(timezone.utc).isoformat()))
    return {"name": body.name, "relation": body.relation, "status": "active"}


@app.delete("/ally", status_code=204)
def remove_ally(user_id: str = Depends(current_user)):
    with connect() as db:
        db.execute("DELETE FROM allies WHERE user_id=?", (user_id,))


@app.get("/account/sessions")
def account_sessions(user_id: str = Depends(current_user)):
    with connect() as db:
        return [dict(x) for x in db.execute("SELECT id,device_label,created_at,last_seen_at,expires_at FROM sessions WHERE user_id=?", (user_id,))]


@app.delete("/account/sessions/{session_id}", status_code=204)
def remove_session(session_id: str, user_id: str = Depends(current_user)):
    with connect() as db:
        db.execute("DELETE FROM sessions WHERE id=? AND user_id=?", (session_id, user_id))


@app.get("/account/export")
def account_export(user_id: str = Depends(current_user)):
    with connect() as db:
        bundle = {table: [dict(x) for x in db.execute(f"SELECT * FROM {table} WHERE user_id=?", (user_id,))] for table in ("transactions", "pact_rules", "pact_notes", "allies", "events", "support_needs", "sessions")}
        bundle["settings"] = settings_for(user_id).model_dump(mode="json")
    return {"user_id": user_id, "data": bundle}


@app.post("/account/delete")
def request_account_delete(user_id: str = Depends(current_user)):
    now = datetime.now(timezone.utc)
    with connect() as db:
        db.execute("UPDATE users SET deletion_requested_at=? WHERE id=?", (now.isoformat(), user_id))
    return {"scheduled_for": (now + timedelta(hours=48)).isoformat(), "cancel_available": True}


@app.post("/account/delete/cancel")
def cancel_account_delete(user_id: str = Depends(current_user)):
    with connect() as db:
        db.execute("UPDATE users SET deletion_requested_at=NULL WHERE id=?", (user_id,))
    return {"cancelled": True}

