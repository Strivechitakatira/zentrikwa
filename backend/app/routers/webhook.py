"""
Meta WhatsApp webhook router.

  GET  /webhooks/whatsapp  — webhook verification (Meta hub challenge)
  POST /webhooks/whatsapp  — incoming messages (save + enqueue AI response)

Security:
  - GET:  verify hub.verify_token matches META_WEBHOOK_VERIFY_TOKEN from settings
  - POST: validate x-hub-signature-256 header with META_APP_SECRET
  - POST must respond 200 within 5 seconds — heavy work goes to Celery
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query, Request, Response, status

from app.core.config import settings
from app.core.security import verify_meta_signature

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["Webhooks"])


# ── GET — Meta webhook verification ───────────────────────────────────────────

@router.get(
    "/whatsapp",
    include_in_schema=False,  # Don't expose in OpenAPI docs
    summary="Meta webhook verification challenge",
)
async def whatsapp_webhook_verify(
    hub_mode: str = Query(alias="hub.mode", default=""),
    hub_verify_token: str = Query(alias="hub.verify_token", default=""),
    hub_challenge: str = Query(alias="hub.challenge", default=""),
) -> Response:
    """
    Meta calls this endpoint when you register a webhook URL in the
    Meta Developer Portal. Respond with the challenge to confirm ownership.
    """
    if hub_mode != "subscribe":
        logger.warning("Webhook verify: unexpected hub.mode=%r", hub_mode)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid hub.mode")

    if hub_verify_token != settings.META_WEBHOOK_VERIFY_TOKEN:
        logger.warning("Webhook verify: token mismatch")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Verify token mismatch")

    logger.info("WhatsApp webhook verified successfully")
    return Response(content=hub_challenge, media_type="text/plain")


# ── POST — Incoming messages ───────────────────────────────────────────────────

@router.post(
    "/whatsapp",
    status_code=status.HTTP_200_OK,
    summary="Receive incoming WhatsApp messages",
)
async def whatsapp_webhook_receive(request: Request) -> dict:
    """
    Receives all incoming WhatsApp events (messages, statuses, etc.).

    Rules:
    - MUST return 200 within 5 seconds — Meta will retry on timeout
    - Validates x-hub-signature-256 before processing
    - Saves message to DB immediately, enqueues AI response to Celery
    - Returns {"status": "ok"} regardless (Meta ignores response body)
    """
    body = await request.body()
    signature = request.headers.get("x-hub-signature-256", "")

    if not verify_meta_signature(body, signature, settings.META_APP_SECRET):
        # Log but still return 200 — Meta requires 200 even on bad signatures
        # to avoid retry storms. We simply don't process the payload.
        logger.warning(
            "WhatsApp webhook: invalid signature — payload ignored (path=%s)",
            request.url.path,
        )
        return {"status": "ignored"}

    # TODO (Phase 2): parse payload → save message → enqueue Celery task
    # For now, log the event and return 200 immediately.
    logger.info("WhatsApp webhook received (signature valid), %d bytes", len(body))

    return {"status": "ok"}
