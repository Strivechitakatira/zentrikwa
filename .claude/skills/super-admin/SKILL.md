---
name: super-admin
description: Use when building the Super Admin portal for the Conva (ZentrikAI) platform. Trigger for "super admin", "platform admin", "admin portal", "tenant management", "plan management", "billing oversight", "all tenants", "/admin route", "platform users", or any task that touches the platform-owner view of all tenants. Do NOT confuse with tenant dashboard (use conva-frontend for that).
allowed-tools: Read, Grep, Glob, Bash, Write, Edit
---

## When to Apply

Use this skill for **any task that builds the platform-owner super admin portal** — the view that only you (the Conva operator) can access.

**Must use:** `backend/app/api/admin.py`, `frontend/app/admin/`, platform-level queries across all tenants, subscription plan management, billing oversight, system health.

**Skip:** Tenant dashboard features (use `conva-frontend`), FastAPI CRUD routes (use `fastapi-route`), DB migrations (use `db-schema-rls`).

**Critical:** Super admin routes must be protected by a separate auth check confirming the user is in `platform_users` — tenant JWT alone is not sufficient.

---

## Architecture

```
/admin (Next.js route group)
  └── Protected by: middleware → platform_users table check

FastAPI /api/admin/*
  └── Protected by: Depends(get_platform_admin)
      ├── Validates JWT (same Supabase Auth)
      └── Checks: SELECT 1 FROM platform_users WHERE user_id = $1

Data access: admin routes use SERVICE ROLE client
  └── Bypasses RLS — can read ALL tenant data
  └── NEVER expose service role key to frontend
```

---

## 1. Super Admin Auth Dependency (`backend/app/core/deps.py` addition)

```python
# Add to backend/app/core/deps.py

async def get_platform_admin(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict:
    """
    Validates JWT AND confirms the user is a platform admin.
    Use on ALL /api/admin/* routes — no exceptions.
    """
    # Step 1: validate JWT
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated",
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    # Step 2: confirm platform_users membership
    supabase = get_admin_client()  # service role — bypasses RLS
    result = await (
        supabase.table("platform_users")
        .select("id, role")
        .eq("user_id", user_id)
        .eq("is_active", True)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=403, detail="Platform admin access required")

    return {**payload, "platform_role": result.data["role"]}
```

---

## 2. FastAPI Admin Router (`backend/app/api/admin.py`)

```python
# backend/app/api/admin.py
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, status
from app.core.deps import get_platform_admin
from app.models.admin import (
    TenantListResponse, TenantDetailResponse,
    PlanListResponse, UpdateTenantPlanRequest,
    SystemHealthResponse,
)
from app.services import admin as admin_service

router = APIRouter(prefix="/admin", tags=["Super Admin"])

# Every route uses Depends(get_platform_admin) — never tenant deps


@router.get("/tenants", response_model=TenantListResponse)
async def list_tenants(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    search: str | None = Query(None),
    plan: str | None = Query(None),
    status: str | None = Query(None),
    _admin=Depends(get_platform_admin),
):
    return await admin_service.list_all_tenants(page, page_size, search, plan, status)


@router.get("/tenants/{client_id}", response_model=TenantDetailResponse)
async def get_tenant(client_id: UUID, _admin=Depends(get_platform_admin)):
    try:
        return await admin_service.get_tenant_detail(client_id)
    except LookupError:
        raise HTTPException(status_code=404, detail="Tenant not found")


@router.patch("/tenants/{client_id}/plan")
async def update_tenant_plan(
    client_id: UUID,
    body: UpdateTenantPlanRequest,
    _admin=Depends(get_platform_admin),
):
    await admin_service.change_tenant_plan(client_id, body.plan_id, body.reason)
    return {"status": "updated"}


@router.post("/tenants/{client_id}/suspend")
async def suspend_tenant(client_id: UUID, _admin=Depends(get_platform_admin)):
    await admin_service.set_tenant_status(client_id, "suspended")
    return {"status": "suspended"}


@router.post("/tenants/{client_id}/reactivate")
async def reactivate_tenant(client_id: UUID, _admin=Depends(get_platform_admin)):
    await admin_service.set_tenant_status(client_id, "active")
    return {"status": "active"}


@router.get("/plans", response_model=PlanListResponse)
async def list_plans(_admin=Depends(get_platform_admin)):
    return await admin_service.list_plans()


@router.get("/health", response_model=SystemHealthResponse)
async def system_health(_admin=Depends(get_platform_admin)):
    return await admin_service.get_system_health()


@router.get("/analytics/platform")
async def platform_analytics(
    days: int = Query(30, ge=1, le=365),
    _admin=Depends(get_platform_admin),
):
    return await admin_service.get_platform_analytics(days)
```

---

## 3. Admin Service Layer (`backend/app/services/admin.py`)

```python
# backend/app/services/admin.py
from uuid import UUID
from datetime import datetime, timezone, timedelta
from app.db.supabase import get_admin_client
from app.models.admin import TenantListResponse, TenantDetailResponse, TenantSummary


async def list_all_tenants(
    page: int,
    page_size: int,
    search: str | None,
    plan: str | None,
    status_filter: str | None,
) -> TenantListResponse:
    supabase = get_admin_client()

    query = (
        supabase.table("clients")
        .select("""
            id, business_name, owner_email, country, timezone, status,
            created_at,
            client_subscriptions(
              plan_id, status, trial_ends_at,
              subscription_plans(name, price_usd)
            )
        """, count="exact")
        .order("created_at", desc=True)
        .range((page - 1) * page_size, page * page_size - 1)
    )

    if search:
        query = query.ilike("business_name", f"%{search}%")
    if status_filter:
        query = query.eq("status", status_filter)

    result = await query.execute()
    items  = [TenantSummary.model_validate(row) for row in (result.data or [])]
    return TenantListResponse(items=items, total=result.count or 0, page=page, page_size=page_size)


async def get_tenant_detail(client_id: UUID) -> TenantDetailResponse:
    supabase = get_admin_client()

    client_result = await (
        supabase.table("clients")
        .select("*, client_subscriptions(*, subscription_plans(*))")
        .eq("id", str(client_id))
        .single()
        .execute()
    )
    if not client_result.data:
        raise LookupError(f"Client {client_id} not found")

    # Get usage stats
    thirty_days_ago = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()

    msg_count = await (
        supabase.table("messages")
        .select("id", count="exact")
        .eq("client_id", str(client_id))
        .gte("created_at", thirty_days_ago)
        .execute()
    )
    contact_count = await (
        supabase.table("contacts")
        .select("id", count="exact")
        .eq("client_id", str(client_id))
        .execute()
    )

    return TenantDetailResponse.model_validate({
        **client_result.data,
        "messages_last_30_days": msg_count.count or 0,
        "total_contacts": contact_count.count or 0,
    })


async def change_tenant_plan(client_id: UUID, plan_id: str, reason: str | None) -> None:
    supabase = get_admin_client()
    await (
        supabase.table("client_subscriptions")
        .update({"plan_id": plan_id, "updated_at": "now()"})
        .eq("client_id", str(client_id))
        .execute()
    )
    # Audit log
    await supabase.table("audit_logs").insert({
        "actor": "platform_admin",
        "action": "tenant.plan_changed",
        "resource_id": str(client_id),
        "meta": {"plan_id": plan_id, "reason": reason},
    }).execute()


async def set_tenant_status(client_id: UUID, new_status: str) -> None:
    supabase = get_admin_client()
    await (
        supabase.table("clients")
        .update({"status": new_status, "updated_at": "now()"})
        .eq("id", str(client_id))
        .execute()
    )
    await supabase.table("audit_logs").insert({
        "actor": "platform_admin",
        "action": f"tenant.{new_status}",
        "resource_id": str(client_id),
    }).execute()


async def get_system_health() -> dict:
    supabase = get_admin_client()
    now = datetime.now(timezone.utc)
    one_hour_ago = (now - timedelta(hours=1)).isoformat()

    total_clients  = await supabase.table("clients").select("id", count="exact").execute()
    active_clients = await supabase.table("clients").select("id", count="exact").eq("status", "active").execute()
    msgs_1h        = await supabase.table("messages").select("id", count="exact").gte("created_at", one_hour_ago).execute()

    return {
        "total_tenants":  total_clients.count or 0,
        "active_tenants": active_clients.count or 0,
        "messages_last_hour": msgs_1h.count or 0,
        "timestamp": now.isoformat(),
    }
```

---

## 4. Pydantic Models (`backend/app/models/admin.py`)

```python
from uuid import UUID
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


class TenantSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id:            UUID
    business_name: str
    owner_email:   str
    country:       Optional[str]
    status:        str
    plan_name:     Optional[str] = None
    created_at:    datetime


class TenantListResponse(BaseModel):
    items:     list[TenantSummary]
    total:     int
    page:      int
    page_size: int


class TenantDetailResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id:                    UUID
    business_name:         str
    owner_email:           str
    country:               Optional[str]
    timezone:              Optional[str]
    status:                str
    created_at:            datetime
    messages_last_30_days: int
    total_contacts:        int


class UpdateTenantPlanRequest(BaseModel):
    plan_id: str
    reason:  Optional[str] = None


class SystemHealthResponse(BaseModel):
    total_tenants:       int
    active_tenants:      int
    messages_last_hour:  int
    timestamp:           str
```

---

## 5. Frontend Admin Layout (`frontend/app/admin/layout.tsx`)

```typescript
// frontend/app/admin/layout.tsx
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getServerApiClient } from '@/lib/api/server-client';
import { AdminSidebar } from '@/components/admin/AdminSidebar';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Verify platform admin status via FastAPI
  const api = await getServerApiClient();
  const { error } = await api.GET('/api/admin/health');
  if (error) {
    // 403 = not a platform admin — redirect away
    redirect('/dashboard');
  }

  return (
    <div className="flex h-screen bg-slate-900">
      <AdminSidebar />
      <main className="flex-1 overflow-y-auto bg-slate-50 p-6">{children}</main>
    </div>
  );
}
```

---

## 6. Admin Tenants Page (`frontend/app/admin/tenants/page.tsx`)

```typescript
import { getServerApiClient } from '@/lib/api/server-client';
import { TenantsTable } from '@/components/admin/TenantsTable';

export default async function TenantsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; plan?: string }>;
}) {
  const params = await searchParams;
  const api = await getServerApiClient();

  const { data: tenants, error } = await api.GET('/api/admin/tenants', {
    params: {
      query: {
        page: params.page ? parseInt(params.page) : 1,
        page_size: 50,
        search: params.search,
        plan: params.plan,
      },
    },
  });

  if (error) {
    return <div className="rounded bg-red-50 p-4 text-sm text-red-700">Failed to load tenants.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Tenants</h1>
        <span className="text-sm text-gray-500">{tenants!.total} total</span>
      </div>
      <TenantsTable tenants={tenants!.items} total={tenants!.total} />
    </div>
  );
}
```

---

## 7. Middleware Update for `/admin`

Add `/admin` protection to `frontend/middleware.ts`:

```typescript
// In the middleware function — add admin check
if (request.nextUrl.pathname.startsWith('/admin')) {
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  // Further platform_users check happens in the layout via API call
}
```

---

## Security Rules

| Rule | Requirement |
|------|-------------|
| `get_platform_admin` dep | Required on EVERY `/api/admin/*` route — no exceptions |
| Service role client | Admin queries use `get_admin_client()` (service role) — bypasses RLS |
| No cross-contamination | Admin service must never leak tenant-specific data to wrong tenant |
| Audit log | Every destructive admin action (suspend, plan change) writes to `audit_logs` |
| Frontend guard | Admin layout calls `/api/admin/health` — 403 → redirects to `/dashboard` |
| Rate limiting | All admin endpoints: `30/minute` — admin is trusted but bots aren't |

---

## Pre-Delivery Checklist

- [ ] `Depends(get_platform_admin)` on every `/api/admin/*` route
- [ ] `get_platform_admin` checks `platform_users` table — tenant JWT alone is not enough
- [ ] All admin DB queries use service role client — explicit bypass of RLS
- [ ] Destructive actions (suspend, plan change) write to `audit_logs`
- [ ] Frontend `/admin` layout verifies platform admin via API call — not just Supabase session
- [ ] Middleware protects `/admin/:path*` routes
- [ ] `response_model` set on all admin routes for OpenAPI type generation
- [ ] Rate limiting applied to admin endpoints
- [ ] No tenant `client_id` isolation errors — admin sees all tenants intentionally
