"""RAG pipeline service.

chunk → embed → retrieve → generate → cite

Embedding + chat generation use an OpenAI-compatible API when
``OPENAI_API_KEY`` is set, otherwise fall back to a deterministic local
embedding and an extractive summariser so the whole prototype runs offline
and stays fully traceable (no model-memory answers).
"""

import hashlib
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

settings = get_settings()


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
        json={"model": settings.embedding_model, "input": text},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()["data"][0]["embedding"]


async def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed a list of texts, using the API when configured."""
    if settings.openai_api_key:
        async with httpx.AsyncClient() as client:
            return [await _api_embedding(client, t) for t in texts]
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
        boundingBox=BoundingBox(
            x1=bbox[0] or 0, y1=bbox[1] or 0, x2=bbox[2] or 0, y2=bbox[3] or 0
        ),
    )


async def generate_answer(
    query: str,
    chunks: list[RetrievedChunk],
) -> tuple[str, list[CitationOut]]:
    """Produce a source-cited answer (API-backed or extractive fallback)."""
    if not chunks:
        return (
            "I could not find supporting material in the committed documents for "
            "that query. Please try rephrasing, or ingest/commit relevant reports first.",
            [],
        )
    citations = [build_citation(c, i) for i, c in enumerate(chunks)]

    if settings.openai_api_key:
        try:
            return await _llm_answer(query, chunks, citations)
        except Exception:
            pass  # fall through to extractive answer if the API call fails

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


async def _llm_answer(
    query: str, chunks: list[RetrievedChunk], citations: list[CitationOut]
) -> tuple[str, list[CitationOut]]:
    context = "\n\n---\n\n".join(
        f"[{i + 1}] {c.documentName} (p.{c.pageNumber})\n{c.text}"
        for i, c in enumerate(chunks)
    )
    system = (
        "You are CIL Search Studio, a parliamentary data assistant. "
        "Answer ONLY from the retrieved source excerpts below. Every factual "
        "claim must map to one of the bracketed sources. If the excerpts do not "
        "support an answer, say so explicitly. Never answer from memory."
    )
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{settings.openai_base_url}/chat/completions",
            headers={"Authorization": f"Bearer {settings.openai_api_key}"},
            json={
                "model": settings.chat_model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": f"Query: {query}\n\nSources:\n{context}"},
                ],
                "temperature": 0.2,
            },
            timeout=60,
        )
        resp.raise_for_status()
        answer = resp.json()["choices"][0]["message"]["content"]
    return answer, citations
