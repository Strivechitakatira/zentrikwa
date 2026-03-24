from __future__ import annotations
from uuid import UUID
from app.db.supabase import get_admin_client

COLS = "id, client_id, conversation_id, contact_id, wa_message_id, direction, type, body, media_url, status, error_message, created_at"


async def insert_message(data: dict) -> dict:
    supabase = get_admin_client()
    result = (
        supabase.table("messages")
        .insert(data)
        .select(COLS)
        .execute()
    )
    return result.data[0]


async def get_by_wa_message_id(wa_message_id: str) -> dict | None:
    """Idempotency check — returns existing row if already processed."""
    supabase = get_admin_client()
    result = (
        supabase.table("messages")
        .select("id")
        .eq("wa_message_id", wa_message_id)
        .maybe_single()
        .execute()
    )
    return result.data


async def get_recent_messages(
    conversation_id: str,
    limit: int = 20,
) -> list[dict]:
    """Fetch last N messages for Claude context window (oldest first)."""
    supabase = get_admin_client()
    result = (
        supabase.table("messages")
        .select("id, direction, type, body, created_at")
        .eq("conversation_id", conversation_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    # Reverse so oldest is first (chronological for Claude)
    return list(reversed(result.data))


async def list_messages(
    conversation_id: str,
    page: int = 1,
    page_size: int = 50,
) -> tuple[list[dict], int]:
    supabase = get_admin_client()
    result = (
        supabase.table("messages")
        .select(COLS, count="exact")
        .eq("conversation_id", conversation_id)
        .order("created_at", desc=False)
        .range((page - 1) * page_size, page * page_size - 1)
        .execute()
    )
    return result.data, result.count or 0


async def update_message_status(
    message_id: str,
    status: str,
    wa_message_id: str | None = None,
    error_message: str | None = None,
) -> None:
    supabase = get_admin_client()
    data: dict = {"status": status}
    if wa_message_id:
        data["wa_message_id"] = wa_message_id
    if error_message:
        data["error_message"] = error_message
    (
        supabase.table("messages")
        .update(data)
        .eq("id", message_id)
        .execute()
    )


async def get_agent_config(client_id: str) -> dict:
    """Load AI agent config for this tenant."""
    supabase = get_admin_client()
    result = (
        supabase.table("agent_configs")
        .select("id, name, system_prompt, is_live, language")
        .eq("client_id", client_id)
        .maybe_single()
        .execute()
    )
    # Return defaults if no config exists yet
    if not result.data:
        return {
            "name": "AI Assistant",
            "system_prompt": "You are a helpful WhatsApp Business assistant. Be friendly, concise, and professional.",
            "is_live": True,
            "language": "en",
        }
    return result.data
