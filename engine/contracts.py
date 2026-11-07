from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, Field


class Driver(BaseModel):
    id: str
    label: str
    amount_gbp: float
    due_date: date | None = None
    window: dict[str, date] | None = None
    kind: Literal["bill", "income_dip", "one_off", "letter"]
    source_note: str


class Day(BaseModel):
    date: date
    p_shortfall: float
    state: Literal["clear", "cloudy", "storm"]
    p10: float
    p50: float
    p90: float
    driver_ids: list[str] = Field(default_factory=list)


class Forecast(BaseModel):
    id: str
    as_of: date
    starting_balance_gbp: float | None = None
    horizon_days: int = 60
    paths: int = 1000
    days: list[Day]
    drivers: list[Driver]
    covered_until: date
    # Days the safety buffer covers (Weather tile). Decision 0001 (b); web contract FE-03.
    buffer_days: int = 0
    # None when there is nothing useful to suggest. Decision 0001 (e).
    best_action: dict[str, Any] | None = None


class IncomeSource(BaseModel):
    label: str = Field(min_length=1, max_length=100)
    amount_gbp: float = Field(gt=0, allow_inf_nan=False)
    next_pay_date: date
    frequency: Literal["once", "weekly", "fortnightly", "monthly", "yearly"] = "once"
    # Relative standard deviation: 0.10 means about 10% variation around the usual pay.
    variability_pct: float = Field(default=0, ge=0, le=1, allow_inf_nan=False)


class BillSchedule(BaseModel):
    label: str = Field(min_length=1, max_length=100)
    amount_gbp: float = Field(gt=0, allow_inf_nan=False)
    due_date: date
    frequency: Literal["once", "weekly", "fortnightly", "monthly", "yearly"] = "once"


class CustomerForecastRequest(BaseModel):
    # Balance at the start of as_of; scheduled cash flows dated as_of are included.
    as_of: date
    current_balance_gbp: float = Field(allow_inf_nan=False)
    incomes: list[IncomeSource] = Field(default_factory=list, max_length=50)
    bills: list[BillSchedule] = Field(default_factory=list, max_length=100)
    horizon_days: int = Field(default=60, ge=1, le=60)
    paths: int = Field(default=1000, ge=100, le=10000)
    seed: int | None = Field(default=2026, ge=0, le=2**32 - 1)


class TextInput(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


class NoteInput(BaseModel):
    transcript: str = Field(default="", max_length=4000)
    audio_blob_ref: str | None = None


class MoveInput(BaseModel):
    amount_gbp: float = Field(gt=0, le=500)
    confirmed: bool


class AllyInput(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    relation: str = Field(min_length=1, max_length=80)
    contact: str | None = Field(default=None, max_length=200)


class PactRule(BaseModel):
    id: str = ""
    trigger: dict[str, Any]
    action: dict[str, Any]
    when_label: str
    then_label: str
    confirmed: bool = False
    active_from: date | None = None
    change_requested_at: str | None = None


class Settings(BaseModel):
    reading_level: Literal["simple", "clear", "detailed"] = "simple"
    read_aloud: bool = False
    translation: str | None = None
    storm_lead_days: Literal[14, 7, 0] = 14
    storm_threshold: float = 0.30
    colour_mode: Literal["standard", "colour_blind", "high_contrast"] = "standard"
    ally: dict[str, str] | None = None
    calm_mode: bool = False
    mood: Literal["good", "unsure", "worried"] | None = None


class ErrorBody(BaseModel):
    code: str
    message_plain: str
