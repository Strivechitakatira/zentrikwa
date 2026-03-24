"""
Security utilities — three public functions + one JWT helper used by deps.py.

  verify_meta_signature()  — timing-safe HMAC-SHA256 webhook validation
  encrypt()                — AES-256-GCM encryption for WhatsApp access tokens
  decrypt()                — reverses encrypt()
  verify_supabase_jwt()    — decodes and validates a Supabase JWT (used by deps.py)
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

logger = logging.getLogger(__name__)

_NONCE_LEN = 12


# ── Webhook signature ──────────────────────────────────────────────────────────

def verify_meta_signature(
    payload: bytes,
    signature_header: str | None,
    app_secret: str,
) -> bool:
    """
    Validate Meta's ``x-hub-signature-256`` header.

    - Uses ``hmac.compare_digest`` — timing-safe, prevents length-extension attacks.
    - Returns ``False`` (never raises) if anything is wrong.
    - Strips the ``sha256=`` prefix before comparing.
    - Logs a warning on missing or malformed headers so ops can investigate.

    The caller must always return HTTP 200 to Meta regardless of this result.
    """
    if not signature_header:
        logger.warning("Missing x-hub-signature-256 header on webhook request")
        return False

    if not signature_header.startswith("sha256="):
        logger.warning(
            "Malformed webhook signature header (no sha256= prefix): %r",
            signature_header[:32],
        )
        return False

    try:
        expected = hmac.new(
            app_secret.encode("utf-8"),
            payload,
            hashlib.sha256,
        ).hexdigest()
        received = signature_header.removeprefix("sha256=")
        return hmac.compare_digest(expected, received)
    except Exception:
        logger.warning("Unexpected error during webhook signature verification")
        return False


# ── AES-256-GCM encryption ─────────────────────────────────────────────────────

def _derive_key() -> bytes:
    """
    Derive a 32-byte AES key from ``SECRET_KEY`` via SHA-256.

    Imported lazily to avoid circular imports at module load time.
    """
    from app.core.config import settings
    return hashlib.sha256(settings.SECRET_KEY.encode("utf-8")).digest()


def encrypt(plaintext: str) -> str:
    """
    Encrypt a string with AES-256-GCM.

    Key: SHA-256(SECRET_KEY) — consistent, no per-call KDF overhead.
    Nonce: 12 random bytes per call — unique ciphertext on every invocation.
    Output: base64(nonce[12] + ciphertext+tag)

    Intended for WhatsApp access tokens and similar credentials before DB storage.
    """
    key = _derive_key()
    nonce = os.urandom(_NONCE_LEN)
    aesgcm = AESGCM(key)
    ciphertext_with_tag = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)
    return base64.b64encode(nonce + ciphertext_with_tag).decode("utf-8")


def decrypt(encrypted: str) -> str:
    """
    Decrypt a string produced by ``encrypt()``.

    Raises ``ValueError`` on any failure (wrong key, tampered data, bad base64).
    Never logs the decrypted value.
    """
    try:
        raw = base64.b64decode(encrypted)
        nonce = raw[:_NONCE_LEN]
        ciphertext_with_tag = raw[_NONCE_LEN:]
        key = _derive_key()
        aesgcm = AESGCM(key)
        return aesgcm.decrypt(nonce, ciphertext_with_tag, None).decode("utf-8")
    except Exception as exc:
        raise ValueError("Decryption failed — data may be tampered or key has changed") from exc


# ── Supabase JWT validation (used by deps.py) ──────────────────────────────────

def verify_supabase_jwt(token: str) -> dict:
    """
    Decode and validate a Supabase-issued JWT.

    Returns the decoded payload dict on success.
    Raises ``jwt.ExpiredSignatureError`` or ``jwt.InvalidTokenError`` on failure
    — callers (deps.py) are responsible for converting to HTTPException.
    """
    import jwt  # PyJWT — imported here to keep module-level imports minimal

    from app.core.config import settings

    return jwt.decode(
        token,
        settings.JWT_SECRET,
        algorithms=[settings.JWT_ALGORITHM],
        audience="authenticated",
    )
