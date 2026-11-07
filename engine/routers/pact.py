import json
import re
import secrets
from datetime import date, datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends

from ..contracts import MoveInput, NoteInput, PactRule, TextInput
from ..database import connect
from ..dependencies import apply_scheduled_changes, current_user, fail, settings_for, write_event
from ..forecast import make_forecast

router = APIRouter(tags=["pact", "simulation", "actions"])
ALLOWED_ACTIONS = {"category_cap", "credit_pause_hours", "notify_ally", "move_to_buffer", "show_note"}


def new_rule(raw: dict, confirmed: bool) -> PactRule:
    action = raw.get("action", {})
    if action.get("kind") not in ALLOWED_ACTIONS:
        fail(422, "action_not_allowed", "Please say that another way. I can only use the actions in Pact.")
    return PactRule(id=raw.get("id") or secrets.token_hex(8), trigger=raw.get("trigger", {"kind": "storm_probability", "threshold": .3}), action=action, when_label=raw.get("when_label", "When money may be tight"), then_label=raw.get("then_label", "Show my Pact"), confirmed=confirmed)


@router.post("/pact/parse")
def parse_pact(body: TextInput, _user_id: str = Depends(current_user)):
    text = body.text.lower()
    if any(term in text for term in ("transfer money", "invest", "pay someone", "buy crypto")):
        return {"rules": [], "rephrase_request": "Please say that another way. I can only use the actions in Pact."}
    kind, label = ("move_to_buffer", "Move money to my buffer") if re.search(r"\b(save|saving|buffer|aside|set by)\b", text) else ("show_note", "Show my note")
    match = re.search(r"£\s*(\d+(?:\.\d{1,2})?)", body.text)
    amount = float(match.group(1)) if match else 15.0
    rule = new_rule({"action": {"kind": kind, **({"amount_gbp": amount} if kind == "move_to_buffer" else {})}, "trigger": {"kind": "storm_probability", "threshold": .3}, "when_label": "When a storm is coming", "then_label": label}, False)
    return {"rules": [rule], "rephrase_request": None}


@router.post("/pact", status_code=201)
def create_pact(body: list[PactRule], user_id: str = Depends(current_user)):
    saved = []
    with connect() as db:
        for item in body:
            rule = new_rule(item.model_dump(mode="json"), True)
            rule.active_from = date.today()
            db.execute("INSERT INTO pact_rules VALUES(?,?,?,?,?)", (rule.id, user_id, rule.model_dump_json(), datetime.now(timezone.utc).isoformat(), None))
            saved.append(rule)
    return saved


@router.get("/pact")
def list_pacts(user_id: str = Depends(current_user)):
    with connect() as db:
        return [json.loads(row["value"]) for row in db.execute("SELECT value FROM pact_rules WHERE user_id=?", (user_id,))]


@router.patch("/pact/{rule_id}")
def update_pact(rule_id: str, body: PactRule, user_id: str = Depends(current_user)):
    with connect() as db:
        row = db.execute("SELECT value FROM pact_rules WHERE id=? AND user_id=?", (rule_id, user_id)).fetchone()
        if not row:
            fail(404, "rule_not_found", "That rule could not be found.")
        value = json.loads(row["value"])
        value["pending_change"] = body.model_dump(mode="json")
        value["change_requested_at"] = datetime.now(timezone.utc).isoformat()
        db.execute("UPDATE pact_rules SET value=?,change_requested_at=? WHERE id=?", (json.dumps(value), value["change_requested_at"], rule_id))
    return {"scheduled_for": (datetime.now(timezone.utc) + timedelta(hours=48)).isoformat(), "rule": value}


@router.delete("/pact/{rule_id}")
def delete_pact(rule_id: str, user_id: str = Depends(current_user)):
    with connect() as db:
        row = db.execute("SELECT value FROM pact_rules WHERE id=? AND user_id=?", (rule_id, user_id)).fetchone()
        if not row:
            fail(404, "rule_not_found", "That rule could not be found.")
        value = json.loads(row["value"])
        value["pending_delete"] = True
        timestamp = datetime.now(timezone.utc).isoformat()
        db.execute("UPDATE pact_rules SET value=?,change_requested_at=? WHERE id=?", (json.dumps(value), timestamp, rule_id))
    return {"scheduled_for": (datetime.now(timezone.utc) + timedelta(hours=48)).isoformat()}


@router.post("/pact/note", status_code=201)
def save_note(body: NoteInput, user_id: str = Depends(current_user)):
    note_id = secrets.token_hex(8)
    with connect() as db:
        db.execute("INSERT INTO pact_notes VALUES(?,?,?,?,?)", (note_id, user_id, body.transcript, body.audio_blob_ref, datetime.now(timezone.utc).isoformat()))
    return {"id": note_id, "transcript": body.transcript}


@router.post("/simulate")
def simulate(as_of: date, user_id: str = Depends(current_user)):
    apply_scheduled_changes(user_id)
    forecast = make_forecast(as_of=as_of, threshold=settings_for(user_id).storm_threshold)
    with connect() as db:
        rules = [json.loads(row["value"]) for row in db.execute("SELECT value FROM pact_rules WHERE user_id=?", (user_id,))]
    fired = []
    for rule in rules:
        if rule.get("confirmed") and not rule.get("pending_delete"):
            fired.append(rule)
            write_event(user_id, "rule_fired", {"rule_id": rule["id"], "date": as_of.isoformat(), "action": rule["action"]})
            if rule["action"]["kind"] == "notify_ally":
                write_event(user_id, "ally_notified", {"message": "Amara asked us to tell you money may be tight around 23 March. You can't see her spending."})
    storm = next((day for day in forecast.days if day.state == "storm"), None)
    if storm:
        write_event(user_id, "storm_started", {"date": storm.date.isoformat(), "p_shortfall": storm.p_shortfall})
    return {"forecast": forecast, "fired_rules": fired}


@router.post("/actions/move-to-buffer")
def move_to_buffer(body: MoveInput, user_id: str = Depends(current_user)):
    if not body.confirmed:
        fail(400, "confirmation_required", "Tap to confirm before moving money to your buffer.")
    write_event(user_id, "buffer_moved", {"amount_gbp": body.amount_gbp, "confirmed": True})
    return make_forecast(buffer_move=body.amount_gbp, threshold=settings_for(user_id).storm_threshold)
