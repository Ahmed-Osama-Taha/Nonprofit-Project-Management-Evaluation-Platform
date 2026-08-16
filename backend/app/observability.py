"""OpenTelemetry + Prometheus + structured-logging bootstrap.

Gated by ``settings.otel_enabled`` — a complete no-op (and imports nothing heavy)
when disabled, so dev and the test suite run with no observability stack. Enabled
in the observability compose profile, it wires:

* **Traces** — FastAPI, SQLAlchemy (every query), botocore (S3), httpx, exported
  via OTLP to the collector -> Jaeger.
* **Metrics** — a Prometheus ``/metrics`` endpoint (RED per route) scraped by
  Prometheus and dashboarded in Grafana.
* **Logs** — JSON with ``trace_id`` / ``span_id`` injected, shipped to Loki.

All imports are lazy and failures are swallowed so a missing dependency or a
down collector can never break the app.
"""

from __future__ import annotations

import logging

from app.core.config import settings

logger = logging.getLogger("nppm")


def setup_observability(app) -> None:
    if not settings.otel_enabled:
        return
    try:
        _setup_logging()
        _setup_tracing(app)
        _setup_metrics(app)
        logger.info("Observability enabled (service=%s)", settings.otel_service_name)
    except Exception as exc:  # noqa: BLE001 — never let telemetry break the app
        logger.warning("Observability setup skipped: %s", exc)


def _setup_logging() -> None:
    """JSON logs with trace correlation so Loki lines link to Jaeger traces."""
    from opentelemetry.instrumentation.logging import LoggingInstrumentor
    from pythonjsonlogger import jsonlogger

    LoggingInstrumentor().instrument(set_logging_format=False)
    handler = logging.StreamHandler()
    handler.setFormatter(
        jsonlogger.JsonFormatter(
            "%(asctime)s %(levelname)s %(name)s %(message)s "
            "%(otelTraceID)s %(otelSpanID)s"
        )
    )
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(logging.INFO)


def _setup_tracing(app) -> None:
    from opentelemetry import trace
    from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
    from opentelemetry.instrumentation.botocore import BotocoreInstrumentor
    from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
    from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
    from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor

    provider = TracerProvider(
        resource=Resource.create({"service.name": settings.otel_service_name})
    )
    exporter = OTLPSpanExporter(
        endpoint=settings.otel_exporter_otlp_endpoint or None, insecure=True
    )
    provider.add_span_processor(BatchSpanProcessor(exporter))
    trace.set_tracer_provider(provider)

    FastAPIInstrumentor.instrument_app(app)
    HTTPXClientInstrumentor().instrument()
    BotocoreInstrumentor().instrument()
    try:
        from app.core.db import engine

        SQLAlchemyInstrumentor().instrument(engine=engine)
    except Exception as exc:  # noqa: BLE001
        logger.warning("SQLAlchemy instrumentation skipped: %s", exc)


def _setup_metrics(app) -> None:
    from prometheus_fastapi_instrumentator import Instrumentator

    Instrumentator().instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)
