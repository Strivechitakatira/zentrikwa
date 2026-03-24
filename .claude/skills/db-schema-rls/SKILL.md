---
name: db-schema-rls
description: Use when creating or modifying Supabase Postgres schema, indexes, RLS policies, or RPC functions for the Conva (ZentrikAI) multi-tenant platform. Trigger for "add table", "new migration", "write RLS", "add index", "create RPC", or any supabase/migrations/ work.
allowed-tools: Read, Grep, Glob, Bash, Write, Edit
---

## When to Apply

Use for any change to `supabase/migrations/` in the ZentrikAI monorepo.

**Must use:** new tables, schema changes, RLS policy additions or changes, index additions, analytics RPC functions.

**Skip:** FastAPI routes (use `fastapi-route`), frontend components (use `conva-frontend`).

---

## Non-Negotiables

- RLS ON for every table — no exceptions
- `client_id` on every tenant table with `REFERENCES clients(id) ON DELETE CASCADE`
- Tenant isolation policy on every tenant table (template below)
- Every migration file has a timestamp prefix: `YYYYMMDDHHMMSS_<description>.sql`
- Never alter schema via Supabase dashboard without a migration file

---

## Tenant Isolation RLS Policy Template

Apply to **every** tenant-scoped table:

```sql
ALTER TABLE <table_name> ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON <table_name>
  USING (
    client_id = (
      SELECT client_id FROM team_members
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  );
```

---

## Required Tables for Conva

| Table | Purpose |
|-------|---------|
| `clients` | One row per tenant (company/business) |
| `team_members` | Maps `user_id` (Supabase Auth) → `client_id` |
| `agent_configs` | Per-tenant AI agent configuration |
| `agent_files` | 7 markdown files per tenant for prompt building |
| `whatsapp_accounts` | Per-tenant WhatsApp Business account credentials |
| `contacts` | WhatsApp contacts (per tenant) |
| `conversations` | One per contact per tenant |
| `messages` | All inbound/outbound messages |
| `knowledge_base` | Documents for pgvector retrieval |
| `flows` | Automation flow definitions |
| `flow_nodes` | Flow node configurations |
| `broadcasts` | Campaign message definitions |
| `broadcast_recipients` | Per-recipient status tracking |
| `payment_settings` | AES-encrypted payment provider credentials |
| `audit_logs` | Immutable audit trail |

---

## Column Standards

```sql
-- Primary key
id UUID PRIMARY KEY DEFAULT gen_random_uuid()

-- Tenant foreign key (every tenant table)
client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE

-- Timestamps (always with timezone)
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at TIMESTAMPTZ NOT NULL DEFAULT now()

-- Soft delete (prefer over hard delete)
deleted_at TIMESTAMPTZ

-- Money (always cents, never decimals)
price_cents INTEGER NOT NULL DEFAULT 0

-- Phone (E.164 format)
phone TEXT CHECK (phone ~ '^\+[1-9]\d{7,14}$')

-- Status (constrained TEXT, not enum — easier to migrate)
status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived'))

-- Message direction
direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound'))
```

---

## Required Indexes

Always add these for every tenant table:

```sql
-- Base tenant index
CREATE INDEX idx_<table>_client_id          ON <table> (client_id);

-- Paginated list queries
CREATE INDEX idx_<table>_client_created     ON <table> (client_id, created_at DESC);

-- Filtered list queries (add per status/type column)
CREATE INDEX idx_<table>_client_status      ON <table> (client_id, status);

-- Natural key uniqueness within tenant
CREATE UNIQUE INDEX idx_<table>_client_<key> ON <table> (client_id, <natural_key>);
```

---

## pgvector for Knowledge Base

```sql
-- Enable extension (once per project)
CREATE EXTENSION IF NOT EXISTS vector;

-- Knowledge base table
CREATE TABLE knowledge_base (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  content      TEXT NOT NULL,
  embedding    vector(1536),   -- OpenAI/Anthropic embedding dimension
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON knowledge_base
  USING (client_id = (SELECT client_id FROM team_members WHERE user_id = auth.uid() LIMIT 1));

-- IVFFlat index for similarity search
CREATE INDEX idx_knowledge_base_embedding ON knowledge_base
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

---

## Analytics RPC Pattern

```sql
CREATE OR REPLACE FUNCTION analytics_messages_7d(p_client_id UUID)
RETURNS TABLE (day DATE, inbound BIGINT, outbound BIGINT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    date_trunc('day', created_at AT TIME ZONE 'Africa/Harare')::DATE AS day,
    COUNT(*) FILTER (WHERE direction = 'inbound')                    AS inbound,
    COUNT(*) FILTER (WHERE direction = 'outbound')                   AS outbound
  FROM messages
  WHERE client_id = p_client_id
    AND created_at >= now() - INTERVAL '7 days'
    AND deleted_at IS NULL
  GROUP BY 1
  ORDER BY 1;
$$;
```

Rules:
- Always `SECURITY DEFINER SET search_path = public`
- Always take `p_client_id UUID` as first param — never from JWT inside RPC
- Timezone: use `Africa/Harare` for day bucketing

---

## Full Migration Template

```sql
-- supabase/migrations/20260324140000_add_<feature>.sql

-- ============================================================
-- Table
-- ============================================================
CREATE TABLE <name> (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- domain columns here
  name        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),

  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE <name> ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON <name>
  USING (
    client_id = (
      SELECT client_id FROM team_members
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  );

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX idx_<name>_client_id      ON <name> (client_id);
CREATE INDEX idx_<name>_client_created ON <name> (client_id, created_at DESC);
CREATE INDEX idx_<name>_client_status  ON <name> (client_id, status);
```

---

## Pre-Migration Checklist

- [ ] Filename has `YYYYMMDDHHMMSS` prefix
- [ ] Read existing migrations before writing — check for conflicts
- [ ] `client_id` column on every new tenant table
- [ ] `ENABLE ROW LEVEL SECURITY` statement present
- [ ] Tenant isolation RLS policy created
- [ ] Indexes on `client_id`, `created_at DESC`, status/type columns
- [ ] No `SELECT *` in any RPC function
- [ ] RPC functions use `SECURITY DEFINER SET search_path = public`
- [ ] Africa/Harare timezone used in date-bucketing RPCs
