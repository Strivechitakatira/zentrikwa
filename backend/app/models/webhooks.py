"""
Pydantic models for Meta WhatsApp Cloud API webhook payloads.
Reference: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples
"""
from __future__ import annotations
from typing import Optional
from pydantic import BaseModel, Field


class WATextMessage(BaseModel):
    body: str


class WAImageMessage(BaseModel):
    id: str
    mime_type: str
    sha256: str
    caption: Optional[str] = None


class WAAudioMessage(BaseModel):
    id: str
    mime_type: str
    sha256: str
    voice: bool = False


class WADocumentMessage(BaseModel):
    id: str
    mime_type: str
    sha256: str
    filename: Optional[str] = None
    caption: Optional[str] = None


class WALocationMessage(BaseModel):
    latitude: float
    longitude: float
    name: Optional[str] = None
    address: Optional[str] = None


class WAMessage(BaseModel):
    """Single inbound WhatsApp message."""
    id: str
    from_number: str = Field(alias="from")
    timestamp: str
    type: str
    text: Optional[WATextMessage] = None
    image: Optional[WAImageMessage] = None
    audio: Optional[WAAudioMessage] = None
    document: Optional[WADocumentMessage] = None
    location: Optional[WALocationMessage] = None

    model_config = {"populate_by_name": True}

    @property
    def text_body(self) -> str | None:
        if self.type == "text" and self.text:
            return self.text.body
        if self.type == "image" and self.image:
            return self.image.caption
        if self.type == "document" and self.document:
            return self.document.caption
        return None


class WAContactProfile(BaseModel):
    name: Optional[str] = None


class WAContact(BaseModel):
    wa_id: str
    profile: Optional[WAContactProfile] = None


class WAMetadata(BaseModel):
    display_phone_number: str
    phone_number_id: str


class WAStatus(BaseModel):
    """Delivery / read receipt."""
    id: str
    status: str        # "sent", "delivered", "read", "failed"
    timestamp: str
    recipient_id: str


class WAValue(BaseModel):
    messaging_product: str
    metadata: WAMetadata
    contacts: Optional[list[WAContact]] = None
    messages: Optional[list[WAMessage]] = None
    statuses: Optional[list[WAStatus]] = None


class WAChange(BaseModel):
    value: WAValue
    field: str


class WAEntry(BaseModel):
    id: str
    changes: list[WAChange]


class WebhookPayload(BaseModel):
    object: str
    entry: list[WAEntry]
