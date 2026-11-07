"""
Extension BX2: Rule-based Council Tax Support & Single Person Discount eligibility check.
Clearly labelled as an estimate with a link to Manchester City Council.
"""

from __future__ import annotations
from typing import Any


def check_unclaimed_support(
    receives_universal_credit: bool = True,
    single_adult_household: bool = True,
    care_leaver_under_25: bool = True,
    council_tax_monthly_gbp: float = 118.0,
) -> dict[str, Any]:
    eligible = receives_universal_credit or single_adult_household or care_leaver_under_25
    estimated_monthly = round(council_tax_monthly_gbp * 0.75, 2) if receives_universal_credit else round(council_tax_monthly_gbp * 0.25, 2)

    return {
        "eligible": eligible,
        "is_estimate": True,
        "label": "You may be able to claim Council Tax Support",
        "estimated_monthly_gbp": estimated_monthly,
        "estimated_annual_gbp": round(estimated_monthly * 12, 2),
        "council_url": "https://www.manchester.gov.uk/info/200008/benefits_and_support",
        "driver": {
            "id": "drv_support_cts",
            "day": "2026-03-23",
            "due_date": "2026-03-23",
            "label": "You may be able to claim: Council Tax Support (estimate)",
            "category": "support_estimate",
            "amount_gbp": estimated_monthly,
            "kind": "support_estimate",
            "source_note": "Rule-based estimate from Universal Credit receipt & household size",
        },
    }
