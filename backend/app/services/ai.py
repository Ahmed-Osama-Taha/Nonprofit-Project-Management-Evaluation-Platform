"""AI service: LLM analysis + Q&A (Anthropic Claude) and pluggable embeddings.

Design notes
------------
* **LLM = Anthropic Claude** by default (the official `anthropic` SDK). An
  OpenAI-compatible provider is also supported via configuration.
* The model is asked for **structured JSON**, not free-form chat, so the
  reviewer UI and downstream code consume typed fields (criteria scores,
  risks, missing info, suggested questions, preliminary recommendation).
* The AI produces an *advisory* assessment only. The final decision is always
  taken by a human reviewer — the human-in-the-loop boundary.
* **Embeddings are pluggable and decoupled from the chat provider.** Anthropic
  has no embeddings endpoint, so the default `local` provider computes a
  deterministic hashing embedding — the RAG pipeline works end-to-end with
  *only* a Claude key and no external calls. Swap `EMBEDDING_PROVIDER=openai`
  to use a hosted embeddings model instead.
"""

from __future__ import annotations

import hashlib
import json
import math
import re

from app.core.config import settings

_llm_client = None  # lazily-created Anthropic / OpenAI client
_openai_embed_client = None


class AINotConfigured(RuntimeError):
    pass


# --------------------------------------------------------------------------- #
# Embeddings
# --------------------------------------------------------------------------- #
_TOKEN_RE = re.compile(r"[^\W\d_]+|\d+", re.UNICODE)


def _tokenize(text: str) -> list[str]:
    return _TOKEN_RE.findall(text.lower())


def _local_embed(text: str) -> list[float]:
    """Deterministic hashing embedding (bag-of-words → fixed-dim, L2-normalised).

    Not a semantic model, but stable and dependency-free: identical text maps to
    identical vectors and cosine similarity meaningfully ranks lexically related
    chunks. Lets the full RAG pipeline run with only a Claude key.
    """
    dim = settings.ai_embedding_dim
    vec = [0.0] * dim
    for tok in _tokenize(text):
        h = hashlib.blake2b(tok.encode("utf-8"), digest_size=8).digest()
        idx = int.from_bytes(h[:4], "big") % dim
        sign = 1.0 if h[4] & 1 else -1.0
        vec[idx] += sign
    norm = math.sqrt(sum(v * v for v in vec))
    if norm == 0.0:
        return vec
    return [v / norm for v in vec]


def _openai_embed_texts(texts: list[str]) -> list[list[float]]:
    global _openai_embed_client
    if not settings.openai_api_key:
        raise AINotConfigured(
            "EMBEDDING_PROVIDER=openai requires OPENAI_API_KEY to be set."
        )
    if _openai_embed_client is None:
        from openai import OpenAI

        _openai_embed_client = OpenAI(
            api_key=settings.openai_api_key, base_url=settings.openai_base_url
        )
    resp = _openai_embed_client.embeddings.create(
        model=settings.ai_embedding_model, input=texts
    )
    return [item.embedding for item in resp.data]


def embed_texts(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    if settings.embedding_provider == "openai":
        return _openai_embed_texts(texts)
    return [_local_embed(t) for t in texts]


def embed_text(text: str) -> list[float]:
    return embed_texts([text])[0]


# --------------------------------------------------------------------------- #
# LLM (Anthropic Claude, or OpenAI-compatible)
# --------------------------------------------------------------------------- #
def _get_llm():
    global _llm_client
    if not settings.ai_enabled:
        key = "ANTHROPIC_API_KEY" if settings.ai_provider == "anthropic" else "OPENAI_API_KEY"
        raise AINotConfigured(
            f"{key} is not set. Configure it to enable AI features "
            f"(provider = {settings.ai_provider})."
        )
    if _llm_client is None:
        if settings.ai_provider == "anthropic":
            from anthropic import Anthropic

            kwargs = {"api_key": settings.anthropic_api_key}
            if settings.anthropic_base_url:
                kwargs["base_url"] = settings.anthropic_base_url
            _llm_client = Anthropic(**kwargs)
        else:
            from openai import OpenAI

            _llm_client = OpenAI(
                api_key=settings.openai_api_key, base_url=settings.openai_base_url
            )
    return _llm_client


def _anthropic_text(system: str, user: str) -> str:
    """One Claude completion → text.

    Thinking is disabled: this is structured extraction, and on thinking-by-
    default models (e.g. claude-opus-5) reasoning tokens count against
    max_tokens and would truncate the JSON. Some models (e.g. claude-fable-5)
    reject `thinking: disabled` — fall back to a plain call for those.
    """
    client = _get_llm()
    base = dict(
        model=settings.anthropic_model,
        max_tokens=settings.anthropic_max_tokens,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    try:
        msg = client.messages.create(**base, thinking={"type": "disabled"})
    except Exception:  # noqa: BLE001 — model may not allow disabling thinking
        msg = client.messages.create(**base)
    return "".join(b.text for b in msg.content if getattr(b, "type", None) == "text")


def _complete_json(system: str, user: str) -> dict:
    """Single-shot completion that must return a JSON object."""
    if settings.ai_provider == "anthropic":
        text = _anthropic_text(system, user)
    else:
        resp = _get_llm().chat.completions.create(
            model=settings.ai_chat_model,
            temperature=0.2,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        )
        text = resp.choices[0].message.content or "{}"
    return _parse_json(text)


def _complete_text(system: str, user: str) -> str:
    if settings.ai_provider == "anthropic":
        return _anthropic_text(system, user)
    resp = _get_llm().chat.completions.create(
        model=settings.ai_chat_model,
        temperature=0.2,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    )
    return resp.choices[0].message.content or ""


def _parse_json(text: str) -> dict:
    """Parse a JSON object, tolerating markdown fences / surrounding prose."""
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?|```$", "", text, flags=re.MULTILINE).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start != -1 and end != -1 and end > start:
            return json.loads(text[start : end + 1])
        raise


# --------------------------------------------------------------------------- #
# Prompts
# --------------------------------------------------------------------------- #
ANALYSIS_SYSTEM_PROMPT = """You are an expert grant/program officer assisting a \
nonprofit funding organization in the GCC (Saudi Arabia). You analyze project \
applications from nonprofit organizations and produce a rigorous, neutral, \
evidence-based assessment to help a human reviewer decide.

You do NOT make funding decisions. You surface information. Be specific and \
reference the application content. When information is missing, say so \
explicitly rather than assuming. Applications may be written in Arabic or \
English; write every string field in the SAME language as the application.

Return ONLY a valid JSON object (no markdown fences) matching this schema:
{
  "summary": string,                       // 3-5 sentence neutral summary
  "category": string,                      // e.g. Education, Health, Environment, Economic Empowerment, Relief, Social, Other
  "extracted_fields": {
     "estimated_beneficiaries": number|null,
     "estimated_budget": number|null,
     "currency": string|null,              // e.g. "SAR"
     "duration_months": number|null,
     "geography": string|null
  },
  "criteria": [                            // score EACH of these six criteria
     { "name": "Relevance & Alignment", "score": number, "rationale": string },
     { "name": "Impact & Beneficiaries", "score": number, "rationale": string },
     { "name": "Feasibility & Plan", "score": number, "rationale": string },
     { "name": "Budget Clarity", "score": number, "rationale": string },
     { "name": "Sustainability", "score": number, "rationale": string },
     { "name": "Organizational Capacity", "score": number, "rationale": string }
  ],                                       // each score is 0-100
  "risks": [ { "title": string, "severity": "low"|"medium"|"high", "detail": string } ],
  "missing_information": [ string ],       // concrete gaps a reviewer should ask about
  "suggested_questions": [ string ],       // questions the reviewer should pose to the applicant
  "strengths": [ string ],
  "preliminary_score": number,             // 0-100 holistic readiness (NOT a decision)
  "preliminary_recommendation": "approve"|"request_changes"|"reject",  // advisory only
  "recommendation_rationale": string
}
"""

CHAT_SYSTEM_PROMPT = """You are a helpful assistant answering a reviewer's \
questions about a specific nonprofit project application. Answer ONLY from the \
provided application data and document excerpts. If the answer is not present, \
say you don't have that information. Reply in the reviewer's language. Be concise."""


def _build_analysis_input(project: dict, context_chunks: list[str]) -> str:
    context = "\n\n".join(f"[Excerpt {i + 1}]\n{c}" for i, c in enumerate(context_chunks))
    return (
        "PROJECT APPLICATION (structured fields):\n"
        f"{json.dumps(project, ensure_ascii=False, indent=2)}\n\n"
        "RELEVANT DOCUMENT EXCERPTS (retrieved from attachments):\n"
        f"{context or '(no attachments provided)'}\n\n"
        "Analyze the application per the schema. Return JSON only."
    )


def analyze_project(project: dict, context_chunks: list[str]) -> dict:
    """Run the structured LLM analysis. Returns parsed JSON + model name."""
    data = _complete_json(ANALYSIS_SYSTEM_PROMPT, _build_analysis_input(project, context_chunks))
    data["_model"] = settings.ai_model_name
    return data


def answer_question(project: dict, question: str, context_chunks: list[str]) -> str:
    context = "\n\n".join(f"[Excerpt {i + 1}]\n{c}" for i, c in enumerate(context_chunks))
    user = (
        f"APPLICATION:\n{json.dumps(project, ensure_ascii=False, indent=2)}\n\n"
        f"DOCUMENT EXCERPTS:\n{context or '(none)'}\n\n"
        f"QUESTION: {question}"
    )
    return _complete_text(CHAT_SYSTEM_PROMPT, user)
