import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Response

from ..contracts import AllyInput
from ..database import connect
from ..dependencies import current_user

router = APIRouter(prefix="/ally", tags=["ally"])


@router.get("")
def get_ally(user_id: str = Depends(current_user)):
    with connect() as db:
        row = db.execute("SELECT name,relation,contact,status FROM allies WHERE user_id=?", (user_id,)).fetchone()
    return dict(row) if row else None


@router.post("", status_code=201)
def put_ally(body: AllyInput, user_id: str = Depends(current_user)):
    with connect() as db:
        db.execute("INSERT INTO allies VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET name=excluded.name,relation=excluded.relation,contact=excluded.contact,status='active'", (secrets.token_hex(8), user_id, body.name, body.relation, body.contact, "active", datetime.now(timezone.utc).isoformat()))
    return {"name": body.name, "relation": body.relation, "status": "active"}


@router.delete("", status_code=204)
def remove_ally(user_id: str = Depends(current_user)):
    with connect() as db:
        db.execute("DELETE FROM allies WHERE user_id=?", (user_id,))
