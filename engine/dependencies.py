import json
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import Cookie, HTTPException

from .database import connect
from .contracts import Settings


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


def write_event(user_id: str, kind: str, payload: dict[str, Any]) -> None:
    with connect() as db:
        db.execute("INSERT INTO events VALUES(?,?,?,?,?)", (secrets.token_hex(12), user_id, kind, json.dumps(payload), datetime.now(timezone.utc).isoformat()))


def apply_scheduled_changes(user_id: str) -> None:
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
