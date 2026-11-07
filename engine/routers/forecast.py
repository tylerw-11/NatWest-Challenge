from datetime import date

from fastapi import APIRouter, Depends

from ..contracts import CustomerForecastRequest, Forecast
from ..dependencies import current_user, settings_for
from ..forecast import DRIVERS, forecast_from_customer_data, make_forecast

router = APIRouter(tags=["forecast"])


@router.get("/forecast", response_model=Forecast)
def get_forecast(user_id: str = Depends(current_user)):
    return make_forecast(threshold=settings_for(user_id).storm_threshold)


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
def drivers(day: date, _user_id: str = Depends(current_user)):
    return [item for item in DRIVERS if item.due_date == day or item.window and item.window["start"] <= day <= item.window["end"]]
