"""
Celery application entry point.

Local dev:
  celery -A app.worker worker --loglevel=info --concurrency=2
  celery -A app.worker beat  --loglevel=info

Production (Railway):
  worker service: celery -A app.worker worker --loglevel=info --concurrency=4 --max-tasks-per-child=100
  beat service:   celery -A app.worker beat  --loglevel=info
"""
from __future__ import annotations

from celery import Celery
from celery.schedules import crontab

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
    # Serialization
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",

    # Timezone (Zimbabwe CAT = UTC+2)
    timezone="Africa/Harare",
    enable_utc=True,

    # Reliability
    task_acks_late=True,             # Re-queue if worker crashes before ack
    worker_prefetch_multiplier=1,    # Fair dispatch — one task per slot
    task_track_started=True,
    result_expires=3600,             # 1-hour result TTL

    # Broker transport
    broker_transport_options={
        "visibility_timeout": 3600,  # Requeue if task not done in 1h
    },

    # ── Periodic tasks (Celery Beat) ────────────────────────────────────────
    beat_schedule={
        "aggregate-analytics-hourly": {
            "task": "analytics.aggregate_hourly",
            "schedule": crontab(minute=0),          # Top of every hour
        },
        "process-follow-ups": {
            "task": "follow_ups.process",
            "schedule": crontab(minute="*/5"),       # Every 5 minutes
        },
    },
)
