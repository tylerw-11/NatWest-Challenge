from fastapi import APIRouter, Depends

from ..contracts import Settings, TextInput
from ..database import connect
from ..dependencies import current_user, settings_for
from datetime import datetime, timezone
import secrets

router = APIRouter(tags=["settings", "profile"])


@router.get("/me")
def me(user_id: str = Depends(current_user)):
    with connect() as db:
        user = dict(db.execute("SELECT id,display_name,contact,created_at FROM users WHERE id=?", (user_id,)).fetchone())
        bank = db.execute("SELECT provider,consent_expires_at,status FROM bank_connections WHERE user_id=?", (user_id,)).fetchone()
    user["bank_connection"] = dict(bank) if bank else None
    user["onboarding_complete"] = True
    # Web contract `Me` (FE-03, decision 0001 c). Old fields above are kept so nothing breaks.
    user["user"] = {"name": user["display_name"], "email": user["contact"] or ""}
    user["bank"] = {"name": bank["provider"], "connected_until": bank["consent_expires_at"]} if bank and bank["status"] == "connected" else None
    return user


@router.get("/settings", response_model=Settings)
def get_settings(user_id: str = Depends(current_user)):
    return settings_for(user_id)


@router.put("/settings", response_model=Settings)
def put_settings(body: Settings, user_id: str = Depends(current_user)):
    with connect() as db:
        db.execute("INSERT INTO settings(user_id,value) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET value=excluded.value", (user_id, body.model_dump_json()))
    return body


@router.post("/support-needs", status_code=201)
def save_support_need(body: TextInput, user_id: str = Depends(current_user)):
    with connect() as db:
        db.execute("INSERT INTO support_needs VALUES(?,?,?,?)", (secrets.token_hex(12), user_id, body.text, datetime.now(timezone.utc).isoformat()))
    return {"saved": True}
