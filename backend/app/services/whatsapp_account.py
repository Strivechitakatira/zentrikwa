"""
Service layer for WhatsApp account management.

Business rules:
- access_token is encrypted with AES-256-GCM before it reaches the DB
- Decryption happens only when the token is needed to call the Meta API
- No FastAPI imports — raises Python exceptions only
"""
from __future__ import annotations

import logging
from uuid import UUID

import httpx

from app.core.security import decrypt, encrypt
from app.db.queries.whatsapp import (
    delete_whatsapp_account,
    get_whatsapp_account,
    get_whatsapp_account_with_token,
    mark_whatsapp_verified,
    upsert_whatsapp_account,
)
from app.models.whatsapp import (
    EmbeddedSignupRequest,
    WhatsAppAccountResponse,
    WhatsAppConnectRequest,
    WhatsAppStatusResponse,
)

logger = logging.getLogger(__name__)

_META_API = "https://graph.facebook.com/v18.0"


async def connect_account(
    client_id: UUID, body: WhatsAppConnectRequest
) -> WhatsAppAccountResponse:
    """
    Store (or replace) a WhatsApp Business account for a tenant.

    The access_token is encrypted before writing to the DB.
    Validates the token against the Meta Graph API before saving.
    """
    # Validate token against Meta — raises ValueError on bad token
    display_name, phone_number = await _verify_meta_token(
        body.phone_number_id, body.access_token
    )

    encrypted_token = encrypt(body.access_token)

    row = await upsert_whatsapp_account(
        client_id,
        {
            "phone_number_id": body.phone_number_id,
            "waba_id": body.waba_id,
            "access_token_enc": encrypted_token,
            "display_name": body.display_name or display_name,
            "phone_number": body.phone_number or phone_number,
            "is_active": True,
            "verified_at": "now()",
        },
    )

    return WhatsAppAccountResponse.model_validate(row)


async def get_status(client_id: UUID) -> WhatsAppStatusResponse:
    """Return connection status for the dashboard card."""
    row = await get_whatsapp_account(client_id)
    if not row:
        return WhatsAppStatusResponse(connected=False)

    return WhatsAppStatusResponse(
        connected=row["is_active"],
        account=WhatsAppAccountResponse.model_validate(row),
    )


async def disconnect_account(client_id: UUID) -> None:
    """Remove the tenant's WhatsApp account credentials."""
    deleted = await delete_whatsapp_account(client_id)
    if not deleted:
        raise LookupError("No WhatsApp account connected for this tenant")


async def get_decrypted_token(client_id: UUID) -> str:
    """
    Retrieve and decrypt the access token for API calls.
    Used internally by the webhook handler and message sender.
    """
    row = await get_whatsapp_account_with_token(client_id)
    if not row:
        raise LookupError("No WhatsApp account connected for this tenant")
    return decrypt(row["access_token_enc"])


async def complete_embedded_signup(
    client_id: UUID, body: EmbeddedSignupRequest
) -> WhatsAppAccountResponse:
    """
    Called after Meta Embedded Signup completes in the browser.

    Flow:
      1. Exchange the short-lived OAuth code for a user access token
      2. Exchange for a long-lived token (60-day expiry)
      3. Fetch phone number display details from Meta
      4. Encrypt token and upsert into whatsapp_accounts
    """
    from app.core.config import settings

    # 1. Exchange code → short-lived user token
    short_token = await _exchange_code_for_token(body.code)

    # 2. Exchange short-lived → long-lived token (60 days)
    long_token = await _exchange_for_long_lived_token(short_token)

    # 3. Fetch phone number details
    display_name, phone_number = await _verify_meta_token(body.phone_number_id, long_token)

    # 4. Persist encrypted
    encrypted_token = encrypt(long_token)
    row = await upsert_whatsapp_account(
        client_id,
        {
            "phone_number_id": body.phone_number_id,
            "waba_id": body.waba_id,
            "access_token_enc": encrypted_token,
            "display_name": display_name,
            "phone_number": phone_number,
            "is_active": True,
            "verified_at": "now()",
        },
    )
    return WhatsAppAccountResponse.model_validate(row)


# ── Internal helpers ───────────────────────────────────────────────────────────

async def _exchange_code_for_token(code: str) -> str:
    """Exchange the OAuth authorization code for a short-lived user access token."""
    from app.core.config import settings

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"{_META_API}/oauth/access_token",
            params={
                "client_id": settings.META_APP_ID,
                "client_secret": settings.META_APP_SECRET,
                "code": code,
            },
        )

    if not resp.is_success:
        data = resp.json()
        msg = data.get("error", {}).get("message", "Unknown error")
        raise ValueError(f"Failed to exchange OAuth code: {msg}")

    return resp.json()["access_token"]


async def _exchange_for_long_lived_token(short_token: str) -> str:
    """Exchange a short-lived user token for a long-lived token (60-day expiry)."""
    from app.core.config import settings

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"{_META_API}/oauth/access_token",
            params={
                "grant_type": "fb_exchange_token",
                "client_id": settings.META_APP_ID,
                "client_secret": settings.META_APP_SECRET,
                "fb_exchange_token": short_token,
            },
        )

    if not resp.is_success:
        logger.warning("Long-lived token exchange failed: %s", resp.text)
        # Fall back to the short-lived token rather than failing entirely
        return short_token

    return resp.json()["access_token"]


async def _verify_meta_token(
    phone_number_id: str, access_token: str
) -> tuple[str | None, str | None]:
    """
    Call the Meta Graph API to verify the token is valid for this phone number.

    Returns (display_name, phone_number) on success.
    Raises ValueError on invalid token or mismatched phone_number_id.
    """
    url = f"{_META_API}/{phone_number_id}"
    params = {"fields": "display_phone_number,verified_name", "access_token": access_token}

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, params=params)
    except httpx.RequestError as exc:
        logger.warning("Meta API unreachable during token validation: %s", exc)
        # Don't block connection if Meta is temporarily unreachable
        return None, None

    if resp.status_code == 401:
        raise ValueError("Invalid Meta access token — check the token and try again")

    if resp.status_code == 404:
        raise ValueError(
            f"Phone Number ID '{phone_number_id}' not found — verify it in Meta Business Manager"
        )

    if not resp.is_success:
        logger.warning("Meta API returned %s during validation: %s", resp.status_code, resp.text)
        return None, None

    data = resp.json()
    display_name: str | None = data.get("verified_name")
    phone_number: str | None = data.get("display_phone_number")
    return display_name, phone_number
