---
name: celery-tasks
description: Use when building or debugging Celery background tasks for the Conva (ZentrikAI) platform. Trigger for "background task", "async job", "celery task", "worker", "queue", "send broadcast", "schedule follow-up", "aggregate analytics", or any operation that must not block an HTTP response.
allowed-tools: Read, Grep, Glob, Bash, Write, Edit
---

## When to Apply

Use for any task that runs outside the HTTP request/response cycle.

**Must use:** AI response pipeline, broadcast sends, follow-up scheduling, analytics aggregation, PDF generation, or any operation that would take >1 second or must not block HTTP.

**Skip:** Standard CRUD endpoints (use `fastapi-route`), WhatsApp webhook handler (use `whatsapp-pipeline`).

**Rule of thumb:** If it takes >1 second or calls an external API — it's a Celery task.

---

## Task Inventory

| Task | File | Trigger | Time Limit |
|------|------|---------|------------|
| `ai.respond` | `tasks/ai_respond.py` | Inbound WhatsApp message | 60s |
| `broadcast.send_to_recipient` | `tasks/broadcast_send.py` | Campaign launch | 30s |
| `follow_ups.process` | `tasks/follow_ups.py` | Scheduled trigger | 120s |
| `analytics.aggregate_hourly` | `tasks/analytics_aggregate.py` | Hourly cron | 180s |

---

## Task Structure Template

```python
# backend/app/tasks/<domain>.py
import asyncio
import logging
from celery.exceptions import SoftTimeLimitExceeded
from app.worker import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(
    bind=True,
    name="<domain>.<action>",     # Explicit name — never auto-generated
    max_retries=3,
    default_retry_delay=10,
    soft_time_limit=55,           # Warns before hard kill
    time_limit=60,                # Hard kill
    acks_late=True,               # Re-queue if worker crashes
)
def task_name(self, param1: str, param2: str) -> None:
    asyncio.run(_task_name_async(self, param1, param2))


async def _task_name_async(task, param1: str, param2: str) -> None:
    try:
        # 1. Idempotency check
        # 2. Load data
        # 3. Save to DB BEFORE external API call
        # 4. Make external call
        # 5. Update DB with external result ID
        pass

    except SoftTimeLimitExceeded:
        logger.warning(f"Soft time limit: {param1}")
        raise

    except Exception as exc:
        logger.error(f"Task failed: {exc}", exc_info=True)
        if task.request.retries < task.max_retries:
            raise task.retry(exc=exc, countdown=10 * (2 ** task.request.retries))
        await handle_final_failure(param1, param2)
```

---

## Retry Strategy

```python
# Exponential backoff: 10s → 20s → 40s
raise task.retry(exc=exc, countdown=10 * (2 ** task.request.retries))

# Fixed (rate limits)
raise task.retry(exc=exc, countdown=60)
```

---

## Enqueuing Tasks

```python
# Immediate
ai_respond.delay(message_id=str(msg_row["id"]), conversation_id=str(conv["id"]), client_id=str(client_id))

# Delayed
send_follow_up.apply_async(args=[contact_id, client_id], countdown=3600)

# Cron trigger
celery_app.send_task("analytics.aggregate_hourly")
```

---

## Idempotency (Required)

```python
existing = await get_by_external_id(external_id)
if existing and existing["status"] in ("sent", "completed"):
    return  # Already done

row = await insert_record({...})         # Save BEFORE external call
result = await call_external_api(...)
await update_record(row["id"], {"external_id": result["id"], "status": "sent"})
```

---

## Task Registration

Every new task module must be added to `include` in `backend/app/worker.py`:

```python
celery_app = Celery("conva", broker=settings.REDIS_URL, backend=settings.REDIS_URL,
    include=["app.tasks.ai_respond", "app.tasks.broadcast_send",
             "app.tasks.follow_ups", "app.tasks.analytics_aggregate"])
```

---

## Pre-Delivery Checklist

- [ ] Explicit `name=` string on task decorator
- [ ] `bind=True` for `self.retry()` access
- [ ] `max_retries=3` with exponential countdown
- [ ] `soft_time_limit` and `time_limit` both set
- [ ] `acks_late=True` for critical tasks
- [ ] DB write BEFORE external API call
- [ ] Idempotency check at task start
- [ ] Final failure handled gracefully
- [ ] Registered in `app/worker.py` `include` list
- [ ] Sync task wraps `asyncio.run(_async_fn())`
