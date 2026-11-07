"""Sends the 6-digit login code by email over SMTP.

Set SMTP_HOST, SMTP_PORT (default 587), SMTP_USER, SMTP_PASSWORD and SMTP_FROM in .env.
Any SMTP provider works (a Gmail app password, Outlook, SendGrid, Mailgun, Resend's SMTP relay).
Without SMTP, codes are only usable when PACT_DEV_CODES=true (local testing): the code is
printed in the engine log and returned to the app, which shows it as "Test mode".
"""
import logging
import os
import smtplib
from email.message import EmailMessage

log = logging.getLogger("pact.mail")


def email_configured() -> bool:
    return bool(os.getenv("SMTP_HOST") and os.getenv("SMTP_FROM"))


def dev_codes_enabled() -> bool:
    return os.getenv("PACT_DEV_CODES", "false").lower() == "true"


def send_login_code(to: str, code: str) -> None:
    """Send the code. Raises on SMTP failure so the caller can answer with a plain error."""
    msg = EmailMessage()
    msg["Subject"] = f"Your Pact code is {code}"
    msg["From"] = os.environ["SMTP_FROM"]
    msg["To"] = to
    msg.set_content(
        f"Your Pact code is {code}.\n\n"
        "It works for 10 minutes. If you did not ask for it, you can ignore this email.\n"
    )
    host, port = os.environ["SMTP_HOST"], int(os.getenv("SMTP_PORT", "587"))
    user, password = os.getenv("SMTP_USER"), os.getenv("SMTP_PASSWORD")
    if port == 465:
        server: smtplib.SMTP = smtplib.SMTP_SSL(host, port, timeout=10)
    else:
        server = smtplib.SMTP(host, port, timeout=10)
        server.starttls()
    with server:
        if user and password:
            server.login(user, password)
        server.send_message(msg)
    log.info("Login code sent to %s", to)
