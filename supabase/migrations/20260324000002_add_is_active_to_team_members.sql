-- Migration: 20260324000002_add_is_active_to_team_members.sql
-- Adds is_active column required by deps.py get_client_id and require_admin_role.
-- Also fixes require_admin_role: 'owner' must be treated as admin-level.

-- ─── Add is_active column ──────────────────────────────────────────────────────
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_team_members_is_active ON team_members (user_id, is_active);
