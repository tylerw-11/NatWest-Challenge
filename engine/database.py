import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from .contracts import Settings
from .generator import DEMO_RULES, generate_transactions

DB_PATH = Path(os.getenv("PACT_DB", Path(__file__).with_name("pact.sqlite3")))


def connect() -> sqlite3.Connection:
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    return db


def init_db() -> None:
    with connect() as db:
        db.executescript("""
        PRAGMA foreign_keys=ON;
        CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, display_name TEXT NOT NULL, contact TEXT, created_at TEXT NOT NULL, deletion_requested_at TEXT);
        CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), device_label TEXT, created_at TEXT, last_seen_at TEXT, expires_at TEXT);
        CREATE TABLE IF NOT EXISTS settings(user_id TEXT PRIMARY KEY REFERENCES users(id), value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS transactions(id INTEGER PRIMARY KEY, user_id TEXT NOT NULL, date TEXT NOT NULL, amount_gbp REAL NOT NULL, merchant_label TEXT NOT NULL, category TEXT, is_recurring INTEGER DEFAULT 0);
        CREATE TABLE IF NOT EXISTS pact_rules(id TEXT PRIMARY KEY, user_id TEXT NOT NULL, value TEXT NOT NULL, confirmed_at TEXT, change_requested_at TEXT);
        CREATE TABLE IF NOT EXISTS pact_notes(id TEXT PRIMARY KEY, user_id TEXT NOT NULL, transcript TEXT, audio_blob_ref TEXT, recorded_at TEXT);
        CREATE TABLE IF NOT EXISTS allies(id TEXT PRIMARY KEY, user_id TEXT UNIQUE NOT NULL, name TEXT NOT NULL, relation TEXT NOT NULL, contact TEXT, status TEXT NOT NULL DEFAULT 'active', created_at TEXT);
        CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS support_needs(id TEXT PRIMARY KEY, user_id TEXT NOT NULL, text TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS explainer_cache(cache_key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS login_codes(contact TEXT PRIMARY KEY, code_hash TEXT, expires_at TEXT, attempts INTEGER DEFAULT 0, last_sent_at TEXT);
        CREATE TABLE IF NOT EXISTS passkeys(id TEXT PRIMARY KEY, user_id TEXT NOT NULL, credential_id TEXT NOT NULL, public_key TEXT NOT NULL, sign_count INTEGER DEFAULT 0, label TEXT);
        CREATE TABLE IF NOT EXISTS bank_connections(id TEXT PRIMARY KEY, user_id TEXT NOT NULL, provider TEXT, consent_expires_at TEXT, status TEXT);
        """)
        now = datetime.now(timezone.utc).isoformat()
        db.execute("INSERT OR IGNORE INTO users(id,display_name,contact,created_at) VALUES('amara','Amara','amara@example.com',?)", (now,))
        # Demo seed (decision 0001 d): matches web/mocks/settings.json and pact.json.
        demo_settings = Settings(read_aloud=True, ally={"name": "Jade", "relation": "sister"})
        db.execute("INSERT OR IGNORE INTO settings(user_id,value) VALUES('amara',?)", (demo_settings.model_dump_json(),))
        db.execute("INSERT OR IGNORE INTO allies(id,user_id,name,relation,status,created_at) VALUES('ally-jade','amara','Jade','sister','active',?)", (now,))
        if db.execute("SELECT COUNT(*) FROM pact_rules WHERE user_id='amara'").fetchone()[0] == 0:
            db.executemany("INSERT INTO pact_rules VALUES(?,?,?,?,?)", [(rule["id"], "amara", json.dumps(rule), now, None) for rule in DEMO_RULES])
        db.execute("INSERT OR IGNORE INTO bank_connections(id,user_id,provider,consent_expires_at,status) VALUES('demo-bank','amara','Demo bank','2027-03-10','connected')")
        if db.execute("SELECT COUNT(*) FROM transactions WHERE user_id='amara'").fetchone()[0] == 0:
            db.executemany("INSERT INTO transactions(user_id,date,amount_gbp,merchant_label,category) VALUES('amara',?,?,?,?)", [(t['date'], t['amount_gbp'], t['merchant_label'], t['category']) for t in generate_transactions()])
