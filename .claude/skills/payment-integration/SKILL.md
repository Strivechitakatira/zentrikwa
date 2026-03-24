---
name: payment-integration
description: Use when building payment gateway integration for Conva — Paynow, EcoCash, Innbucks (Zimbabwe), or Stripe (international). Trigger for "payment", "Paynow", "EcoCash", "Innbucks", "Stripe", "payment link", "payment credentials", "payment settings", "pay now", "collect payment", or any task in backend/app/services/payments/. Always use with payment credential encryption.
allowed-tools: Read, Grep, Glob, Bash, Write, Edit
---

## When to Apply

Use this skill for **any task involving payment collection, payment credential storage, or payment link generation** in ZentrikAI.

**Must use:** `backend/app/services/payments/`, `backend/app/api/payments.py`, payment settings encryption, Paynow IPN webhook, Stripe webhook, payment link sending via WhatsApp.

**Skip:** General CRUD routes (use `fastapi-route`), PDF invoices (use `pdf-documents`), full feature (use `conva-feature`).

---

## Architecture

```
Tenant configures credentials
  → AES-256 encrypted in payment_settings table

Customer selects product/invoice
  → Tenant requests payment link via dashboard
  → FastAPI creates payment with chosen gateway
  → Payment link sent to customer via WhatsApp

Customer pays
  → Gateway calls IPN/webhook callback
  → FastAPI validates + records payment
  → Invoice/order marked as paid
  → Notification sent to tenant
```

---

## 1. Credential Encryption (`backend/app/services/payments/encryption.py`)

Payment credentials (Paynow keys, Stripe keys) are **never stored in plaintext**.

```python
# backend/app/services/payments/encryption.py
import os
import base64
import hashlib
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

_KEY: bytes | None = None


def _get_key() -> bytes:
    global _KEY
    if _KEY is None:
        secret = os.environ["ENCRYPTION_SECRET"].encode("utf-8")
        _KEY = hashlib.sha256(secret).digest()  # 32-byte AES-256 key
    return _KEY


def encrypt(plaintext: str) -> str:
    """
    AES-256-GCM encrypt. Returns base64-encoded nonce+ciphertext.
    """
    key    = _get_key()
    nonce  = os.urandom(12)                  # 96-bit nonce (GCM standard)
    aesgcm = AESGCM(key)
    ct     = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)
    return base64.b64encode(nonce + ct).decode("utf-8")


def decrypt(ciphertext_b64: str) -> str:
    """
    AES-256-GCM decrypt. Raises ValueError if tampered.
    """
    key    = _get_key()
    data   = base64.b64decode(ciphertext_b64.encode("utf-8"))
    nonce  = data[:12]
    ct     = data[12:]
    aesgcm = AESGCM(key)
    try:
        pt = aesgcm.decrypt(nonce, ct, None)
        return pt.decode("utf-8")
    except Exception:
        raise ValueError("Decryption failed — ciphertext may be tampered")
```

---

## 2. Payment Settings Service (`backend/app/services/payments/settings.py`)

```python
# backend/app/services/payments/settings.py
from uuid import UUID
from app.db.queries.payments import get_payment_settings, upsert_payment_settings
from app.models.payments import PaymentSettingsRequest, PaymentSettingsResponse
from app.services.payments.encryption import encrypt, decrypt


async def save_payment_settings(client_id: UUID, data: PaymentSettingsRequest) -> None:
    """
    Encrypt sensitive fields before storing. Never write raw keys to DB.
    """
    row: dict = {"client_id": str(client_id)}

    if data.paynow_integration_id is not None:
        row["paynow_integration_id"] = data.paynow_integration_id  # not secret
    if data.paynow_integration_key is not None:
        row["paynow_integration_key_enc"] = encrypt(data.paynow_integration_key)

    if data.stripe_publishable_key is not None:
        row["stripe_publishable_key"] = data.stripe_publishable_key  # not secret
    if data.stripe_secret_key is not None:
        row["stripe_secret_key_enc"] = encrypt(data.stripe_secret_key)

    if data.ecocash_merchant_code is not None:
        row["ecocash_merchant_code"] = data.ecocash_merchant_code
    if data.ecocash_api_key is not None:
        row["ecocash_api_key_enc"] = encrypt(data.ecocash_api_key)

    await upsert_payment_settings(row)


async def load_payment_settings(client_id: UUID) -> PaymentSettingsResponse:
    """
    Return masked settings for display — never return raw secret keys.
    """
    row = await get_payment_settings(str(client_id))
    if not row:
        return PaymentSettingsResponse()

    return PaymentSettingsResponse(
        paynow_integration_id=row.get("paynow_integration_id"),
        paynow_configured=bool(row.get("paynow_integration_key_enc")),
        stripe_publishable_key=row.get("stripe_publishable_key"),
        stripe_configured=bool(row.get("stripe_secret_key_enc")),
        ecocash_merchant_code=row.get("ecocash_merchant_code"),
        ecocash_configured=bool(row.get("ecocash_api_key_enc")),
    )


async def get_decrypted_paynow_key(client_id: UUID) -> str:
    """Internal use only — loads and decrypts Paynow integration key."""
    row = await get_payment_settings(str(client_id))
    if not row or not row.get("paynow_integration_key_enc"):
        raise ValueError("Paynow not configured for this tenant")
    return decrypt(row["paynow_integration_key_enc"])


async def get_decrypted_stripe_key(client_id: UUID) -> str:
    """Internal use only — loads and decrypts Stripe secret key."""
    row = await get_payment_settings(str(client_id))
    if not row or not row.get("stripe_secret_key_enc"):
        raise ValueError("Stripe not configured for this tenant")
    return decrypt(row["stripe_secret_key_enc"])
```

---

## 3. Pydantic Models (`backend/app/models/payments.py`)

```python
from uuid import UUID
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict


class PaymentSettingsRequest(BaseModel):
    # Paynow (Zimbabwe)
    paynow_integration_id:  Optional[str] = None
    paynow_integration_key: Optional[str] = None  # will be encrypted

    # Stripe (international)
    stripe_publishable_key: Optional[str] = None
    stripe_secret_key:      Optional[str] = None  # will be encrypted

    # EcoCash (Zimbabwe mobile money)
    ecocash_merchant_code: Optional[str] = None
    ecocash_api_key:       Optional[str] = None   # will be encrypted


class PaymentSettingsResponse(BaseModel):
    """Never includes raw secret keys — only masks and public keys."""
    paynow_integration_id:  Optional[str] = None
    paynow_configured:      bool = False
    stripe_publishable_key: Optional[str] = None
    stripe_configured:      bool = False
    ecocash_merchant_code:  Optional[str] = None
    ecocash_configured:     bool = False


class CreatePaymentLinkRequest(BaseModel):
    gateway:    str = Field(..., pattern=r"^(paynow|stripe|ecocash)$")
    amount_cents: int = Field(..., ge=1)
    currency:   str = Field(..., pattern=r"^(USD|ZIG)$")
    reference:  str = Field(..., min_length=1, max_length=100)
    contact_id: UUID
    description: Optional[str] = Field(None, max_length=500)


class PaymentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:           UUID
    gateway:      str
    amount_cents: int
    currency:     str
    status:       str
    reference:    str
    payment_url:  Optional[str]
    created_at:   datetime
```

---

## 4. Paynow Integration (`backend/app/services/payments/paynow.py`)

```python
# backend/app/services/payments/paynow.py
import httpx
import hashlib
import logging
from uuid import UUID
from urllib.parse import urlencode
from app.core.config import settings
from app.services.payments.settings import get_decrypted_paynow_key
from app.db.queries.payments import get_payment_settings

logger = logging.getLogger(__name__)

PAYNOW_INITIATE_URL = "https://www.paynow.co.zw/interface/initiatetransaction"


async def create_paynow_payment_link(
    client_id: UUID,
    amount_cents: int,
    currency: str,
    reference: str,
    contact_email: str,
    description: str,
) -> str:
    """
    Initiate a Paynow transaction. Returns the redirect URL for the customer.
    """
    settings_row = await get_payment_settings(str(client_id))
    if not settings_row or not settings_row.get("paynow_integration_id"):
        raise ValueError("Paynow not configured")

    integration_id  = settings_row["paynow_integration_id"]
    integration_key = await get_decrypted_paynow_key(client_id)

    amount_usd = amount_cents / 100  # Paynow uses decimal amounts

    return_url  = f"{settings.APP_URL}/dashboard/business/payments"
    result_url  = f"{settings.APP_URL}/api/payments/paynow-callback"

    params = {
        "id":          integration_id,
        "reference":   reference,
        "amount":      f"{amount_usd:.2f}",
        "additionalinfo": description or reference,
        "returnurl":   return_url,
        "resulturl":   result_url,
        "authemail":   contact_email,
        "status":      "Message",
    }

    # Build hash: all values + integration key, SHA512
    hash_str = "".join(str(v) for v in params.values()) + integration_key
    params["hash"] = hashlib.sha512(hash_str.encode("utf-8")).hexdigest().upper()

    async with httpx.AsyncClient(timeout=15.0) as http:
        resp = await http.post(PAYNOW_INITIATE_URL, data=params)
        resp.raise_for_status()

    result = dict(pair.split("=", 1) for pair in resp.text.split("&") if "=" in pair)

    if result.get("status", "").lower() != "ok":
        raise ValueError(f"Paynow initiation failed: {result.get('error', 'unknown')}")

    return result["browserurl"]


def verify_paynow_ipn(params: dict, integration_key: str) -> bool:
    """
    Validate Paynow IPN callback. Hash = all values except hash field + key.
    """
    received_hash = params.pop("hash", "").upper()
    hash_str = "".join(str(v) for v in params.values()) + integration_key
    expected = hashlib.sha512(hash_str.encode("utf-8")).hexdigest().upper()
    return received_hash == expected
```

---

## 5. Stripe Integration (`backend/app/services/payments/stripe.py`)

```python
# backend/app/services/payments/stripe.py
import stripe
from uuid import UUID
from app.core.config import settings
from app.services.payments.settings import get_decrypted_stripe_key

logger = __import__("logging").getLogger(__name__)


async def create_stripe_payment_link(
    client_id: UUID,
    amount_cents: int,
    currency: str,
    description: str,
    contact_email: str,
    reference: str,
) -> str:
    secret_key = await get_decrypted_stripe_key(client_id)
    stripe.api_key = secret_key

    session = stripe.checkout.Session.create(
        payment_method_types=["card"],
        line_items=[{
            "price_data": {
                "currency": currency.lower(),
                "product_data": {"name": description},
                "unit_amount": amount_cents,
            },
            "quantity": 1,
        }],
        mode="payment",
        success_url=f"{settings.APP_URL}/dashboard/business/payments?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{settings.APP_URL}/dashboard/business/payments",
        customer_email=contact_email or None,
        metadata={"reference": reference, "client_id": str(client_id)},
    )
    return session.url


async def verify_stripe_webhook(payload: bytes, sig_header: str) -> dict:
    """
    Verify Stripe webhook signature. Raises ValueError if invalid.
    """
    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, settings.STRIPE_WEBHOOK_SECRET,
        )
        return event
    except stripe.error.SignatureVerificationError as e:
        raise ValueError(f"Stripe webhook signature invalid: {e}")
```

---

## 6. Webhook Handlers (`backend/app/api/payments.py` — webhook routes)

```python
from fastapi import APIRouter, Request, Depends, HTTPException, status
from app.core.deps import get_current_user, get_client_id
from app.services.payments.paynow import verify_paynow_ipn
from app.services.payments.stripe import verify_stripe_webhook
from app.services.payments.settings import get_decrypted_paynow_key
from app.db.queries.payments import record_payment, get_payment_settings
from app.core.config import settings
import logging

router = APIRouter(prefix="/payments", tags=["Payments"])
logger = logging.getLogger(__name__)


@router.post("/paynow-callback")
async def paynow_callback(request: Request):
    """
    Paynow IPN. MUST return 200 even on fraud — log to stderr, never raise 4xx.
    Paynow retries on non-200 responses.
    """
    form   = await request.form()
    params = dict(form)

    # Identify which tenant this is for via the reference
    reference = params.get("reference", "")
    # reference format: "{client_id}-{internal_ref}"
    parts = reference.split("-", 1)
    if len(parts) < 2:
        logger.warning(f"Paynow IPN: unrecognisable reference {reference}")
        return {"status": "ok"}  # ACK regardless

    client_id_str = parts[0]

    try:
        settings_row = await get_payment_settings(client_id_str)
        integration_key = await get_decrypted_paynow_key(__import__("uuid").UUID(client_id_str))
        valid = verify_paynow_ipn(dict(params), integration_key)
    except Exception as e:
        logger.error(f"Paynow IPN validation error: {e}")
        return {"status": "ok"}  # Return 200 even on error

    if not valid:
        logger.warning(f"Paynow IPN: invalid hash for reference {reference}")
        return {"status": "ok"}

    # Record payment
    paid = params.get("status", "").lower() == "paid"
    if paid:
        await record_payment({
            "client_id": client_id_str,
            "gateway": "paynow",
            "reference": reference,
            "amount_cents": int(float(params.get("amount", "0")) * 100),
            "currency": "USD",
            "status": "paid",
            "gateway_reference": params.get("paynowreference", ""),
        })

    return {"status": "ok"}


@router.post("/stripe-webhook")
async def stripe_webhook(request: Request):
    payload    = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    try:
        event = await verify_stripe_webhook(payload, sig_header)
    except ValueError as e:
        logger.warning(f"Stripe webhook invalid: {e}")
        raise HTTPException(status_code=400, detail="Invalid signature")

    if event["type"] == "checkout.session.completed":
        session   = event["data"]["object"]
        client_id = session["metadata"].get("client_id")
        reference = session["metadata"].get("reference")
        if client_id and reference:
            await record_payment({
                "client_id": client_id,
                "gateway": "stripe",
                "reference": reference,
                "amount_cents": session["amount_total"],
                "currency": session["currency"].upper(),
                "status": "paid",
                "gateway_reference": session["id"],
            })

    return {"status": "ok"}
```

---

## 7. Security Rules

| Rule | Requirement |
|------|-------------|
| Credentials at rest | AES-256-GCM encrypted — never plaintext in DB |
| Credentials in API response | Only masks returned (`paynow_configured: true`) — raw keys never in response |
| Stripe webhook | Signature verification via `stripe.Webhook.construct_event` |
| Paynow IPN | Hash verification via SHA-512 — return 200 on all paths |
| `ENCRYPTION_SECRET` | 32+ random chars, backend-only env var — never in frontend |
| Audit logging | Write entry to `audit_logs` on every credential save |
| Rate limiting | `POST /payments/create-link`: 10/minute |

---

## 8. DB Schema Notes

```sql
-- payment_settings: one row per tenant
CREATE TABLE payment_settings (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id                UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE UNIQUE,
  paynow_integration_id    TEXT,
  paynow_integration_key_enc TEXT,  -- AES-256-GCM encrypted
  stripe_publishable_key   TEXT,
  stripe_secret_key_enc    TEXT,    -- AES-256-GCM encrypted
  ecocash_merchant_code    TEXT,
  ecocash_api_key_enc      TEXT,    -- AES-256-GCM encrypted
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- payments: one row per transaction
CREATE TABLE payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  gateway           TEXT NOT NULL,   -- paynow | stripe | ecocash
  reference         TEXT NOT NULL,
  gateway_reference TEXT,
  amount_cents      INTEGER NOT NULL,
  currency          TEXT NOT NULL DEFAULT 'USD',
  status            TEXT NOT NULL DEFAULT 'pending',  -- pending | paid | failed | refunded
  contact_id        UUID REFERENCES contacts(id),
  invoice_id        UUID REFERENCES invoices(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## Pre-Delivery Checklist

- [ ] Paynow/EcoCash/Stripe secret keys encrypted with AES-256-GCM before DB insert
- [ ] `PaymentSettingsResponse` returns masks only — raw keys never leave the backend
- [ ] Paynow IPN handler returns 200 on ALL code paths — never 4xx
- [ ] Paynow hash verified with `hmac`-style SHA-512 comparison
- [ ] Stripe webhook verified with `stripe.Webhook.construct_event`
- [ ] `ENCRYPTION_SECRET` from env via `settings` — never `os.getenv()` inline
- [ ] Audit log written on every credential save
- [ ] Rate limit applied to payment link creation endpoint
- [ ] `stripe` added to `requirements.txt`
- [ ] `cryptography` added to `requirements.txt`
