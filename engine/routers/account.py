from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends

from ..database import connect
from ..dependencies import current_user, fail, settings_for

router = APIRouter(prefix="/account", tags=["account"])


@router.get("/sessions")
def account_sessions(user_id: str = Depends(current_user)):
    with connect() as db:
        # Return the same short display handle as /me, never the full session token.
        return [dict(row) for row in db.execute("SELECT substr(id,1,12) AS id,device_label,created_at,last_seen_at,expires_at FROM sessions WHERE user_id=?", (user_id,))]


@router.delete("/sessions/{session_id}", status_code=204)
def remove_session(session_id: str, user_id: str = Depends(current_user)):
    if len(session_id) != 12 or not all(char.isalnum() or char in "_-" for char in session_id):
        fail(404, "session_not_found", "That device could not be found.")
    with connect() as db:
        db.execute("DELETE FROM sessions WHERE substr(id,1,12)=? AND user_id=?", (session_id, user_id))


@router.get("/export")
def account_export(user_id: str = Depends(current_user)):
    with connect() as db:
        # Session ids are bearer credentials, so never include them in a data export.
        tables = ("profiles", "transactions", "pact_rules", "pact_notes", "allies", "events", "support_needs", "bank_connections")
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
