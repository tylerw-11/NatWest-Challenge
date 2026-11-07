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
