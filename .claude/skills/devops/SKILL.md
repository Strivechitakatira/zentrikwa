---
name: devops
description: Use when configuring deployment infrastructure for the Conva (ZentrikAI) monorepo: Docker Compose for local dev, Vercel for Next.js frontend, Railway for FastAPI backend, Celery worker services, GitHub Actions CI, environment variables, health checks, or cron jobs.
allowed-tools: Read, Grep, Glob, Bash, Write, Edit
---

## When to Apply

Use for any infrastructure, deployment, or CI configuration in ZentrikAI.

**Must use:** `docker-compose.yml`, `backend/Dockerfile`, `railway.toml`, `frontend/vercel.json`, `.github/workflows/`, `backend/app/worker.py`, env var setup, cron route implementation.

**Skip:** FastAPI business logic (use `fastapi-route`), frontend components (use `conva-frontend`).

---

## Deployment Topology

| Service | Platform | Config File |
|---------|----------|-------------|
| Frontend (Next.js) | Vercel | `frontend/vercel.json` |
| Backend API (FastAPI) | Railway | `backend/railway.toml` |
| Celery Worker | Railway (2nd service) | Same repo, different start command |
| Redis | Upstash Redis | Env var: `REDIS_URL` |
| Database | Supabase | Env var: `SUPABASE_URL` |
| Async Queue | Upstash QStash | Env var: `QSTASH_TOKEN` |

---

## 1. Docker Compose (Local Dev Only)

```yaml
# docker-compose.yml (repo root)
version: "3.9"

services:
  api:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    env_file: ./backend/.env
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
    depends_on:
      redis:
        condition: service_healthy
    volumes:
      - ./backend:/app
    restart: unless-stopped

  worker:
    build:
      context: ./backend
      dockerfile: Dockerfile
    env_file: ./backend/.env
    command: celery -A app.worker worker --loglevel=info --concurrency=2
    depends_on:
      redis:
        condition: service_healthy
    volumes:
      - ./backend:/app
    restart: unless-stopped

  flower:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "5555:5555"
    env_file: ./backend/.env
    command: celery -A app.worker flower --port=5555
    depends_on: [worker]

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5
    restart: unless-stopped
```

> Supabase is cloud-hosted — no local Postgres in docker-compose.

---

## 2. Backend Dockerfile

```dockerfile
# backend/Dockerfile
FROM python:3.12-slim

# Security: run as non-root
RUN groupadd -r appuser && useradd -r -g appuser appuser

WORKDIR /app

# Install dependencies first (cache layer)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

# Gunicorn for production; uvicorn for dev
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
```

---

## 3. Railway Config

```toml
# backend/railway.toml
[build]
builder = "dockerfile"
dockerfilePath = "Dockerfile"

[deploy]
startCommand = "uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 2"
healthcheckPath = "/health"
healthcheckTimeout = 30
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3
```

Celery worker (Railway second service, same repo):
- Start command: `celery -A app.worker worker --loglevel=info --concurrency=4 --max-tasks-per-child=100`
- Root directory: `backend/`
- No exposed port needed

---

## 4. Vercel Config

```json
{
  "framework": "nextjs",
  "buildCommand": "pnpm build",
  "devCommand": "pnpm dev",
  "installCommand": "pnpm install --frozen-lockfile"
}
```

In Vercel project settings:
- Root directory: `frontend/`
- Node.js version: 20.x
- All env vars set in Vercel dashboard — nothing sensitive in `vercel.json`

---

## 5. GitHub Actions CI

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  backend:
    name: Backend (lint + type-check + test)
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
          cache: pip

      - name: Install dependencies
        run: pip install -r requirements.txt && pip install ruff mypy pytest pytest-asyncio

      - name: Lint (ruff)
        run: ruff check .

      - name: Type-check (mypy)
        run: mypy app/ --ignore-missing-imports --strict

      - name: Test
        run: pytest tests/ -v --tb=short
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          SUPABASE_JWT_SECRET: ${{ secrets.SUPABASE_JWT_SECRET }}
          REDIS_URL: redis://localhost:6379
          ENCRYPTION_SECRET: test-secret-min-32-chars-for-ci-use
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}

    services:
      redis:
        image: redis:7-alpine
        ports: ["6379:6379"]

  frontend:
    name: Frontend (type-check + lint + build)
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Type-check
        run: pnpm typecheck

      - name: Lint
        run: pnpm lint

      - name: Build
        run: pnpm build
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}
          NEXT_PUBLIC_API_URL: ${{ secrets.NEXT_PUBLIC_API_URL }}
          NEXT_PUBLIC_APP_URL: https://app.conva.ai
```

---

## 6. Celery Worker (`backend/app/worker.py`)

```python
from celery import Celery
from app.core.config import settings

celery_app = Celery(
    "conva",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=[
        "app.tasks.ai_respond",
        "app.tasks.broadcast_send",
        "app.tasks.follow_ups",
        "app.tasks.analytics_aggregate",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Africa/Harare",
    enable_utc=True,
    task_acks_late=True,            # Re-queue on worker crash before ack
    worker_prefetch_multiplier=1,   # Fair dispatch — one task per worker slot
    task_track_started=True,
    result_expires=3600,            # 1 hour TTL for results
    broker_transport_options={
        "visibility_timeout": 3600,  # Requeue if task not done in 1h
    },
)
```

---

## 7. Health Check

Always add to `backend/app/main.py`:

```python
@app.get("/health", tags=["Health"], include_in_schema=False)
async def health():
    return {"status": "ok", "service": "conva-api", "version": "1.0.0"}
```

---

## 8. Vercel Cron Jobs

```json
// frontend/vercel.json (add crons section)
{
  "crons": [
    { "path": "/api/cron/aggregate-analytics", "schedule": "0 * * * *" },
    { "path": "/api/cron/process-follow-ups",  "schedule": "*/5 * * * *" }
  ]
}
```

Cron route implementation:
```typescript
// frontend/app/api/cron/[job]/route.ts
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Call FastAPI backend to trigger job
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/internal/[job]`, {
    method: 'POST',
    headers: { 'X-Internal-Secret': process.env.INTERNAL_API_SECRET! },
  });

  return Response.json({ triggered: res.ok });
}
```

---

## 9. Environment Variable Inventory

### Backend `.env.example`
```bash
# Supabase
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_JWT_SECRET=

# Meta WhatsApp
META_APP_ID=
META_APP_SECRET=
META_WEBHOOK_VERIFY_TOKEN=
META_EMBEDDED_SIGNUP_CONFIG_ID=

# AI
ANTHROPIC_API_KEY=

# Queue
REDIS_URL=
UPSTASH_REDIS_URL=
UPSTASH_REDIS_TOKEN=
QSTASH_TOKEN=
QSTASH_CURRENT_SIGNING_KEY=
QSTASH_NEXT_SIGNING_KEY=

# Payments
PAYNOW_INTEGRATION_ID=
PAYNOW_INTEGRATION_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# Email
RESEND_API_KEY=

# Security
ENCRYPTION_SECRET=
INTERNAL_API_SECRET=
CRON_SECRET=
JWT_SECRET=

# App
APP_URL=
ALLOWED_ORIGINS=http://localhost:3000
```

### Frontend `.env.example`
```bash
# Supabase (public)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Payments (public)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# App
NEXT_PUBLIC_APP_URL=
NEXT_PUBLIC_API_URL=

# Server-only (no NEXT_PUBLIC_ prefix)
CRON_SECRET=
INTERNAL_API_SECRET=
```

---

## Pre-Deployment Checklist

- [ ] `backend/.env.example` updated when new backend env vars added
- [ ] `frontend/.env.example` updated when new frontend env vars added
- [ ] No `.env` files committed (verify `.gitignore`)
- [ ] Health check endpoint returns 200
- [ ] CI passes: lint + type-check + build for both services
- [ ] ALLOWED_ORIGINS set to production URL (not `["*"]`)
- [ ] Celery worker deployed as separate Railway service
- [ ] Flower (Celery monitoring) accessible only internally
- [ ] `ENCRYPTION_SECRET` ≥32 chars in production
