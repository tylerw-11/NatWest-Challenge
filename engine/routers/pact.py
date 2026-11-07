import json
import re
import secrets
from datetime import date, datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Body, Depends
from pydantic import ValidationError

from ..contracts import MoveInput, NoteInput, PactRule, TextInput
from ..database import connect
from ..dependencies import apply_scheduled_changes, current_user, fail, settings_for, write_event
from .forecast import DEMO_USER, forecast_for

router = APIRouter(tags=["pact", "simulation", "actions"])
ALLOWED_ACTIONS = {"category_cap", "credit_pause_hours", "notify_ally", "move_to_buffer", "show_note"}


def new_rule(raw: dict, confirmed: bool) -> PactRule:
    action = raw.get("action", {})
    if action.get("kind") not in ALLOWED_ACTIONS:
        fail(422, "action_not_allowed", "Please say that another way. I can only use the actions in Pact.")
    return PactRule(id=raw.get("id") or secrets.token_hex(8), trigger=raw.get("trigger", {"kind": "storm_probability", "threshold": .3}), action=action, when_label=raw.get("when_label", "When money may be tight"), then_label=raw.get("then_label", "Show my Pact"), confirmed=confirmed)


FORBIDDEN = ("transfer money", "invest", "pay someone", "buy crypto", "crypto", "lend me", "loan me", "gamble", "bet ")
PRONOUN = {"sister": "she", "mum": "she", "mother": "she", "aunt": "she", "daughter": "she", "brother": "he", "dad": "he", "father": "he", "uncle": "he", "son": "he"}


def _money(clause: str) -> float | None:
    match = re.search(r"£\s*(\d+(?:\.\d{1,2})?)", clause)
    return float(match.group(1)) if match else None


def _hours(clause: str) -> int | None:
    match = re.search(r"(\d+)\s*(hours?|hrs?|days?)", clause)
    if not match:
        return None
    return int(match.group(1)) * (24 if match.group(2).startswith("day") else 1)


def parse_rules(text: str, ally: dict | None) -> list[PactRule]:
    """Keyword parser over the closed action list. Claude can replace it later; the output shape stays."""
    lower = text.lower()
    if any(term in lower for term in FORBIDDEN):
        return []
    storm_ahead = {"kind": "storm_probability", "threshold": 0.3, "horizon_days": 14}
    storm_now = {"kind": "storm_probability", "threshold": 0.3}
    rules: dict[str, PactRule] = {}
    for clause in re.split(r",|;|\.|\band\b|\bthen\b", lower):
        clause = clause.strip()
        if not clause:
            continue
        if "category_cap" not in rules and re.search(r"takeaway|eating out|deliveroo|uber eats|just eat|food out|spend(ing)? on", clause):
            cap = _money(clause) or 20.0
            rules["category_cap"] = PactRule(id="rule_takeaway_cap", trigger=storm_ahead, action={"kind": "category_cap", "category": "takeaways", "cap_gbp": cap, "period": "week"}, when_label="Storm 14 days away", then_label=f"Takeaways capped at £{cap:g} a week")
        elif "credit_pause_hours" not in rules and re.search(r"borrow|credit|klarna|clearpay|pay.?later|loan|buy now", clause):
            hours = _hours(clause) or 48
            rules["credit_pause_hours"] = PactRule(id="rule_credit_pause", trigger=storm_ahead, action={"kind": "credit_pause_hours", "hours": hours}, when_label="Storm 14 days away", then_label=f"No new credit or pay-later for {hours} hours")
        elif "notify_ally" not in rules and re.search(r"\btell\b|\blet\b.*\bknow\b|\btext\b|\bmessage\b|\bally\b|sister|brother|friend|\bmum\b|\bdad\b", clause):
            name = (ally or {}).get("name") or "my ally"
            pronoun = PRONOUN.get(((ally or {}).get("relation") or "").lower(), "they")
            rules["notify_ally"] = PactRule(id="rule_notify_ally", trigger=storm_now, action={"kind": "notify_ally"}, when_label="Storm starts", then_label=f"Let {name} know ({pronoun} can't see your spending)")
        elif "move_to_buffer" not in rules and re.search(r"\b(save|saving|buffer|aside|put away|set by)\b", clause):
            amount = _money(clause) or 15.0
            on_payday = "payday" in clause or "pay day" in clause
            rules["move_to_buffer"] = PactRule(id="rule_payday_buffer", trigger=storm_now, action={"kind": "move_to_buffer", "amount_gbp": amount, **({"on": "payday"} if on_payday else {})}, when_label="Payday in a storm" if on_payday else "When a storm is coming", then_label=f"Move £{amount:g} to your buffer")
        elif "show_note" not in rules and re.search(r"\bnote\b|remind me|read me|play my", clause):
            rules["show_note"] = PactRule(id="rule_show_note", trigger=storm_now, action={"kind": "show_note"}, when_label="Storm starts", then_label="Show me my note")
    return list(rules.values())


@router.post("/pact/parse", response_model=list[PactRule])
def parse_pact(body: TextInput, user_id: str = Depends(current_user)):
    """Draft rules from free text. Drafts are unconfirmed: nothing is stored until POST /pact."""
    rules = parse_rules(body.text, settings_for(user_id).ally)
    if not rules:
        fail(422, "rephrase", "We can't make that into a rule. Try something like \"save £15 on payday\" or \"tell Jade\".")
    return rules


@router.post("/pact", status_code=201)
def create_pact(body: Any = Body(...), user_id: str = Depends(current_user)):
    """Stores the rules the user confirmed. Accepts {"rules": [...]} (the app) or a bare list."""
    items = body.get("rules") if isinstance(body, dict) else body
    if not isinstance(items, list):
        fail(422, "invalid_rules", "Something looks wrong with these rules.")
    try:
        parsed = [PactRule.model_validate(item) for item in items]
    except ValidationError:
        fail(422, "invalid_rules", "Something looks wrong with these rules.")
    saved = []
    with connect() as db:
        for item in parsed:
            rule = new_rule(item.model_dump(mode="json"), True)
            rule.active_from = date.today()
            # Rule ids are a global key: never take over another person's rule with the same id.
            owner = db.execute("SELECT user_id FROM pact_rules WHERE id=?", (rule.id,)).fetchone()
            if owner and owner["user_id"] != user_id:
                rule.id = f"{rule.id}-{secrets.token_hex(4)}"
            db.execute("INSERT OR REPLACE INTO pact_rules VALUES(?,?,?,?,?)", (rule.id, user_id, rule.model_dump_json(), datetime.now(timezone.utc).isoformat(), None))
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


DEMO_NOTE = {"text": "You've got this. Skip takeaways for two weeks. Jade's got your back.", "duration_s": 18}


@router.post("/pact/note", status_code=201)
def save_note(body: NoteInput, user_id: str = Depends(current_user)):
    text = body.text or body.transcript
    with connect() as db:
        db.execute("INSERT INTO pact_notes(id,user_id,transcript,audio_blob_ref,recorded_at,duration_s) VALUES(?,?,?,?,?,?)", (secrets.token_hex(8), user_id, text, body.audio_blob_ref, datetime.now(timezone.utc).isoformat(), body.duration_s))
    return {"text": text, "duration_s": body.duration_s}


@router.get("/pact/note")
def get_note(user_id: str = Depends(current_user)):
    with connect() as db:
        row = db.execute("SELECT transcript,duration_s FROM pact_notes WHERE user_id=? ORDER BY recorded_at DESC LIMIT 1", (user_id,)).fetchone()
    if row:
        return {"text": row["transcript"] or "", "duration_s": row["duration_s"] or 0}
    return DEMO_NOTE if user_id == DEMO_USER else {"text": "", "duration_s": 0}


def _left_this_week(user_id: str, category: str, cap: float, as_of: date) -> float:
    """category_cap: what is left of the weekly cap, from real transactions in the 7 days to as_of."""
    with connect() as db:
        spent = db.execute(
            "SELECT COALESCE(-SUM(amount_gbp),0) FROM transactions WHERE user_id=? AND category=? AND amount_gbp<0 AND date BETWEEN ? AND ?",
            (user_id, category, (as_of - timedelta(days=6)).isoformat(), as_of.isoformat()),
        ).fetchone()[0]
    return round(max(0.0, cap - spent), 2)


@router.post("/simulate")
def simulate(as_of: date, user_id: str = Depends(current_user)):
    """Demo fast-forward (presenter key Shift+F): re-runs the forecast as of a date and fires confirmed rules."""
    if user_id != DEMO_USER:
        fail(403, "demo_only", "Fast-forward is only for the demo account.")
    apply_scheduled_changes(user_id)
    write_event(user_id, "demo_clock", {"as_of": as_of.isoformat()})
    forecast = forecast_for(user_id)
    with connect() as db:
        rules = [json.loads(row["value"]) for row in db.execute("SELECT value FROM pact_rules WHERE user_id=?", (user_id,))]
    storm = next((day for day in forecast.days if day.state == "storm"), None)
    fired_rules, fired = [], []
    for rule in rules:
        if not rule.get("confirmed") or rule.get("pending_delete") or storm is None:
            continue
        action = rule["action"]
        left = _left_this_week(user_id, action.get("category", ""), float(action.get("cap_gbp", 0)), as_of) if action["kind"] == "category_cap" else None
        fired_rules.append(rule)
        fired.append({"rule_id": rule["id"], "action_kind": action["kind"], "left_gbp": left})
        write_event(user_id, "rule_fired", {"rule_id": rule["id"], "date": as_of.isoformat(), "action": action})
        if action["kind"] == "notify_ally":
            write_event(user_id, "ally_notified", {"message": f"Amara asked us to tell you money may be tight around {storm.date.strftime('%d %B').lstrip('0')}. You can't see her spending."})
    if storm:
        write_event(user_id, "storm_started", {"date": storm.date.isoformat(), "p_shortfall": storm.p_shortfall})
    return {"forecast": forecast, "fired": fired, "fired_rules": fired_rules}


@router.post("/actions/move-to-buffer")
def move_to_buffer(body: MoveInput, user_id: str = Depends(current_user)):
    if not body.confirmed:
        fail(400, "confirmation_required", "Tap to confirm before moving money to your buffer.")
    if user_id != DEMO_USER:
        fail(403, "demo_only", "Moving money to a buffer isn't connected to your bank yet.")
    write_event(user_id, "buffer_moved", {"amount_gbp": body.amount_gbp, "confirmed": True})
    return forecast_for(user_id)
