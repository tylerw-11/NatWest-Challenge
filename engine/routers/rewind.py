from fastapi import APIRouter, Depends

from ..dependencies import current_user
from ..generator import REWIND_MONTHS

router = APIRouter(prefix="/rewind", tags=["rewind"])


@router.get("")
def rewind(_user_id: str = Depends(current_user)):
    labels = ["April 2025", "May 2025", "June 2025", "July 2025", "August 2025", "September 2025", "October 2025", "November 2025", "December 2025", "January 2026", "February 2026", "March 2026"]
    return {"months": [{"month": month, "extra_gbp": amount} for month, amount in zip(labels, REWIND_MONTHS)], "categories": [
        {"id": "insurance", "label": "Monthly insurance premium", "total_gbp": 118, "source_note": "Monthly payments cost more than paying yearly."},
        {"id": "overdraft", "label": "Overdraft interest", "total_gbp": 61, "source_note": "Interest across 22 days in the overdraft."},
        {"id": "pay-later", "label": "Pay-later late fees", "total_gbp": 35, "source_note": "Seven late fees of £5 each."}], "total_gbp": 214, "kept_with_pact_gbp": 96}
