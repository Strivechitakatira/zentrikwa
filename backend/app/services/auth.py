"""
Service layer for the auth domain.

Business rules live here. No FastAPI imports — raises Python exceptions only:
  LookupError   → caller maps to 404
  ValueError    → caller maps to 422
  PermissionError → caller maps to 403 (unused here, kept for convention)
"""
from __future__ import annotations

import re
from uuid import UUID

from app.db.queries.auth import (
    client_slug_exists,
    create_client,
    create_team_member,
    get_team_member_by_user,
)
from app.models.auth import SignupCompleteRequest, UserResponse


def _slugify(name: str) -> str:
    """Convert a company name into a URL-safe slug."""
    slug = name.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_]+", "-", slug)
    slug = re.sub(r"-+", "-", slug).strip("-")
    return slug[:60]  # cap at 60 chars


async def _unique_slug(base: str) -> str:
    """Return a slug guaranteed unique in the clients table."""
    slug = _slugify(base)
    if not await client_slug_exists(slug):
        return slug

    # Append incrementing suffix until unique
    for i in range(2, 100):
        candidate = f"{slug}-{i}"
        if not await client_slug_exists(candidate):
            return candidate

    raise ValueError(f"Could not generate a unique slug for '{base}'")


async def complete_signup(
    user_id: str,
    email: str,
    body: SignupCompleteRequest,
) -> UserResponse:
    """
    Called once after email verification.

    - Idempotent: if the user already has a team_member record, return their profile.
    - Creates the client (tenant) and the owner team_member row.
    """
    # Idempotency: return existing membership if already set up
    existing = await get_team_member_by_user(user_id)
    if existing:
        return UserResponse(
            id=UUID(user_id),
            email=email,
            full_name=body.full_name,
            client_id=UUID(existing["client_id"]),
            role=existing["role"],
        )

    slug = await _unique_slug(body.company_name)
    client = await create_client(name=body.company_name, slug=slug)
    member = await create_team_member(
        client_id=UUID(client["id"]),
        user_id=user_id,
        role="owner",
    )

    return UserResponse(
        id=UUID(user_id),
        email=email,
        full_name=body.full_name,
        client_id=UUID(client["id"]),
        role=member["role"],
    )


async def get_current_user_profile(
    user_id: str,
    email: str,
) -> UserResponse:
    """Return the authenticated user's profile and tenant membership."""
    member = await get_team_member_by_user(user_id)
    if not member:
        raise LookupError("No active tenant membership found for this user")

    return UserResponse(
        id=UUID(user_id),
        email=email,
        full_name=None,
        client_id=UUID(member["client_id"]),
        role=member["role"],
    )
