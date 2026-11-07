"""Seeded demo transactions. Labels are normalised; no personal identifiers."""
from datetime import date, timedelta
import random


def generate_transactions(seed: int = 23032026) -> list[dict]:
    rng = random.Random(seed)
    start, end = date(2025, 4, 1), date(2026, 3, 10)
    rows: list[dict] = []
    day = start
    while day <= end:
        if day.weekday() in (1, 3, 5):
            rows.append(dict(date=day.isoformat(), amount_gbp=round(rng.uniform(45, 115), 2), merchant_label="gig income", category="income"))
        day += timedelta(days=1)
    for month in range(12):
        year, m = 2025, 4 + month
        if m > 12:
            year, m = 2026, m - 12
        for merchant, amount, due, category in [
            ("rent", -620, 1, "housing"), ("monthly insurance", -9.83, 6, "insurance"),
            ("phone renewal", -45, 22, "phone"), ("council tax", -118, 23, "bills"),
        ]:
            try:
                d = date(year, m, due)
                rows.append(dict(date=d.isoformat(), amount_gbp=amount, merchant_label=merchant, category=category))
            except ValueError:
                pass
    # The demo's rewind figures are planted deterministically in the engine output.
    return sorted(rows, key=lambda row: row["date"])


REWIND_MONTHS = [12, 8, 31, 15, 9, 24, 14, 10, 38, 27, 16, 10]


# The four rules Amara's pact turns into in demo step 4 (same as web/mocks/pact_draft.json, here already agreed).
# Not seeded: the demo starts with no rules. Kept for /pact/parse in the backend-integration step.
DEMO_RULES = [
    {"id": "rule_takeaway_cap", "trigger": {"kind": "storm_probability", "threshold": 0.3, "horizon_days": 14}, "action": {"kind": "category_cap", "category": "takeaways", "cap_gbp": 20, "period": "week"}, "when_label": "Storm 14 days away", "then_label": "Takeaways capped at £20 a week", "confirmed": True},
    {"id": "rule_credit_pause", "trigger": {"kind": "storm_probability", "threshold": 0.3, "horizon_days": 14}, "action": {"kind": "credit_pause_hours", "hours": 48}, "when_label": "Storm 14 days away", "then_label": "No new credit or pay-later for 48 hours", "confirmed": True},
    {"id": "rule_notify_ally", "trigger": {"kind": "storm_probability", "threshold": 0.3}, "action": {"kind": "notify_ally"}, "when_label": "Storm starts", "then_label": "Let Jade know (she can't see your spending)", "confirmed": True},
    {"id": "rule_payday_buffer", "trigger": {"kind": "storm_probability", "threshold": 0.3}, "action": {"kind": "move_to_buffer", "amount_gbp": 15, "on": "payday"}, "when_label": "Payday in a storm", "then_label": "Move £15 to your buffer", "confirmed": True},
]
