"""
DB query layer for WhatsApp account credentials.

Rules:
- client_id is always the first parameter
- access_token_enc is the only column that holds the encrypted token
- Never SELECT access_token_enc in public-facing queries
- Returns dict | None — no raw Supabase objects
"""
from __future__ import annotations

from uuid import UUID

from app.db.supabase import get_admin_client

# Columns safe to return to callers (no encrypted token)
_PUBLIC_COLUMNS = (
    "id, client_id, phone_number_id, waba_id, display_name, "
    "phone_number, is_active, verified_at, created_at, updated_at"
)

# Include encrypted token only for internal service use
_FULL_COLUMNS = _PUBLIC_COLUMNS + ", access_token_enc"


async def get_whatsapp_account(client_id: UUID) -> dict | None:
    """Return the tenant's WhatsApp account (without token)."""
    supabase = get_admin_client()
    result = (
        supabase.table("whatsapp_accounts")
        .select(_PUBLIC_COLUMNS)
        .eq("client_id", str(client_id))
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


async def get_whatsapp_account_with_token(client_id: UUID) -> dict | None:
    """Return the tenant's WhatsApp account including encrypted token (internal use only)."""
    supabase = get_admin_client()
    result = (
        supabase.table("whatsapp_accounts")
        .select(_FULL_COLUMNS)
        .eq("client_id", str(client_id))
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


async def get_whatsapp_account_by_phone_number_id(phone_number_id: str) -> dict | None:
    """Lookup by phone_number_id — used by the webhook handler to route incoming messages."""
    supabase = get_admin_client()
    result = (
        supabase.table("whatsapp_accounts")
        .select(_FULL_COLUMNS)
        .eq("phone_number_id", phone_number_id)
        .eq("is_active", True)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


async def upsert_whatsapp_account(client_id: UUID, data: dict) -> dict:
    """Create or replace the tenant's WhatsApp account (one per tenant)."""
    supabase = get_admin_client()
    result = (
        supabase.table("whatsapp_accounts")
        .upsert(
            {**data, "client_id": str(client_id), "updated_at": "now()"},
            on_conflict="client_id",
        )
        .select(_PUBLIC_COLUMNS)
        .single()
        .execute()
    )
    return result.data


async def delete_whatsapp_account(client_id: UUID) -> bool:
    """Remove the tenant's WhatsApp account (disconnect)."""
    supabase = get_admin_client()
    result = (
        supabase.table("whatsapp_accounts")
        .delete()
        .eq("client_id", str(client_id))
        .execute()
    )
    return len(result.data) > 0


async def mark_whatsapp_verified(client_id: UUID) -> None:
    """Stamp verified_at when webhook ownership is confirmed."""
    supabase = get_admin_client()
    supabase.table("whatsapp_accounts").update(
        {"verified_at": "now()", "updated_at": "now()"}
    ).eq("client_id", str(client_id)).execute()
