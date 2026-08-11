"""Orchestrates the AI pipeline for a project.

    documents ─► extract ─► chunk ─► embed ─► pgvector
                                                  │
                                    retrieve top-k │
                                                  ▼
                          structured fields + excerpts ─► LLM ─► AIAnalysis
"""

from __future__ import annotations

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import (
    AIAnalysis,
    AIAnalysisStatus,
    Document,
    DocumentChunk,
    Project,
)
from app.services import ai
from app.services.ai import AINotConfigured
from app.services.extraction import chunk_text

RETRIEVAL_QUERY = (
    "project goals, budget, beneficiaries, KPIs, risks, timeline, sustainability, "
    "organizational capacity, monitoring and evaluation"
)


def _project_payload(project: Project) -> dict:
    return {
        "title": project.title,
        "summary": project.summary,
        "category": project.category,
        "problem_statement": project.problem_statement,
        "goals": project.goals,
        "kpis": project.kpis,
        "target_beneficiaries": project.target_beneficiaries,
        "beneficiary_description": project.beneficiary_description,
        "requested_budget": project.requested_budget,
        "currency": project.currency,
        "duration_months": project.duration_months,
        "location": project.location,
    }


def index_project_documents(db: Session, project: Project) -> int:
    """(Re)build the pgvector index for a project's documents. Returns chunk count."""
    db.execute(delete(DocumentChunk).where(DocumentChunk.project_id == project.id))

    docs = db.scalars(
        select(Document).where(Document.project_id == project.id)
    ).all()

    all_chunks: list[tuple[str, int, str]] = []  # (document_id, index, content)
    for doc in docs:
        if not doc.extracted_text:
            continue
        for i, chunk in enumerate(chunk_text(doc.extracted_text)):
            all_chunks.append((doc.id, i, chunk))

    if not all_chunks:
        db.commit()
        return 0

    embeddings = ai.embed_texts([c[2] for c in all_chunks])
    for (document_id, idx, content), emb in zip(all_chunks, embeddings):
        db.add(
            DocumentChunk(
                project_id=project.id,
                document_id=document_id,
                chunk_index=idx,
                content=content,
                embedding=emb,
            )
        )
    db.commit()
    return len(all_chunks)


def retrieve_context(db: Session, project: Project, query: str, k: int = 6) -> list[str]:
    """Vector similarity search over the project's document chunks."""
    has_chunks = db.scalar(
        select(DocumentChunk.id).where(DocumentChunk.project_id == project.id).limit(1)
    )
    if not has_chunks:
        return []
    query_emb = ai.embed_text(query)
    rows = db.scalars(
        select(DocumentChunk)
        .where(DocumentChunk.project_id == project.id)
        .order_by(DocumentChunk.embedding.cosine_distance(query_emb))
        .limit(k)
    ).all()
    return [r.content for r in rows]


def run_analysis(db: Session, project: Project) -> AIAnalysis:
    """Full pipeline: index -> retrieve -> analyze -> persist. Idempotent per project."""
    analysis = db.scalar(
        select(AIAnalysis).where(AIAnalysis.project_id == project.id)
    )
    if analysis is None:
        analysis = AIAnalysis(project_id=project.id)
        db.add(analysis)

    analysis.status = AIAnalysisStatus.processing
    analysis.error = None
    db.commit()

    try:
        index_project_documents(db, project)
        context = retrieve_context(db, project, RETRIEVAL_QUERY)
        result = ai.analyze_project(_project_payload(project), context)

        analysis.status = AIAnalysisStatus.completed
        analysis.model = result.get("_model")
        analysis.summary = result.get("summary")
        analysis.category = result.get("category")
        analysis.risks = result.get("risks")
        analysis.missing_information = result.get("missing_information")
        analysis.suggested_questions = result.get("suggested_questions")
        analysis.strengths = result.get("strengths")
        analysis.criteria = result.get("criteria")
        analysis.preliminary_score = result.get("preliminary_score")
        analysis.preliminary_recommendation = result.get("preliminary_recommendation")
        analysis.recommendation_rationale = result.get("recommendation_rationale")
        analysis.extracted_fields = result.get("extracted_fields")
        analysis.raw_output = {k: v for k, v in result.items() if k != "_model"}

        # Backfill the project category from AI if the applicant left it blank.
        if not project.category and result.get("category"):
            project.category = result.get("category")
    except AINotConfigured as exc:
        # Operational misconfiguration, not an analysis result. Mark failed and
        # re-raise so a synchronous caller can surface a clear 503.
        analysis.status = AIAnalysisStatus.failed
        analysis.error = str(exc)[:2000]
        db.commit()
        raise
    except Exception as exc:  # noqa: BLE001 — record failure, keep submission intact
        analysis.status = AIAnalysisStatus.failed
        analysis.error = str(exc)[:2000]

    db.commit()
    db.refresh(analysis)
    return analysis
