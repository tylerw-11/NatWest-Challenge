import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Cookie, Response

from ..database import connect

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/demo", status_code=204)
def demo_login(response: Response):
    session = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    with connect() as db:
        db.execute("INSERT INTO sessions VALUES(?,?,?,?,?,?)", (session, "amara", "Demo device", now.isoformat(), now.isoformat(), (now + timedelta(days=30)).isoformat()))
        # Each demo login starts the scripted demo fresh, so it can be run twice in a row (Gate 2).
        db.execute("DELETE FROM events WHERE user_id='amara' AND kind='buffer_moved'")
    response.set_cookie("pact_session", session, httponly=True, secure=True, samesite="lax", max_age=30 * 86400, path="/")


@router.post("/logout", status_code=204)
def logout(response: Response, pact_session: str | None = Cookie(default=None)):
    if pact_session:
        with connect() as db:
            db.execute("DELETE FROM sessions WHERE id=?", (pact_session,))
    response.delete_cookie("pact_session", path="/")
