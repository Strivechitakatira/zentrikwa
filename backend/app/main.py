"""
Zentrikai API — FastAPI application entry point.

Local dev:   uvicorn app.main:app --reload --port 8000
Production:  uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 2
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings

# ── Logging ────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s  %(message)s",
)
logger = logging.getLogger(__name__)


# ── Lifespan ───────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    logger.info(
        "Starting %s (%s environment)",
        settings.APP_NAME,
        settings.ENVIRONMENT,
    )
    yield
    logger.info("Shutting down %s", settings.APP_NAME)


# ── App ────────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Zentrikai API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.is_development else None,
    redoc_url=None,
)


# ── CORS ───────────────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Exception handlers ─────────────────────────────────────────────────────────

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": "Validation error",
            "code": "VALIDATION_ERROR",
            "detail": exc.errors(),
        },
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(
    request: Request, exc: HTTPException
) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.detail,
            "code": "HTTP_ERROR",
        },
        headers=getattr(exc, "headers", None),
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(
    request: Request, exc: Exception
) -> JSONResponse:
    # Log the full traceback server-side — never expose it in the response.
    logger.error(
        "Unhandled exception on %s %s",
        request.method,
        request.url.path,
        exc_info=True,
    )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "Internal server error",
            "code": "INTERNAL_ERROR",
        },
    )


# ── System routes ──────────────────────────────────────────────────────────────

@app.get("/health", include_in_schema=False)
async def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "app": settings.APP_NAME,
        "environment": settings.ENVIRONMENT,
    }


@app.get("/api/v1/", tags=["API"])
async def api_root() -> dict[str, str]:
    return {"message": "Zentrikai API v1"}


# ── Routers ────────────────────────────────────────────────────────────────────
# Each router file exists with an empty APIRouter().
# Routes will be added in subsequent sessions.

from app.routers import (  # noqa: E402
    admin,
    agent,
    analytics,
    auth,
    billing,
    campaigns,
    contacts,
    conversations,
    documents,
    leads,
    orders,
    payments,
    team,
    webhook,
    whatsapp,
)

_V1 = "/api/v1"

app.include_router(auth.router,          prefix=_V1,         tags=["Auth"])
app.include_router(whatsapp.router,      prefix=_V1,         tags=["WhatsApp"])
app.include_router(webhook.router,       prefix=_V1,         tags=["Webhooks"])
app.include_router(agent.router,         prefix=_V1,         tags=["Agent"])
app.include_router(conversations.router, prefix=_V1,         tags=["Conversations"])
app.include_router(leads.router,         prefix=_V1,         tags=["Leads"])
app.include_router(contacts.router,      prefix=_V1,         tags=["Contacts"])
app.include_router(orders.router,        prefix=_V1,         tags=["Orders"])
app.include_router(documents.router,     prefix=_V1,         tags=["Documents"])
app.include_router(campaigns.router,     prefix=_V1,         tags=["Campaigns"])
app.include_router(payments.router,      prefix=_V1,         tags=["Payments"])
app.include_router(analytics.router,     prefix=_V1,         tags=["Analytics"])
app.include_router(team.router,          prefix=_V1,         tags=["Team"])
app.include_router(billing.router,       prefix=_V1,         tags=["Billing"])
app.include_router(admin.router,         prefix=f"{_V1}/admin", tags=["Admin"])
