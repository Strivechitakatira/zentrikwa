"""
DB query layer for the auth domain.

Rules:
- Every function receives explicit IDs — never infers context from session
- Returns typed dict | None or list[dict] — no raw Supabase objects
- No business logic — pure data access only
"""
from __future__ import annotations

import re
from uuid import UUID

from app.db.supabase import get_admin_client

_CLIENT_COLUMNS = "id, name, slug, plan, is_active, created_at, updated_at"
_MEMBER_COLUMNS = "id, client_id, user_id, role, is_active, joined_at, created_at"


async def client_slug_exists(slug: str) -> bool:
    supabase = get_admin_client()
    result = (
        supabase.table("clients")
        .select("id")
        .eq("slug", slug)
        .limit(1)
        .execute()
    )
    return len(result.data) > 0


async def create_client(name: str, slug: str) -> dict:
    supabase = get_admin_client()
    result = (
        supabase.table("clients")
        .insert({"name": name, "slug": slug})
        .select(_CLIENT_COLUMNS)
        .single()
        .execute()
    )
    return result.data


async def create_team_member(
    client_id: UUID, user_id: str, role: str = "owner"
) -> dict:
    supabase = get_admin_client()
    result = (
        supabase.table("team_members")
        .insert(
            {
                "client_id": str(client_id),
                "user_id": user_id,
                "role": role,
                "is_active": True,
                "joined_at": "now()",
            }
        )
        .select(_MEMBER_COLUMNS)
        .single()
        .execute()
    )
    return result.data


async def get_team_member_by_user(user_id: str) -> dict | None:
    supabase = get_admin_client()
    result = (
        supabase.table("team_members")
        .select(_MEMBER_COLUMNS)
        .eq("user_id", user_id)
        .eq("is_active", True)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None
