from fastapi import APIRouter, Depends

from ..dependencies import current_user
from ..generator import REWIND_MONTHS

router = APIRouter(prefix="/rewind", tags=["rewind"])


@router.get("")
def rewind(_user_id: str = Depends(current_user)):
    labels = [f"{2025 + (3 + i) // 12}-{(3 + i) % 12 + 1:02d}" for i in range(12)]  # 2025-04 .. 2026-03 (decision 0001 a)
    return {"months": [{"month": month, "extra_gbp": amount} for month, amount in zip(labels, REWIND_MONTHS)], "categories": [
        {"id": "insurance", "label": "Monthly insurance premium", "total_gbp": 118, "source_note": "Monthly payments cost more than paying yearly."},
        {"id": "overdraft", "label": "Overdraft interest", "total_gbp": 61, "source_note": "Interest across 22 days in the overdraft."},
        {"id": "pay-later", "label": "Pay-later late fees", "total_gbp": 35, "source_note": "Seven late fees of £5 each."}], "total_gbp": 214, "kept_with_pact_gbp": 96}
