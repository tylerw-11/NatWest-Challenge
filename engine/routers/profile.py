"""A real person's money (Sign-up step 3). Saving it switches GET /forecast to their own forecast."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from ..contracts import Profile
from ..database import connect
from ..dependencies import current_user, fail

router = APIRouter(prefix="/profile", tags=["profile"])


def profile_for(user_id: str) -> Profile | None:
    with connect() as db:
        row = db.execute("SELECT value FROM profiles WHERE user_id=?", (user_id,)).fetchone()
    return Profile.model_validate_json(row["value"]) if row else None


@router.get("", response_model=Profile)
def get_profile(user_id: str = Depends(current_user)):
    profile = profile_for(user_id)
    if profile is None:
        fail(404, "not_found", "Add your money details to see your own forecast.")
    return profile


@router.put("", response_model=Profile)
def put_profile(body: Profile, user_id: str = Depends(current_user)):
    if user_id == "amara":
        fail(403, "demo_account", "The demo account uses Amara's numbers. Log in with a code to use your own.")
    with connect() as db:
        db.execute(
            "INSERT INTO profiles(user_id,value,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
            (user_id, body.model_dump_json(), datetime.now(timezone.utc).isoformat()),
        )
    return body
