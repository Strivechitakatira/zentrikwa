"""
Conversations router.

  GET  /conversations              — paginated list with contact info
  GET  /conversations/{id}         — conversation details + message thread
  PATCH /conversations/{id}        — update status / assigned_to
  GET  /conversations/{id}/messages — paginated message history
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status

from app.core.deps import ClientId
from app.db.queries.conversations import (
    get_conversation,
    list_conversations,
    update_conversation,
)
from app.db.queries.messages import list_messages
from app.models.conversations import (
    ConversationListResponse,
    ConversationResponse,
    ConversationThreadResponse,
    MessageResponse,
    UpdateConversationRequest,
)

router = APIRouter(prefix="/conversations", tags=["Conversations"])


# ── List conversations ─────────────────────────────────────────────────────────

@router.get("", response_model=ConversationListResponse)
async def list_convs(
    client_id: ClientId,
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=100),
    status_filter: str | None = Query(None, alias="status"),
) -> ConversationListResponse:
    rows, total = await list_conversations(
        client_id,
        page=page,
        page_size=page_size,
        status=status_filter,
    )
    items = [_conv_from_row(r) for r in rows]
    return ConversationListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


# ── Get conversation thread ────────────────────────────────────────────────────

@router.get("/{conversation_id}", response_model=ConversationThreadResponse)
async def get_conv(
    conversation_id: UUID,
    client_id: ClientId,
    msg_page: int = Query(1, ge=1),
    msg_page_size: int = Query(50, ge=1, le=200),
) -> ConversationThreadResponse:
    conv = await get_conversation(str(conversation_id))
    if not conv or str(conv.get("client_id")) != str(client_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    messages, total_messages = await list_messages(
        str(conversation_id),
        page=msg_page,
        page_size=msg_page_size,
    )

    return ConversationThreadResponse(
        conversation=_conv_from_row(conv),
        messages=[_msg_from_row(m) for m in messages],
        total_messages=total_messages,
    )


# ── Update conversation ────────────────────────────────────────────────────────

@router.patch("/{conversation_id}", response_model=ConversationResponse)
async def update_conv(
    conversation_id: UUID,
    body: UpdateConversationRequest,
    client_id: ClientId,
) -> ConversationResponse:
    if body.status and body.status not in ("bot", "open", "closed"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="status must be one of: bot, open, closed",
        )

    update_data: dict = {}
    if body.status is not None:
        update_data["status"] = body.status
    if body.assigned_to is not None:
        update_data["assigned_to"] = str(body.assigned_to)

    if not update_data:
        # Nothing to update — return current state
        conv = await get_conversation(str(conversation_id))
        if not conv or str(conv.get("client_id")) != str(client_id):
            raise HTTPException(status_code=404, detail="Conversation not found")
        return _conv_from_row(conv)

    updated = await update_conversation(client_id, conversation_id, update_data)
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    return _conv_from_row(updated)


# ── Messages sub-resource ──────────────────────────────────────────────────────

@router.get("/{conversation_id}/messages", response_model=dict)
async def get_messages(
    conversation_id: UUID,
    client_id: ClientId,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
) -> dict:
    # Verify conversation belongs to this tenant
    conv = await get_conversation(str(conversation_id))
    if not conv or str(conv.get("client_id")) != str(client_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    messages, total = await list_messages(str(conversation_id), page=page, page_size=page_size)
    return {
        "items": [_msg_from_row(m) for m in messages],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


# ── Helpers ────────────────────────────────────────────────────────────────────

def _conv_from_row(row: dict) -> ConversationResponse:
    from app.models.conversations import ContactResponse

    contact_data = row.get("contacts")
    contact = ContactResponse.model_validate(contact_data) if contact_data else None
    return ConversationResponse(
        id=row["id"],
        contact_id=row["contact_id"],
        contact_phone=row["contact_phone"],
        status=row.get("status", "bot"),
        unread_count=row.get("unread_count", 0),
        last_message_at=row.get("last_message_at"),
        last_message=row.get("last_message"),
        assigned_to=row.get("assigned_to"),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        contact=contact,
    )


def _msg_from_row(row: dict) -> MessageResponse:
    return MessageResponse(
        id=row["id"],
        conversation_id=row["conversation_id"],
        direction=row["direction"],
        type=row.get("type", "text"),
        body=row.get("body"),
        media_url=row.get("media_url"),
        status=row.get("status", "sent"),
        created_at=row["created_at"],
    )
