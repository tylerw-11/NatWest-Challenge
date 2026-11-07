"""
Automated test suite for Pact Backend Requirements (T2, T3, T4, T6, T9, T10, T11):
Asserts every single figure in the Backend Requirements table as of Tuesday 10 March 2026:
1. Weather: Covered until 19 March; 10-18 March clear, 19-22 March tight (cloudy), 23 March storm; buffer 6 days; 4 rules on
2. Time River: 23 March p_shortfall = 0.33, p50 = £35; council tax £118 due 23 Mar; phone renewal £45 due 22 Mar; earnings £90 lower 16-22 Mar
3. Best action: Move £15 on Friday 13 March (payday); p_shortfall falls to 0.125 (about 1 in 8)
4. Rewind: Monthly extras Apr to Mar: [12, 8, 31, 15, 9, 24, 14, 10, 38, 27, 16, 10] (total £214);
   insurance premium £118, overdraft interest £61 (22 days), pay-later late fees £35 (7 x £5); £96 kept with pact.
5. Explainer digit post-check rejects invented figures.
6. Parser test set: 10 phrasings in pact_phrasings.json (8 accepted, 2 rejected).
"""

from __future__ import annotations
import json
import sys
from pathlib import Path

ENGINE_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(ENGINE_DIR))

from generator import generate_amara_data
from forecast_engine import simulate_forecast, run_rewind
from claude_service import parse_pact_text, explain_forecast


def test_all_demo_figures() -> None:
    dataset = generate_amara_data(seed=42)
    fc = simulate_forecast(dataset, as_of_str="2026-03-10")

    # 1. Weather figures
    assert fc["covered_until"] == "2026-03-19", f"Expected covered_until 2026-03-19, got {fc['covered_until']}"
    assert fc["buffer_days"] == 6, f"Expected buffer_days 6, got {fc['buffer_days']}"
    assert fc["rules_on_count"] == 4, f"Expected rules_on_count 4, got {fc['rules_on_count']}"

    days_by_iso = {d["date"]: d for d in fc["days"]}
    for day_num in range(10, 19):
        iso = f"2026-03-{day_num:02d}"
        assert days_by_iso[iso]["weather"] == "clear", f"Expected {iso} clear"
    for day_num in range(19, 23):
        iso = f"2026-03-{day_num:02d}"
        assert days_by_iso[iso]["weather"] == "cloudy", f"Expected {iso} cloudy/tight"
        assert days_by_iso[iso]["weather_label"] == "tight"

    # 2. Time River figures on 23 March
    d23 = days_by_iso["2026-03-23"]
    assert d23["weather"] == "storm"
    assert abs(d23["p_shortfall"] - 0.33) < 1e-6, f"Expected p_shortfall 0.33, got {d23['p_shortfall']}"
    assert abs(d23["p50"] - 35.0) < 1e-6, f"Expected p50 £35, got {d23['p50']}"

    drv_amounts = {d["id"]: abs(d["amount_gbp"]) for d in d23["drivers"]}
    assert drv_amounts["drv_council_tax"] == 118.0
    assert drv_amounts["drv_phone_renewal"] == 45.0
    assert drv_amounts["drv_earnings_dip"] == 90.0

    # 3. Best action & post-action simulation
    ba = fc["best_action"]
    assert ba["amount_gbp"] == 15.0
    assert ba["payday_date"] == "2026-03-13"
    assert abs(ba["p_shortfall_after"] - 0.125) < 1e-6

    fc_after = simulate_forecast(dataset, as_of_str="2026-03-13", storm_action_executed=True)
    d23_after = next(d for d in fc_after["days"] if d["date"] == "2026-03-23")
    assert abs(d23_after["p_shortfall"] - 0.125) < 1e-6
    assert d23_after["weather"] == "cloudy"

    # 4. Rewind figures
    rw = run_rewind(dataset)
    monthly_vals = [int(m["extra_cost_gbp"]) for m in rw["months"]]
    expected_months = [12, 8, 31, 15, 9, 24, 14, 10, 38, 27, 16, 10]
    assert monthly_vals == expected_months, f"Expected {expected_months}, got {monthly_vals}"
    assert sum(monthly_vals) == 214
    assert rw["total_gbp"] == 214.0
    assert rw["kept_with_pact_gbp"] == 96.0

    cats = {c["kind"]: c["amount_gbp"] for c in rw["categories"]}
    assert cats["insurance_premium"] == 118.0
    assert cats["overdraft_interest"] == 61.0
    assert cats["bnpl_late_fees"] == 35.0

    # 5. Explainer reading levels & digit post-check
    exp9 = explain_forecast(fc, reading_age=9)
    exp12 = explain_forecast(fc, reading_age=12)
    exp16 = explain_forecast(fc, reading_age=16)
    assert exp9["text"] != exp12["text"] != exp16["text"]

    # Test invented figure rejection in explainer
    bad_exp = explain_forecast(fc, reading_age=9, candidate_override_text="You will owe £9999 on 23 March.")
    assert bad_exp["fallback_used"] is True
    assert "9999" not in bad_exp["text"]

    # 6. Test 10 phrasings in pact_phrasings.json
    phrasings_path = Path(__file__).parent / "pact_phrasings.json"
    phrasings = json.loads(phrasings_path.read_text(encoding="utf-8"))
    assert len(phrasings) == 10
    for item in phrasings:
        res = parse_pact_text(item["text"])
        assert res["valid"] == item["should_accept"], f"Failed on {item['id']}"

    print("ALL BACKEND REQUIREMENTS TESTS (T2, T3, T4, T6, T9, T10, T11) PASSED 100%!")


if __name__ == "__main__":
    test_all_demo_figures()
