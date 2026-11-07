"""Read-aloud with ElevenLabs (eleven_v4, 90+ languages, audio tags): the voice's delivery follows the moment on screen.

How the key is used (and nothing else):
- Only server-side: ELEVENLABS_API_KEY lives in .env and is never sent to the browser or logged.
- Only Pact's own screen text and the person's own pact note are sent, after `scrub()` removes
  email addresses and long digit runs (account numbers, sort codes, phone numbers).
- Every clip is cached on disk by (text, language, delivery, voice, model), so replaying a screen costs nothing.
- Hard budgets (ELEVENLABS_DAILY_CHARS, ELEVENLABS_MONTHLY_CHARS) sit under the account's quota;
  over budget, or on any error, the app falls back to the browser's own voice.
"""
import hashlib
import os
import re
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

import httpx

from .database import connect

API = "https://api.elevenlabs.io/v1/text-to-speech"
CACHE_DIR = Path(os.getenv("PACT_SPEECH_CACHE", Path(__file__).with_name(".speech_cache")))
MAX_CHARS = 1500  # one screen read (with its translated lines); longer text is read by the browser voice


def api_key() -> str | None:
    return os.getenv("ELEVENLABS_API_KEY") or None


def model() -> str:
    # Eleven v4: ElevenLabs' most expressive model (audio tags, 90+ languages), clearer than v3.
    return os.getenv("ELEVENLABS_MODEL", "eleven_v4")


_languages: dict[str, set[str] | None] = {}


def supported_languages() -> set[str] | None:
    """The model's languages, from ElevenLabs' free /v1/models list (fetched once per engine run)."""
    m = model()
    if m not in _languages:
        try:
            r = httpx.get("https://api.elevenlabs.io/v1/models", headers={"xi-api-key": api_key() or ""}, timeout=10)
            found = next((x for x in r.json() if x.get("model_id") == m), None) if r.status_code == 200 else None
            if found:
                _languages[m] = {lang["language_id"] for lang in found.get("languages", [])}
        except (httpx.HTTPError, ValueError):
            pass  # unknown for now: let ElevenLabs decide, and ask again next time
    return _languages.get(m)


def voice() -> str:
    # Alice: clear, warm British voice (premade). Override with ELEVENLABS_VOICE_ID.
    return os.getenv("ELEVENLABS_VOICE_ID", "Xb7hH8MSUJpSbSDYk0k2")


def daily_budget() -> int:
    return int(os.getenv("ELEVENLABS_DAILY_CHARS", "3000"))


def monthly_budget() -> int:
    return int(os.getenv("ELEVENLABS_MONTHLY_CHARS", "9000"))  # free tier is 10,000 a month


@dataclass(frozen=True)
class Context:
    """What is on screen when the person asks to hear it (sent by the app)."""

    screen: str = "other"  # weather, river, storm, rewind, pact, support, settings, login, signup, account, other
    weather: str | None = None  # clear | cloudy | storm: the state the screen is about
    storm_mode: bool = False
    calm_mode: bool = False
    mood: str | None = None  # good | unsure | worried (declared by the person, never inferred)
    kind: str = "page"  # page | note | success


@dataclass(frozen=True)
class Delivery:
    tags: tuple[str, ...] = field(default_factory=tuple)
    speed: float = 1.0
    stability: float = 0.5  # eleven_v3: 0.0 creative, 0.5 natural, 1.0 robust
    reason: str = ""


def delivery(ctx: Context) -> Delivery:
    """Choose tone and pace case by case. The order matters: what the person chose comes first.

    Never alarming: even a storm is read steadily and kindly (copy rules: warm, non-judgemental).
    """
    if ctx.kind == "note":
        # Their own words to their future self: read back warmly, as encouragement.
        return Delivery(("warmly", "encouraging"), 0.95, 0.5, "their own pact note")
    if ctx.calm_mode:
        # They turned on calm mode: slow, soft and even, whatever the forecast says.
        return Delivery(("calm", "softly"), 0.88, 0.5, "calm mode is on")
    if ctx.mood == "worried":
        # They told us they're worried: gentle reassurance first.
        return Delivery(("gently", "reassuring"), 0.9, 0.5, "they said they feel worried")
    if ctx.kind == "success":
        # Something good just happened (e.g. money moved to the buffer).
        return Delivery(("relieved", "warmly"), 0.97, 0.5, "a step that helped")
    if ctx.storm_mode or ctx.screen == "storm" or ctx.weather == "storm":
        # A storm: steady and supportive. Serious enough to be heard, never frightening.
        return Delivery(("reassuring", "steady"), 0.93, 0.5, "storm ahead")
    if ctx.screen == "rewind":
        # Extra costs already paid: "Not your fault. It costs more to have less."
        return Delivery(("empathetic", "gently"), 0.95, 0.5, "looking back at extra costs")
    if ctx.weather == "cloudy":
        # Tight but not a storm: thoughtful and warm.
        return Delivery(("thoughtful", "warmly"), 0.96, 0.5, "money may be tight")
    if ctx.screen == "support" or ctx.mood == "unsure":
        return Delivery(("gently", "warmly"), 0.95, 0.5, "checking in")
    if ctx.weather == "clear" or ctx.screen == "weather":
        bright = ("cheerfully", "warmly") if ctx.mood == "good" else ("warmly",)
        return Delivery(bright, 1.0, 0.5, "a fine week")
    # Log in, settings, account, sign-up: clear and neutral.
    return Delivery((), 1.0, 0.5, "neutral")


_EMAIL = re.compile(r"[^\s@]+@[^\s@]+\.[^\s@]+")
_DIGITS = re.compile(r"\b\d(?:[\s-]?\d){5,}\b")  # 6+ digits, with spaces or dashes: accounts, sort codes, phones


def scrub(text: str) -> str:
    """Remove what must never leave Pact: email addresses and long digit runs."""
    text = _EMAIL.sub("your email", text)
    return re.sub(r"\s+", " ", _DIGITS.sub("a number", text)).strip()


def iso_language(lang: str | None) -> str | None:
    """The app's BCP-47 code (e.g. 'pt-BR', 'zh-Hans', 'fa-AF', 'ckb') to ElevenLabs' language id."""
    if not lang:
        return None
    base = lang.split("-")[0].lower()
    return base if 2 <= len(base) <= 3 and base.isalpha() else None


def cache_key(text: str, lang: str | None, d: Delivery) -> str:
    raw = "|".join([model(), voice(), lang or "auto", ",".join(d.tags), f"{d.speed}", f"{d.stability}", text])
    return hashlib.sha256(raw.encode()).hexdigest()


def _used(day: date) -> tuple[int, int]:
    with connect() as db:
        today = db.execute("SELECT chars FROM speech_usage WHERE day=?", (day.isoformat(),)).fetchone()
        month = db.execute("SELECT COALESCE(SUM(chars),0) FROM speech_usage WHERE day LIKE ?", (day.strftime("%Y-%m") + "%",)).fetchone()[0]
    return (today["chars"] if today else 0), month


def _record(day: date, chars: int) -> None:
    with connect() as db:
        db.execute("INSERT INTO speech_usage(day,chars) VALUES(?,?) ON CONFLICT(day) DO UPDATE SET chars=chars+excluded.chars", (day.isoformat(), chars))


class SpeechUnavailable(Exception):
    def __init__(self, code: str, message: str, status: int):
        super().__init__(message)
        self.code, self.message, self.status = code, message, status


def synthesize_remote(text: str, lang: str | None, d: Delivery) -> bytes:
    """The one call that spends credits. Tests replace this function."""
    body = {
        "text": text,
        "model_id": model(),
        "voice_settings": {"stability": d.stability, "similarity_boost": 0.75, "speed": d.speed},
    }
    if lang:
        body["language_code"] = lang
    try:
        r = httpx.post(f"{API}/{voice()}", params={"output_format": "mp3_44100_128"}, headers={"xi-api-key": api_key() or ""}, json=body, timeout=30)
        if r.status_code == 422 and lang:  # language not supported by this model: let it auto-detect
            body.pop("language_code")
            r = httpx.post(f"{API}/{voice()}", params={"output_format": "mp3_44100_128"}, headers={"xi-api-key": api_key() or ""}, json=body, timeout=30)
    except httpx.HTTPError:
        raise SpeechUnavailable("speech_failed", "The voice isn't available right now.", 502) from None
    if r.status_code != 200:
        raise SpeechUnavailable("speech_failed", "The voice isn't available right now.", 502)
    return r.content


def speak(text: str, lang: str | None, ctx: Context) -> tuple[bytes, bool, Delivery]:
    """Returns (mp3 bytes, from_cache, delivery). Raises SpeechUnavailable when the app should use the browser voice."""
    if not api_key():
        raise SpeechUnavailable("speech_off", "The voice isn't set up.", 503)
    clean = scrub(text)
    if not clean:
        raise SpeechUnavailable("nothing_to_read", "There's nothing to read.", 422)
    if len(clean) > MAX_CHARS:
        raise SpeechUnavailable("too_long", "That's too long for the voice.", 413)
    d = delivery(ctx)
    code = iso_language(lang)
    supported = supported_languages()
    if code and supported is not None and code not in supported:
        # Better the browser's voice in the right language than ElevenLabs in the wrong one.
        raise SpeechUnavailable("language_not_supported", "The voice doesn't speak this language yet.", 422)
    # Audio tags go in front of the text; eleven_v3 reads them as directions, not words.
    payload = (" ".join(f"[{t}]" for t in d.tags) + " " + clean).strip()
    path = CACHE_DIR / f"{cache_key(payload, code, d)}.mp3"
    if path.exists():
        return path.read_bytes(), True, d
    today = date.today()
    used_today, used_month = _used(today)
    if used_today + len(payload) > daily_budget() or used_month + len(payload) > monthly_budget():
        raise SpeechUnavailable("speech_budget", "The voice has used today's allowance.", 429)
    audio = synthesize_remote(payload, code, d)
    _record(today, len(payload))
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path.write_bytes(audio)
    return audio, False, d
