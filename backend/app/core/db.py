from collections.abc import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings

engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    future=True,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Columns added to already-existing tables after the initial release. Because
# metadata.create_all() only creates MISSING TABLES (never new columns on an
# existing table), we add these idempotently on startup so an existing database
# self-heals without a volume reset or a full migration tool. Every statement is
# `ADD COLUMN IF NOT EXISTS`, so it is safe to run on every boot.
_ADDITIVE_COLUMNS: list[tuple[str, str, str]] = [
    ("documents", "scan_status", "VARCHAR(32) NOT NULL DEFAULT 'skipped'"),
    ("documents", "deleted_at", "TIMESTAMPTZ"),
]


def init_db() -> None:
    """Create the pgvector extension and all tables, then reconcile additive
    columns.

    For a prototype we use metadata.create_all plus a tiny idempotent column
    patcher instead of migrations. A real deployment would use Alembic
    (see docs/ARCHITECTURE.md).
    """
    # Import models so they register on Base.metadata before create_all.
    from app import models  # noqa: F401

    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))

    Base.metadata.create_all(bind=engine)

    # Backfill any columns added to pre-existing tables (create_all won't).
    with engine.begin() as conn:
        for table, column, coltype in _ADDITIVE_COLUMNS:
            conn.execute(
                text(f'ALTER TABLE "{table}" ADD COLUMN IF NOT EXISTS "{column}" {coltype}')
            )
