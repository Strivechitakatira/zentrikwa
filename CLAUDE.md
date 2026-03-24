# CLAUDE.md — Conva (ZentrikAI)
> Multi-tenant WhatsApp Business AI SaaS · FastAPI + Next.js Monorepo

---

## Role
You are a Staff Engineer building a production-grade multi-tenant SaaS platform.
Backend: Python/FastAPI. Frontend: Next.js (TypeScript). Database: Supabase (Postgres + Auth + Storage + RLS).

---

## Stack (LOCKED)

| Layer            | Technology                                      |
|------------------|-------------------------------------------------|
| Backend          | Python 3.12+, FastAPI, Pydantic v2, asyncpg     |
| Frontend         | Next.js 15+ App Router, TypeScript, Tailwind    |
| Database         | Supabase (Postgres + Auth + Storage + RLS)      |
| AI               | Anthropic Claude API (`claude-sonnet-4-6`)      |
| WhatsApp         | Meta WhatsApp Cloud API v18.0                   |
| Background Jobs  | Celery + Redis (or ARQ)                         |
| Payments (ZW)    | Paynow + EcoCash + Innbucks                     |
| Payments (INT)   | Stripe                                          |
| Email            | Resend                                          |
| PDFs             | ReportLab (Python)                              |
| Queue            | Upstash Redis + QStash (WhatsApp webhook async) |
| Hosting          | Vercel (frontend) + Railway/Fly.io (backend)    |

---

## Monorepo Structure

```
zentrikAI/
├── backend/                  # FastAPI app
│   ├── app/
│   │   ├── api/              # Route handlers (routers)
│   │   │   ├── auth.py
│   │   │   ├── agent.py
│   │   │   ├── conversations.py
│   │   │   ├── leads.py
│   │   │   ├── campaigns.py
│   │   │   ├── contacts.py
│   │   │   ├── documents.py
│   │   │   ├── payments.py
│   │   │   ├── flows.py
│   │   │   ├── analytics.py
│   │   │   ├── team.py
│   │   │   ├── notifications.py
│   │   │   ├── webhooks.py   # Meta WhatsApp webhook
│   │   │   └── admin.py      # Super admin routes
│   │   ├── core/
│   │   │   ├── config.py     # Settings (pydantic-settings)
│   │   │   ├── security.py   # JWT + AES encryption
│   │   │   ├── deps.py       # FastAPI dependencies (get_current_user, etc.)
│   │   │   └── middleware.py # Tenant isolation, rate limiting
│   │   ├── db/
│   │   │   ├── supabase.py   # Supabase client (server + admin)
│   │   │   └── queries/      # Query layer per domain
│   │   ├── models/           # Pydantic request/response models
│   │   ├── services/         # Business logic layer
│   │   │   ├── ai/
│   │   │   │   ├── prompt_builder.py
│   │   │   │   └── responder.py
│   │   │   ├── whatsapp/
│   │   │   │   └── send.py
│   │   │   ├── flows/
│   │   │   │   ├── executor.py
│   │   │   │   └── templates.py
│   │   │   ├── documents/
│   │   │   │   └── pdf_generator.py
│   │   │   └── payments/
│   │   │       └── encryption.py
│   │   ├── tasks/            # Celery tasks (background jobs)
│   │   │   ├── ai_respond.py
│   │   │   ├── broadcast_send.py
│   │   │   ├── follow_ups.py
│   │   │   └── analytics_aggregate.py
│   │   └── main.py           # FastAPI app entry point
│   ├── tests/
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
├── frontend/                 # Next.js app
│   ├── app/
│   │   ├── (public)/         # Marketing + auth pages
│   │   └── dashboard/        # Tenant dashboard
│   ├── components/
│   ├── lib/
│   │   ├── api/              # Typed API client (calls FastAPI)
│   │   └── auth/             # Supabase Auth helpers
│   ├── types/                # TypeScript types (generated from FastAPI OpenAPI)
│   └── .env.example
├── supabase/
│   └── migrations/           # All SQL migrations (source of truth)
├── docker-compose.yml
└── .env.example
```

---

## Architecture Decisions (FINAL)

| Decision              | Choice                                                              |
|-----------------------|---------------------------------------------------------------------|
| Auth                  | Supabase Auth (JWT) — forwarded to FastAPI via `Authorization` header |
| Multi-tenancy         | Supabase RLS on all tables (`client_id` isolation)                  |
| Background jobs       | Celery + Redis for heavy tasks; QStash for WhatsApp webhook async   |
| Monorepo              | Yes — single repo, Vercel deploys `frontend/`, Railway deploys `backend/` |
| Type sharing          | Generate TypeScript types from FastAPI `/openapi.json` via `openapi-ts` |

---

## Non-Negotiables

### Security
- JWT from Supabase Auth validated in every FastAPI route via `deps.py`
- `client_id` extracted from JWT and injected into all DB queries — never trust client-provided `client_id`
- AES-256 encryption for all payment credentials (`ENCRYPTION_SECRET` env var)
- No `SUPABASE_SERVICE_ROLE_KEY` or `ANTHROPIC_API_KEY` ever in frontend code
- Rate limiting on all public-facing routes (WhatsApp webhook, auth endpoints)
- Webhook signature validation: `x-hub-signature-256` on every Meta webhook call

### WhatsApp Webhook
- `POST /api/webhooks/whatsapp` must respond **200 within 5 seconds**
- Save message to DB immediately → enqueue AI response to Celery/QStash → return 200
- Never call Claude API inline in the webhook handler

### Multi-Tenancy
- Every tenant table has `client_id UUID NOT NULL`
- RLS policy enforced at DB level — application layer is a secondary check only
- No cross-tenant data leakage ever

### Zimbabwe-Specific
- Timezone: `Africa/Harare` (CAT, UTC+2) — use `pytz` or `zoneinfo`
- Currency: stored in cents, displayed as ZiG/USD dual
- Phone numbers: E.164 format (`+263771234567`)

---

## Coding Standards

### Python (FastAPI)
- Python 3.12+, use `async def` for all route handlers and DB calls
- Pydantic v2 for all request/response models — no raw dicts in API boundaries
- Use `pydantic-settings` for config (`app/core/config.py`) — never `os.getenv()` scattered in code
- Dependency injection via FastAPI `Depends()` — `get_current_user`, `get_db`, `get_client_id`
- Services layer handles business logic — routers only parse/validate and call services
- No business logic in route handlers
- All DB queries in `app/db/queries/` — never inline SQL in routes or services
- Use `asyncpg` for direct queries when Supabase client is insufficient
- Type everything — no `Any` unless truly unavoidable
- Raise `HTTPException` with proper status codes — never return error strings as 200

### TypeScript (Next.js)
- Strict TypeScript — no `any`
- App Router with Server Components by default; Client Components only when needed (`"use client"`)
- All API calls go through `lib/api/` typed client — never `fetch` inline in components
- Tailwind for all styling — no CSS modules, no inline styles
- `react-hook-form` + `zod` for all forms

### General
- No demo/fake/hardcoded data anywhere
- When adding a feature: update Pydantic models, DB migration notes, API contracts, TypeScript types
- For security-sensitive routes: add rate limit + audit log entry
- Keep migrations in `supabase/migrations/` — never alter schema via Supabase dashboard without a migration file

---

## Output Expectations

When asked to "build X", produce:
1. File paths to create/change (both `backend/` and `frontend/` if applicable)
2. DB migration if schema changes
3. Pydantic models + FastAPI router + service layer
4. Frontend page/component + API client call
5. Security checks (auth dep, RLS, rate limit)

---

## Environment Variables

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=          # backend only

# Meta WhatsApp
META_APP_ID=
META_APP_SECRET=
META_WEBHOOK_VERIFY_TOKEN=
META_EMBEDDED_SIGNUP_CONFIG_ID=

# AI
ANTHROPIC_API_KEY=                  # backend only

# Queue
REDIS_URL=
UPSTASH_REDIS_URL=
UPSTASH_REDIS_TOKEN=
QSTASH_TOKEN=                       # backend only
QSTASH_CURRENT_SIGNING_KEY=
QSTASH_NEXT_SIGNING_KEY=

# Payments
PAYNOW_INTEGRATION_ID=
PAYNOW_INTEGRATION_KEY=
STRIPE_SECRET_KEY=                  # backend only
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=

# Email
RESEND_API_KEY=                     # backend only

# App
NEXT_PUBLIC_APP_URL=
NEXT_PUBLIC_API_URL=                # FastAPI base URL (used by frontend)
APP_NAME=Conva

# Security
ENCRYPTION_SECRET=                  # 32+ chars for AES key derivation
INTERNAL_API_SECRET=                # backend-to-backend calls
CRON_SECRET=                        # cron route auth
JWT_SECRET=                         # matches Supabase JWT secret
```

---

## Common Pitfalls

| Error                          | Fix                                                              |
|-------------------------------|------------------------------------------------------------------|
| 401 on all FastAPI routes      | Check JWT secret matches Supabase project JWT secret            |
| client_id wrong in queries     | Always extract from JWT via `deps.py` — never from request body |
| Webhook 5s timeout             | Move AI call to Celery task — never call Claude inline           |
| RLS denied                     | Check `client_id` in policy matches the JWT claim               |
| Celery task not running        | Check `REDIS_URL` env var + worker is started                   |
| CORS errors from frontend      | Add frontend origin to FastAPI `CORSMiddleware`                  |
| Type mismatch frontend/backend | Regenerate types: `pnpm openapi-ts` from FastAPI `/openapi.json` |

---

*Stack: FastAPI + Next.js 15 + Supabase + Claude AI + Meta WhatsApp | Updated: 2026-03-24*
