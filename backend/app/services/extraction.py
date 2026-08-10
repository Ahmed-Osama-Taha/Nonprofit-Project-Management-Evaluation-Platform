"""Text extraction from uploaded documents (PDF, DOCX, plain text)."""

from __future__ import annotations

import io


def extract_text(filename: str, content_type: str | None, data: bytes) -> str:
    name = (filename or "").lower()
    ctype = (content_type or "").lower()

    if name.endswith(".pdf") or "pdf" in ctype:
        return _extract_pdf(data)
    if name.endswith(".docx") or "wordprocessingml" in ctype:
        return _extract_docx(data)
    if name.endswith((".txt", ".md", ".csv")) or ctype.startswith("text/"):
        return data.decode("utf-8", errors="replace")

    # Best-effort fallback: try decoding as text.
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        return ""


def _extract_pdf(data: bytes) -> str:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(data))
    parts = []
    for page in reader.pages:
        try:
            parts.append(page.extract_text() or "")
        except Exception:  # noqa: BLE001 — skip unreadable page, keep the rest
            continue
    return "\n".join(parts).strip()


def _extract_docx(data: bytes) -> str:
    from docx import Document as DocxDocument

    doc = DocxDocument(io.BytesIO(data))
    return "\n".join(p.text for p in doc.paragraphs).strip()


def chunk_text(text: str, chunk_size: int = 1000, overlap: int = 150) -> list[str]:
    """Word-based chunking with overlap — good enough for a prototype RAG index."""
    words = text.split()
    if not words:
        return []
    chunks: list[str] = []
    step = max(1, chunk_size - overlap)
    for start in range(0, len(words), step):
        chunk = " ".join(words[start : start + chunk_size])
        if chunk.strip():
            chunks.append(chunk)
        if start + chunk_size >= len(words):
            break
    return chunks
