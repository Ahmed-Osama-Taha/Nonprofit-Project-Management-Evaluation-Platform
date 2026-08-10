"""AI service: embeddings, RAG retrieval, and structured project analysis.

Design notes
------------
* The LLM is asked for **structured JSON**, not free-form chat, so downstream
  code and the reviewer UI can consume typed fields (risks, missing info,
  suggested questions, preliminary score).
* The AI produces a *preliminary* recommendation only. The final decision is
  always taken by a human reviewer — this is the human-in-the-loop boundary.
* Requires an OpenAI-compatible API key. If none is configured, callers get a
  clear error and the analysis row is marked `failed` (no fabricated output).
"""

from __future__ import annotations

import json

from openai import OpenAI

from app.core.config import settings

_client: OpenAI | None = None


class AINotConfigured(RuntimeError):
    pass


def _get_client() -> OpenAI:
    global _client
    if not settings.ai_enabled:
        raise AINotConfigured(
            "OPENAI_API_KEY is not set. Configure an OpenAI-compatible key to use AI features."
        )
    if _client is None:
        _client = OpenAI(
            api_key=settings.openai_api_key,
            base_url=settings.openai_base_url,
        )
    return _client


def embed_texts(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    client = _get_client()
    resp = client.embeddings.create(model=settings.ai_embedding_model, input=texts)
    return [item.embedding for item in resp.data]


def embed_text(text: str) -> list[float]:
    return embed_texts([text])[0]


ANALYSIS_SYSTEM_PROMPT = """You are an expert grant/program officer assisting a \
nonprofit funding organization. You analyze project applications and produce a \
rigorous, neutral, evidence-based assessment.

You do NOT make funding decisions. You surface information to help a human \
reviewer decide. Be specific and reference the application content. If \
information is missing, say so explicitly rather than assuming.

Return ONLY valid JSON matching this schema:
{
  "summary": string,                       // 3-5 sentence neutral summary
  "category": string,                      // e.g. Education, Health, Environment, Economic Development, Relief, Other
  "extracted_fields": {
     "estimated_beneficiaries": number|null,
     "estimated_budget": number|null,
     "duration_months": number|null,
     "geography": string|null
  },
  "risks": [ { "title": string, "severity": "low"|"medium"|"high", "detail": string } ],
  "missing_information": [ string ],        // concrete gaps a reviewer should ask about
  "suggested_questions": [ string ],        // questions the reviewer should pose to the applicant
  "preliminary_score": number,             // 0-100, holistic quality/readiness (NOT a decision)
  "preliminary_recommendation": "approve"|"request_changes"|"reject"  // advisory only
}
"""


def _build_analysis_input(project: dict, context_chunks: list[str]) -> str:
    context = "\n\n".join(f"[Excerpt {i + 1}]\n{c}" for i, c in enumerate(context_chunks))
    return (
        "PROJECT APPLICATION (structured fields):\n"
        f"{json.dumps(project, ensure_ascii=False, indent=2)}\n\n"
        "RELEVANT DOCUMENT EXCERPTS (retrieved from attachments):\n"
        f"{context or '(no attachments provided)'}\n\n"
        "Analyze the application per the schema."
    )


def analyze_project(project: dict, context_chunks: list[str]) -> dict:
    """Run the structured LLM analysis. Returns parsed JSON + model name."""
    client = _get_client()
    resp = client.chat.completions.create(
        model=settings.ai_chat_model,
        temperature=0.2,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": ANALYSIS_SYSTEM_PROMPT},
            {"role": "user", "content": _build_analysis_input(project, context_chunks)},
        ],
    )
    content = resp.choices[0].message.content or "{}"
    data = json.loads(content)
    data["_model"] = settings.ai_chat_model
    return data


CHAT_SYSTEM_PROMPT = """You are a helpful assistant answering a reviewer's \
questions about a specific nonprofit project application. Answer ONLY from the \
provided application data and document excerpts. If the answer is not present, \
say you don't have that information. Be concise."""


def answer_question(project: dict, question: str, context_chunks: list[str]) -> str:
    client = _get_client()
    context = "\n\n".join(f"[Excerpt {i + 1}]\n{c}" for i, c in enumerate(context_chunks))
    user = (
        f"APPLICATION:\n{json.dumps(project, ensure_ascii=False, indent=2)}\n\n"
        f"DOCUMENT EXCERPTS:\n{context or '(none)'}\n\n"
        f"QUESTION: {question}"
    )
    resp = client.chat.completions.create(
        model=settings.ai_chat_model,
        temperature=0.2,
        messages=[
            {"role": "system", "content": CHAT_SYSTEM_PROMPT},
            {"role": "user", "content": user},
        ],
    )
    return resp.choices[0].message.content or ""
