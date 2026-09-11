"""RAG pipeline service.

chunk → embed → retrieve → generate → cite

Embedding + chat generation use an OpenAI-compatible API when
``OPENAI_API_KEY`` is set, otherwise fall back to a deterministic local
embedding and an extractive summariser so the whole prototype runs offline
and stays fully traceable (no model-memory answers).
"""

import hashlib
import logging
import math
import re
from dataclasses import dataclass

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.document import Document
from app.models.extraction import ChunkEmbedding
from app.schemas.chat import BoundingBox, CitationOut
from app.services.llm_client import post_chat_completion, stream_chat_completion

settings = get_settings()
logger = logging.getLogger(__name__)


def chunk_text(
    text: str,
    chunk_size: int | None = None,
    overlap: int | None = None,
) -> list[str]:
    """Split text into overlapping character chunks on word boundaries."""
    chunk_size = chunk_size or settings.rag_chunk_size
    overlap = overlap or settings.rag_chunk_overlap
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return []
    if len(text) <= chunk_size:
        return [text]

    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = min(start + chunk_size, len(text))
        if end < len(text):
            space = text.rfind(" ", start, end)
            if space > start + chunk_size // 2:
                end = space
        chunks.append(text[start:end].strip())
        if end >= len(text):
            break
        start = max(end - overlap, start + 1)
    return [c for c in chunks if c]


# ---------------------------------------------------------------------------
# Embeddings
# ---------------------------------------------------------------------------
def _local_embedding(text: str, dim: int | None = None) -> list[float]:
    """Deterministic bag-of-words embedding (offline fallback)."""
    dim = dim or settings.embedding_dim
    vec = [0.0] * dim
    tokens = re.findall(r"[a-z0-9]+", text.lower())
    for token in tokens:
        digest = hashlib.sha256(token.encode()).digest()
        for i in range(min(dim, 8 * len(digest))):
            bit = (digest[i // 8] >> (i % 8)) & 1
            vec[i] += 1.0 if bit else -1.0
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


async def _api_embedding(client: httpx.AsyncClient, text: str) -> list[float]:
    resp = await client.post(
        f"{settings.openai_base_url}/embeddings",
        headers={"Authorization": f"Bearer {settings.openai_api_key}"},
        json={
            "model": settings.embedding_model,
            "input": text,
            # Providers default to their own vector size (Gemini: 3072). Pin
            # the request to the pgvector column width so inserts never fail.
            "dimensions": settings.embedding_dim,
        },
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()["data"][0]["embedding"]


# Sticky flag: once the embedding API proves unusable within this process
# (invalid/rotated key, quota exhausted, provider outage), stop calling it so
# every query doesn't pay a doomed round-trip — and so the corpus never mixes
# vectors from the API and the local embedder mid-flight.
_embedding_api_dead = False


async def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed a list of texts, using the API when configured.

    Requires both a key and an embedding model: a chat-only provider (e.g.
    OpenRouter) leaves ``EMBEDDING_MODEL`` empty, so retrieval stays on the
    deterministic local embedder instead of calling a missing endpoint.

    An API failure (dead key, 4xx/5xx, timeout) degrades the whole batch to
    the local embedder instead of crashing callers like seed/commit — after
    fixing the key, run ``python -m scripts.reembed_corpus`` to rebuild
    API-grade vectors.
    """
    global _embedding_api_dead
    if settings.openai_api_key and settings.embedding_model and not _embedding_api_dead:
        try:
            async with httpx.AsyncClient() as client:
                return [await _api_embedding(client, t) for t in texts]
        except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError):
            _embedding_api_dead = True
            logger.exception(
                "embedding API failed — falling back to the local embedder for "
                "this process. Check OPENAI_API_KEY / EMBEDDING_MODEL / "
                "OPENAI_BASE_URL, then re-run `python -m scripts.reembed_corpus`."
            )
    return [_local_embedding(t) for t in texts]


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a)) or 1.0
    nb = math.sqrt(sum(x * x for x in b)) or 1.0
    return dot / (na * nb)


# ---------------------------------------------------------------------------
# Retrieval
# ---------------------------------------------------------------------------
@dataclass
class RetrievedChunk:
    text: str
    document_id: str
    document_name: str
    page_number: int
    bbox: tuple[int | None, int | None, int | None, int | None] | None = None
    score: float = 0.0


async def retrieve(
    db: AsyncSession,
    query: str,
    top_k: int | None = None,
    subsidiary: str | None = None,
    coalfield: str | None = None,
    fiscal_year: str | None = None,
) -> list[RetrievedChunk]:
    """Retrieve the most similar committed chunks."""
    top_k = top_k or settings.rag_top_k

    stmt = select(Document.id, Document.file_name).where(Document.status == "committed")
    if subsidiary:
        stmt = stmt.where(Document.subsidiary.has(name=subsidiary))
    if coalfield:
        stmt = stmt.where(Document.coalfield.has(name=coalfield))
    if fiscal_year:
        stmt = stmt.where(Document.fiscal_year == fiscal_year)

    rows = (await db.execute(stmt)).all()
    if not rows:
        return []

    chunks_stmt = select(ChunkEmbedding).where(
        ChunkEmbedding.document_id.in_([r.id for r in rows])
    )
    chunks = (await db.execute(chunks_stmt)).scalars().all()
    if not chunks:
        return []

    query_vec = await embed_texts([query])
    qv = query_vec[0]

    scored: list[tuple[float, ChunkEmbedding]] = []
    for chunk in chunks:
        if chunk.embedding is None:
            continue
        score = _cosine(qv, chunk.embedding)
        scored.append((score, chunk))
    scored.sort(key=lambda x: x[0], reverse=True)

    name_by_id = {r.id: r.file_name for r in rows}
    result: list[RetrievedChunk] = []
    for score, chunk in scored[:top_k]:
        result.append(
            RetrievedChunk(
                text=chunk.chunk_text,
                document_id=chunk.document_id,
                document_name=name_by_id.get(chunk.document_id, "document"),
                page_number=chunk.page_number,
                bbox=(chunk.bbox_x1, chunk.bbox_y1, chunk.bbox_x2, chunk.bbox_y2),
                score=score,
            )
        )
    return result


# ---------------------------------------------------------------------------
# Generation
# ---------------------------------------------------------------------------
def build_citation(chunk: RetrievedChunk, index: int) -> CitationOut:
    bbox = chunk.bbox or (0, 0, 0, 0)
    return CitationOut(
        id=f"cit-{index + 1}",
        documentName=chunk.document_name,
        pageNumber=chunk.page_number,
        documentId=chunk.document_id,
        boundingBox=BoundingBox(
            x1=bbox[0] or 0, y1=bbox[1] or 0, x2=bbox[2] or 0, y2=bbox[3] or 0
        ),
    )


async def generate_answer(
    query: str,
    chunks: list[RetrievedChunk],
    history: list[dict[str, str]] | None = None,
) -> tuple[str, list[CitationOut]]:
    """Produce a source-cited answer (API-backed or extractive fallback).

    ``history`` is the session transcript (role/content dicts, oldest first)
    so follow-up questions can resolve conversational references; answers
    stay grounded in the retrieved ``chunks`` only.
    """
    if not chunks:
        return (
            "I could not find supporting material in the committed documents for "
            "that query. Please try rephrasing, or ingest/commit relevant reports first.",
            [],
        )
    citations = [build_citation(c, i) for i, c in enumerate(chunks)]

    if settings.chat_api_key_effective:
        try:
            return await _llm_answer(query, chunks, citations, history)
        except Exception:
            # Never leave this silent — a dead key/wrong model otherwise looks
            # exactly like "the AI answered" while the extractive fallback runs.
            logger.exception(
                "LLM answer generation failed — falling back to extractive answer"
            )
    else:
        logger.warning(
            "no chat API key configured — using extractive answer fallback"
        )

    return _extractive_answer(query, chunks), citations


def _extractive_answer(query: str, chunks: list[RetrievedChunk]) -> str:
    """Compose a readable answer by scoring sentences against query terms."""
    query_terms = set(re.findall(r"[a-z0-9]+", query.lower()))
    lines: list[str] = []
    used = 0
    for chunk in chunks:
        if used >= 3:
            break
        sentences = re.split(r"(?<=[.!?])\s+", chunk.text)
        scored_sentences = []
        for sent in sentences:
            sent_terms = set(re.findall(r"[a-z0-9]+", sent.lower()))
            score = len(query_terms & sent_terms)
            if len(sent.split()) >= 6 and score >= 1:
                scored_sentences.append((score, sent.strip()))
        scored_sentences.sort(key=lambda x: x[0], reverse=True)
        for _, sent in scored_sentences[:2]:
            if sent not in lines:
                lines.append(sent)
                used += 1
    if not lines:
        return (
            "The retrieved source material is available below. "
            "Refine your question for a more targeted extract."
        )
    body = "\n\n".join(lines)
    return (
        "### Executive Brief\n\n"
        f"{body}\n\n"
        "> Figures are drawn from the cited source documents above. "
        "Provisional values are subject to final accounting."
    )


def _build_chat_messages(
    query: str,
    chunks: list[RetrievedChunk],
    history: list[dict[str, str]] | None = None,
) -> list[dict[str, str]]:
    """Assemble the grounded prompt (system rules + trimmed history + query)."""
    context = "\n\n---\n\n".join(
        f"[{i + 1}] {c.document_name} (p.{c.page_number})\n{c.text}"
        for i, c in enumerate(chunks)
    )
    system = (
        "You are CIL Report Studio, a parliamentary data assistant. For any "
        "factual claim about the corpus, answer ONLY from the retrieved source "
        "excerpts below; every such claim must map to one of the bracketed "
        "sources, and if the excerpts do not support an answer, say so "
        "explicitly. Never introduce corpus facts from memory. "
        "Earlier conversation turns are provided for continuity: use them to "
        "resolve conversational references such as 'it', 'that block', 'my "
        "previous question' or 'the same figure', and you may restate or "
        "summarise what was already said in the conversation, but do not "
        "present anything from those turns as a new corpus fact."
    )
    messages: list[dict[str, str]] = [{"role": "system", "content": system}]
    # Trim stored turns so a long transcript cannot blow the provider context.
    for turn in (history or [])[-8:]:
        content = turn.get("content", "").strip()
        if content:
            messages.append(
                {"role": turn.get("role", "user"), "content": content[:1500]}
            )
    messages.append(
        {"role": "user", "content": f"Query: {query}\n\nSources:\n{context}"}
    )
    return messages


def _word_deltas(text: str) -> list[str]:
    """Split text into the word-per-token chunks the SSE layer yields."""
    words = text.split(" ")
    return [w + (" " if i < len(words) - 1 else "") for i, w in enumerate(words)]


async def _llm_answer(
    query: str,
    chunks: list[RetrievedChunk],
    citations: list[CitationOut],
    history: list[dict[str, str]] | None = None,
) -> tuple[str, list[CitationOut]]:
    answer = (
        await post_chat_completion(
            {
                "model": settings.chat_model,
                "messages": _build_chat_messages(query, chunks, history),
                "temperature": 0.2,
                # Bound the completion. Without it some gateways bill the
                # request at the model's full output ceiling (e.g. 131k tokens
                # for MiniMax M3 on OpenRouter), which a zero-credit account
                # cannot afford — the request is rejected with 402 before a
                # single token is generated ("requires more credits, or fewer
                # max_tokens"). For glm-5.3-flash it also keeps the always-on
                # reasoning tokens from squeezing out the visible answer.
                "max_tokens": 1024,
            },
            timeout=60,
        )
    )["choices"][0]["message"]["content"]
    return answer, citations


async def generate_answer_stream(
    query: str,
    chunks: list[RetrievedChunk],
    history: list[dict[str, str]] | None = None,
):
    """Stream a source-cited answer as {"type": ...} events.

    Yields ``{"type": "delta", "text": str}`` per provider token and a final
    ``{"type": "citations", "citations": list[CitationOut]}``. Grounding is
    identical to :func:`generate_answer` (shared ``_build_chat_messages``). A
    provider failure BEFORE the first token degrades to the extractive answer
    (logged, never silent); a mid-stream failure propagates so the SSE layer
    can emit an explicit ``error`` event for the partial answer.
    """
    citations = [build_citation(c, i) for i, c in enumerate(chunks)]

    if not chunks:
        yield {
            "type": "delta",
            "text": (
                "I could not find supporting material in the committed documents "
                "for that query. Please try rephrasing, or ingest and commit "
                "relevant reports first."
            ),
        }
        yield {"type": "citations", "citations": []}
        return

    if not settings.chat_api_key_effective:
        logger.warning("no chat API key configured — using extractive answer fallback")
        for delta in _word_deltas(_extractive_answer(query, chunks)):
            yield {"type": "delta", "text": delta}
        yield {"type": "citations", "citations": citations}
        return

    emitted = False
    try:
        async for delta in stream_chat_completion(
            {
                "model": settings.chat_model,
                "messages": _build_chat_messages(query, chunks, history),
                "temperature": 0.2,
                # Bound the completion. Without it some gateways bill the
                # request at the model's full output ceiling (e.g. 131k tokens
                # for MiniMax M3 on OpenRouter), which a zero-credit account
                # cannot afford — the request is rejected with 402 before a
                # single token is generated ("requires more credits, or fewer
                # max_tokens"). For glm-5.3-flash it also keeps the always-on
                # reasoning tokens from squeezing out the visible answer.
                "max_tokens": 1024,
            },
            timeout=60,
        ):
            emitted = True
            yield {"type": "delta", "text": delta}
    except Exception:
        if emitted:
            # Mid-stream failure: partial answer is already visible to the
            # user; let chat.py persist it and surface an explicit SSE error.
            raise
        logger.exception(
            "LLM answer generation failed — falling back to extractive answer"
        )
        for delta in _word_deltas(_extractive_answer(query, chunks)):
            yield {"type": "delta", "text": delta}
    yield {"type": "citations", "citations": citations}
