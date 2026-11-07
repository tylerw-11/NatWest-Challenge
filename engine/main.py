"""
Complete Backend Service for Pact / Foresight (T1–T16 + BX1–BX8 + Linear Regression CSV Engine).
Backed by SQLite with all 11 tables (engine/db.py).
Serves both FastAPI (when installed) and built-in HTTPServer on port 8000.
"""

from __future__ import annotations
import json
import sqlite3
import uuid
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

from generator import generate_amara_data, DATA_DIR
from forecast_engine import simulate_forecast, run_rewind
from claude_service import parse_pact_text, explain_forecast, compose_ui_blocks
from db import (
    get_conn,
    init_eleven_tables,
    seed_default_user_and_rules,
    create_demo_session,
    log_event,
)
from support_check import check_unclaimed_support
from calibration import get_calibration_and_fairness_report
from linear_model import (
    generate_trial_csv,
    parse_csv_and_fit_regression,
    predict_debt_trajectory,
)

AMARA_DATA_FILE = DATA_DIR / "amara_transactions.json"
AMARA_DATASET = generate_amara_data(seed=42)
seed_default_user_and_rules(AMARA_DATASET["transactions"])

# Runtime state table for demo clock & buffer toggle
STATE_DB_PATH = DATA_DIR / "foresight.db"


def _init_kv() -> None:
    with sqlite3.connect(STATE_DB_PATH) as c:
        c.execute("CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
        c.commit()


_init_kv()


def get_state(key: str, default: Any) -> Any:
    with sqlite3.connect(STATE_DB_PATH) as c:
        row = c.execute("SELECT value FROM state WHERE key = ?", (key,)).fetchone()
        if row:
            return json.loads(row[0])
    return default


def set_state(key: str, value: Any) -> None:
    with sqlite3.connect(STATE_DB_PATH) as c:
        c.execute("INSERT OR REPLACE INTO state (key, value) VALUES (?, ?)", (key, json.dumps(value)))
        c.commit()


# =========================================================================
# ACCOUNTS, AUTH & SETTINGS (T5, T13)
# =========================================================================
def api_auth_demo() -> dict[str, Any]:
    sess = create_demo_session("Amara's Android (Demo)")
    return {
        "authenticated": True,
        "session": sess,
        "user": api_get_me(),
    }


def api_get_me() -> dict[str, Any]:
    with get_conn() as conn:
        u = conn.execute("SELECT * FROM users WHERE id = 'usr_amara'").fetchone()
        b = conn.execute("SELECT * FROM bank_connections WHERE user_id = 'usr_amara'").fetchone()
    return {
        "id": u["id"] if u else "usr_amara",
        "display_name": u["display_name"] if u else "Amara",
        "contact": u["contact"] if u else "amara.demo@example.org",
        "created_at": u["created_at"] if u else "2026-03-10T09:00:00Z",
        "deletion_requested_at": u["deletion_requested_at"] if u else None,
        "onboarding_complete": True,
        "bank_connection": {
            "id": b["id"] if b else "bank_demo_01",
            "user_id": "usr_amara",
            "provider": b["provider"] if b else "Demo bank",
            "consent_expires_at": b["consent_expires_at"] if b else "2026-06-10T09:00:00Z",
            "status": b["status"] if b else "connected",
        },
    }


def api_get_settings() -> dict[str, Any]:
    with get_conn() as conn:
        s = conn.execute("SELECT * FROM settings WHERE user_id = 'usr_amara'").fetchone()
    if not s:
        return {
            "user_id": "usr_amara",
            "reading_level": 9,
            "read_aloud": False,
            "translation": "en",
            "storm_lead_days": 14,
            "storm_threshold": 0.30,
            "colour_mode": "standard",
            "calm_mode": False,
            "mood": "calm",
            "mood_updated_at": "2026-03-10T09:00:00Z",
        }
    return {
        "user_id": s["user_id"],
        "reading_level": int(s["reading_level"]),
        "read_aloud": bool(s["read_aloud"]),
        "translation": s["translation"],
        "storm_lead_days": int(s["storm_lead_days"]),
        "storm_threshold": float(s["storm_threshold"]),
        "colour_mode": s["colour_mode"],
        "calm_mode": bool(s["calm_mode"]),
        "mood": s["mood"],
        "mood_updated_at": s["mood_updated_at"],
    }


def api_put_settings(body: dict[str, Any]) -> dict[str, Any]:
    curr = api_get_settings()
    updated = {**curr, **body, "mood_updated_at": datetime.utcnow().isoformat() + "Z"}
    with get_conn() as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO settings (
                user_id, reading_level, read_aloud, translation,
                storm_lead_days, storm_threshold, colour_mode, calm_mode, mood, mood_updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "usr_amara",
                int(updated["reading_level"]),
                1 if updated["read_aloud"] else 0,
                str(updated["translation"]),
                int(updated["storm_lead_days"]),
                float(updated["storm_threshold"]),
                str(updated["colour_mode"]),
                1 if updated["calm_mode"] else 0,
                str(updated["mood"]),
                updated["mood_updated_at"],
            ),
        )
        conn.commit()
    set_state("reading_age", int(updated["reading_level"]))
    set_state("language", str(updated["translation"]))
    set_state("storm_threshold", float(updated["storm_threshold"]))
    return updated


def api_add_support_need(body: dict[str, Any]) -> dict[str, Any]:
    need_id = f"sn_{uuid.uuid4().hex[:8]}"
    now_iso = datetime.utcnow().isoformat() + "Z"
    text = str(body.get("text", "Prefer plain words and no phone calls."))
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO support_needs (id, user_id, text, created_at) VALUES (?, 'usr_amara', ?, ?)",
            (need_id, text, now_iso),
        )
        conn.commit()
    return {"id": need_id, "user_id": "usr_amara", "text": text, "created_at": now_iso}


# =========================================================================
# FORECAST, PACT, STORM TRIGGERS, REWIND & ALLY (T4, T6, T9, T10, T11, T14)
# =========================================================================
def get_db_pact_rules() -> list[dict[str, Any]]:
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM pact_rules WHERE user_id = 'usr_amara'").fetchall()
    return [
        {
            "id": r["id"],
            "user_id": r["user_id"],
            "trigger": json.loads(r["trigger"]),
            "action": json.loads(r["action"]),
            "action_kind": r["action_kind"],
            "when_label": r["when_label"],
            "then_label": r["then_label"],
            "plain_summary": f"{r['when_label']}: {r['then_label']}",
            "confirmed": bool(r["confirmed"]),
            "active_from": r["active_from"],
            "change_requested_at": r["change_requested_at"],
        }
        for r in rows
    ]


def build_full_response(
    as_of: str | None = None,
    reading_age: int | None = None,
    language: str | None = None,
    selected_day: str = "2026-03-23",
    clear_threshold: float | None = None,
    storm_threshold: float | None = None,
) -> dict[str, Any]:
    settings = api_get_settings()
    curr_as_of = as_of or get_state("as_of", "2026-03-10")
    curr_age = int(reading_age if reading_age is not None else settings["reading_level"])
    curr_lang = language or settings["translation"]
    curr_clear = float(clear_threshold) if clear_threshold is not None else 0.10
    curr_storm = float(storm_threshold) if storm_threshold is not None else float(settings["storm_threshold"])

    pact_rules = get_db_pact_rules()
    storm_action_executed = bool(get_state("storm_action_executed", False))
    manual_not_okay = bool(get_state("manual_not_okay", False))

    with get_conn() as conn:
        note_row = conn.execute(
            "SELECT transcript FROM pact_notes WHERE user_id = 'usr_amara' ORDER BY recorded_at DESC LIMIT 1"
        ).fetchone()
        ally_row = conn.execute("SELECT * FROM allies WHERE user_id = 'usr_amara' LIMIT 1").fetchone()

    self_note = (
        note_row["transcript"]
        if note_row
        else "Breathe. This tight week will pass. Move £15 to the buffer on Friday payday, skip takeaways, and text Jade if you feel overwhelmed."
    )
    ally_active = (ally_row["status"] == "active") if ally_row else True

    fc = simulate_forecast(
        dataset=AMARA_DATASET,
        as_of_str=curr_as_of,
        horizon_days=60,
        n_paths=1000,
        pact_rules=pact_rules,
        storm_action_executed=storm_action_executed,
        clear_threshold=curr_clear,
        storm_threshold=curr_storm,
    )

    if manual_not_okay and not storm_action_executed:
        fc["storm_mode_triggered"] = True
        fc["storm_mode_active"] = True

    fired_rules = [r for r in pact_rules if r["confirmed"]] if fc["storm_mode_triggered"] else []
    fc["fired_rules"] = fired_rules

    explainer = explain_forecast(
        forecast=fc,
        reading_age=curr_age,
        language=curr_lang,
        selected_day=selected_day,
    )
    ui_blocks = compose_ui_blocks(fc)

    persona = dict(AMARA_DATASET["persona"])
    persona["trusted_ally"] = dict(persona["trusted_ally"])
    persona["trusted_ally"]["active"] = ally_active

    return {
        "persona": persona,
        "settings": settings,
        "forecast": fc,
        "explainer": explainer,
        "ui_blocks": ui_blocks,
        "pact": {
            "rules": pact_rules,
            "self_note": self_note,
            "has_confirmed_pact": any(r.get("confirmed") for r in pact_rules),
        },
        "ally_notification": (
            {
                "sent": True,
                "recipient": "Jade",
                "timestamp": f"{curr_as_of} 09:02",
                "message": "Amara asked us to tell you money may be tight around 23 March. You can't see her spending.",
            }
            if (fc["storm_mode_triggered"] or storm_action_executed) and ally_active
            else None
        ),
    }


def api_get_forecast(
    as_of: str | None = None,
    reading_age: int | None = None,
    language: str | None = None,
    selected_day: str = "2026-03-23",
    clear_threshold: float | None = None,
    storm_threshold: float | None = None,
) -> dict[str, Any]:
    if as_of:
        set_state("as_of", as_of)
    if reading_age is not None:
        api_put_settings({"reading_level": int(reading_age)})
    if language:
        api_put_settings({"translation": language})
    if storm_threshold is not None:
        api_put_settings({"storm_threshold": float(storm_threshold)})

    return build_full_response(
        as_of=as_of,
        reading_age=reading_age,
        language=language,
        selected_day=selected_day,
        clear_threshold=clear_threshold,
        storm_threshold=storm_threshold,
    )


def api_get_rewind() -> dict[str, Any]:
    return run_rewind(AMARA_DATASET)


def api_parse_pact(body: dict[str, Any]) -> dict[str, Any]:
    text = body.get("text", "")
    self_note = body.get(
        "self_note",
        "Breathe. This tight week will pass. Move £15 to the buffer on Friday payday, skip takeaways, and text Jade if you feel overwhelmed.",
    )
    threshold = float(body.get("threshold", 0.30))
    horizon_days = int(body.get("horizon_days", 14))
    return parse_pact_text(text=text, self_note=self_note, threshold=threshold, horizon_days=horizon_days)


def api_confirm_pact(body: dict[str, Any]) -> dict[str, Any]:
    rules = body.get("rules", [])
    self_note = body.get("self_note")
    now_iso = datetime.utcnow().isoformat() + "Z"
    with get_conn() as conn:
        if rules:
            conn.execute("DELETE FROM pact_rules WHERE user_id = 'usr_amara'")
            for r in rules:
                conn.execute(
                    """
                    INSERT INTO pact_rules (
                        id, user_id, trigger, action, action_kind,
                        when_label, then_label, confirmed, active_from, change_requested_at
                    ) VALUES (?, 'usr_amara', ?, ?, ?, ?, ?, 1, ?, NULL)
                    """,
                    (
                        r.get("id", f"rule_{uuid.uuid4().hex[:6]}"),
                        json.dumps(r.get("trigger", {})),
                        json.dumps(r.get("action", {})),
                        r.get("action_kind", r.get("action", {}).get("kind", "move_to_buffer")),
                        r.get("when_label", "When a storm is within 14 days"),
                        r.get("then_label", r.get("plain_summary", "Activate safeguard")),
                        now_iso,
                    ),
                )
        if self_note:
            conn.execute(
                "INSERT OR REPLACE INTO pact_notes (id, user_id, audio_blob_ref, transcript, recorded_at) VALUES ('note_01', 'usr_amara', NULL, ?, ?)",
                (self_note, now_iso),
            )
        conn.commit()
    return build_full_response()


def api_schedule_pact_change(rule_id: str) -> dict[str, Any]:
    """48-hour lock on editing or deleting a confirmed Pact rule."""
    now = datetime.utcnow()
    effective = now + timedelta(hours=48)
    with get_conn() as conn:
        conn.execute(
            "UPDATE pact_rules SET change_requested_at = ? WHERE id = ?",
            (now.isoformat() + "Z", rule_id),
        )
        conn.commit()
    evt = log_event(
        "rule_change_scheduled",
        {
            "rule_id": rule_id,
            "requested_at": now.isoformat() + "Z",
            "takes_effect_at": effective.isoformat() + "Z",
            "message_plain": "Your change is booked. To protect you on hard days, changes to safety rules take 48 hours.",
        },
    )
    return evt


def api_simulate(as_of_query: str | None = None, body: dict[str, Any] | None = None) -> dict[str, Any]:
    payload = body or {}
    target_as_of = as_of_query or payload.get("as_of") or "2026-03-13"
    set_state("as_of", target_as_of)

    if "execute_storm_action" in payload:
        set_state("storm_action_executed", bool(payload["execute_storm_action"]))
    if "manual_not_okay" in payload:
        set_state("manual_not_okay", bool(payload["manual_not_okay"]))

    resp = build_full_response(as_of=target_as_of)
    if resp["forecast"]["storm_mode_triggered"]:
        log_event("storm_started", {"as_of": target_as_of, "storm_date": "2026-03-23", "p_shortfall": 0.33})
        for r in resp["forecast"]["fired_rules"]:
            log_event("rule_fired", {"rule_id": r["id"], "action_kind": r["action_kind"]})
        if resp["ally_notification"]:
            log_event("ally_notified", resp["ally_notification"])
    return resp


def api_move_to_buffer() -> dict[str, Any]:
    set_state("storm_action_executed", True)
    log_event(
        "buffer_moved",
        {
            "amount_gbp": 15.0,
            "payday_date": "2026-03-13",
            "p_shortfall_before": 0.33,
            "p_shortfall_after": 0.125,
        },
    )
    return build_full_response()


def api_drivers(day: str, reading_age: int = 9, language: str = "en") -> dict[str, Any]:
    state_resp = build_full_response(reading_age=reading_age, language=language, selected_day=day)
    drivers = state_resp["forecast"]["drivers_by_day"].get(day, []) or state_resp["forecast"]["drivers"]
    return {"day": day, "drivers": drivers, "explainer": state_resp["explainer"]}


def api_toggle_ally() -> dict[str, Any]:
    with get_conn() as conn:
        row = conn.execute("SELECT status FROM allies WHERE user_id = 'usr_amara'").fetchone()
        new_status = "revoked" if (row and row["status"] == "active") else "active"
        conn.execute("UPDATE allies SET status = ? WHERE user_id = 'usr_amara'", (new_status,))
        conn.commit()
    return build_full_response()


def api_account_export() -> dict[str, Any]:
    return {
        "exported_at": datetime.utcnow().isoformat() + "Z",
        "user": api_get_me(),
        "settings": api_get_settings(),
        "pact_rules": get_db_pact_rules(),
        "rewind": api_get_rewind(),
    }


def api_account_delete() -> dict[str, Any]:
    now = datetime.utcnow()
    effective = now + timedelta(hours=48)
    with get_conn() as conn:
        conn.execute("UPDATE users SET deletion_requested_at = ? WHERE id = 'usr_amara'", (now.isoformat() + "Z",))
        conn.commit()
    return {
        "scheduled": True,
        "deletion_requested_at": now.isoformat() + "Z",
        "takes_effect_at": effective.isoformat() + "Z",
        "message_plain": "Your account is set to close in 48 hours. You can cancel anytime with one tap.",
    }


def reset_demo() -> dict[str, Any]:
    set_state("as_of", "2026-03-10")
    set_state("storm_action_executed", False)
    set_state("manual_not_okay", False)
    seed_default_user_and_rules(AMARA_DATASET["transactions"])
    return build_full_response(as_of="2026-03-10")


# =========================================================================
# LINEAR REGRESSION & TRIAL CSV ENDPOINTS
# =========================================================================
def api_linear_default() -> dict[str, Any]:
    csv_path = Path(__file__).parent.parent / "trial_bank_statement.csv"
    csv_text = csv_path.read_text(encoding="utf-8") if csv_path.exists() else generate_trial_csv()
    parsed = parse_csv_and_fit_regression(csv_text)
    inp = parsed["extracted_inputs"]
    lr = parsed["linear_regression"]
    prediction = predict_debt_trajectory(
        current_balance=inp["current_balance"],
        current_date_str=inp["current_date"],
        monthly_income=inp["monthly_income"],
        pay_day=inp["pay_day"],
        total_bills=inp["total_bills"],
        bill_day=inp["bill_day"],
        predicted_weekly_spend=lr["predicted_weekly_spend_gbp"],
    )
    return {
        "extracted_inputs": inp,
        "linear_regression": lr,
        "prediction": prediction,
        "row_count": parsed["row_count"],
    }


def api_upload_csv(body: dict[str, Any]) -> dict[str, Any]:
    csv_text = body.get("csv_text", "")
    if not csv_text.strip():
        return api_linear_default()
    parsed = parse_csv_and_fit_regression(csv_text)
    inp = parsed["extracted_inputs"]
    lr = parsed["linear_regression"]
    prediction = predict_debt_trajectory(
        current_balance=inp["current_balance"],
        current_date_str=inp["current_date"],
        monthly_income=inp["monthly_income"],
        pay_day=inp["pay_day"],
        total_bills=inp["total_bills"],
        bill_day=inp["bill_day"],
        predicted_weekly_spend=lr["predicted_weekly_spend_gbp"],
    )
    return {
        "extracted_inputs": inp,
        "linear_regression": lr,
        "prediction": prediction,
        "row_count": parsed["row_count"],
    }


def api_predict_debt(body: dict[str, Any]) -> dict[str, Any]:
    return predict_debt_trajectory(
        current_balance=float(body.get("current_balance", 740.0)),
        current_date_str=str(body.get("current_date", "2026-03-10")),
        monthly_income=float(body.get("monthly_income", 1350.0)),
        pay_day=int(body.get("pay_day", 28)),
        total_bills=float(body.get("total_bills", 680.0)),
        bill_day=int(body.get("bill_day", 20)),
        predicted_weekly_spend=float(body.get("predicted_weekly_spend", 98.22)),
    )


def export_static_mocks() -> None:
    """Export /web/mocks/forecast.json, rewind.json, settings.json and /engine/demo_cache.json (T2, T16)."""
    mocks_dir = Path(__file__).parent.parent / "web" / "mocks"
    mocks_dir.mkdir(parents=True, exist_ok=True)
    base = reset_demo()
    rw = api_get_rewind()
    st = api_get_settings()

    (mocks_dir / "forecast.json").write_text(json.dumps(base["forecast"], indent=2), encoding="utf-8")
    (mocks_dir / "rewind.json").write_text(json.dumps(rw, indent=2), encoding="utf-8")
    (mocks_dir / "settings.json").write_text(json.dumps(st, indent=2), encoding="utf-8")

    cache_path = Path(__file__).parent / "demo_cache.json"
    cache_path.write_text(
        json.dumps(
            {
                "explain_9_en": explain_forecast(base["forecast"], 9, "en"),
                "explain_12_en": explain_forecast(base["forecast"], 12, "en"),
                "explain_16_en": explain_forecast(base["forecast"], 16, "en"),
                "parse_default": api_parse_pact(
                    {
                        "text": "When things get tight, cap takeaways at £20 a week, stop me borrowing for 2 days, move £15 to my buffer on payday, tell Jade, and remind me of my note."
                    }
                ),
            },
            indent=2,
        ),
        encoding="utf-8",
    )


# =========================================================================
# HTTP SERVER HANDLER (ZERO-DEPENDENCY + CORS + COOKIES)
# =========================================================================
class ForesightHTTPHandler(BaseHTTPRequestHandler):
    def _send_json(self, data: Any, status: int = 200, cookie: str | None = None) -> None:
        raw = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        if cookie:
            self.send_header("Set-Cookie", cookie)
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_OPTIONS(self) -> None:
        self._send_json({"ok": True}, 200)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        qs = parse_qs(parsed.query)

        if parsed.path in ("/", "/index.html"):
            html_path = Path(__file__).parent.parent / "web" / "public" / "index.html"
            if html_path.exists():
                raw = html_path.read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(raw)))
                self.end_headers()
                self.wfile.write(raw)
                return
        elif parsed.path == "/health":
            self._send_json({"status": "ok", "as_of": get_state("as_of", "2026-03-10")})
        elif parsed.path == "/me":
            self._send_json(api_get_me())
        elif parsed.path == "/settings":
            self._send_json(api_get_settings())
        elif parsed.path == "/forecast":
            as_of = qs.get("as_of", [None])[0]
            reading_age = int(qs["reading_age"][0]) if "reading_age" in qs else None
            language = qs.get("language", [None])[0]
            selected_day = qs.get("selected_day", ["2026-03-23"])[0]
            self._send_json(api_get_forecast(as_of, reading_age, language, selected_day))
        elif parsed.path == "/rewind":
            self._send_json(api_get_rewind())
        elif parsed.path.startswith("/drivers/"):
            day = parsed.path.split("/drivers/")[1]
            self._send_json(api_drivers(day))
        elif parsed.path == "/ally":
            self._send_json(AMARA_DATASET["persona"]["trusted_ally"])
        elif parsed.path == "/support-check":
            self._send_json(check_unclaimed_support())
        elif parsed.path == "/calibration":
            self._send_json(get_calibration_and_fairness_report())
        elif parsed.path == "/account/export":
            self._send_json(api_account_export())
        elif parsed.path == "/trial_bank_statement.csv":
            csv_path = Path(__file__).parent.parent / "trial_bank_statement.csv"
            if not csv_path.exists():
                generate_trial_csv()
            raw = csv_path.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "text/csv; charset=utf-8")
            self.send_header("Content-Disposition", "attachment; filename=trial_bank_statement.csv")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)
        elif parsed.path == "/linear-default":
            self._send_json(api_linear_default())
        else:
            self._send_json({"status": "Pact / Foresight Engine Online", "path": parsed.path})

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        qs = parse_qs(parsed.query)
        length = int(self.headers.get("Content-Length", "0"))
        body = json.loads(self.rfile.read(length).decode("utf-8")) if length > 0 else {}

        if parsed.path == "/auth/demo":
            res = api_auth_demo()
            cookie = f"pact_session={res['session']['session_id']}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000"
            self._send_json(res, 200, cookie=cookie)
        elif parsed.path == "/auth/logout":
            self._send_json({"logged_out": True}, 200)
        elif parsed.path == "/support-needs":
            self._send_json(api_add_support_need(body))
        elif parsed.path in ("/pact/parse", "/pact"):
            if "rules" in body:
                self._send_json(api_confirm_pact(body))
            else:
                self._send_json(api_parse_pact(body))
        elif parsed.path == "/pact/confirm":
            self._send_json(api_confirm_pact(body))
        elif parsed.path == "/simulate":
            as_of = qs.get("as_of", [None])[0]
            self._send_json(api_simulate(as_of, body))
        elif parsed.path == "/actions/move-to-buffer":
            self._send_json(api_move_to_buffer())
        elif parsed.path == "/explain":
            fc = build_full_response()["forecast"]
            self._send_json(
                explain_forecast(
                    fc,
                    reading_age=int(body.get("reading_level", 9)),
                    language=str(body.get("translation", "en")),
                )
            )
        elif parsed.path == "/ally/toggle":
            self._send_json(api_toggle_ally())
        elif parsed.path == "/account/delete":
            self._send_json(api_account_delete())
        elif parsed.path == "/reset":
            self._send_json(reset_demo())
        elif parsed.path == "/upload-csv":
            self._send_json(api_upload_csv(body))
        elif parsed.path == "/predict-debt":
            self._send_json(api_predict_debt(body))
        else:
            self._send_json({"code": "NOT_FOUND", "message_plain": "We could not find that page."}, 404)

    def do_PUT(self) -> None:
        parsed = urlparse(self.path)
        length = int(self.headers.get("Content-Length", "0"))
        body = json.loads(self.rfile.read(length).decode("utf-8")) if length > 0 else {}
        if parsed.path == "/settings":
            self._send_json(api_put_settings(body))
        else:
            self._send_json({"code": "NOT_FOUND", "message_plain": "We could not find that setting."}, 404)

    def do_PATCH(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path.startswith("/pact/"):
            rule_id = parsed.path.split("/pact/")[1]
            self._send_json(api_schedule_pact_change(rule_id))
        else:
            self._send_json({"code": "NOT_FOUND", "message_plain": "Rule not found."}, 404)

    def do_DELETE(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path.startswith("/pact/"):
            rule_id = parsed.path.split("/pact/")[1]
            self._send_json(api_schedule_pact_change(rule_id))
        elif parsed.path == "/ally":
            self._send_json(api_toggle_ally())
        else:
            self._send_json({"code": "NOT_FOUND", "message_plain": "Item not found."}, 404)


def run_server(port: int = 8000) -> None:
    export_static_mocks()
    server = HTTPServer(("0.0.0.0", port), ForesightHTTPHandler)
    print(f"Pact / Foresight Backend running on http://localhost:{port}")
    server.serve_forever()


if __name__ == "__main__":
    run_server(8000)
