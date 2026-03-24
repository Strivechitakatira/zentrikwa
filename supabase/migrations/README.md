# Supabase Migrations

All schema changes live here. Never alter the database via the Supabase dashboard
without creating a migration file first.

## Naming convention
```
<YYYYMMDDHHMMSS>_<description>.sql
```
Example: `20260324120000_create_clients_and_team_members.sql`

## Running migrations
```bash
supabase db push          # apply pending migrations
supabase db reset         # reset local DB and re-apply all migrations
```

## Order of first migrations
1. `create_extensions.sql`     — enable `uuid-ossp`, `vector`
2. `create_clients.sql`        — `clients` table (tenant root)
3. `create_team_members.sql`   — `team_members` (user → client mapping)
4. `create_agent_configs.sql`  — AI agent configuration per tenant
5. `create_contacts.sql`       — WhatsApp contacts
6. `create_conversations.sql`  — conversations + messages
7. `create_flows.sql`          — automation flows
8. `create_knowledge_base.sql` — pgvector knowledge base
9. `create_payments.sql`       — payment settings (AES-encrypted)
10. `create_audit_logs.sql`    — immutable audit trail
