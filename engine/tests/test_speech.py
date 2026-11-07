"""The ElevenLabs voice: tone per moment, privacy, caching and budgets. Never calls ElevenLabs:
`speech.synthesize_remote` (the only call that spends credits) is replaced in every test."""
import pytest
from fastapi.testclient import TestClient

from engine import database, speech
from engine.main import app
from engine.speech import Context, delivery

ORIGIN = {"Origin": "http://localhost:3000"}


@pytest.fixture()
def calls(tmp_path, monkeypatch):
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "speech.sqlite3")
    monkeypatch.setattr(speech, "CACHE_DIR", tmp_path / "cache")
    monkeypatch.setenv("ELEVENLABS_API_KEY", "test-key-not-real")
    monkeypatch.setenv("ELEVENLABS_DAILY_CHARS", "300")
    sent: list[dict] = []

    def fake(text, lang, d):
        sent.append({"text": text, "lang": lang, "tags": d.tags})
        return b"ID3-fake-mp3"

    monkeypatch.setattr(speech, "synthesize_remote", fake)
    monkeypatch.setattr(speech, "supported_languages", lambda: {"en", "pl", "pt", "ar", "ckb", "yue", "zh"})
    return sent


@pytest.fixture()
def client(calls):
    with TestClient(app, base_url="https://testserver") as c:
        yield c


@pytest.mark.parametrize(
    ("ctx", "tags"),
    [
        (Context(kind="note", calm_mode=True), ("warmly", "encouraging")),  # their own words come first
        (Context(screen="storm", storm_mode=True, calm_mode=True), ("calm", "softly")),  # calm mode beats the storm
        (Context(screen="weather", weather="storm", mood="worried"), ("gently", "reassuring")),
        (Context(screen="storm", storm_mode=True), ("reassuring", "steady")),
        (Context(screen="weather", weather="storm"), ("reassuring", "steady")),
        (Context(screen="rewind"), ("empathetic", "gently")),
        (Context(screen="weather", weather="cloudy"), ("thoughtful", "warmly")),
        (Context(screen="support"), ("gently", "warmly")),
        (Context(screen="weather", weather="clear", mood="good"), ("cheerfully", "warmly")),
        (Context(screen="weather", weather="clear"), ("warmly",)),
        (Context(screen="login"), ()),
        (Context(kind="success"), ("relieved", "warmly")),
    ],
)
def test_tone_follows_the_moment(ctx, tags):
    d = delivery(ctx)
    assert d.tags == tags and len(d.tags) <= 2
    assert 0.85 <= d.speed <= 1.0 and d.stability in (0.0, 0.5, 1.0)


def test_never_alarming():
    """No context ever produces an anxious or urgent delivery (copy rules: warm, non-judgemental)."""
    for screen in ("weather", "river", "storm", "rewind", "pact", "support", "login", "other"):
        for weather in (None, "clear", "cloudy", "storm"):
            for mood in (None, "good", "unsure", "worried"):
                d = delivery(Context(screen=screen, weather=weather, mood=mood, storm_mode=screen == "storm"))
                assert not set(d.tags) & {"urgent", "anxious", "worried", "scared", "panicked", "shouting", "sad"}


def test_scrub_removes_emails_and_long_numbers():
    out = speech.scrub("Email sam@example.com, account 12345678, sort code 20-00-00, phone 07700 900123. Save £15 on 13 March.")
    assert "@" not in out and "12345678" not in out and "20-00-00" not in out and "900123" not in out
    assert "£15" in out and "13 March" in out  # short figures the person needs stay


def test_speech_returns_audio_with_tone_and_caches(client, calls):
    body = {"text": "A storm is 10 days away. You planned for this.", "screen": "storm", "storm_mode": True, "weather": "storm"}
    first = client.post("/speech", json=body, headers=ORIGIN)
    assert first.status_code == 200 and first.headers["content-type"] == "audio/mpeg"
    assert first.headers["x-pact-voice-tone"] == "reassuring,steady" and first.headers["x-pact-voice-cache"] == "miss"
    assert calls[0]["text"].startswith("[reassuring] [steady] A storm")
    again = client.post("/speech", json=body, headers=ORIGIN)
    assert again.headers["x-pact-voice-cache"] == "hit" and len(calls) == 1  # replaying costs nothing


def test_language_is_passed_as_elevenlabs_code(client, calls):
    client.post("/speech", json={"text": "Wszystko w porządku", "lang": "pl"}, headers=ORIGIN)
    client.post("/speech", json={"text": "Tudo bem", "lang": "pt-BR"}, headers=ORIGIN)
    client.post("/speech", json={"text": "باشه", "lang": "ckb"}, headers=ORIGIN)
    client.post("/speech", json={"text": "你好", "lang": "zh-Hans"}, headers=ORIGIN)
    client.post("/speech", json={"text": "Hello"}, headers=ORIGIN)
    assert [c["lang"] for c in calls] == ["pl", "pt", "ckb", "zh", None]


def test_unsupported_language_uses_the_browser_voice(client, calls):
    r = client.post("/speech", json={"text": "Selam", "lang": "ti"}, headers=ORIGIN)
    assert r.status_code == 422 and r.json()["code"] == "language_not_supported" and calls == []


def test_budget_and_limits_fall_back_politely(client, calls):
    assert client.post("/speech", json={"text": "x" * 1600}, headers=ORIGIN).json()["code"] == "too_long"
    for i in range(5):
        client.post("/speech", json={"text": f"Line {i} " + "y" * 60}, headers=ORIGIN)
    over = client.post("/speech", json={"text": "One more line " + "z" * 60}, headers=ORIGIN)
    assert over.status_code == 429 and over.json()["code"] == "speech_budget"
    assert len(calls) <= 4  # the 300-character daily budget was never exceeded
    assert client.post("/speech", json={"text": "hi"}).status_code == 403  # must come from the Pact app


def test_no_key_means_browser_voice(client, monkeypatch):
    monkeypatch.delenv("ELEVENLABS_API_KEY")
    r = client.post("/speech", json={"text": "Hello"}, headers=ORIGIN)
    assert r.status_code == 503 and r.json()["code"] == "speech_off"


def test_settings_put_merges_partial_changes(client):
    client.post("/auth/demo", headers=ORIGIN)
    assert client.get("/settings").json()["ally"] == {"name": "Jade", "relation": "sister"}
    s = client.put("/settings", json={"calm_mode": True}, headers=ORIGIN).json()
    assert s["calm_mode"] is True and s["ally"] == {"name": "Jade", "relation": "sister"}  # nothing else reset
    assert client.put("/settings", json={"reading_level": "shouty"}, headers=ORIGIN).json()["code"] == "invalid_settings"
