"""
Alias module `engine/forecast.py` matching `.claude/skills/pact-build-workflow/SKILL.md` layout.
Re-exports all engine algorithms from `forecast_engine.py`.
"""

from forecast_engine import (
    detect_recurring,
    learn_income_and_habits,
    solve_best_action,
    simulate_forecast,
    run_rewind,
)

__all__ = [
    "detect_recurring",
    "learn_income_and_habits",
    "solve_best_action",
    "simulate_forecast",
    "run_rewind",
]
