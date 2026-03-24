from __future__ import annotations
from uuid import UUID
from app.db.supabase import get_admin_client

COLS = "id, client_id, phone, name, wa_id, email, tags, notes, is_blocked, created_at, updated_at"


async def upsert_contact_by_phone(
    client_id: UUID,
    phone: str,
    name: str | None = None,
    wa_id: str | None = None,
) -> dict:
    """
    Insert or update a contact by phone number.
    Returns the contact row. Used by the webhook processor.
    """
    supabase = get_admin_client()
    data: dict = {"client_id": str(client_id), "phone": phone}
    if name:
        data["name"] = name
    if wa_id:
        data["wa_id"] = wa_id

    result = (
        supabase.table("contacts")
        .upsert(data, on_conflict="client_id,phone", returning="representation")
        .select(COLS)
        .execute()
    )
    return result.data[0]


async def get_contact(client_id: UUID, contact_id: UUID) -> dict | None:
    supabase = get_admin_client()
    result = (
        supabase.table("contacts")
        .select(COLS)
        .eq("client_id", str(client_id))
        .eq("id", str(contact_id))
        .maybe_single()
        .execute()
    )
    return result.data


async def list_contacts(
    client_id: UUID,
    page: int = 1,
    page_size: int = 50,
    search: str | None = None,
) -> tuple[list[dict], int]:
    supabase = get_admin_client()
    query = (
        supabase.table("contacts")
        .select(COLS, count="exact")
        .eq("client_id", str(client_id))
        .order("created_at", desc=True)
        .range((page - 1) * page_size, page * page_size - 1)
    )
    if search:
        query = query.ilike("name", f"%{search}%")
    result = query.execute()
    return result.data, result.count or 0


async def get_contact_by_phone(client_id: UUID, phone: str) -> dict | None:
    supabase = get_admin_client()
    result = (
        supabase.table("contacts")
        .select(COLS)
        .eq("client_id", str(client_id))
        .eq("phone", phone)
        .maybe_single()
        .execute()
    )
    return result.data
