"""
Pydantic models for the WhatsApp account domain.

The access_token field is write-only — it is encrypted before storage and
never returned in any response model.
"""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class EmbeddedSignupRequest(BaseModel):
    """
    Payload sent by the Facebook JS SDK after Embedded Signup completes.

    - code: OAuth authorization code — exchanged server-side for an access token
    - phone_number_id / waba_id: from the WA_EMBEDDED_SIGNUP message event
    """

    code: str = Field(..., min_length=1)
    phone_number_id: str = Field(..., min_length=1)
    waba_id: str = Field(..., min_length=1)


class WhatsAppConnectRequest(BaseModel):
    """Connect (or update) a WhatsApp Business account for this tenant."""

    phone_number_id: str = Field(..., min_length=1, max_length=64)
    waba_id: str = Field(..., min_length=1, max_length=64)
    access_token: str = Field(..., min_length=10, description="Meta permanent access token — encrypted at rest")
    display_name: str | None = Field(None, max_length=255)
    phone_number: str | None = Field(None, max_length=32)


class WhatsAppAccountResponse(BaseModel):
    """Public-facing account record — access_token is never included."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    phone_number_id: str
    waba_id: str
    display_name: str | None
    phone_number: str | None
    is_active: bool
    verified_at: datetime | None
    created_at: datetime
    updated_at: datetime


class WhatsAppStatusResponse(BaseModel):
    """Summary status for the dashboard card."""

    connected: bool
    account: WhatsAppAccountResponse | None = None
