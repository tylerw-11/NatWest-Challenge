import json
from typing import Any

from fastapi import APIRouter, Depends

from ..database import connect
from ..dependencies import current_user, settings_for
from ..forecast import DRIVERS

router = APIRouter(prefix="/explain", tags=["explain"])


@router.post("")
def explain(body: dict[str, Any], user_id: str = Depends(current_user)):
    settings = settings_for(user_id)
    forecast_id = str(body.get("forecast_id", "demo-2026-03-10-0"))
    key = json.dumps([forecast_id, settings.reading_level, settings.translation], separators=(",", ":"))
    with connect() as db:
        cached = db.execute("SELECT value FROM explainer_cache WHERE cache_key=?", (key,)).fetchone()
    if cached:
        return json.loads(cached["value"])
    copy = {
        "simple": "A few costs may land close together. See what causes this forecast.",
        "clear": "These costs may land close together, so money could feel tight.",
        "detailed": "The listed costs and a quieter week may raise the chance of a shortfall.",
    }[settings.reading_level]
    block = {"kind": "tip", "text": copy, "driver_ids": [driver.id for driver in DRIVERS], "translation": copy if settings.translation else None}
    with connect() as db:
        db.execute("INSERT OR REPLACE INTO explainer_cache VALUES(?,?)", (key, json.dumps(block)))
    return block
