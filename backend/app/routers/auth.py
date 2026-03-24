"""
Auth router — tenant onboarding and profile endpoints.

Supabase Auth handles signup/login/forgot-password on the client side.
These endpoints handle what happens *after* authentication:
  POST /auth/complete-signup  — create tenant record after first login
  GET  /auth/me               — return the authenticated user's profile
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.deps import CurrentUserId, get_current_user_id
from app.models.auth import MessageResponse, SignupCompleteRequest, UserResponse
from app.services import auth as auth_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post(
    "/complete-signup",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Complete tenant onboarding after email verification",
)
async def complete_signup(
    body: SignupCompleteRequest,
    user_id: CurrentUserId,
) -> UserResponse:
    """
    Call this once after the user verifies their email.

    - Creates the ``clients`` (tenant) row and the ``team_members`` (owner) row.
    - Idempotent: safe to call multiple times; returns existing data on repeat calls.
    - Requires a valid Bearer JWT — the user must be authenticated.
    - ``client_id`` is NOT accepted from the body; it is generated here.
    """
    # Extract email from the JWT payload via Supabase admin client
    from app.db.supabase import get_admin_client

    try:
        supabase = get_admin_client()
        user_resp = supabase.auth.admin.get_user_by_id(str(user_id))
        email: str = user_resp.user.email or ""
    except Exception as exc:
        logger.warning("Could not fetch user email for %s: %s", user_id, exc)
        email = ""

    try:
        return await auth_service.complete_signup(
            user_id=str(user_id),
            email=email,
            body=body,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Return the authenticated user's profile and tenant",
)
async def get_me(
    user_id: CurrentUserId,
) -> UserResponse:
    """
    Returns the current user's profile including their ``client_id`` and role.

    Requires a valid Bearer JWT.
    """
    from app.db.supabase import get_admin_client

    try:
        supabase = get_admin_client()
        user_resp = supabase.auth.admin.get_user_by_id(str(user_id))
        email: str = user_resp.user.email or ""
    except Exception as exc:
        logger.warning("Could not fetch user email for %s: %s", user_id, exc)
        email = ""

    try:
        return await auth_service.get_current_user_profile(
            user_id=str(user_id),
            email=email,
        )
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
