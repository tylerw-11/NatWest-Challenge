from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends

from ..database import connect
from ..dependencies import current_user, settings_for

router = APIRouter(prefix="/account", tags=["account"])


@router.get("/sessions")
def account_sessions(user_id: str = Depends(current_user)):
    with connect() as db:
        return [dict(row) for row in db.execute("SELECT id,device_label,created_at,last_seen_at,expires_at FROM sessions WHERE user_id=?", (user_id,))]


@router.delete("/sessions/{session_id}", status_code=204)
def remove_session(session_id: str, user_id: str = Depends(current_user)):
    with connect() as db:
        db.execute("DELETE FROM sessions WHERE id=? AND user_id=?", (session_id, user_id))


@router.get("/export")
def account_export(user_id: str = Depends(current_user)):
    with connect() as db:
        tables = ("transactions", "pact_rules", "pact_notes", "allies", "events", "support_needs", "sessions")
        bundle = {table: [dict(row) for row in db.execute(f"SELECT * FROM {table} WHERE user_id=?", (user_id,))] for table in tables}
        bundle["settings"] = settings_for(user_id).model_dump(mode="json")
    return {"user_id": user_id, "data": bundle}


@router.post("/delete")
def request_account_delete(user_id: str = Depends(current_user)):
    now = datetime.now(timezone.utc)
    with connect() as db:
        db.execute("UPDATE users SET deletion_requested_at=? WHERE id=?", (now.isoformat(), user_id))
    return {"scheduled_for": (now + timedelta(hours=48)).isoformat(), "cancel_available": True}


@router.post("/delete/cancel")
def cancel_account_delete(user_id: str = Depends(current_user)):
    with connect() as db:
        db.execute("UPDATE users SET deletion_requested_at=NULL WHERE id=?", (user_id,))
    return {"cancelled": True}
