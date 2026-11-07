"""POST /speech: read Pact's screen text aloud with an ElevenLabs voice whose delivery fits the moment.

No session is needed, so read-aloud also works in mock mode, but the usual guards apply: the
Origin must be the Pact app (main.py), 60 requests a minute, 1,500 characters a request, and the
daily and monthly character budgets in engine/speech.py. Any refusal tells the app to use the
browser's own voice instead.
"""
from fastapi import APIRouter
from fastapi.responses import Response
from pydantic import BaseModel, Field

from .. import speech
from ..dependencies import fail

router = APIRouter(tags=["speech"])


class SpeechInput(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    lang: str | None = Field(default=None, max_length=20)
    screen: str = Field(default="other", max_length=20)
    weather: str | None = Field(default=None, pattern="^(clear|cloudy|storm)$")
    storm_mode: bool = False
    calm_mode: bool = False
    mood: str | None = Field(default=None, pattern="^(good|unsure|worried)$")
    kind: str = Field(default="page", pattern="^(page|note|success)$")


@router.post("/speech")
def speak(body: SpeechInput):
    ctx = speech.Context(screen=body.screen, weather=body.weather, storm_mode=body.storm_mode, calm_mode=body.calm_mode, mood=body.mood, kind=body.kind)
    try:
        audio, cached, d = speech.speak(body.text, body.lang, ctx)
    except speech.SpeechUnavailable as e:
        fail(e.status, e.code, e.message)
    return Response(
        content=audio,
        media_type="audio/mpeg",
        headers={"X-Pact-Voice-Cache": "hit" if cached else "miss", "X-Pact-Voice-Tone": ",".join(d.tags) or "neutral", "Cache-Control": "private, max-age=86400"},
    )
