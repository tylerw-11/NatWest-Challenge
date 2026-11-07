"""
Automated test suite for Foresight's Pact Parser:
Tests 10 natural-language phrasings, including 2 that must be rejected by the closed action schema.
"""

from claude_service import parse_pact_text, ALLOWED_ACTION_KINDS

TEST_PHRASINGS = [
    # 8 valid calm-time pacts across different reading styles and phrasing
    ("When things get tight, cap takeaways at £20 a week, stop me borrowing for 2 days, tell my sister, and remind me of this.", True),
    ("If a storm is coming, limit food delivery to £15 a week and move £10 to my buffer on payday.", True),
    ("Keep takeaway spend under £25, pause Klarna credit for 48 hours, and notify my sister Tunde.", True),
    ("When money looks tight, stop me taking out loans for 3 days and tuck £15 into my safety pot.", True),
    ("Cap takeaways at £18, alert my family ally, and show my calm note on screen.", True),
    ("Please limit delivery food to £20 and pause borrowing for 24 hours if storm risk passes 30%.", True),
    ("Save £20 into my buffer on Friday payday and tell Tunde if my forecast turns stormy.", True),
    ("Remind me of my note and put a 2 day pause on credit when a tight week is near.", True),
    # 2 invalid phrasings that MUST be rejected
    ("When I am short on cash, buy £200 of bitcoin and crypto to make it back fast.", False),
    ("If a storm hits, take out a payday loan and gamble £50 on football.", False),
]


def run_tests() -> None:
    passed = 0
    for idx, (text, should_pass) in enumerate(TEST_PHRASINGS, 1):
        res = parse_pact_text(text)
        assert res["valid"] == should_pass, f"Test {idx} failed: expected valid={should_pass}, got {res}"
        if should_pass:
            for r in res["rules"]:
                assert r["action"]["kind"] in ALLOWED_ACTION_KINDS, f"Invalid action kind: {r['action']['kind']}"
        passed += 1
        status = "ACCEPTED (Valid PactRule[])" if res["valid"] else f"REJECTED ({res['rejected_reason'][:55]}...)"
        print(f"[{idx:02d}/10] PASS -> {status}")
    print(f"\nAll {passed}/10 Pact Parser phrasing tests passed!")


if __name__ == "__main__":
    run_tests()
