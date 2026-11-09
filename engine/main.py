"""Pact API application entry point. Start from the repository root with:
`uvicorn engine.main:app --reload`.
"""
import os
import re
import time
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urlsplit

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Load the repository's engine configuration even when Uvicorn is started without
# `--env-file` or from a different working directory. Existing process variables win.
load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=False)

from .database import init_db
from .routers import account, ally, auth, explain, forecast, pact, profile, rewind, settings, speech

@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Pact Engine", version="0.1.0", lifespan=lifespan)
origins = [origin.strip() for origin in os.getenv("FRONTEND_ORIGIN", "http://localhost:3000").split(",") if origin.strip()]
# Next.js falls back to the next open port (or developers use 127.0.0.1). During
# local development accept loopback origins on any port; deployed origins remain exact.
local_hosts = {"localhost", "127.0.0.1", "::1"}
allow_local_dev_origins = any(urlsplit(origin).hostname in local_hosts for origin in origins)
local_origin_pattern = r"^https?://(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$"


def is_allowed_origin(origin: str | None) -> bool:
    if not origin:
        return False
    normalized = origin.rstrip("/")
    if normalized in {allowed.rstrip("/") for allowed in origins}:
        return True
    return allow_local_dev_origins and re.fullmatch(local_origin_pattern, normalized) is not None


app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=local_origin_pattern if allow_local_dev_origins else None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_request_times: dict[str, list[float]] = {}


@app.middleware("http")
async def security_and_rate_limit(request: Request, call_next):
    if request.method == "OPTIONS":
        print(
            "[pact] CORS preflight "
            f"origin={request.headers.get('origin', '<missing>')} "
            f"method={request.headers.get('access-control-request-method', '<missing>')} "
            f"headers={request.headers.get('access-control-request-headers', '<none>')}",
            flush=True,
        )
    if request.method in {"POST", "PUT", "PATCH", "DELETE"} and request.url.path not in {"/auth/demo", "/auth/logout"}:
        origin = request.headers.get("origin")
        if not is_allowed_origin(origin):
            return JSONResponse(status_code=403, content={"code": "origin_not_allowed", "message_plain": "This request did not come from Pact."})
    key = request.cookies.get("pact_session") or (request.client.host if request.client else "unknown")
    now = time.monotonic()
    recent = [timestamp for timestamp in _request_times.get(key, []) if now - timestamp < 60]
    if len(recent) >= 60:
        return JSONResponse(status_code=429, content={"code": "rate_limited", "message_plain": "Please wait a moment and try again."})
    recent.append(now)
    _request_times[key] = recent
    return await call_next(request)


@app.exception_handler(HTTPException)
async def http_error(_request, exc: HTTPException):
    detail = exc.detail
    body = detail if isinstance(detail, dict) and "code" in detail else {"code": "request_error", "message_plain": str(detail)}
    return JSONResponse(status_code=exc.status_code, content=body)


@app.get("/health")
def health():
    return {"status": "ok"}


for route_module in (auth, account, ally, explain, forecast, pact, profile, rewind, settings, speech):
    app.include_router(route_module.router)
