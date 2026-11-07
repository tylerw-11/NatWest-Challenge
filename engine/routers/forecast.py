from datetime import date

from fastapi import APIRouter, Depends

from ..contracts import CustomerForecastRequest, Forecast
from ..database import connect
from ..dependencies import current_user, fail, settings_for
from ..forecast import DRIVERS, forecast_from_customer_data, make_forecast
from .profile import profile_for

router = APIRouter(tags=["forecast"])

DEMO_USER = "amara"
DEMO_START = date(2026, 3, 10)


def demo_state(user_id: str) -> tuple[date, float]:
    """The demo clock (moved by POST /simulate) and how much has been moved to the buffer."""
    with connect() as db:
        clock = db.execute("SELECT json_extract(payload,'$.as_of') FROM events WHERE user_id=? AND kind='demo_clock' ORDER BY created_at DESC LIMIT 1", (user_id,)).fetchone()
        moved = db.execute("SELECT COALESCE(SUM(json_extract(payload,'$.amount_gbp')),0) FROM events WHERE user_id=? AND kind='buffer_moved'", (user_id,)).fetchone()[0]
    return (date.fromisoformat(clock[0]) if clock and clock[0] else DEMO_START), moved


def forecast_for(user_id: str) -> Forecast:
    """Amara gets the scripted demo; anyone else gets their own forecast from today."""
    threshold = settings_for(user_id).storm_threshold
    if user_id == DEMO_USER:
        as_of, moved = demo_state(user_id)
        return make_forecast(as_of=as_of, threshold=threshold, buffer_move=moved)
    profile = profile_for(user_id)
    if profile is None:
        fail(404, "no_profile", "Add your money details to see your forecast.")
    return forecast_from_customer_data(
        as_of=date.today(),
        current_balance_gbp=profile.current_balance_gbp,
        incomes=[item.model_dump() for item in profile.incomes],
        bills=[item.model_dump() for item in profile.bills],
        threshold=threshold,
        seed=2026,  # same inputs on the same day give the same forecast
    )


@router.get("/forecast", response_model=Forecast)
def get_forecast(user_id: str = Depends(current_user)):
    return forecast_for(user_id)


@router.post("/forecast", response_model=Forecast)
def forecast_customer_data(body: CustomerForecastRequest, user_id: str = Depends(current_user)):
    return forecast_from_customer_data(
        as_of=body.as_of,
        current_balance_gbp=body.current_balance_gbp,
        incomes=[item.model_dump() for item in body.incomes],
        bills=[item.model_dump() for item in body.bills],
        horizon_days=body.horizon_days,
        paths=body.paths,
        threshold=settings_for(user_id).storm_threshold,
        seed=body.seed,
    )


@router.get("/drivers/{day}")
def drivers(day: date, user_id: str = Depends(current_user)):
    if user_id != DEMO_USER:
        forecast = forecast_for(user_id)
        ids = next((d.driver_ids for d in forecast.days if d.date == day), [])
        return [item for item in forecast.drivers if item.id in ids]
    return [item for item in DRIVERS if item.due_date == day or item.window and item.window["start"] <= day <= item.window["end"]]
