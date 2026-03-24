from __future__ import annotations
from uuid import UUID
from app.db.supabase import get_admin_client

COLS = "id, client_id, contact_id, contact_phone, status, unread_count, last_message_at, last_message, assigned_to, created_at, updated_at"
COLS_WITH_CONTACT = f"{COLS}, contacts(id, phone, name, email, tags, notes, is_blocked, created_at, updated_at)"


async def upsert_conversation(
    client_id: UUID,
    contact_id: UUID,
    contact_phone: str,
) -> dict:
    """
    Get or create a conversation for this contact.
    One conversation per contact per tenant.
    """
    supabase = get_admin_client()
    result = (
        supabase.table("conversations")
        .upsert(
            {
                "client_id": str(client_id),
                "contact_id": str(contact_id),
                "contact_phone": contact_phone,
            },
            on_conflict="client_id,contact_id",
            returning="representation",
        )
        .select(COLS)
        .execute()
    )
    return result.data[0]


async def get_conversation(conversation_id: str) -> dict | None:
    supabase = get_admin_client()
    result = (
        supabase.table("conversations")
        .select(COLS_WITH_CONTACT)
        .eq("id", conversation_id)
        .maybe_single()
        .execute()
    )
    return result.data


async def list_conversations(
    client_id: UUID,
    page: int = 1,
    page_size: int = 30,
    status: str | None = None,
) -> tuple[list[dict], int]:
    supabase = get_admin_client()
    query = (
        supabase.table("conversations")
        .select(COLS_WITH_CONTACT, count="exact")
        .eq("client_id", str(client_id))
        .order("last_message_at", desc=True, nullsfirst=False)
        .range((page - 1) * page_size, page * page_size - 1)
    )
    if status:
        query = query.eq("status", status)
    result = query.execute()
    return result.data, result.count or 0


async def update_conversation(
    client_id: UUID,
    conversation_id: UUID,
    data: dict,
) -> dict | None:
    supabase = get_admin_client()
    result = (
        supabase.table("conversations")
        .update({**data, "updated_at": "now()"})
        .eq("client_id", str(client_id))
        .eq("id", str(conversation_id))
        .select(COLS)
        .execute()
    )
    return result.data[0] if result.data else None


async def increment_unread(conversation_id: str) -> None:
    """Increment unread_count and update last_message_at."""
    supabase = get_admin_client()
    # Use RPC to atomically increment
    supabase.rpc(
        "increment_unread",
        {"conv_id": conversation_id},
    ).execute()


async def update_last_message(
    conversation_id: str,
    snippet: str | None,
) -> None:
    supabase = get_admin_client()
    (
        supabase.table("conversations")
        .update({
            "last_message_at": "now()",
            "last_message": (snippet or "")[:120],
            "updated_at": "now()",
        })
        .eq("id", conversation_id)
        .execute()
    )
