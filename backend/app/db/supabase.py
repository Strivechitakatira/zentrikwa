"""
Supabase client factory.

Two functions, both cached with ``@lru_cache``:

  get_client()        — anon key, respects RLS, for user-facing route operations
  get_admin_client()  — service role key, bypasses ALL RLS policies

Strict usage rules for get_admin_client():
  ✓ Celery tasks
  ✓ Cron jobs
  ✓ Webhook processing
  ✓ Tenant signup / onboarding setup
  ✗ NEVER in user-facing API route handlers
  ✗ NEVER exposed to the frontend in any form
"""
from __future__ import annotations

from functools import lru_cache

from supabase import Client, create_client


@lru_cache
def get_client() -> Client:
    """
    Return a Supabase client authenticated with the anon key.

    Respects all RLS policies — the database enforces tenant isolation
    automatically via the user's JWT context.

    Use this as the default client in route handlers that operate on behalf
    of the authenticated user.
    """
    from app.core.config import settings  # lazy to avoid circular imports at module load

    return create_client(
        supabase_url=settings.SUPABASE_URL,
        supabase_key=settings.SUPABASE_ANON_KEY,
    )


@lru_cache
def get_admin_client() -> Client:
    """
    Return a Supabase client authenticated with the service role key.

    Bypasses ALL RLS policies — tenant isolation must be enforced explicitly
    by always including ``client_id`` in every query filter.

    Allowed only in: Celery tasks, cron jobs, webhook handlers, onboarding flows.
    """
    from app.core.config import settings

    return create_client(
        supabase_url=settings.SUPABASE_URL,
        supabase_key=settings.SUPABASE_SERVICE_ROLE_KEY,
    )
