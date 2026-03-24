---
name: security
description: Use when implementing security controls for the Conva (ZentrikAI) platform: JWT validation, multi-tenant RLS verification, webhook signature validation, AES-256 encryption for payment credentials, rate limiting, audit logging, and CORS/CSP headers. Trigger for "add security", "rate limit", "audit log", "encrypt credentials", "validate signature", or pre-ship security review.
allowed-tools: Read, Grep, Glob, Bash, Write, Edit
---

## When to Apply

Use for any security control implementation in the ZentrikAI monorepo.

**Must use:** JWT deps, rate limiting middleware, webhook signature validation, payment credential encryption, audit logging, CORS config, security headers.

**Skip:** Schema design (use `db-schema-rls`), general FastAPI patterns (use `fastapi-route`).

---

## 1. JWT Validation (`backend/app/core/deps.py`)

```python
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
from app.core.config import settings
from app.db.supabase import get_admin_client

bearer_scheme = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict:
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated",
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


async def get_client_id(user: dict = Depends(get_current_user)) -> UUID:
    """Extract client_id from DB — never trust JWT claims for client_id."""
    user_id = user.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    supabase = get_admin_client()
    result = await (
        supabase.table("team_members")
        .select("client_id")
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=403, detail="No tenant access")

    return UUID(result.data["client_id"])
```

---

## 2. Webhook Signature Validation (`backend/app/core/security.py`)

```python
import hmac
import hashlib


def verify_meta_signature(payload: bytes, signature: str, app_secret: str) -> bool:
    """
    Validate Meta's x-hub-signature-256 header.
    Uses hmac.compare_digest for timing-safe comparison.
    """
    if not signature.startswith("sha256="):
        return False
    expected = "sha256=" + hmac.new(
        app_secret.encode("utf-8"),
        payload,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)  # Timing-safe — never use ==
```

**Rules:**
- Always use `hmac.compare_digest` — never `==` (prevents timing attacks)
- Read raw body bytes BEFORE parsing JSON
- Return 200 on invalid signature (Meta retries on non-200, causing infinite loops)

---

## 3. AES-256 Encryption for Payment Credentials

```python
# backend/app/core/security.py
import base64
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
import os
from app.core.config import settings


def _derive_key(salt: bytes) -> bytes:
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=100_000,
    )
    return kdf.derive(settings.ENCRYPTION_SECRET.encode())


def encrypt_credential(plaintext: str) -> str:
    """Returns base64-encoded salt + nonce + ciphertext."""
    salt = os.urandom(16)
    key = _derive_key(salt)
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode(), None)
    return base64.b64encode(salt + nonce + ciphertext).decode()


def decrypt_credential(encrypted: str) -> str:
    data = base64.b64decode(encrypted)
    salt, nonce, ciphertext = data[:16], data[16:28], data[28:]
    key = _derive_key(salt)
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(nonce, ciphertext, None).decode()
```

**Rules:**
- `ENCRYPTION_SECRET` must be ≥32 characters
- Never log encrypted or decrypted credentials
- Never return encrypted fields in API Response models

---

## 4. Rate Limiting (`backend/app/core/middleware.py`)

```python
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi import Request, Response
from fastapi.responses import JSONResponse

limiter = Limiter(key_func=get_remote_address)


def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> Response:
    return JSONResponse(
        status_code=429,
        content={"detail": "Rate limit exceeded. Try again later."},
    )
```

Apply per route:
```python
from app.core.middleware import limiter

# Auth endpoints
@router.post("/login")
@limiter.limit("5/minute")
async def login(request: Request, ...): ...

# Public-facing endpoints
@router.post("/webhook")
@limiter.limit("100/minute")
async def webhook(request: Request, ...): ...

# Bulk operations
@router.post("/contacts/import")
@limiter.limit("3/minute")
async def import_contacts(request: Request, ...): ...
```

---

## 5. Audit Logging

Write to `audit_logs` table for any sensitive mutation:

```python
# backend/app/db/queries/audit.py
from uuid import UUID
from app.db.supabase import get_admin_client


async def write_audit_log(
    client_id: UUID,
    user_id: str,
    action: str,          # e.g., "payment_settings.updated", "team_member.removed"
    resource_id: str,
    meta: dict | None = None,
) -> None:
    supabase = get_admin_client()
    await supabase.table("audit_logs").insert({
        "client_id": str(client_id),
        "user_id": user_id,
        "action": action,
        "resource_id": resource_id,
        "meta": meta or {},
    }).execute()
```

**Required for:**
- Any mutation on `payment_settings`
- Any mutation on `team_members` (invite, remove, role change)
- Any mutation on `agent_configs`
- Any admin-scoped action

---

## 6. CORS Configuration (`backend/app/main.py`)

```python
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,  # Explicit allowlist — never ["*"] in prod
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
)
```

`settings.ALLOWED_ORIGINS` in production:
```python
ALLOWED_ORIGINS: list[str] = ["https://app.conva.ai"]
```

---

## 7. Security Headers (Next.js Middleware)

```typescript
// frontend/middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set(
    'Strict-Transport-Security',
    'max-age=63072000; includeSubDomains; preload',
  );
  response.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",   // Next.js requires unsafe-inline
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self'",
      `connect-src 'self' ${process.env.NEXT_PUBLIC_SUPABASE_URL} ${process.env.NEXT_PUBLIC_API_URL}`,
      "frame-ancestors 'none'",
    ].join('; '),
  );

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

---

## 8. Pre-Ship Security Checklist

### Backend
- [ ] Every authenticated route has `Depends(get_current_user)` + `Depends(get_client_id)`
- [ ] `client_id` never accepted from request body/query — only from JWT dep
- [ ] `hmac.compare_digest` used for webhook signature (not `==`)
- [ ] Payment credentials encrypted before insert, never returned in responses
- [ ] Rate limits applied: 5/min auth, 100/min webhook, 3/min bulk ops
- [ ] Sensitive mutations have audit log entry
- [ ] `CORS ALLOWED_ORIGINS` is explicit list — not `["*"]`
- [ ] No `os.getenv()` — all config from `settings`

### Database
- [ ] RLS enabled on every table
- [ ] Tenant isolation policy on every tenant table
- [ ] No `SELECT *` in RPC functions
- [ ] RPC functions use `SECURITY DEFINER SET search_path = public`

### Frontend
- [ ] Security headers set in middleware
- [ ] No `NEXT_PUBLIC_` prefix on secrets
- [ ] No `dangerouslySetInnerHTML` without sanitization
- [ ] `SUPABASE_SERVICE_ROLE_KEY` not in any frontend env var
