"""
WhatsApp Cloud API — message sending helpers.
All functions are async and raise httpx.HTTPStatusError on failure.
"""
from __future__ import annotations
import logging
import httpx

logger = logging.getLogger(__name__)

GRAPH_API_BASE = "https://graph.facebook.com/v18.0"
TIMEOUT = 15.0


async def send_text_message(
    phone_number_id: str,
    access_token: str,
    to: str,
    body: str,
) -> dict:
    """Send a plain-text WhatsApp message. Returns the Meta API response."""
    url = f"{GRAPH_API_BASE}/{phone_number_id}/messages"
    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": to,
        "type": "text",
        "text": {"preview_url": False, "body": body},
    }
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        resp = await client.post(
            url,
            json=payload,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        resp.raise_for_status()
        logger.info("WA message sent to %s via phone_number_id=%s", to, phone_number_id)
        return resp.json()


async def mark_message_read(
    phone_number_id: str,
    access_token: str,
    wa_message_id: str,
) -> None:
    """Mark an incoming message as read (removes unread indicator in WA)."""
    url = f"{GRAPH_API_BASE}/{phone_number_id}/messages"
    payload = {
        "messaging_product": "whatsapp",
        "status": "read",
        "message_id": wa_message_id,
    }
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        resp = await client.post(
            url,
            json=payload,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        # Non-critical — don't raise, just log
        if resp.status_code != 200:
            logger.warning("Failed to mark message read: %s", resp.text)
