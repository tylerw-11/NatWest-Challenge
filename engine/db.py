"""
SQLite database layer implementing the 11 tables from the Pact Backend Requirements:
1. users
2. sessions
3. passkeys
4. bank_connections
5. transactions (normalised merchant labels only; no names or account numbers)
6. settings
7. support_needs (declared by user; never inferred)
8. pact_rules (with change_requested_at for the 48-hour lock)
9. pact_notes
10. allies (Jade — view-only weather alert; no login, no balances, no transactions)
11. events (audit trail for storm_started, rule_fired, ally_notified, buffer_moved)
"""

from __future__ import annotations
import json
import sqlite3
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).parent / "data"
DB_PATH = DATA_DIR / "pact.db"


def get_conn() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_eleven_tables() -> None:
    with get_conn() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                display_name TEXT NOT NULL,
                contact TEXT NOT NULL,
                created_at TEXT NOT NULL,
                deletion_requested_at TEXT
            );

            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                device_label TEXT NOT NULL,
                created_at TEXT NOT NULL,
                last_seen_at TEXT NOT NULL,
                expires_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS passkeys (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                credential_id TEXT NOT NULL,
                public_key TEXT NOT NULL,
                sign_count INTEGER NOT NULL DEFAULT 0,
                label TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS bank_connections (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                provider TEXT NOT NULL DEFAULT 'Demo bank',
                consent_expires_at TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'connected'
            );

            CREATE TABLE IF NOT EXISTS transactions (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                date TEXT NOT NULL,
                amount_gbp REAL NOT NULL,
                merchant_label TEXT NOT NULL,
                category TEXT NOT NULL,
                is_recurring INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS settings (
                user_id TEXT PRIMARY KEY,
                reading_level INTEGER NOT NULL DEFAULT 9,
                read_aloud INTEGER NOT NULL DEFAULT 0,
                translation TEXT NOT NULL DEFAULT 'en',
                storm_lead_days INTEGER NOT NULL DEFAULT 14,
                storm_threshold REAL NOT NULL DEFAULT 0.30,
                colour_mode TEXT NOT NULL DEFAULT 'standard',
                calm_mode INTEGER NOT NULL DEFAULT 0,
                mood TEXT NOT NULL DEFAULT 'calm',
                mood_updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS support_needs (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                text TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS pact_rules (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                trigger TEXT NOT NULL,
                action TEXT NOT NULL,
                action_kind TEXT NOT NULL,
                when_label TEXT NOT NULL,
                then_label TEXT NOT NULL,
                confirmed INTEGER NOT NULL DEFAULT 1,
                active_from TEXT,
                change_requested_at TEXT
            );

            CREATE TABLE IF NOT EXISTS pact_notes (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                audio_blob_ref TEXT,
                transcript TEXT NOT NULL,
                recorded_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS allies (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                name TEXT NOT NULL,
                relation TEXT NOT NULL,
                contact TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'active',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS events (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                kind TEXT NOT NULL,
                payload TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            """
        )
        conn.commit()


def seed_default_user_and_rules(transactions: list[dict[str, Any]]) -> None:
    init_eleven_tables()
    now_iso = "2026-03-10T09:00:00Z"
    with get_conn() as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO users (id, display_name, contact, created_at, deletion_requested_at)
            VALUES (?, ?, ?, ?, NULL)
            """,
            ("usr_amara", "Amara", "amara.demo@example.org", now_iso),
        )

        conn.execute(
            """
            INSERT OR REPLACE INTO bank_connections (id, user_id, provider, consent_expires_at, status)
            VALUES (?, ?, 'Demo bank', '2026-06-10T09:00:00Z', 'connected')
            """,
            ("bank_demo_01", "usr_amara"),
        )

        # Ensure default settings exist
        row = conn.execute("SELECT user_id FROM settings WHERE user_id = 'usr_amara'").fetchone()
        if not row:
            conn.execute(
                """
                INSERT INTO settings (
                    user_id, reading_level, read_aloud, translation,
                    storm_lead_days, storm_threshold, colour_mode, calm_mode, mood, mood_updated_at
                ) VALUES ('usr_amara', 9, 0, 'en', 14, 0.30, 'standard', 0, 'calm', ?)
                """,
                (now_iso,),
            )

        # Seed Jade as the Trusted Ally
        conn.execute(
            """
            INSERT OR REPLACE INTO allies (id, user_id, name, relation, contact, status, created_at)
            VALUES ('ally_jade', 'usr_amara', 'Jade', 'Sister', '+44 7700 900412', 'active', ?)
            """,
            (now_iso,),
        )

        # Seed default calm-day Pact Note
        conn.execute(
            """
            INSERT OR REPLACE INTO pact_notes (id, user_id, audio_blob_ref, transcript, recorded_at)
            VALUES (
                'note_01',
                'usr_amara',
                'demo_audio_amara_calm_note.webm',
                'Breathe. This tight week will pass. Move £15 to the buffer on Friday payday, skip takeaways, and text Jade if you feel overwhelmed.',
                ?
            )
            """,
            (now_iso,),
        )

        # Seed the 4 confirmed Pact rules ("4 rules on")
        default_rules = [
            (
                "rule_01",
                "usr_amara",
                json.dumps({"kind": "storm_probability", "threshold": 0.30, "horizon_days": 14}),
                json.dumps({"kind": "move_to_buffer", "amount_gbp": 15, "payday": "2026-03-13"}),
                "move_to_buffer",
                "When a storm is within 14 days",
                "Move £15 to buffer on Friday payday",
                1,
                now_iso,
                None,
            ),
            (
                "rule_02",
                "usr_amara",
                json.dumps({"kind": "storm_probability", "threshold": 0.30, "horizon_days": 14}),
                json.dumps({"kind": "category_cap", "category": "takeaway", "amount_gbp": 20, "period": "week"}),
                "category_cap",
                "When a storm is within 14 days",
                "Cap takeaways at £20 a week",
                1,
                now_iso,
                None,
            ),
            (
                "rule_03",
                "usr_amara",
                json.dumps({"kind": "storm_probability", "threshold": 0.30, "horizon_days": 14}),
                json.dumps({"kind": "credit_pause_hours", "hours": 48}),
                "credit_pause_hours",
                "When a storm is within 14 days",
                "Pause new Buy Now, Pay Later credit for 48 hours",
                1,
                now_iso,
                None,
            ),
            (
                "rule_04",
                "usr_amara",
                json.dumps({"kind": "storm_probability", "threshold": 0.30, "horizon_days": 14}),
                json.dumps({"kind": "notify_ally", "ally_name": "Jade"}),
                "notify_ally",
                "When a storm starts",
                "Let my sister Jade know money may be tight",
                1,
                now_iso,
                None,
            ),
        ]
        conn.execute("DELETE FROM pact_rules WHERE user_id = 'usr_amara'")
        conn.executemany(
            """
            INSERT INTO pact_rules (
                id, user_id, trigger, action, action_kind,
                when_label, then_label, confirmed, active_from, change_requested_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            default_rules,
        )

        # Load transactions into the transactions table (no names or account numbers)
        conn.execute("DELETE FROM transactions WHERE user_id = 'usr_amara'")
        tx_tuples = [
            (
                t["id"],
                "usr_amara",
                t["booking_date"],
                float(t["amount"]),
                t["normalised_merchant"],
                t["category"],
                1 if t.get("category") in ("housing", "council_tax", "telecoms", "utilities", "insurance") else 0,
            )
            for t in transactions
        ]
        conn.executemany(
            """
            INSERT INTO transactions (id, user_id, date, amount_gbp, merchant_label, category, is_recurring)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            tx_tuples,
        )
        conn.commit()


def create_demo_session(device_label: str = "Amara's Android (Chrome)") -> dict[str, Any]:
    now = datetime.utcnow()
    exp = now + timedelta(days=30)
    sess_id = f"sess_{uuid.uuid4().hex[:16]}"
    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO sessions (id, user_id, device_label, created_at, last_seen_at, expires_at)
            VALUES (?, 'usr_amara', ?, ?, ?, ?)
            """,
            (sess_id, device_label, now.isoformat() + "Z", now.isoformat() + "Z", exp.isoformat() + "Z"),
        )
        conn.commit()
    return {
        "session_id": sess_id,
        "user_id": "usr_amara",
        "device_label": device_label,
        "expires_at": exp.isoformat() + "Z",
    }


def log_event(kind: str, payload: dict[str, Any], user_id: str = "usr_amara") -> dict[str, Any]:
    evt_id = f"evt_{uuid.uuid4().hex[:10]}"
    now_iso = datetime.utcnow().isoformat() + "Z"
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO events (id, user_id, kind, payload, created_at) VALUES (?, ?, ?, ?, ?)",
            (evt_id, user_id, kind, json.dumps(payload), now_iso),
        )
        conn.commit()
    return {"id": evt_id, "user_id": user_id, "kind": kind, "payload": payload, "created_at": now_iso}
