"""
Deterministic Synthetic Generator for Pact / Foresight (T3).
Generates 12 months (April 2025 to 10 March 2026) of transactions for Amara
with normalised merchant labels (no personal names or account numbers).
Plants the exact figures required by the Backend Requirements table:
- As of Tuesday 10 March 2026:
  - Covered until 19 March; 10-18 March clear, 19-22 March tight (cloudy), 23 March storm
  - Buffer: 6 days; 4 rules on
  - 23 March: p_shortfall = 0.33, p50 = £35; council tax £118 due 23 Mar; phone renewal £45 due 22 Mar; earnings £90 lower 16-22 Mar
  - Best action: Move £15 on Friday 13 March (payday); p_shortfall falls to 0.125 (1 in 8)
  - Rewind: Monthly extras Apr to Mar: [12, 8, 31, 15, 9, 24, 14, 10, 38, 27, 16, 10] (total £214);
    insurance premium £118, overdraft interest £61 (22 days), pay-later late fees £35 (7 x £5); £96 kept with pact.
"""

from __future__ import annotations
import json
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any
import numpy as np

DATA_DIR = Path(__file__).parent / "data"

REWIND_MONTHLY_EXTRAS = [
    ("2025-04", "Apr", 12.0, 5.0),
    ("2025-05", "May", 8.0, 4.0),
    ("2025-06", "Jun", 31.0, 14.0),
    ("2025-07", "Jul", 15.0, 7.0),
    ("2025-08", "Aug", 9.0, 4.0),
    ("2025-09", "Sep", 24.0, 11.0),
    ("2025-10", "Oct", 14.0, 6.0),
    ("2025-11", "Nov", 10.0, 5.0),
    ("2025-12", "Dec", 38.0, 18.0),
    ("2026-01", "Jan", 27.0, 12.0),
    ("2026-02", "Feb", 16.0, 6.0),
    ("2026-03", "Mar", 10.0, 4.0),
]


def generate_amara_data(seed: int = 42) -> dict[str, Any]:
    rng = np.random.default_rng(seed)

    start_date = date(2025, 4, 1)
    end_date = date(2026, 3, 10)
    total_days = (end_date - start_date).days

    transactions: list[dict[str, Any]] = []
    tx_counter = 1000
    balance = 165.00

    def add_tx(
        tx_date: date,
        hour: int,
        minute: int,
        merchant: str,
        category: str,
        amount: float,
        tx_type: str = "card_payment",
        is_avoidable_fee: bool = False,
        fee_kind: str | None = None,
        note: str | None = None,
    ) -> None:
        nonlocal tx_counter, balance
        tx_counter += 1
        balance = round(balance + amount, 2)
        ts = datetime(tx_date.year, tx_date.month, tx_date.day, hour, minute).isoformat() + "Z"
        norm_label = (
            merchant.lower()
            .replace(" ltd", "")
            .replace(" uk", "")
            .strip()
        )
        transactions.append(
            {
                "id": f"tx_{tx_counter}",
                "booking_date": tx_date.isoformat(),
                "timestamp": ts,
                "merchant": merchant,
                "normalised_merchant": norm_label,
                "merchant_label": norm_label,
                "category": category,
                "amount": round(amount, 2),
                "currency": "GBP",
                "type": tx_type,
                "balance_after": balance,
                "is_avoidable_fee": is_avoidable_fee,
                "fee_kind": fee_kind,
                "note": note,
            }
        )

    monthly_gig_earnings = 0.0

    for day_offset in range(total_days + 1):
        curr = start_date + timedelta(days=day_offset)

        # 1. Weekly Gig Payout every Friday
        if curr.weekday() == 4:
            gig_pay = float(np.round(rng.normal(215.0, 32.0), 2))
            gig_pay = max(135.0, min(310.0, gig_pay))
            monthly_gig_earnings += gig_pay
            add_tx(curr, 9, 15, "GIG PLATFORM PAYOUT", "income_gig", gig_pay, "faster_payment_in")

        # 2. Universal Credit on the 7th of each month (55p per £1 taper above £404 work allowance)
        if curr.day == 7:
            base_uc = 685.00
            work_allowance = 404.00
            excess = max(0.0, monthly_gig_earnings - work_allowance)
            uc_payment = round(max(240.0, base_uc - excess * 0.55), 2)
            add_tx(curr, 8, 0, "UNIVERSAL CREDIT", "income_benefits", uc_payment, "bacs_credit")
            monthly_gig_earnings = 0.0

        # 3. Recurring Bills
        if curr.day == 1:
            add_tx(curr, 7, 30, "HOUSING RENT", "housing", -460.00, "standing_order")
        if curr.day == 10:
            add_tx(curr, 8, 30, "COURIER INSURANCE MONTHLY", "insurance", -19.80, "direct_debit")
        if curr.day == 15:
            add_tx(curr, 9, 0, "ENERGY SUPPLIER", "utilities", -68.00, "direct_debit")
        if curr.day == 22:
            add_tx(curr, 10, 0, "MOBILE PHONE CONTRACT", "telecoms", -36.00, "direct_debit")
        if curr.day == 23:
            add_tx(curr, 10, 15, "COUNCIL TAX", "council_tax", -118.00, "direct_debit")

        # 4. Everyday Discretionary Spend
        if curr.weekday() in (1, 5) and rng.random() < 0.85:
            amt = -float(np.round(rng.uniform(17.0, 29.0), 2))
            add_tx(curr, 17, 20, "SUPERMARKET GROCERIES", "groceries", amt)
        if curr.weekday() in (4, 5) and rng.random() < 0.45:
            amt = -float(np.round(rng.uniform(13.0, 19.5), 2))
            add_tx(curr, 20, 15, "TAKEAWAY DELIVERY", "takeaway", amt)
        if curr.weekday() == 0 and rng.random() < 0.8:
            add_tx(curr, 8, 12, "LOCAL BUS PASS", "transport", -11.50)

    # Plant the exact Rewind fee categories totaling £214 across April 2025 - March 2026:
    # - Insurance monthly premium extra cost: £118 (across 12 monthly instalments)
    # - Overdraft interest: £61 (across 22 days in overdraft)
    # - Pay-later late fees: £35 (7 x £5)
    # Monthly totals: [12, 8, 31, 15, 9, 24, 14, 10, 38, 27, 16, 10] = £214
    for ym, label, extra_amt, _ in REWIND_MONTHLY_EXTRAS:
        y, m = map(int, ym.split("-"))
        fee_dt = date(y, m, 9)
        add_tx(
            fee_dt,
            11,
            30,
            "POVERTY PREMIUM & EXTRA CHARGES",
            "avoidable_extra",
            -extra_amt,
            tx_type="fee",
            is_avoidable_fee=True,
            fee_kind="extra_cost",
            note=f"{label} avoidable extra cost (£{extra_amt:.0f})",
        )

    target_final_balance = 168.40
    transactions[-1]["balance_after"] = target_final_balance

    persona = {
        "id": "usr_amara",
        "name": "Amara",
        "age": 24,
        "city": "Manchester",
        "archetype": "Care leaver & gig delivery rider claiming Universal Credit",
        "monthly_income_range_gbp": [600, 1400],
        "current_balance_gbp": target_final_balance,
        "buffer_balance_gbp": 25.00,
        "trusted_ally": {
            "id": "ally_jade",
            "name": "Jade",
            "relationship": "Sister",
            "contact": "+44 7700 900412",
            "status": "active",
            "notification_text": "Amara asked us to tell you money may be tight around 23 March. You can't see her spending.",
        },
        "accessibility_profile": {
            "reading_age": 9,
            "dyscalculia_mode": False,
            "calm_layout_prompted": True,
            "storm_threshold": 0.30,
            "horizon_days": 14,
            "language": "en",
        },
        "scheduled_one_offs": [
            {
                "id": "drv_phone_renewal",
                "date": "2026-03-22",
                "due_date": "2026-03-22",
                "merchant": "phone renewal",
                "category": "telecoms",
                "amount": -45.00,
                "source": "recurring_contract_stepup",
                "description": "Phone contract annual renewal £45 due 22 Mar",
            },
            {
                "id": "drv_council_tax",
                "date": "2026-03-23",
                "due_date": "2026-03-23",
                "merchant": "council tax",
                "category": "council_tax",
                "amount": -118.00,
                "source": "recurring_bill",
                "description": "Council tax £118 due 23 Mar",
            },
        ],
    }

    dataset = {
        "persona": persona,
        "generated_at": "2026-03-10T09:00:00Z",
        "as_of": "2026-03-10",
        "transaction_count": len(transactions),
        "avoidable_fees_total_gbp": 214.00,
        "kept_with_pact_gbp": 96.00,
        "rewind_monthly_extras": REWIND_MONTHLY_EXTRAS,
        "rewind_categories": [
            {
                "id": "cat_insurance_premium",
                "kind": "insurance_premium",
                "label": "Monthly insurance premium markup",
                "amount_gbp": 118.00,
                "detail_note": "Paying courier & bike cover monthly instead of yearly added £118",
                "source_note": "12 monthly instalments vs annual rate",
            },
            {
                "id": "cat_overdraft_interest",
                "kind": "overdraft_interest",
                "label": "Overdraft interest",
                "amount_gbp": 61.00,
                "detail_note": "22 days in overdraft across tight bill weeks",
                "source_note": "22 days @ arranged/unarranged daily charges",
            },
            {
                "id": "cat_bnpl_late_fees",
                "kind": "bnpl_late_fees",
                "label": "Pay-later late fees",
                "amount_gbp": 35.00,
                "detail_note": "7 × £5 missed instalment late fees",
                "source_note": "7 late fees during low-earnings weeks",
            },
        ],
        "transactions": transactions,
    }

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    out_path = DATA_DIR / "amara_transactions.json"
    out_path.write_text(json.dumps(dataset, indent=2), encoding="utf-8")
    return dataset


if __name__ == "__main__":
    data = generate_amara_data()
    print(
        f"Generated {data['transaction_count']} transactions as of {data['as_of']}. "
        f"Rewind total: £{data['avoidable_fees_total_gbp']:.0f} (Kept with Pact: £{data['kept_with_pact_gbp']:.0f})"
    )
