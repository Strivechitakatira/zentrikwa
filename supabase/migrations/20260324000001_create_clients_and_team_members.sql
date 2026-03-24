-- Migration: 20260324000001_create_clients_and_team_members.sql
-- Foundation tables for multi-tenancy.
-- Every tenant table will reference clients(id).

-- ─── clients: one row per tenant ──────────────────────────────────────────────
CREATE TABLE clients (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  plan          TEXT NOT NULL DEFAULT 'starter' CHECK (plan IN ('starter', 'growth', 'enterprise')),
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── team_members: maps Supabase Auth users → tenant ─────────────────────────
-- This is the authoritative source of client_id for a given user.
-- get_client_id() in deps.py queries this table.
CREATE TABLE team_members (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL,                    -- Supabase Auth user UUID
  role          TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  invited_by    UUID REFERENCES team_members(id),
  joined_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, user_id)
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX idx_team_members_user_id   ON team_members (user_id);
CREATE INDEX idx_team_members_client_id ON team_members (client_id);

-- ─── RLS ──────────────────────────────────────────────────────────────────────
-- clients: team members can read their own tenant's row
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clients_read_own" ON clients
  FOR SELECT
  USING (
    id = (SELECT client_id FROM team_members WHERE user_id = auth.uid() LIMIT 1)
  );

-- team_members: tenant isolation
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team_members_tenant_isolation" ON team_members
  USING (
    client_id = (SELECT client_id FROM team_members WHERE user_id = auth.uid() LIMIT 1)
  );
