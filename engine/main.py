"""Pact API application entry point. Start from the repository root with:
`uvicorn engine.main:app --reload`.
"""
import os
import time

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .database import init_db
from .routers import account, ally, auth, explain, forecast, pact, rewind, settings

app = FastAPI(title="Pact Engine", version="0.1.0")
origins = [origin.strip() for origin in os.getenv("FRONTEND_ORIGIN", "http://localhost:3000").split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "X-Requested-With"],
)

_request_times: dict[str, list[float]] = {}


@app.middleware("http")
async def security_and_rate_limit(request: Request, call_next):
    if request.method in {"POST", "PUT", "PATCH", "DELETE"} and request.url.path not in {"/auth/demo", "/auth/logout"}:
        origin = request.headers.get("origin")
        if not origin or origin.rstrip("/") not in {allowed.rstrip("/") for allowed in origins}:
            return JSONResponse(status_code=403, content={"code": "origin_not_allowed", "message_plain": "This request did not come from Pact."})
    key = request.cookies.get("pact_session") or (request.client.host if request.client else "unknown")
    now = time.monotonic()
    recent = [timestamp for timestamp in _request_times.get(key, []) if now - timestamp < 60]
    if len(recent) >= 60:
        return JSONResponse(status_code=429, content={"code": "rate_limited", "message_plain": "Please wait a moment and try again."})
    recent.append(now)
    _request_times[key] = recent
    return await call_next(request)


@app.on_event("startup")
def startup() -> None:
    init_db()


@app.exception_handler(HTTPException)
async def http_error(_request, exc: HTTPException):
    detail = exc.detail
    body = detail if isinstance(detail, dict) and "code" in detail else {"code": "request_error", "message_plain": str(detail)}
    return JSONResponse(status_code=exc.status_code, content=body)


@app.get("/health")
def health():
    return {"status": "ok"}


for route_module in (auth, account, ally, explain, forecast, pact, rewind, settings):
    app.include_router(route_module.router)
