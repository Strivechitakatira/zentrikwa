from __future__ import annotations
from uuid import UUID
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


# ── Contact ───────────────────────────────────────────────────────────────────

class ContactResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    phone: str
    name: Optional[str]
    email: Optional[str]
    tags: list[str]
    notes: Optional[str]
    is_blocked: bool
    created_at: datetime
    updated_at: datetime


# ── Message ───────────────────────────────────────────────────────────────────

class MessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    conversation_id: UUID
    direction: str          # "inbound" | "outbound"
    type: str
    body: Optional[str]
    media_url: Optional[str]
    status: str             # "pending" | "sent" | "delivered" | "read" | "failed"
    created_at: datetime


# ── Conversation ──────────────────────────────────────────────────────────────

class ConversationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    contact_id: UUID
    contact_phone: str
    status: str             # "bot" | "open" | "closed"
    unread_count: int
    last_message_at: Optional[datetime]
    last_message: Optional[str]
    assigned_to: Optional[UUID]
    created_at: datetime
    updated_at: datetime
    contact: Optional[ContactResponse] = None


class ConversationListResponse(BaseModel):
    items: list[ConversationResponse]
    total: int
    page: int
    page_size: int


class ConversationThreadResponse(BaseModel):
    conversation: ConversationResponse
    messages: list[MessageResponse]
    total_messages: int


class UpdateConversationRequest(BaseModel):
    status: Optional[str] = None    # "bot" | "open" | "closed"
    assigned_to: Optional[UUID] = None
