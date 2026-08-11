"""Audit journaling.

Every audit entry is written to PostgreSQL (queryable) AND shipped to object
storage (S3/MinIO) as an individual JSON object under a date-partitioned prefix.
Object storage gives durable, append-only, tamper-evident retention that
outlives the database and is easy to stream into a SIEM/data lake.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import AuditLog, Notification, User
from app.services import storage

logger = logging.getLogger("nppm.audit")


def _ship_to_s3(entry: AuditLog) -> str | None:
    """Best-effort: write the entry as a JSON object. Never breaks the request."""
    if not settings.audit_to_s3:
        return None
    now = datetime.now(timezone.utc)
    key = (
        f"{settings.audit_s3_prefix}/{now:%Y/%m/%d}/"
        f"{now:%H%M%S%f}-{entry.id}.json"
    )
    payload = {
        "id": entry.id,
        "ts": now.isoformat(),
        "actor_id": entry.actor_id,
        "actor_email": entry.actor_email,
        "actor_role": entry.actor_role,
        "action": entry.action,
        "entity_type": entry.entity_type,
        "entity_id": entry.entity_id,
        "method": entry.method,
        "path": entry.path,
        "status_code": entry.status_code,
        "latency_ms": entry.latency_ms,
        "ip": entry.ip,
        "request_id": entry.request_id,
        "detail": entry.detail,
    }
    try:
        storage.upload_bytes(
            key,
            json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            content_type="application/json",
        )
        return key
    except Exception as exc:  # noqa: BLE001 — auditing must not break the request
        logger.warning("Audit S3 shipment failed for %s: %s", entry.id, exc)
        return None


def record_audit(
    db: Session,
    *,
    actor: User | None,
    action: str,
    entity_type: str | None = None,
    entity_id: str | None = None,
    detail: dict | None = None,
) -> AuditLog:
    """Append an immutable domain-event audit entry. Caller commits."""
    log = AuditLog(
        actor_id=actor.id if actor else None,
        actor_email=actor.email if actor else None,
        actor_role=actor.role.value if actor else None,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        detail=detail,
    )
    log.s3_key = _ship_to_s3(log)
    db.add(log)
    return log


def record_api_access(
    db: Session,
    *,
    actor: User | None,
    method: str,
    path: str,
    status_code: int,
    latency_ms: int,
    ip: str | None,
    request_id: str,
) -> AuditLog:
    """Append an HTTP access-log entry (written by the audit middleware)."""
    log = AuditLog(
        actor_id=actor.id if actor else None,
        actor_email=actor.email if actor else None,
        actor_role=actor.role.value if actor else None,
        action="api.request",
        method=method,
        path=path,
        status_code=status_code,
        latency_ms=latency_ms,
        ip=ip,
        request_id=request_id,
    )
    log.s3_key = _ship_to_s3(log)
    db.add(log)
    db.commit()
    return log


def notify(
    db: Session,
    *,
    user_id: str,
    message: str,
    project_id: str | None = None,
) -> Notification:
    """Create an in-app notification. Caller commits."""
    n = Notification(user_id=user_id, message=message, project_id=project_id)
    db.add(n)
    return n
