from sqlalchemy.orm import Session

from app.models import AuditLog, Notification, User


def record_audit(
    db: Session,
    *,
    actor: User | None,
    action: str,
    entity_type: str | None = None,
    entity_id: str | None = None,
    detail: dict | None = None,
) -> AuditLog:
    """Append an immutable audit entry. Caller commits."""
    log = AuditLog(
        actor_id=actor.id if actor else None,
        actor_email=actor.email if actor else None,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        detail=detail,
    )
    db.add(log)
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
