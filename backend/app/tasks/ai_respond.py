"""
Celery task: generate an AI response to an inbound WhatsApp message.

Flow:
  1. Load agent config — check is_live flag
  2. Load conversation + contact for context
  3. Fetch last 20 messages for Claude context window
  4. Build system prompt
  5. Call Claude API
  6. Save outbound message row BEFORE sending (idempotency)
  7. Send via WhatsApp Cloud API
  8. Update message row with wa_message_id from Meta response
  9. Update conversation last_message snippet

On failure: retry up to 3x with exponential back-off.
After 3 failures: mark message as "failed", log error.
"""
from __future__ import annotations

import asyncio
import logging

from app.worker import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(
    bind=True,
    name="ai_respond",
    max_retries=3,
    default_retry_delay=15,  # seconds; doubled each retry by Celery
    acks_late=True,
)
def ai_respond(
    self,
    message_id: str,
    conversation_id: str,
    client_id: str,
) -> None:
    """Synchronous Celery entry point — delegates to async implementation."""
    asyncio.run(_run(self, message_id, conversation_id, client_id))


# ── Async implementation ───────────────────────────────────────────────────────

async def _run(
    task,
    message_id: str,
    conversation_id: str,
    client_id: str,
) -> None:
    from uuid import UUID

    from app.db.queries.conversations import (
        get_conversation,
        update_last_message,
    )
    from app.db.queries.messages import (
        get_agent_config,
        get_recent_messages,
        insert_message,
        update_message_status,
    )
    from app.db.queries.whatsapp import get_whatsapp_account_with_token
    from app.core.security import decrypt
    from app.services.ai.prompt_builder import build_system_prompt
    from app.services.ai.responder import call_claude
    from app.services.whatsapp.send import send_text_message

    try:
        # 1. Check agent is live
        agent_config = await get_agent_config(client_id)
        if not agent_config.get("is_live", True):
            logger.info("Agent not live for client=%s — skipping AI response", client_id)
            return

        # 2. Load conversation (contains contact_phone)
        conversation = await get_conversation(conversation_id)
        if not conversation:
            logger.warning("Conversation %s not found — aborting ai_respond", conversation_id)
            return

        contact_id = conversation.get("contact_id")
        contact_phone = conversation.get("contact_phone")

        # Get contact name if available
        contact_name: str | None = None
        if conversation.get("contacts"):
            contact_name = conversation["contacts"].get("name")

        # 3. Fetch last 20 messages for context
        history = await get_recent_messages(conversation_id, limit=20)

        # 4. Build system prompt
        system_prompt = await build_system_prompt(client_id, contact_name)

        # 5. Call Claude
        response_text = await call_claude(system_prompt, history)
        if not response_text:
            logger.warning("Claude returned empty response for conv=%s", conversation_id)
            return

        # 6. Insert outbound message BEFORE sending (survive crash between save and send)
        msg_row = await insert_message(
            {
                "client_id": client_id,
                "conversation_id": conversation_id,
                "contact_id": str(contact_id) if contact_id else None,
                "direction": "outbound",
                "type": "text",
                "body": response_text,
                "status": "pending",
            }
        )
        outbound_id = str(msg_row["id"])

        # 7. Load WA credentials
        wa_account = await get_whatsapp_account_with_token(UUID(client_id))
        if not wa_account:
            logger.error("No WhatsApp account for client=%s — cannot send reply", client_id)
            await update_message_status(outbound_id, "failed", error_message="No WA account")
            return

        access_token = decrypt(wa_account["access_token_enc"])
        phone_number_id = wa_account["phone_number_id"]

        # 8. Send via WhatsApp
        wa_result = await send_text_message(
            phone_number_id=phone_number_id,
            access_token=access_token,
            to=contact_phone,
            body=response_text,
        )

        # 9. Update message with wa_message_id returned by Meta
        wa_message_id: str | None = None
        messages_list = wa_result.get("messages", [])
        if messages_list:
            wa_message_id = messages_list[0].get("id")

        await update_message_status(outbound_id, "sent", wa_message_id=wa_message_id)

        # 10. Update conversation snippet with outbound reply
        await update_last_message(conversation_id, response_text[:120])

        logger.info(
            "AI response sent: conv=%s client=%s wa_msg=%s",
            conversation_id,
            client_id,
            wa_message_id,
        )

    except Exception as exc:
        logger.error(
            "ai_respond failed (attempt %d/%d): %s",
            task.request.retries + 1,
            task.max_retries + 1,
            exc,
            exc_info=True,
        )
        if task.request.retries < task.max_retries:
            raise task.retry(exc=exc, countdown=15 * (2 ** task.request.retries))

        # Final failure — mark message as failed in DB if we have an outbound_id
        try:
            await _mark_failed_if_exists(message_id, str(exc))
        except Exception:
            pass


async def _mark_failed_if_exists(message_id: str, error: str) -> None:
    from app.db.queries.messages import update_message_status
    await update_message_status(message_id, "failed", error_message=error[:500])
