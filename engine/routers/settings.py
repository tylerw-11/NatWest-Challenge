from typing import Any

from fastapi import APIRouter, Body, Cookie, Depends
from pydantic import ValidationError

from ..contracts import Settings, TextInput
from ..database import connect
from ..dependencies import current_user, fail, settings_for
from datetime import datetime, timezone
import secrets

router = APIRouter(tags=["settings", "profile"])


@router.get("/me")
def me(user_id: str = Depends(current_user), pact_session: str | None = Cookie(default=None)):
    with connect() as db:
        user = dict(db.execute("SELECT id,display_name,contact,created_at,deletion_requested_at FROM users WHERE id=?", (user_id,)).fetchone())
        bank = db.execute("SELECT provider,consent_expires_at,status FROM bank_connections WHERE user_id=?", (user_id,)).fetchone()
    user["bank_connection"] = dict(bank) if bank else None
    user["onboarding_complete"] = True
    # Web contract `Me` (FE-03, decision 0001 c). Old fields above are kept so nothing breaks.
    user["user"] = {"name": user["display_name"], "email": user["contact"] or ""}
    user["bank"] = {"name": bank["provider"], "connected_until": bank["consent_expires_at"]} if bank and bank["status"] == "connected" else None
    with connect() as db:
        has_profile = db.execute("SELECT 1 FROM profiles WHERE user_id=?", (user_id,)).fetchone() is not None
        user["has_passkey"] = db.execute("SELECT 1 FROM passkeys WHERE user_id=?", (user_id,)).fetchone() is not None
        user["devices"] = [
            {"id": row["id"][:12], "label": row["device_label"] or "Browser", "last_seen": row["last_seen_at"], "current": row["id"] == pact_session}
            for row in db.execute("SELECT id,device_label,last_seen_at FROM sessions WHERE user_id=? ORDER BY last_seen_at DESC LIMIT 5", (user_id,))
        ]
    # Amara is the scripted demo; anyone else is set up once they have saved their money details.
    user["onboarding_complete"] = user_id == "amara" or has_profile
    return user


@router.get("/settings", response_model=Settings)
def get_settings(user_id: str = Depends(current_user)):
    return settings_for(user_id)


@router.put("/settings", response_model=Settings)
def put_settings(patch: dict[str, Any] = Body(...), user_id: str = Depends(current_user)):
    """Merges the fields sent into the stored settings (the app sends only what changed)."""
    try:
        merged = Settings.model_validate({**settings_for(user_id).model_dump(mode="json"), **patch})
    except ValidationError:
        fail(422, "invalid_settings", "That setting isn't one Pact knows. Try again.")
    with connect() as db:
        db.execute("INSERT INTO settings(user_id,value) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET value=excluded.value", (user_id, merged.model_dump_json()))
    return merged


@router.post("/support-needs", status_code=201)
def save_support_need(body: TextInput, user_id: str = Depends(current_user)):
    with connect() as db:
        db.execute("INSERT INTO support_needs VALUES(?,?,?,?)", (secrets.token_hex(12), user_id, body.text, datetime.now(timezone.utc).isoformat()))
    return {"saved": True}
