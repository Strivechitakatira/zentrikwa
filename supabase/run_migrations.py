"""
Migration runner for Supabase (remote project).

Usage:
  1. Add your Supabase direct DB URL to backend/.env:
       DATABASE_URL=postgresql+asyncpg://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres

  2. Run from the repo root:
       python supabase/run_migrations.py

  The runner applies migrations in filename order and skips already-applied ones.
"""
import asyncio
import os
import sys
from pathlib import Path

# Load backend .env
env_path = Path(__file__).parent.parent / "backend" / ".env"
if env_path.exists():
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip())

DATABASE_URL = os.environ.get("DATABASE_URL", "")

if not DATABASE_URL:
    print("ERROR: DATABASE_URL is not set in backend/.env")
    sys.exit(1)

# asyncpg expects postgresql:// not postgresql+asyncpg://
asyncpg_url = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")

MIGRATIONS_DIR = Path(__file__).parent / "migrations"


async def run() -> None:
    try:
        import asyncpg
    except ImportError:
        print("ERROR: asyncpg not installed. Run: pip install asyncpg")
        sys.exit(1)

    print(f"Connecting to: {asyncpg_url[:40]}...")

    conn = await asyncpg.connect(asyncpg_url)

    # Create migrations tracking table
    await conn.execute("""
        CREATE TABLE IF NOT EXISTS _migrations (
            id         SERIAL PRIMARY KEY,
            filename   TEXT NOT NULL UNIQUE,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)

    # Load applied migrations
    rows = await conn.fetch("SELECT filename FROM _migrations ORDER BY filename")
    applied = {row["filename"] for row in rows}

    # Apply pending migrations in order
    migration_files = sorted(MIGRATIONS_DIR.glob("*.sql"))
    if not migration_files:
        print("No migration files found in supabase/migrations/")
        await conn.close()
        return

    for mf in migration_files:
        if mf.name in applied:
            print(f"  skip  {mf.name}")
            continue

        print(f"  apply {mf.name} ... ", end="", flush=True)
        sql = mf.read_text(encoding="utf-8")
        try:
            await conn.execute(sql)
            await conn.execute(
                "INSERT INTO _migrations (filename) VALUES ($1)", mf.name
            )
            print("OK")
        except Exception as exc:
            print(f"FAILED\n       {exc}")
            await conn.close()
            sys.exit(1)

    await conn.close()
    print("\nAll migrations applied.")


if __name__ == "__main__":
    asyncio.run(run())
