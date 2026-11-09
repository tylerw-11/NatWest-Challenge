import json
import logging
import math
import os
import re
import secrets
from copy import deepcopy
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Body, Depends
from pydantic import ValidationError

from ..contracts import MoveInput, NoteInput, PactRule, TextInput
from ..database import connect
from ..dependencies import apply_scheduled_changes, current_user, fail, settings_for, write_event
from .forecast import DEMO_USER, forecast_for

router = APIRouter(tags=["pact", "simulation", "actions"])
ALLOWED_ACTIONS = {"category_cap", "credit_pause_hours", "notify_ally", "move_to_buffer", "show_note"}
log = logging.getLogger("pact.ai")
PACT_PROMPT = Path(__file__).resolve().parents[1] / "prompts" / "parse_pact.md"


def new_rule(raw: dict, confirmed: bool) -> PactRule:
    action = raw.get("action", {})
    if action.get("kind") not in ALLOWED_ACTIONS:
        fail(422, "action_not_allowed", "Please say that another way. I can only use the actions in Pact.")
    return PactRule(id=raw.get("id") or secrets.token_hex(8), trigger=raw.get("trigger", {"kind": "storm_probability", "threshold": .3}), action=action, when_label=raw.get("when_label", "When money may be tight"), then_label=raw.get("then_label", "Show my Pact"), confirmed=confirmed)


PACT_RULE_TOOL = {
    "name": "draft_pact_rules",
    "description": "Return only clear draft rules explicitly requested by the user.",
    "input_schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "rules": {
                "type": "array",
                "minItems": 0,
                "maxItems": 5,
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "trigger": {
                            "type": "object",
                            "additionalProperties": False,
                            "properties": {
                                "kind": {"type": "string", "enum": ["storm_probability", "buffer_below_days", "user_not_okay"]},
                                "threshold": {"type": "number", "minimum": 0, "maximum": 1},
                                "horizon_days": {"type": "integer", "minimum": 1, "maximum": 60},
                                "buffer_days": {"type": "integer", "minimum": 0, "maximum": 60},
                            },
                            "required": ["kind"],
                        },
                        "action": {
                            "type": "object",
                            "additionalProperties": False,
                            "properties": {
                                "kind": {"type": "string", "enum": sorted(ALLOWED_ACTIONS)},
                                "category": {"type": "string", "minLength": 1, "maxLength": 60},
                                "cap_gbp": {"type": "number", "exclusiveMinimum": 0, "maximum": 500},
                                "period": {"type": "string", "enum": ["day", "week", "month"]},
                                "hours": {"type": "integer", "minimum": 1, "maximum": 720},
                                "amount_gbp": {"type": "number", "exclusiveMinimum": 0, "maximum": 500},
                                "on": {"type": "string", "enum": ["payday"]},
                                "reminder": {"type": "string", "minLength": 1, "maxLength": 140},
                            },
                            "required": ["kind"],
                        },
                        "when_label": {"type": "string", "minLength": 1, "maxLength": 80},
                        "then_label": {"type": "string", "minLength": 1, "maxLength": 100},
                    },
                    "required": ["trigger", "action", "when_label", "then_label"],
                },
            }
        },
        "required": ["rules"],
    },
}


def _redact_for_ai(text: str, user_id: str, ally: dict[str, str] | None) -> str:
    """Remove identifying details before sending a rule request to Claude."""
    safe = text
    with connect() as db:
        user = db.execute("SELECT display_name,contact FROM users WHERE id=?", (user_id,)).fetchone()
    for value in ((user["display_name"] if user else None), (user["contact"] if user else None), (ally or {}).get("name")):
        if value and len(value.strip()) > 1:
            safe = re.sub(re.escape(value.strip()), "[person]", safe, flags=re.IGNORECASE)
    safe = re.sub(r"\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b", "[email]", safe)
    safe = re.sub(r"(?<!\w)(?:\+?\d[\d\s().-]{6,}\d)(?!\w)", "[long number]", safe)
    # Names not yet saved as the user's ally are scrubbed when named as an alert recipient.
    safe = re.sub(r"\b(tell|notify|message|text|alert)\s+(?!me\b|us\b|someone\b|my\b|a\b|an\b|the\b)([A-Z][A-Za-z'-]+)", r"\1 my trusted person", safe, flags=re.IGNORECASE)
    return safe


def _extract_savings_goal(text: str, user_id: str, ally: dict[str, str] | None) -> str | None:
    """Return an explicitly stated, privacy-redacted savings goal, if present."""
    safe = _redact_for_ai(text, user_id, ally)
    match = re.search(
        r"\b(?:save|saving|savings)\b.{0,60}?\b(?:for|towards?|toward)\s+(.+?)(?:[.!?]|$)",
        safe,
        flags=re.IGNORECASE,
    )
    if not match:
        return None
    goal = match.group(1).strip(" ,;:")
    if not goal or len(goal) > 95:
        return None
    return goal


def _draft_rules_with_claude(text: str, user_id: str, ally: dict[str, str] | None) -> list[PactRule]:
    api_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        fail(503, "ai_not_configured", "AI suggestions are not set up yet. Add an Anthropic API key to the engine settings.")

    settings = settings_for(user_id)
    savings_goal = _extract_savings_goal(text, user_id, ally)
    tool = deepcopy(PACT_RULE_TOOL)
    system_prompt = PACT_PROMPT.read_text(encoding="utf-8")
    if savings_goal:
        # Require several distinct reminders for an explicit goal, without inventing
        # amounts or schedules. Constrain the tool schema to prevent empty/tool-drift output.
        rule_schema = tool["input_schema"]["properties"]["rules"]
        rule_schema["minItems"] = 3
        action_schema = rule_schema["items"]["properties"]["action"]
        action_schema["properties"]["kind"]["enum"] = ["show_note"]
        action_schema["required"] = ["kind", "reminder"]
        trigger_schema = rule_schema["items"]["properties"]["trigger"]
        trigger_schema["properties"]["kind"]["enum"] = ["storm_probability"]
        system_prompt += (
            "\nFor this request the user has stated a savings goal. You must return between three "
            "and five distinct show_note drafts. Each reminder must give a different practical "
            "planning step, not merely restate the goal or offer generic encouragement. For multiple "
            "targets, useful steps can include listing each target and due date, choosing a Christmas "
            "budget, and deciding how to split an affordable amount between them. Keep when_label "
            "about the storm trigger and make then_label a short summary of each reminder. Do not "
            "invent amounts, dates, affordability, or bank actions."
        )
    system_prompt += f"\nThe current storm probability threshold is {settings.storm_threshold}."
    try:
        from anthropic import Anthropic

        client = Anthropic(api_key=api_key, timeout=20.0, max_retries=0)
        message = client.messages.create(
            model=os.getenv("PACT_CLAUDE_MODEL", "claude-haiku-4-5-20251001"),
            max_tokens=1200,
            system=system_prompt,
            tools=[tool],
            tool_choice={"type": "tool", "name": "draft_pact_rules"},
            messages=[{"role": "user", "content": _redact_for_ai(text, user_id, ally)}],
        )
        usage = getattr(message, "usage", None)
        log.info(
            "Claude Pact request succeeded id=%s model=%s input_tokens=%s output_tokens=%s",
            getattr(message, "id", "unknown"),
            getattr(message, "model", "unknown"),
            getattr(usage, "input_tokens", "unknown"),
            getattr(usage, "output_tokens", "unknown"),
        )
    except Exception as exc:  # SDK/network/provider errors are kept out of the public response.
        log.warning("Claude Pact drafting failed (%s)", type(exc).__name__)
        fail(502, "ai_unavailable", "AI suggestions could not be made right now. Please try again.")

    result = next((block.input for block in message.content if getattr(block, "type", None) == "tool_use" and block.name == "draft_pact_rules"), None)
    if not isinstance(result, dict) or not isinstance(result.get("rules"), list):
        fail(502, "ai_invalid_response", "AI suggestions came back in a format Pact could not use. Please try again.")

    explicit_amounts = [float(value) for value in re.findall(r"£\s*(\d+(?:\.\d{1,2})?)", text)]
    explicit_hours = [int(value) * (24 if unit.lower().startswith("d") else 1) for value, unit in re.findall(r"\b(\d+)\s*(hours?|hrs?|days?)\b", text, flags=re.IGNORECASE)]
    drafts: list[PactRule] = []
    for item in result["rules"]:
        if not isinstance(item, dict):
            continue
        action = item.get("action")
        trigger = item.get("trigger")
        if not isinstance(action, dict) or not isinstance(trigger, dict) or action.get("kind") not in ALLOWED_ACTIONS:
            continue
        kind = action["kind"]
        amount_key = "cap_gbp" if kind == "category_cap" else "amount_gbp" if kind == "move_to_buffer" else None
        if amount_key:
            amount = action.get(amount_key)
            if not isinstance(amount, (int, float)) or not math.isfinite(amount) or not 0 < float(amount) <= 500 or not any(math.isclose(float(amount), explicit, abs_tol=0.005) for explicit in explicit_amounts):
                continue
        if kind == "category_cap" and (not isinstance(action.get("category"), str) or action.get("period") not in {"day", "week", "month"}):
            continue
        if kind == "category_cap":
            period_terms = {"day": r"\b(daily|per day|each day)\b", "week": r"\b(weekly|per week|each week|a week)\b", "month": r"\b(monthly|per month|each month|a month)\b"}
            if not re.search(period_terms[action["period"]], text, flags=re.IGNORECASE):
                continue
        if kind == "credit_pause_hours":
            hours = action.get("hours")
            if not isinstance(hours, int) or isinstance(hours, bool) or hours not in explicit_hours or not 1 <= hours <= 720:
                continue
        if kind == "move_to_buffer":
            if action.get("on") not in {None, "payday"}:
                continue
            if action.get("on") == "payday" and not re.search(r"pay\s*day", text, flags=re.IGNORECASE):
                continue
        if kind == "show_note":
            reminder = action.get("reminder")
            if not isinstance(reminder, str) or not reminder.strip() or len(reminder) > 140:
                continue
            if savings_goal:
                normalized_reminder = re.sub(r"[^a-z0-9 ]", "", reminder.lower()).strip()
                normalized_text = re.sub(r"[^a-z0-9 ]", "", text.lower()).strip()
                practical_step = re.search(
                    r"\b(list|write|check|set|choose|decide|separate|work out|plan|review|track|compare|prioritise|prioritize|budget|calculate|note|identify)\b",
                    reminder,
                    flags=re.IGNORECASE,
                )
                if not practical_step or normalized_reminder in normalized_text:
                    continue
                if any(
                    existing.action.get("reminder", "").strip().casefold() == reminder.strip().casefold()
                    for existing in drafts
                ):
                    continue
        if trigger.get("kind") not in {"storm_probability", "buffer_below_days", "user_not_okay"}:
            continue
        if trigger.get("kind") == "storm_probability":
            trigger["threshold"] = settings.storm_threshold
            if "horizon_days" in trigger:
                trigger["horizon_days"] = settings.storm_lead_days
        elif trigger.get("kind") == "buffer_below_days":
            buffer_days = trigger.get("buffer_days")
            requested_days = [int(value) for value in re.findall(r"\b(\d+)\s+days?\b", text, flags=re.IGNORECASE)]
            if not isinstance(buffer_days, int) or isinstance(buffer_days, bool) or buffer_days not in requested_days or not 0 <= buffer_days <= 60:
                continue
        elif not re.search(r"\bnot\s+(?:okay|ok)\b", text, flags=re.IGNORECASE):
            continue
        if kind == "notify_ally":
            item["then_label"] = item.get("then_label", "Let your trusted person know")
        try:
            drafts.append(PactRule.model_validate({**item, "id": secrets.token_hex(8), "confirmed": False}))
        except (TypeError, ValueError):
            continue
    if not drafts:
        if savings_goal:
            fail(502, "ai_invalid_response", "Claude could not make a usable reminder draft. Please try again.")
        fail(422, "rephrase", "I could not find a clear Pact rule in that. Try one small step you want future you to take.")
    if savings_goal and not 3 <= len(drafts) <= 5:
        fail(502, "ai_invalid_response", "Claude could not make three distinct, usable suggestions. Please try again.")
    return drafts


@router.post("/pact/parse", response_model=list[PactRule])
def parse_pact(body: TextInput, user_id: str = Depends(current_user)):
    """Draft rules from free text. Drafts are unconfirmed: nothing is stored until POST /pact."""
    return _draft_rules_with_claude(body.text, user_id, settings_for(user_id).ally)


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
        fired.append({
            "rule_id": rule["id"],
            "action_kind": action["kind"],
            "left_gbp": left,
            "reminder": action.get("reminder") if action["kind"] == "show_note" else None,
        })
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
