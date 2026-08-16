"""dramatiq worker tasks.

AI analysis runs here — **out of the web process** — when a RabbitMQ broker is
configured (``RABBITMQ_URL``). Otherwise the API falls back to in-process
FastAPI ``BackgroundTasks`` so dev and the test suite run with no broker.

Run the worker:  ``dramatiq app.tasks``  (see the ``worker`` compose service).
"""

from __future__ import annotations

import dramatiq

from app.core.config import settings

# Import-safe broker selection: a real RabbitMQ broker only when configured,
# otherwise an in-memory StubBroker so importing this module never opens a
# socket (keeps tests / no-broker environments happy).
if settings.rabbitmq_url:
    from dramatiq.brokers.rabbitmq import RabbitmqBroker

    broker = RabbitmqBroker(url=settings.rabbitmq_url)
else:
    from dramatiq.brokers.stub import StubBroker

    broker = StubBroker()

dramatiq.set_broker(broker)


@dramatiq.actor(max_retries=3, time_limit=600_000)  # 10 min; retries then dead-letters
def run_analysis_task(project_id: str, language: str = "ar") -> None:
    """Run the full AI analysis pipeline for a project in a fresh DB session."""
    from app.core.db import SessionLocal
    from app.models import Project
    from app.services import analysis as analysis_service

    db = SessionLocal()
    try:
        project = db.get(Project, project_id)
        if project:
            # force=True: the API pre-marked the row "processing" for instant UI
            # feedback; the broker already dedupes, so run past the guard.
            analysis_service.run_analysis(db, project, language, force=True)
    finally:
        db.close()
