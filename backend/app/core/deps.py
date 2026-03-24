"""
FastAPI dependency injection — tenant isolation and role enforcement.

Type aliases (use these in route signatures, never the raw Depends form):

  CurrentUserId  → UUID of the authenticated Supabase user
  ClientId       → UUID of the user's tenant (from team_members, not JWT)
  PlatformAdmin  → dict from platform_users (super-admin only routes)

Usage:

  # Authenticated tenant route
  async def my_route(client_id: ClientId) -> ...:
      ...

  # Tenant admin-only route
  async def admin_route(member: Annotated[dict, Depends(require_admin_role)]) -> ...:
      ...

  # Platform super-admin route
  async def platform_route(admin: PlatformAdmin) -> ...:
      ...

Rules:
  - client_id NEVER comes from the request body, path params, or query params.
  - Always use ClientId — it is derived from the authenticated JWT via DB lookup.
  - require_admin_role must wrap ANY route that modifies tenant-level settings.
  - get_platform_admin is for /admin/* routes only.
"""
from __future__ import annotations

import logging
from typing import Annotated
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase import Client

from app.core.security import verify_supabase_jwt
from app.db.supabase import get_admin_client

logger = logging.getLogger(__name__)

_bearer = HTTPBearer(auto_error=True)


# ── Supabase client dependency ─────────────────────────────────────────────────

def _get_supabase() -> Client:
    """Inject the admin Supabase client as a FastAPI dependency."""
    return get_admin_client()


_SupabaseClient = Annotated[Client, Depends(_get_supabase)]


# ── 1. get_current_user_id ─────────────────────────────────────────────────────

async def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
) -> UUID:
    """
    Extract and validate the Bearer JWT from the Authorization header.

    Returns the ``sub`` claim as a UUID.
    Raises 401 on missing, expired, or malformed tokens.
    """
    try:
        payload = verify_supabase_jwt(credentials.credentials)
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError as exc:
        logger.debug("Invalid JWT: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    sub: str | None = payload.get("sub")
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing subject claim",
        )

    return UUID(sub)


# ── 2. get_client_id ───────────────────────────────────────────────────────────

async def get_client_id(
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    supabase: _SupabaseClient,
) -> UUID:
    """
    Derive the tenant ``client_id`` by looking up ``team_members`` in the DB.

    This is the PRIMARY tenant isolation mechanism.
    ``client_id`` is NEVER accepted from the request — always derived here.

    Raises 403 if the user is not an active member of any tenant.
    """
    result = (
        supabase.table("team_members")
        .select("client_id")
        .eq("user_id", str(user_id))
        .eq("is_active", True)
        .limit(1)
        .execute()
    )

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is not an active member of any tenant",
        )

    return UUID(result.data[0]["client_id"])


# ── 3. require_admin_role ──────────────────────────────────────────────────────

async def require_admin_role(
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    client_id: Annotated[UUID, Depends(get_client_id)],
    supabase: _SupabaseClient,
) -> dict:
    """
    Verify the authenticated user holds the ``admin`` role within their tenant.

    Returns the full ``team_members`` record on success.
    Raises 403 if the user's role is ``agent`` or ``viewer``.

    Use this for any route that modifies tenant-level configuration:
    agent setup, WhatsApp account management, billing, team management.
    """
    result = (
        supabase.table("team_members")
        .select("id, client_id, user_id, role, is_active")
        .eq("user_id", str(user_id))
        .eq("client_id", str(client_id))
        .eq("is_active", True)
        .single()
        .execute()
    )

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Team membership not found",
        )

    member: dict = result.data
    if member.get("role") not in ("admin", "owner"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Admin role required (current role: {member.get('role')})",
        )

    return member


# ── 4. get_platform_admin ──────────────────────────────────────────────────────

async def get_platform_admin(
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    supabase: _SupabaseClient,
) -> dict:
    """
    Verify the authenticated user is a platform-level super admin.

    Queries ``platform_users`` — a separate table from ``team_members``.
    Returns the platform_users record on success.
    Raises 403 if the user is not a super_admin.

    Use ONLY on /admin/* routes — never on tenant-scoped routes.
    """
    result = (
        supabase.table("platform_users")
        .select("id, user_id, role, is_active")
        .eq("user_id", str(user_id))
        .eq("role", "super_admin")
        .eq("is_active", True)
        .single()
        .execute()
    )

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Platform admin access required",
        )

    return result.data  # type: ignore[return-value]


# ── Annotated type aliases ─────────────────────────────────────────────────────
# Import these in router files — do not repeat the Depends() form.

CurrentUserId = Annotated[UUID, Depends(get_current_user_id)]
ClientId = Annotated[UUID, Depends(get_client_id)]
PlatformAdmin = Annotated[dict, Depends(get_platform_admin)]
