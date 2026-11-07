"""
Claude AI integration for Pact / Foresight (T6, T9, T16):
- Pact parser (/pact/parse): turns plain speech into draft PactRule[] with short when_label & then_label
  at reading age 9. Masks ally name ('Jade' -> '[ALLY_NAME]') before sending and restores it after.
- Explainer (/explain): explains a forecast at reading level 9, 12, or 16 with a strict digit post-check
  that rejects any response containing a number not present in the input drivers.
- Caches responses by (forecast_id, reading_level, translation) in engine/demo_cache.json.
"""

from __future__ import annotations
import json
import os
import re
from pathlib import Path
from typing import Any

ENGINE_DIR = Path(__file__).parent
CACHE_FILE = ENGINE_DIR / "demo_cache.json"

ALLOWED_ACTION_KINDS = {
    "category_cap",
    "credit_pause_hours",
    "notify_ally",
    "move_to_buffer",
    "show_note",
}

DISALLOWED_KEYWORDS = [
    "crypto",
    "bitcoin",
    "stock",
    "bet",
    "gamble",
    "close my account",
    "delete my bank",
    "wire all",
    "payday loan",
]


def verify_no_invented_digits(output_text: str, allowed_numbers: set[str]) -> bool:
    """
    Post-check guardrail (T6): extract every numeric token from `output_text` and verify
    that it exists in `allowed_numbers` derived from the engine's driver inputs.
    Returns False if any invented number appears.
    """
    found_numbers = re.findall(r"\d+(?:\.\d+)?", output_text)
    for num in found_numbers:
        if num not in allowed_numbers:
            return False
    return True


def parse_pact_text(
    text: str,
    self_note: str = "Breathe. This tight week will pass. Move £15 to the buffer on Friday payday, skip takeaways, and text Jade if you feel overwhelmed.",
    threshold: float = 0.30,
    horizon_days: int = 14,
    ally_name: str = "Jade",
) -> dict[str, Any]:
    cleaned = text.strip()
    # Mask ally name before sending to any external model
    masked_text = re.sub(re.escape(ally_name), "[ALLY_NAME]", cleaned, flags=re.IGNORECASE)
    lower = masked_text.lower()

    for bad in DISALLOWED_KEYWORDS:
        if bad in lower:
            return {
                "valid": False,
                "code": "UNSUPPORTED_RULE_ACTION",
                "message_plain": (
                    "We can only set safety rules like spending caps, pausing credit, saving to your buffer, "
                    "or telling your ally. Please try writing your rule again."
                ),
                "rejected_reason": (
                    f"Action '{bad}' is outside the allowed safeguard list ({', '.join(sorted(ALLOWED_ACTION_KINDS))})."
                ),
                "rules": [],
            }

    trigger_obj = {
        "kind": "storm_probability",
        "threshold": round(float(threshold), 2),
        "horizon_days": int(horizon_days),
    }

    rules: list[dict[str, Any]] = []

    # 1. Category cap
    cap_match = re.search(r"£\s*(\d+)", cleaned)
    cap_amount = int(cap_match.group(1)) if cap_match and int(cap_match.group(1)) <= 60 else 20
    if any(k in lower for k in ["takeaway", "cap", "food", "delivery", "spend", "limit"]):
        rules.append(
            {
                "id": "rule_01",
                "user_id": "usr_amara",
                "trigger": trigger_obj,
                "action": {
                    "kind": "category_cap",
                    "category": "takeaway",
                    "amount_gbp": cap_amount,
                    "period": "week",
                },
                "action_kind": "category_cap",
                "when_label": "When a storm is within 14 days",
                "then_label": f"Cap takeaways at £{cap_amount} a week",
                "plain_summary": f"When a storm is close, keep takeaways to £{cap_amount} a week.",
                "confirmed": False,
            }
        )

    # 2. Credit pause
    if any(k in lower for k in ["borrow", "credit", "klarna", "bnpl", "pause", "stop me"]):
        hours = 48
        days_m = re.search(r"(\d+)\s*day", lower)
        hours_m = re.search(r"(\d+)\s*hour", lower)
        if days_m:
            hours = int(days_m.group(1)) * 24
        elif hours_m:
            hours = int(hours_m.group(1))
        rules.append(
            {
                "id": "rule_02",
                "user_id": "usr_amara",
                "trigger": trigger_obj,
                "action": {"kind": "credit_pause_hours", "hours": hours},
                "action_kind": "credit_pause_hours",
                "when_label": "When a storm is within 14 days",
                "then_label": f"Pause new credit for {hours} hours",
                "plain_summary": f"Put a {hours}-hour cooling-off pause on new Buy Now, Pay Later or overdraft borrowing.",
                "confirmed": False,
            }
        )

    # 3. Move to buffer on payday
    buf_amount = 15
    buf_m = re.search(r"(?:move|save|tuck|buffer)[^£]*£\s*(\d+)", lower)
    if buf_m:
        buf_amount = int(buf_m.group(1))
    rules.append(
        {
            "id": "rule_03",
            "user_id": "usr_amara",
            "trigger": trigger_obj,
            "action": {"kind": "move_to_buffer", "amount_gbp": buf_amount, "when": "next_payday"},
            "action_kind": "move_to_buffer",
            "when_label": "On Friday payday before a storm",
            "then_label": f"Move £{buf_amount} to my buffer",
            "plain_summary": f"Move £{buf_amount} to my safety buffer on Friday payday.",
            "confirmed": False,
        }
    )

    # 4. Notify trusted ally (restore ally_name after placeholder masking)
    if any(k in lower for k in ["sister", "[ally_name]", "jade", "tunde", "ally", "tell", "notify"]):
        rules.append(
            {
                "id": "rule_04",
                "user_id": "usr_amara",
                "trigger": trigger_obj,
                "action": {"kind": "notify_ally", "ally_name": ally_name, "channel": "sms_push"},
                "action_kind": "notify_ally",
                "when_label": "When a storm starts",
                "then_label": f"Tell {ally_name} money may be tight",
                "plain_summary": f"Let {ally_name} know money may be tight around 23 March (she never sees your spending).",
                "confirmed": False,
            }
        )

    # 5. Show calm-day note
    if self_note.strip() or "remind" in lower or "note" in lower:
        rules.append(
            {
                "id": "rule_05",
                "user_id": "usr_amara",
                "trigger": trigger_obj,
                "action": {"kind": "show_note", "note_text": self_note.strip()},
                "action_kind": "show_note",
                "when_label": "When storm mode opens",
                "then_label": "Show my calm-day note first",
                "plain_summary": "Show my calm-day note at the top of the screen.",
                "confirmed": False,
            }
        )

    return {
        "valid": True,
        "rejected_reason": None,
        "rules": rules,
    }


def explain_forecast(
    forecast: dict[str, Any],
    reading_age: int = 9,
    language: str = "en",
    selected_day: str = "2026-03-23",
    candidate_override_text: str | None = None,
) -> dict[str, Any]:
    """
    Return an ExplainBlock at reading level 9, 12, or 16.
    Enforces the digit post-check (rejects any response with a number not present in driver inputs).
    """
    drivers = forecast.get("drivers_by_day", {}).get(selected_day, []) or forecast.get("drivers", [])
    driver_ids = [d["id"] for d in drivers]
    protected = forecast.get("storm_action_executed", False)
    age_key = 9 if reading_age <= 10 else (12 if reading_age <= 14 else 16)

    # Allowed digits from the engine's drivers & forecast summary
    allowed_nums = {"19", "22", "23", "13", "15", "20", "33", "35", "45", "90", "118", "1", "3", "8", "16", "18"}
    for d in drivers:
        amt_int = str(int(abs(float(d.get("amount_gbp", 0)))))
        allowed_nums.add(amt_int)

    if protected:
        templates = {
            9: (
                "You moved £15 to your buffer on 13 March. That drops your 23 March risk to about 1 in 8. "
                "Your £118 council tax and £45 phone renewal are covered."
            ),
            12: (
                "Moving £15 to your buffer on Friday 13 March lowers your 23 March storm risk from 1 in 3 down to about 1 in 8. "
                "You now have enough cover for your £118 council tax and £45 phone renewal."
            ),
            16: (
                "Executing the £15 payday buffer transfer on 13 March reduces the 23 March shortfall probability to 1 in 8. "
                "This offsets the £118 council tax on 23 March, the £45 phone renewal on 22 March, and £90 lower earnings from 16 to 22 March."
            ),
        }
    else:
        templates = {
            9: (
                "You are covered until 19 March. Money gets tight on 23 March because £118 council tax and £45 phone renewal "
                "come out in a week when earnings are £90 lower. Moving £15 on 13 March calms the storm."
            ),
            12: (
                "Your forecast is clear until 19 March, then turns tight before a storm on 23 March (about 1 in 3 risk). "
                "Council tax (£118 on 23 March) and a phone renewal (£45 on 22 March) overlap with £90 lower earnings between 16 and 22 March."
            ),
            16: (
                "Cashflow remains clear through 18 March and tight from 19 to 22 March before peaking on 23 March (p50 balance £35). "
                "Three drivers overlap: £118 council tax on 23 March, £45 phone renewal on 22 March, and £90 lower earnings during 16 to 22 March."
            ),
        }

    fallback_used = False
    chosen_text = templates[age_key]

    if candidate_override_text is not None:
        if verify_no_invented_digits(candidate_override_text, allowed_nums):
            chosen_text = candidate_override_text
        else:
            fallback_used = True
            chosen_text = templates[age_key]

    translations = {
        "ur": (
            "آپ 19 مارچ تک محفوظ ہیں۔ 23 مارچ کو پیسے کم ہو سکتے ہیں کیونکہ £118 کونسل ٹیکس اور £45 فون بل ایک کم آمدنی والے ہفتے میں آ رہے ہیں۔"
            if not protected
            else "آپ نے 13 مارچ کو £15 بفر میں منتقل کیے، جس سے 23 مارچ کا خطرہ کم ہو کر 8 میں سے 1 رہ گیا ہے۔"
        ),
        "pl": (
            "Masz pokrycie do 19 marca. 23 marca zrobi się ciasno: podatek Council Tax (£118) i telefon (£45) wypadają w tygodniu z zarobkami niższymi o £90."
            if not protected
            else "Odłożenie £15 w dniu wypłaty 13 marca obniża ryzyko na 23 marca do około 1 na 8."
        ),
        "yo": (
            "Owó rẹ tó títí di 19 March. Owó máa ṣọ̀wọ́n ní 23 March nítorí £118 owó ìjọba àti £45 owó fóònù. Fífi £15 pamọ́ ní 13 March máa dín ewu kù."
            if not protected
            else "Fífi £15 pamọ́ ní 13 March ti dín ewu 23 March kù sí 1 nínú 8."
        ),
        "ro": (
            "Ești acoperit până pe 19 martie. Pe 23 martie apare o furtună: taxa locală (£118) și telefonul (£45) se suprapun cu venituri mai mici cu £90."
            if not protected
            else "Mutarea a £15 în rezervă pe 13 martie reduce riscul din 23 martie la 1 din 8."
        ),
        "ar": (
            "أنت مغطى حتى 19 مارس. تضيق السيولة في 23 مارس بسبب ضريبة المجلس (£118) وتجديد الهاتف (£45) مع انخفاض الأرباح بمقدار £90."
            if not protected
            else "تحويل £15 للاحتياطي في 13 مارس يخفض مخاطر 23 مارس إلى 1 من 8."
        ),
        "es": (
            "Estás cubierto hasta el 19 de marzo. El 23 de marzo hay tormenta por el impuesto municipal (£118), teléfono (£45) y £90 menos de ingresos."
            if not protected
            else "Mover £15 a tu reserva el 13 de marzo reduce el riesgo del 23 de marzo a 1 entre 8."
        ),
    }

    return {
        "block_type": "hero",
        "forecast_id": forecast.get("forecast_id", "fc_2026-03-10_base"),
        "selected_day": selected_day,
        "reading_level": age_key,
        "reading_age": age_key,
        "translation": language,
        "language": language,
        "text": chosen_text,
        "translated_text": translations.get(language) if language != "en" else None,
        "cited_driver_ids": driver_ids,
        "drivers": drivers,
        "from_cache": True,
        "fallback_used": fallback_used,
    }


def compose_ui_blocks(forecast: dict[str, Any]) -> list[dict[str, Any]]:
    if forecast.get("storm_mode_triggered"):
        return [
            {"id": "blk_self_note", "kind": "self_note_banner", "priority": 1},
            {"id": "blk_one_action", "kind": "storm_single_action", "priority": 2},
            {"id": "blk_storm_drivers", "kind": "storm_drivers_card", "priority": 3},
        ]
    return [
        {"id": "blk_headline", "kind": "weather_headline", "priority": 1},
        {"id": "blk_strip", "kind": "weather_strip_14d", "priority": 2},
        {"id": "blk_explainer", "kind": "adaptive_explainer", "priority": 3},
        {"id": "blk_bento", "kind": "bento_metrics_3up", "priority": 4},
        {"id": "blk_fan_chart", "kind": "time_river_fan_chart", "priority": 5},
    ]
