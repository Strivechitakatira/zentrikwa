-- ─────────────────────────────────────────────────────────────────────────────
-- Feature 2 & 3: Contacts, Conversations, Messages
-- ─────────────────────────────────────────────────────────────────────────────

-- ── contacts ──────────────────────────────────────────────────────────────────
CREATE TABLE contacts (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  phone        TEXT        NOT NULL,                         -- E.164 e.g. +263771234567
  name         TEXT,
  wa_id        TEXT,                                         -- WhatsApp contact ID
  email        TEXT,
  tags         TEXT[]      NOT NULL DEFAULT '{}',
  notes        TEXT,
  is_blocked   BOOLEAN     NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON contacts
  USING (client_id = (
    SELECT client_id FROM team_members WHERE user_id = auth.uid() LIMIT 1
  ));

CREATE UNIQUE INDEX idx_contacts_client_phone ON contacts (client_id, phone);
CREATE INDEX idx_contacts_client_id           ON contacts (client_id);
CREATE INDEX idx_contacts_created_at          ON contacts (client_id, created_at DESC);


-- ── conversations ─────────────────────────────────────────────────────────────
CREATE TABLE conversations (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  contact_id      UUID        NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  contact_phone   TEXT        NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'bot'
                              CHECK (status IN ('bot', 'open', 'closed')),
  -- bot   = AI is handling
  -- open  = needs human attention
  -- closed = resolved
  unread_count    INTEGER     NOT NULL DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  last_message    TEXT,                                      -- snippet for list view
  assigned_to     UUID,                                      -- team_members.user_id
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON conversations
  USING (client_id = (
    SELECT client_id FROM team_members WHERE user_id = auth.uid() LIMIT 1
  ));

CREATE UNIQUE INDEX idx_conversations_client_contact ON conversations (client_id, contact_id);
CREATE INDEX idx_conversations_client_status         ON conversations (client_id, status);
CREATE INDEX idx_conversations_last_message_at       ON conversations (client_id, last_message_at DESC);


-- ── messages ──────────────────────────────────────────────────────────────────
CREATE TABLE messages (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        UUID        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  conversation_id  UUID        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  contact_id       UUID        NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  wa_message_id    TEXT        UNIQUE,                       -- Meta message ID (idempotency)
  direction        TEXT        NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  type             TEXT        NOT NULL DEFAULT 'text'
                               CHECK (type IN ('text', 'image', 'audio', 'document', 'video', 'location', 'sticker')),
  body             TEXT,                                     -- NULL for media-only
  media_url        TEXT,
  status           TEXT        NOT NULL DEFAULT 'sent'
                               CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
  error_message    TEXT,
  metadata         JSONB       NOT NULL DEFAULT '{}',        -- raw WA payload extras
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON messages
  USING (client_id = (
    SELECT client_id FROM team_members WHERE user_id = auth.uid() LIMIT 1
  ));

CREATE INDEX idx_messages_conversation_id ON messages (conversation_id, created_at ASC);
CREATE INDEX idx_messages_client_id       ON messages (client_id, created_at DESC);
CREATE INDEX idx_messages_wa_message_id   ON messages (wa_message_id) WHERE wa_message_id IS NOT NULL;


-- ── agent_configs ─────────────────────────────────────────────────────────────
-- Simple AI agent settings per tenant (Feature 5 will expand this)
CREATE TABLE agent_configs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID        NOT NULL UNIQUE REFERENCES clients(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL DEFAULT 'AI Assistant',
  system_prompt TEXT        NOT NULL DEFAULT 'You are a helpful WhatsApp Business assistant. Be friendly, concise, and professional. Answer customer questions based on what you know about this business.',
  is_live       BOOLEAN     NOT NULL DEFAULT true,
  language      TEXT        NOT NULL DEFAULT 'en',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE agent_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON agent_configs
  USING (client_id = (
    SELECT client_id FROM team_members WHERE user_id = auth.uid() LIMIT 1
  ));

CREATE INDEX idx_agent_configs_client_id ON agent_configs (client_id);


-- ── auto-insert default agent_config on new client ───────────────────────────
CREATE OR REPLACE FUNCTION create_default_agent_config()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO agent_configs (client_id) VALUES (NEW.id)
  ON CONFLICT (client_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_default_agent_config
  AFTER INSERT ON clients
  FOR EACH ROW EXECUTE FUNCTION create_default_agent_config();
