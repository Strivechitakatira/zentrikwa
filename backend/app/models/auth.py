"""
Pydantic models for the auth domain.

Supabase Auth handles signup/login credentials — these models cover the
post-signup tenant onboarding step and the /me profile response.
"""
from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class SignupCompleteRequest(BaseModel):
    """
    Called immediately after Supabase Auth email verification.
    Creates the client (tenant) record and the owner team_member row.
    """

    company_name: str = Field(..., min_length=1, max_length=255)
    full_name: str = Field(..., min_length=1, max_length=255)


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    full_name: str | None
    client_id: UUID
    role: str


class MessageResponse(BaseModel):
    message: str
