"""
WhatsApp account management router.

  POST   /whatsapp/connect     — connect / update WhatsApp Business account
  GET    /whatsapp/status      — get connection status
  DELETE /whatsapp/disconnect  — remove credentials
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Response, status

from app.core.deps import ClientId
from app.models.whatsapp import (
    EmbeddedSignupRequest,
    WhatsAppAccountResponse,
    WhatsAppConnectRequest,
    WhatsAppStatusResponse,
)
from app.services import whatsapp_account as wa_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/whatsapp", tags=["WhatsApp"])


@router.post(
    "/embedded-signup",
    response_model=WhatsAppAccountResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Complete Meta Embedded Signup — exchange OAuth code for credentials",
)
async def embedded_signup(
    body: EmbeddedSignupRequest,
    client_id: ClientId,
) -> WhatsAppAccountResponse:
    """
    Called by the frontend after the Facebook JS SDK Embedded Signup flow completes.

    Exchanges the OAuth code for a long-lived access token server-side,
    fetches phone number details from Meta, and stores everything encrypted.
    """
    try:
        return await wa_service.complete_embedded_signup(client_id, body)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))


@router.post(
    "/connect",
    response_model=WhatsAppAccountResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Connect a Meta WhatsApp Business account",
)
async def connect_whatsapp(
    body: WhatsAppConnectRequest,
    client_id: ClientId,
) -> WhatsAppAccountResponse:
    """
    Store encrypted WhatsApp credentials for this tenant.
    Validates the token against the Meta Graph API before saving.
    Idempotent — calling again replaces the existing account.
    """
    try:
        return await wa_service.connect_account(client_id, body)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))


@router.get(
    "/status",
    response_model=WhatsAppStatusResponse,
    summary="Get WhatsApp connection status",
)
async def get_whatsapp_status(
    client_id: ClientId,
) -> WhatsAppStatusResponse:
    return await wa_service.get_status(client_id)


@router.delete(
    "/disconnect",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Disconnect WhatsApp account and delete credentials",
)
async def disconnect_whatsapp(
    client_id: ClientId,
) -> Response:
    try:
        await wa_service.disconnect_account(client_id)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    return Response(status_code=status.HTTP_204_NO_CONTENT)
