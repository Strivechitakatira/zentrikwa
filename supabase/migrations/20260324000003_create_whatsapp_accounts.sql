-- Migration: 20260324000003_create_whatsapp_accounts.sql
-- Stores Meta WhatsApp Business account credentials per tenant.
-- access_token is AES-256-GCM encrypted before storage (never stored plaintext).

CREATE TABLE whatsapp_accounts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Meta identifiers
  phone_number_id   TEXT NOT NULL,
  waba_id           TEXT NOT NULL,
  display_name      TEXT,
  phone_number      TEXT,

  -- Encrypted credential (AES-256-GCM via backend/app/core/security.py)
  access_token_enc  TEXT NOT NULL,

  -- Status
  is_active         BOOLEAN NOT NULL DEFAULT true,
  verified_at       TIMESTAMPTZ,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One active WhatsApp account per tenant
  UNIQUE (client_id)
);

ALTER TABLE whatsapp_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON whatsapp_accounts
  USING (
    client_id = (
      SELECT client_id FROM team_members
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  );

CREATE INDEX idx_whatsapp_accounts_client_id ON whatsapp_accounts (client_id);
CREATE INDEX idx_whatsapp_accounts_phone_number_id ON whatsapp_accounts (phone_number_id);
