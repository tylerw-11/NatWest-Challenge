"""
Pydantic models for Pact (/engine/contracts.py).
Strictly matches `.claude/skills/pact-contracts/SKILL.md` and `/web/lib/contracts.ts`.
"""

from __future__ import annotations
from typing import Any, Literal
from pydantic import BaseModel, Field

WeatherState = Literal["clear", "cloudy", "storm"]
DriverKind = Literal["bill", "income_dip", "one_off", "letter"]
TriggerKind = Literal["storm_probability", "buffer_below_days", "user_not_okay"]
ActionKind = Literal[
    "category_cap",
    "credit_pause_hours",
    "notify_ally",
    "move_to_buffer",
    "show_note",
]
ReadingLevel = Literal["simple", "clear", "detailed"]
ColourMode = Literal["standard", "colour_blind", "high_contrast"]
MoodState = Literal["good", "unsure", "worried"]
UIBlockKind = Literal[
    "hero",
    "week_strip",
    "storm_card",
    "tile",
    "chart",
    "list_card",
    "tip",
    "rule_row",
    "note",
    "status_chip",
]


class ErrorResponse(BaseModel):
    code: str
    message_plain: str


class DateWindow(BaseModel):
    start: str
    end: str


class Driver(BaseModel):
    id: str
    label: str
    amount_gbp: float
    due_date: str | None = None
    window: DateWindow | None = None
    kind: DriverKind
    source_note: str


class Day(BaseModel):
    date: str
    p_shortfall: float = Field(ge=0.0, le=1.0)
    state: WeatherState
    p10: float
    p50: float
    p90: float
    driver_ids: list[str]


class BestAction(BaseModel):
    action_id: str
    amount_gbp: float
    date: str
    p_after: float


class Forecast(BaseModel):
    id: str
    as_of: str
    horizon_days: int = 60
    paths: int = 1000
    days: list[Day]
    drivers: list[Driver]
    covered_until: str
    best_action: BestAction
    buffer_days: int = 6
    rules_on_count: int = 4


class RewindMonth(BaseModel):
    month: str
    extra_gbp: float


class RewindCategory(BaseModel):
    id: str
    label: str
    total_gbp: float
    source_note: str


class RewindResponse(BaseModel):
    months: list[RewindMonth]
    categories: list[RewindCategory]
    total_gbp: float
    kept_with_pact_gbp: float


class PactTrigger(BaseModel):
    kind: TriggerKind
    threshold: float | None = None
    horizon_days: int | None = None
    buffer_days: int | None = None


class PactRule(BaseModel):
    id: str
    trigger: PactTrigger
    action: dict[str, Any]
    when_label: str
    then_label: str
    confirmed: bool = False
    active_from: str | None = None
    change_requested_at: str | None = None


class AllySummary(BaseModel):
    name: str
    relation: str
    contact: str | None = None
    status: Literal["active", "revoked"] = "active"


class Settings(BaseModel):
    reading_level: ReadingLevel = "simple"
    read_aloud: bool = False
    translation: str | None = None
    storm_lead_days: Literal[14, 7, 0] = 14
    storm_threshold: float = 0.30
    colour_mode: ColourMode = "standard"
    ally: AllySummary | None = AllySummary(name="Jade", relation="Sister", contact="+44 7700 900412")
    calm_mode: bool = False
    mood: MoodState | None = "good"


class UIBlock(BaseModel):
    kind: UIBlockKind
    id: str | None = None
    eyebrow: str | None = None
    headline: str | None = None
    body: str | None = None
    translation_text: str | None = None
    driver_ids: list[str] = []
    data: dict[str, Any] | None = None
