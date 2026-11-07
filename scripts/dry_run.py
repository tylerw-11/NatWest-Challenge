"""Dry-run the demo against a running engine, the way the web app calls it.

    python scripts/dry_run.py                 # engine at http://localhost:8000, 2 demo runs + 1 real person
    python scripts/dry_run.py --runs 3 --api http://localhost:8000

The real-person run needs the engine started with PACT_DEV_CODES=true (or SMTP; then it is skipped).
Exits non-zero on the first failed check, printing what was expected.
"""
import argparse
import sys
import time
from datetime import date

import httpx

ORIGIN = "http://localhost:3000"
STARTER = "When things get tight, keep takeaways to £20 a week, stop me borrowing for 2 days, tell Jade, and save £15 on payday."


def check(ok: bool, what: str) -> None:
    print(f"  {'ok ' if ok else 'FAIL'} {what}")
    if not ok:
        sys.exit(1)


def client(api: str) -> httpx.Client:
    # The session cookie is Secure; re-set it without the flag so the client sends it to http://localhost too.
    c = httpx.Client(base_url=api, headers={"Origin": ORIGIN}, timeout=15)
    c.event_hooks["response"] = [lambda r: [c.cookies.set(k, v) for k, v in r.cookies.items()]]
    return c


def day(forecast: dict, iso: str) -> dict:
    return next(d for d in forecast["days"] if d["date"] == iso)


def demo_run(api: str, n: int) -> float:
    start = time.perf_counter()
    print(f"Demo run {n}")
    c = client(api)
    check(c.post("/auth/demo").status_code == 204, "Log in: Continue as Amara (demo)")
    f = c.get("/forecast").json()
    s23 = day(f, "2026-03-23")
    check(f["as_of"] == "2026-03-10" and s23["state"] == "storm" and round(1 / s23["p_shortfall"]) == 3, "Step 1: Weather, Tue 10 March, storm on Mon 23 March")
    causes = {d["label"]: d["amount_gbp"] for d in f["drivers"] if d["id"] in s23["driver_ids"]}
    check(causes == {"Council tax": 118, "Phone renewal": 45, "Quieter week": 90}, "Step 2: Time River, 1 in 3 and three causes")
    r = c.get("/rewind").json()
    check(r["total_gbp"] == 214 and [x["total_gbp"] for x in r["categories"]] == [118, 61, 35], "Step 3: Rewind £214 (£118, £61, £35)")
    check(c.get("/pact").json() == [], "Step 4a: no rules yet")
    drafts = c.post("/pact/parse", json={"text": STARTER}).json()
    check(len(drafts) == 4 and not any(d["confirmed"] for d in drafts), "Step 4b: four draft rules, none agreed")
    check(len(c.post("/pact", json={"rules": drafts}).json()) == 4, "Step 4c: she agrees to the four rules")
    sim = c.post("/simulate", params={"as_of": "2026-03-13"}).json()
    kinds = {x["action_kind"] for x in sim["fired"]}
    check(sim["forecast"]["as_of"] == "2026-03-13" and "notify_ally" in kinds, "Step 5: fast-forward to Fri 13 March, rules fire, Jade notified")
    left = next(x["left_gbp"] for x in sim["fired"] if x["action_kind"] == "category_cap")
    check(left == 12, "Step 6a: Storm mode chip, £12 left for takeaways")
    check(c.get("/pact/note").json()["text"] != "", "Step 6b: her note plays")
    after = c.post("/actions/move-to-buffer", json={"amount_gbp": 15, "confirmed": True}).json()
    check(day(after, "2026-03-23")["state"] == "cloudy", "Step 6c: Move £15 to my buffer")
    w = c.get("/forecast").json()
    check(day(w, "2026-03-23")["state"] == "cloudy" and round(1 / day(w, "2026-03-23")["p_shortfall"]) == 8, "Step 7: Weather re-runs, 23 March is tight (1 in 8)")
    return time.perf_counter() - start


def real_person_run(api: str) -> None:
    print("Real person")
    c = client(api)
    email = f"dryrun{int(time.time())}@example.com"
    sent = c.post("/auth/code/request", json={"email": email})
    if sent.status_code == 503 or "dev_code" not in sent.json():
        print("  skip: engine sends real email (or has no PACT_DEV_CODES), so the code isn't visible here")
        return
    check(c.post("/auth/code/verify", json={"email": email, "code": sent.json()["dev_code"]}).json() == {"new_user": True}, "Log in with a code: new person")
    check(c.get("/forecast").status_code == 404, "No forecast before their numbers")
    profile = {
        "current_balance_gbp": 180,
        "incomes": [{"label": "Pay", "amount_gbp": 950, "next_pay_date": "2026-11-28", "frequency": "monthly", "variability_pct": 0.25}],
        "bills": [{"label": "Rent", "amount_gbp": 650, "due_date": "2026-11-20", "frequency": "monthly"}],
    }
    check(c.put("/profile", json=profile).status_code == 200, "Sign-up step 3: their money saved")
    f = c.get("/forecast").json()
    check(f["as_of"] == date.today().isoformat() and len(f["days"]) == 60, "Their own 60-day forecast from today")
    check(c.get("/me").json()["onboarding_complete"] is True, "Onboarding complete")


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")  # so £ prints on Windows consoles
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", default="http://localhost:8000")
    ap.add_argument("--runs", type=int, default=2)
    args = ap.parse_args()
    times = [demo_run(args.api, n + 1) for n in range(args.runs)]
    real_person_run(args.api)
    print(f"All checks passed. Demo runs took {', '.join(f'{t:.2f}s' for t in times)} of API time.")


if __name__ == "__main__":
    main()
