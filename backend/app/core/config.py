from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── Required — app crashes with a clear error if any are missing ────────────

    SECRET_KEY: str
    DATABASE_URL: str                   # must start with postgresql+asyncpg://
    SUPABASE_URL: str
    SUPABASE_ANON_KEY: str
    SUPABASE_SERVICE_ROLE_KEY: str
    JWT_SECRET: str                     # must match Supabase project JWT secret
    REDIS_URL: str
    CELERY_BROKER_URL: str
    CELERY_RESULT_BACKEND: str
    ANTHROPIC_API_KEY: str
    META_APP_ID: str
    META_APP_SECRET: str
    META_WEBHOOK_VERIFY_TOKEN: str
    META_EMBEDDED_SIGNUP_CONFIG_ID: str = ""  # From Meta App → WhatsApp → Embedded Signup

    # ── Optional — sensible defaults ────────────────────────────────────────────

    APP_NAME: str = "Zentrikai"
    DEBUG: bool = False
    ENVIRONMENT: Literal["development", "staging", "production"] = "development"
    JWT_ALGORITHM: str = "HS256"
    FRONTEND_URL: str = "http://localhost:3000"
    ALLOWED_ORIGINS: list[str] = ["http://localhost:3000"]

    # Payments (empty string = not configured)
    PAYNOW_INTEGRATION_ID: str = ""
    PAYNOW_INTEGRATION_KEY: str = ""
    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""

    # Email
    RESEND_API_KEY: str = ""

    # ── Field validators ────────────────────────────────────────────────────────

    @field_validator("DATABASE_URL")
    @classmethod
    def database_url_must_use_asyncpg(cls, v: str) -> str:
        if not v.startswith("postgresql+asyncpg://"):
            raise ValueError(
                "DATABASE_URL must start with postgresql+asyncpg:// "
                "(sync drivers will block the event loop)"
            )
        return v

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def parse_origins(cls, v: str | list[str]) -> list[str]:
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    # ── Model validators (cross-field) ──────────────────────────────────────────

    @model_validator(mode="after")
    def validate_production_requirements(self) -> "Settings":
        if self.ENVIRONMENT == "production":
            if self.DEBUG:
                raise ValueError("DEBUG must be False in production")
            if len(self.SECRET_KEY) < 32:
                raise ValueError(
                    "SECRET_KEY must be at least 32 characters in production"
                )
        return self

    # ── Convenience properties ──────────────────────────────────────────────────

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    @property
    def is_development(self) -> bool:
        return self.ENVIRONMENT == "development"


@lru_cache
def get_settings() -> Settings:
    """
    Cached Settings singleton.

    The first call loads and validates all env vars — if any required var is
    missing the app exits immediately with a clear Pydantic validation error.
    Subsequent calls return the cached instance with zero overhead.
    """
    return Settings()  # type: ignore[call-arg]


# Module-level alias — import ``settings`` for convenience in non-DI contexts.
# Use ``Depends(get_settings)`` in routes that need testable overrides.
settings: Settings = get_settings()
