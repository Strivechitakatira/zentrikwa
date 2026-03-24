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

_jwks_cache: dict | None = None


def _get_supabase_public_keys() -> dict:
    """
    Fetch and cache public keys from Supabase JWKS endpoint.
    Returns a dict of {kid: public_key}.
    Cached in-process — restart clears cache (acceptable for key rotation).
    """
    global _jwks_cache
    if _jwks_cache is not None:
        return _jwks_cache

    import httpx
    import json
    from jwt.algorithms import ECAlgorithm, HMACAlgorithm
    from app.core.config import settings

    jwks_url = f"{settings.SUPABASE_URL}/auth/v1/.well-known/jwks.json"
    try:
        resp = httpx.get(jwks_url, timeout=10)
        resp.raise_for_status()
        keys: dict = {}
        for key in resp.json().get("keys", []):
            kid = key.get("kid", "default")
            alg = key.get("alg", "HS256")
            if alg == "ES256":
                keys[kid] = ECAlgorithm.from_jwk(json.dumps(key))
            elif alg == "HS256":
                keys[kid] = HMACAlgorithm.from_jwk(json.dumps(key))
        _jwks_cache = keys
        return keys
    except Exception as exc:
        logger.warning("Failed to fetch JWKS from Supabase, falling back to JWT_SECRET: %s", exc)
        return {}


def verify_supabase_jwt(token: str) -> dict:
    """
    Decode and validate a Supabase-issued JWT.

    Supports both ES256 (new Supabase projects) and HS256 (legacy).
    Fetches public keys from JWKS endpoint on first call, then caches.

    Returns the decoded payload dict on success.
    Raises ``jwt.ExpiredSignatureError`` or ``jwt.InvalidTokenError`` on failure.
    """
    import jwt  # PyJWT
    from app.core.config import settings

    # Try JWKS-based verification first (ES256 / newer Supabase projects)
    public_keys = _get_supabase_public_keys()
    if public_keys:
        # Get kid from token header to pick the right key
        header = jwt.get_unverified_header(token)
        kid = header.get("kid", "default")
        alg = header.get("alg", "ES256")

        key = public_keys.get(kid) or next(iter(public_keys.values()))
        return jwt.decode(
            token,
            key,
            algorithms=[alg],
            audience="authenticated",
        )

    # Fallback: HS256 with JWT_SECRET (older Supabase projects)
    return jwt.decode(
        token,
        settings.JWT_SECRET,
        algorithms=["HS256"],
        audience="authenticated",
    )
