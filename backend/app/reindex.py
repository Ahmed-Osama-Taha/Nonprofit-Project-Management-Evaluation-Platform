"""Rebuild the pgvector index for every project with the CURRENT embedder.

Run this after changing ``EMBEDDING_PROVIDER`` or the embedding model. The
vector **dimension** and **space** change (e.g. hashing 1536-d → semantic 384-d),
so previously stored chunk vectors are invalid. Chunks are *derived* data —
rebuilt from ``documents.extracted_text`` — so dropping and recreating them is
safe and loses nothing.

What it does:
  1. Drops + recreates ``document_chunks`` so the vector column matches the new
     dimension (this repo uses ``create_all``, not Alembic; in production this
     step would be an Alembic migration + backfill job).
  2. Re-embeds every project's documents with the active provider.
  3. Creates an HNSW ANN index for cosine similarity (pgvector >= 0.5).

Usage:
    python -m app.reindex
"""

from __future__ import annotations

from sqlalchemy import select, text

from app.core.config import settings
from app.core.db import SessionLocal, engine, init_db
from app.models import DocumentChunk, Project
from app.services import analysis as analysis_service


def main() -> None:
    print(
        f"Reindexing with provider={settings.embedding_provider!r} "
        f"dim={settings.ai_embedding_dim} model={settings.ai_st_model!r}"
    )

    # 1. Recreate the chunk table so the vector column has the new dimension.
    DocumentChunk.__table__.drop(engine, checkfirst=True)
    init_db()  # CREATE EXTENSION vector + create_all -> recreates document_chunks

    db = SessionLocal()
    try:
        projects = db.scalars(select(Project)).all()
        total = 0
        for project in projects:
            n = analysis_service.index_project_documents(db, project)
            total += n
            print(f"  {project.id}  {project.title!r}: {n} chunks")
        print(f"Re-embedded {total} chunks across {len(projects)} project(s).")

        # 2. ANN index matching the cosine_distance retrieval operator.
        try:
            db.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding_hnsw "
                    "ON document_chunks USING hnsw (embedding vector_cosine_ops)"
                )
            )
            db.commit()
            print("Created HNSW index on document_chunks.embedding.")
        except Exception as exc:  # noqa: BLE001 — index is an optimisation, not required
            db.rollback()
            print(f"HNSW index skipped ({exc}). Needs pgvector >= 0.5.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
