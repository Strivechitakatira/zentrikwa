"""
Webhook event processor — ties together contacts, conversations, messages, and Celery.

Called by the webhook router AFTER signature validation.
Must complete quickly (< 1s) — heavy work is handed to Celery.
"""
from __future__ import annotations

import logging
from uuid import UUID

from app.db.queries.contacts import upsert_contact_by_phone
from app.db.queries.conversations import (
    update_last_message,
    upsert_conversation,
)
from app.db.queries.messages import get_by_wa_message_id, insert_message
from app.db.queries.whatsapp import get_whatsapp_account_by_phone_number_id
from app.models.webhooks import WAMessage, WAValue, WebhookPayload

logger = logging.getLogger(__name__)


async def process_webhook_payload(payload: WebhookPayload) -> None:
    """
    Entry point for the webhook router.
    Iterates all entries/changes and dispatches each inbound message.
    """
    for entry in payload.entry:
        for change in entry.changes:
            if change.field != "messages":
                continue
            value = change.value
            if not value.messages:
                continue  # delivery/read receipts — skip

            for message in value.messages:
                try:
                    await _handle_inbound_message(message, value)
                except Exception:
                    logger.exception(
                        "Failed to handle inbound message wa_id=%s", message.id
                    )


async def _handle_inbound_message(message: WAMessage, value: WAValue) -> None:
    """
    Process a single inbound message:
      1. Idempotency check
      2. Resolve tenant via phone_number_id
      3. Upsert contact
      4. Upsert conversation
      5. Insert message row
      6. Update conversation last_message snippet
      7. Enqueue ai_respond Celery task
    """
    # 1. Idempotency — skip duplicates
    existing = await get_by_wa_message_id(message.id)
    if existing:
        logger.debug("Duplicate wa_message_id=%s — skipping", message.id)
        return

    # 2. Resolve tenant by phone_number_id from webhook metadata
    phone_number_id = value.metadata.phone_number_id
    wa_account = await get_whatsapp_account_by_phone_number_id(phone_number_id)
    if not wa_account:
        logger.warning(
            "No active WA account for phone_number_id=%s — message dropped",
            phone_number_id,
        )
        return

    client_id = UUID(wa_account["client_id"])

    # 3. Extract sender info
    phone = "+" + message.from_number  # normalise to E.164

    contact_name: str | None = None
    if value.contacts:
        profile = value.contacts[0].profile
        if profile:
            contact_name = profile.name

    # 4. Upsert contact (one per phone per tenant)
    contact = await upsert_contact_by_phone(
        client_id=client_id,
        phone=phone,
        name=contact_name,
        wa_id=message.from_number,
    )
    contact_id = UUID(contact["id"])

    # 5. Upsert conversation (one per contact per tenant)
    conversation = await upsert_conversation(
        client_id=client_id,
        contact_id=contact_id,
        contact_phone=phone,
    )
    conversation_id = str(conversation["id"])

    # 6. Insert inbound message row
    text_body = message.text_body  # None for audio/video/location
    msg_row = await insert_message(
        {
            "client_id": str(client_id),
            "conversation_id": conversation_id,
            "contact_id": str(contact_id),
            "wa_message_id": message.id,
            "direction": "inbound",
            "type": message.type,
            "body": text_body,
            "status": "received",
        }
    )

    # 7. Update conversation snippet
    snippet = text_body or f"[{message.type}]"
    await update_last_message(conversation_id, snippet)

    # 8. Enqueue AI response — fire and forget (import here to avoid circular import)
    from app.tasks.ai_respond import ai_respond  # noqa: PLC0415

    ai_respond.delay(
        message_id=str(msg_row["id"]),
        conversation_id=conversation_id,
        client_id=str(client_id),
    )

    logger.info(
        "Inbound message processed: wa_id=%s conv=%s client=%s",
        message.id,
        conversation_id,
        client_id,
    )
