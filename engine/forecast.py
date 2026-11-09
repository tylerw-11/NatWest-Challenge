from datetime import date, timedelta
import hashlib
import calendar
import json

import numpy as np
if __package__:
    from .contracts import Day, Driver, Forecast
else:
    from contracts import Day, Driver, Forecast

DRIVERS = [
    Driver(id="council-tax-20260323", label="Council tax", amount_gbp=118, due_date=date(2026, 3, 23), kind="bill", source_note="Council tax payment due on 23 March."),
    Driver(id="phone-20260322", label="Phone renewal", amount_gbp=45, due_date=date(2026, 3, 22), kind="bill", source_note="Phone renewal due on 22 March."),
    Driver(id="quieter-week-20260316", label="Quieter week", amount_gbp=90, window={"start": date(2026, 3, 16), "end": date(2026, 3, 22)}, kind="income_dip", source_note="Gig earnings may be lower from 16 to 22 March."),
]

DEMO_BALANCE_WAYPOINTS = (
    (0, 180), (2, 155), (3, 460), (12, 150), (13, 35), (14, 60),
    (16, 240), (21, 330), (24, 280), (31, 520), (44, 316), (59, 420),
)


def _demo_balance(day: date) -> float:
    """Interpolate the demo's fictional balance path between known cash-flow events."""
    offset = (day - date(2026, 3, 10)).days
    if offset <= DEMO_BALANCE_WAYPOINTS[0][0]:
        return float(DEMO_BALANCE_WAYPOINTS[0][1])
    for (left_day, left_balance), (right_day, right_balance) in zip(DEMO_BALANCE_WAYPOINTS, DEMO_BALANCE_WAYPOINTS[1:]):
        if offset <= right_day:
            portion = (offset - left_day) / (right_day - left_day)
            return round(left_balance + (right_balance - left_balance) * portion, 2)
    return float(DEMO_BALANCE_WAYPOINTS[-1][1])


def make_forecast(as_of: date = date(2026, 3, 10), threshold: float = .30, buffer_move: float = 0) -> Forecast:
    storm_date = date(2026, 3, 23)
    days: list[Day] = []
    for i in range(60):
        d = as_of + timedelta(days=i)
        p = .125 if buffer_move >= 15 and d == storm_date else (.33 if d == storm_date else (.16 if date(2026, 3, 19) <= d <= date(2026, 3, 22) else .04))
        state = "clear" if p < .10 else "cloudy" if p <= threshold else "storm"
        drivers = [x.id for x in DRIVERS] if d == storm_date else []
        p50 = _demo_balance(d)
        spread = 40 + int(i * 1.4)
        p10 = -18 if p >= .16 else max(1, round(p50 - spread))
        p90 = 92 if d == storm_date else round(p50 + spread)
        if d == storm_date:
            p50 = 35
        days.append(Day(date=d, p_shortfall=p, state=state, p10=p10, p50=p50, p90=p90, driver_ids=drivers))
    moved = buffer_move >= 15
    # Demo figures: buffer covers 6 days (8 after the £15 move); once moved, there is nothing left to suggest.
    best_action = None if moved else {"action_id": "move_to_buffer", "amount_gbp": 15, "date": date(2026, 3, 13), "p_after": 0.125}
    return Forecast(id=f"demo-{as_of.isoformat()}-{int(buffer_move)}", as_of=as_of, starting_balance_gbp=_demo_balance(as_of), days=days, drivers=DRIVERS, covered_until=date(2026, 3, 19), buffer_days=8 if moved else 6, best_action=best_action)


def _add_months(day: date, months: int, anchor_day: int) -> date:
    index = day.year * 12 + day.month - 1 + months
    year, month = divmod(index, 12)
    month += 1
    return date(year, month, min(anchor_day, calendar.monthrange(year, month)[1]))


def _schedule(first: date, frequency: str, horizon_end: date, start_date: date) -> list[date]:
    anchor = first
    if first < start_date and frequency == "weekly":
        first += timedelta(days=((start_date - first).days + 6) // 7 * 7)
    elif first < start_date and frequency == "fortnightly":
        first += timedelta(days=((start_date - first).days + 13) // 14 * 14)
    elif first < start_date and frequency in {"monthly", "yearly"}:
        step = 12 if frequency == "yearly" else 1
        months = max(0, ((start_date.year - first.year) * 12 + start_date.month - first.month) // step)
        first = _add_months(anchor, months * step, anchor.day)
        while first < start_date:
            months += 1
            first = _add_months(anchor, months * step, anchor.day)
    elif first < start_date:
        return []
    if first > horizon_end:
        return []
    result = [first]
    while True:
        previous = result[-1]
        if frequency == "once":
            break
        if frequency == "weekly":
            following = previous + timedelta(days=7)
        elif frequency == "fortnightly":
            following = previous + timedelta(days=14)
        elif frequency == "monthly":
            following = _add_months(first, len(result), first.day)
        else:  # yearly
            following = _add_months(first, 12 * len(result), first.day)
        if following > horizon_end:
            break
        result.append(following)
    return result


def forecast_from_customer_data(
    *,
    as_of: date,
    current_balance_gbp: float,
    incomes: list[dict],
    bills: list[dict],
    horizon_days: int = 60,
    paths: int = 1000,
    threshold: float = .30,
    seed: int | None = None,
) -> Forecast:
    """Monte Carlo daily cash-flow forecast for a customer's supplied schedule.

    The starting balance is the balance at the start of ``as_of``. Income
    amounts are sampled from a normal distribution with the supplied relative
    variability; bills are treated as fixed. A shortfall means end-of-day cash
    is below zero. The optional seed makes an input reproducible.
    """
    end = as_of + timedelta(days=horizon_days - 1)
    day_count = horizon_days
    cashflows = np.zeros((paths, day_count), dtype=np.float64)
    drivers: list[Driver] = []
    event_dates: dict[date, list[str]] = {}

    for index, income in enumerate(incomes):
        dates = _schedule(income["next_pay_date"], income["frequency"], end, as_of)
        for pay_day in dates:
            if pay_day < as_of:
                continue
            driver_id = f"income-{index + 1}-{pay_day.isoformat()}"
            amount = float(income["amount_gbp"])
            variability = float(income["variability_pct"])
            drivers.append(Driver(id=driver_id, label=income["label"], amount_gbp=amount, due_date=pay_day, kind="one_off", source_note=f"Expected {income['label'].lower()} payment on {pay_day.strftime('%d %b').lstrip('0')}"))
            event_dates.setdefault(pay_day, []).append(driver_id)
            offset = (pay_day - as_of).days
            # Each payday is uncertain independently; fixed income has zero spread.
            if variability:
                local_seed = seed if seed is not None else int(hashlib.sha256(f"{as_of}:{current_balance_gbp}:{income}:{pay_day}".encode()).hexdigest()[:8], 16)
                rng = np.random.default_rng(local_seed + index * 1009 + offset)
                received = np.maximum(rng.normal(amount, amount * variability, paths), 0.0)
            else:
                received = amount
            cashflows[:, offset] += received

    for index, bill in enumerate(bills):
        dates = _schedule(bill["due_date"], bill["frequency"], end, as_of)
        for due_day in dates:
            if due_day < as_of:
                continue
            driver_id = f"bill-{index + 1}-{due_day.isoformat()}"
            amount = float(bill["amount_gbp"])
            drivers.append(Driver(id=driver_id, label=bill["label"], amount_gbp=amount, due_date=due_day, kind="bill", source_note=f"{bill['label']} is due on {due_day.strftime('%d %b').lstrip('0')}"))
            event_dates.setdefault(due_day, []).append(driver_id)
            cashflows[:, (due_day - as_of).days] -= amount

    balances = current_balance_gbp + np.cumsum(cashflows, axis=1)
    probabilities = np.mean(balances < 0, axis=0)
    p10 = np.percentile(balances, 10, axis=0)
    p50 = np.percentile(balances, 50, axis=0)
    p90 = np.percentile(balances, 90, axis=0)
    forecast_days: list[Day] = []
    for offset in range(day_count):
        day = as_of + timedelta(days=offset)
        probability = float(probabilities[offset])
        state = "clear" if probability < .10 else "cloudy" if probability <= threshold else "storm"
        causes = [driver_id for event_day, ids in event_dates.items() if 0 <= (day - event_day).days <= 6 for driver_id in ids]
        forecast_days.append(Day(date=day, p_shortfall=probability, state=state, p10=float(p10[offset]), p50=float(p50[offset]), p90=float(p90[offset]), driver_ids=causes))

    covered_until = end
    for item in forecast_days:
        if item.p_shortfall >= .10:
            covered_until = item.date - timedelta(days=1)
            break
    input_fingerprint = hashlib.sha256(json.dumps({"as_of": as_of.isoformat(), "balance": current_balance_gbp, "incomes": incomes, "bills": bills, "days": horizon_days, "paths": paths, "seed": seed}, sort_keys=True, default=str).encode()).hexdigest()[:16]
    return Forecast(id=f"customer-{input_fingerprint}", as_of=as_of, starting_balance_gbp=current_balance_gbp, horizon_days=horizon_days, paths=paths, days=forecast_days, drivers=drivers, covered_until=covered_until, buffer_days=max(0, (covered_until - as_of).days), best_action=None)
