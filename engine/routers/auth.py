"""Sign-in: the demo button, a 6-digit email code, and passkeys (Face ID / Touch ID / Windows Hello)."""
import base64
import hashlib
import hmac
import json
import os
import re
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Cookie, Depends, Response
from webauthn import (
    generate_authentication_options,
    generate_registration_options,
    options_to_json,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers import base64url_to_bytes, bytes_to_base64url
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

from .. import mailer
from ..contracts import CodeRequest, CodeVerify, CredentialInput
from ..database import connect
from ..dependencies import current_user, fail

router = APIRouter(prefix="/auth", tags=["auth"])

CODE_TTL = timedelta(minutes=10)
RESEND_AFTER = timedelta(seconds=30)
MAX_ATTEMPTS = 5
CHALLENGE_TTL = timedelta(minutes=5)
EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
# HMAC key for stored codes. Set PACT_SECRET in .env so codes survive an engine restart.
SECRET = os.getenv("PACT_SECRET") or secrets.token_hex(32)
RP_ID = os.getenv("PACT_RP_ID", "localhost")
RP_NAME = "Pact"
ORIGINS = [o.strip() for o in os.getenv("FRONTEND_ORIGIN", "http://localhost:3000").split(",") if o.strip()]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def start_session(response: Response, user_id: str, label: str) -> None:
    session = secrets.token_urlsafe(32)
    now = _now()
    with connect() as db:
        db.execute("INSERT INTO sessions VALUES(?,?,?,?,?,?)", (session, user_id, label, now.isoformat(), now.isoformat(), (now + timedelta(days=30)).isoformat()))
    response.set_cookie("pact_session", session, httponly=True, secure=True, samesite="lax", max_age=30 * 86400, path="/")


def _has_profile(user_id: str) -> bool:
    with connect() as db:
        return db.execute("SELECT 1 FROM profiles WHERE user_id=?", (user_id,)).fetchone() is not None


@router.post("/demo", status_code=204)
def demo_login(response: Response):
    start_session(response, "amara", "Demo device")
    # Each demo login starts the scripted demo fresh, so it can be run twice in a row (Gate 2):
    # no rules yet, no note, back to Tuesday 10 March, nothing moved.
    with connect() as db:
        db.execute("DELETE FROM events WHERE user_id='amara' AND kind IN ('buffer_moved','demo_clock')")
        db.execute("DELETE FROM pact_rules WHERE user_id='amara'")
        db.execute("DELETE FROM pact_notes WHERE user_id='amara'")


@router.post("/logout", status_code=204)
def logout(response: Response, pact_session: str | None = Cookie(default=None)):
    if pact_session:
        with connect() as db:
            db.execute("DELETE FROM sessions WHERE id=?", (pact_session,))
    response.delete_cookie("pact_session", path="/")


# ---------- 6-digit code by email ----------

def _code_hash(email: str, code: str) -> str:
    return hmac.new(SECRET.encode(), f"{email}:{code}".encode(), hashlib.sha256).hexdigest()


@router.post("/code/request", status_code=202)
def request_code(body: CodeRequest):
    email = body.email.strip().lower()
    if not EMAIL.match(email):
        fail(422, "invalid_email", "That email address doesn't look right. Check it and try again.")
    if not mailer.email_configured() and not mailer.dev_codes_enabled():
        fail(503, "email_not_set_up", "We can't send codes right now. Use the demo button for now.")
    now = _now()
    with connect() as db:
        row = db.execute("SELECT last_sent_at FROM login_codes WHERE contact=?", (email,)).fetchone()
        if row and row["last_sent_at"] and now - datetime.fromisoformat(row["last_sent_at"]) < RESEND_AFTER:
            fail(429, "too_soon", "We just sent you a code. Wait 30 seconds before asking for a new one.")
        code = f"{secrets.randbelow(10**6):06d}"
        db.execute(
            "INSERT INTO login_codes(contact,code_hash,expires_at,attempts,last_sent_at) VALUES(?,?,?,0,?) "
            "ON CONFLICT(contact) DO UPDATE SET code_hash=excluded.code_hash, expires_at=excluded.expires_at, attempts=0, last_sent_at=excluded.last_sent_at",
            (email, _code_hash(email, code), (now + CODE_TTL).isoformat(), now.isoformat()),
        )
    result = {"sent": True, "expires_in_s": int(CODE_TTL.total_seconds())}
    if mailer.email_configured():
        try:
            mailer.send_login_code(email, code)
        except Exception:  # noqa: BLE001 - any SMTP failure gets one plain message
            fail(502, "email_failed", "We couldn't send the email. Check the address and try again.")
    else:  # PACT_DEV_CODES=true: local testing without email
        print(f"[pact] Test-mode login code for {email}: {code}", flush=True)
        result["dev_code"] = code
    return result


@router.post("/code/verify")
def verify_code(body: CodeVerify, response: Response):
    email = body.email.strip().lower()
    now = _now()
    with connect() as db:
        row = db.execute("SELECT code_hash,expires_at,attempts FROM login_codes WHERE contact=?", (email,)).fetchone()
        if row and row["attempts"] < MAX_ATTEMPTS and not hmac.compare_digest(row["code_hash"], _code_hash(email, body.code)):
            # Count the wrong try and commit it before answering: an error inside this block would roll it back.
            db.execute("UPDATE login_codes SET attempts=attempts+1 WHERE contact=?", (email,))
            wrong = True
        else:
            wrong = False
    if not row or now > datetime.fromisoformat(row["expires_at"]):
        fail(400, "code_expired", "That code has run out. Ask for a new one.")
    if row["attempts"] >= MAX_ATTEMPTS:
        fail(400, "too_many_attempts", "Too many tries. Ask for a new code.")
    if wrong:
        fail(400, "wrong_code", "That code is not right. Check it and try again.")
    with connect() as db:
        db.execute("DELETE FROM login_codes WHERE contact=?", (email,))
        user = db.execute("SELECT id FROM users WHERE contact=?", (email,)).fetchone()
        if user:
            user_id = user["id"]
        else:
            user_id = "u_" + secrets.token_hex(8)
            name = re.split(r"[._+-]", email.split("@")[0])[0].capitalize() or "There"
            db.execute("INSERT INTO users(id,display_name,contact,created_at) VALUES(?,?,?,?)", (user_id, name, email, now.isoformat()))
    start_session(response, user_id, "Logged in with a code")
    return {"new_user": not _has_profile(user_id)}


# ---------- Passkeys (WebAuthn): Face ID, Touch ID, Windows Hello ----------

def _client_challenge(credential: dict) -> str:
    """The challenge the browser signed, read from clientDataJSON (base64url)."""
    try:
        raw = credential["response"]["clientDataJSON"]
        data = json.loads(base64.urlsafe_b64decode(raw + "=" * (-len(raw) % 4)))
        return data["challenge"]
    except (KeyError, ValueError, TypeError):
        fail(400, "passkey_failed", "Face ID didn't work. Try again, or get a code instead.")


def _take_challenge(challenge: str, kind: str, user_id: str | None = None) -> None:
    with connect() as db:
        row = db.execute("SELECT user_id,expires_at FROM webauthn_challenges WHERE challenge=? AND kind=?", (challenge, kind)).fetchone()
        db.execute("DELETE FROM webauthn_challenges WHERE challenge=? OR expires_at<?", (challenge, _now().isoformat()))
    if not row or _now() > datetime.fromisoformat(row["expires_at"]) or (user_id and row["user_id"] != user_id):
        fail(400, "passkey_failed", "Face ID took too long. Try again.")


def _store_challenge(challenge: bytes, kind: str, user_id: str | None) -> None:
    with connect() as db:
        db.execute("INSERT INTO webauthn_challenges VALUES(?,?,?,?)", (bytes_to_base64url(challenge), kind, user_id, (_now() + CHALLENGE_TTL).isoformat()))


@router.post("/passkey/register/options")
def passkey_register_options(user_id: str = Depends(current_user)):
    with connect() as db:
        user = db.execute("SELECT display_name,contact FROM users WHERE id=?", (user_id,)).fetchone()
        existing = [row["credential_id"] for row in db.execute("SELECT credential_id FROM passkeys WHERE user_id=?", (user_id,))]
    options = generate_registration_options(
        rp_id=RP_ID,
        rp_name=RP_NAME,
        user_id=user_id.encode(),
        user_name=(user["contact"] or user_id) if user else user_id,
        user_display_name=user["display_name"] if user else "Pact user",
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.REQUIRED,
            user_verification=UserVerificationRequirement.REQUIRED,
        ),
        exclude_credentials=[PublicKeyCredentialDescriptor(id=base64url_to_bytes(c)) for c in existing],
    )
    _store_challenge(options.challenge, "register", user_id)
    return json.loads(options_to_json(options))


@router.post("/passkey/register/verify", status_code=201)
def passkey_register_verify(body: CredentialInput, user_id: str = Depends(current_user)):
    challenge = _client_challenge(body.credential)
    _take_challenge(challenge, "register", user_id)
    try:
        verified = verify_registration_response(
            credential=body.credential,
            expected_challenge=base64url_to_bytes(challenge),
            expected_rp_id=RP_ID,
            expected_origin=ORIGINS,
            require_user_verification=True,
        )
    except Exception:  # noqa: BLE001 - invalid attestation of any kind
        fail(400, "passkey_failed", "We couldn't turn on Face ID. Try again.")
    with connect() as db:
        db.execute(
            "INSERT INTO passkeys(id,user_id,credential_id,public_key,sign_count,label) VALUES(?,?,?,?,?,?)",
            (secrets.token_hex(8), user_id, bytes_to_base64url(verified.credential_id), bytes_to_base64url(verified.credential_public_key), verified.sign_count, "This device"),
        )
    return {"registered": True}


@router.post("/passkey/login/options")
def passkey_login_options():
    options = generate_authentication_options(rp_id=RP_ID, user_verification=UserVerificationRequirement.REQUIRED)
    _store_challenge(options.challenge, "login", None)
    return json.loads(options_to_json(options))


@router.post("/passkey/login/verify")
def passkey_login_verify(body: CredentialInput, response: Response):
    challenge = _client_challenge(body.credential)
    _take_challenge(challenge, "login")
    credential_id = body.credential.get("id") or body.credential.get("rawId")
    with connect() as db:
        key = db.execute("SELECT id,user_id,public_key,sign_count FROM passkeys WHERE credential_id=?", (credential_id,)).fetchone()
    if not key:
        fail(404, "passkey_unknown", "No Face ID set up on this device yet. Get a code first, then turn on Face ID in Account.")
    try:
        verified = verify_authentication_response(
            credential=body.credential,
            expected_challenge=base64url_to_bytes(challenge),
            expected_rp_id=RP_ID,
            expected_origin=ORIGINS,
            credential_public_key=base64url_to_bytes(key["public_key"]),
            credential_current_sign_count=key["sign_count"],
            require_user_verification=True,
        )
    except Exception:  # noqa: BLE001
        fail(400, "passkey_failed", "Face ID didn't work. Try again, or get a code instead.")
    with connect() as db:
        db.execute("UPDATE passkeys SET sign_count=? WHERE id=?", (verified.new_sign_count, key["id"]))
    start_session(response, key["user_id"], "Logged in with Face ID")
    return {"new_user": False}
