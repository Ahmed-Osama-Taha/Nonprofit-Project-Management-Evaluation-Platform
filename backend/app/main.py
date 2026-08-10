from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import admin, auth, notifications, projects, reviews
from app.core.config import settings
from app.core.db import init_db
from app.seed import seed

logger = logging.getLogger("nppm")
logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    try:
        seed()
    except Exception as exc:  # noqa: BLE001 — seeding must never block startup
        logger.warning("Seed skipped: %s", exc)
    yield


app = FastAPI(
    title="Nonprofit Project Management & Evaluation Platform",
    description=(
        "API for nonprofit organizations to submit projects, an internal team to "
        "review them with AI assistance, and admins to manage the platform. "
        "AI produces advisory analysis only — humans make the final decision."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

# CORS: permissive for the prototype; tighten to known origins in production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(projects.router)
app.include_router(reviews.router)
app.include_router(notifications.router)
app.include_router(admin.router)


@app.get("/api/health", tags=["health"])
def health() -> dict:
    return {
        "status": "ok",
        "environment": settings.environment,
        "ai_enabled": settings.ai_enabled,
        "ai_model": settings.ai_chat_model if settings.ai_enabled else None,
    }
