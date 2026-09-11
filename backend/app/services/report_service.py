"""Report composition engine (M1 — Automated Report Generation).

Turns the committed, embedded corpus into a structured executive report:
sections of grounded findings, key figures, and numbered citations that map
1:1 to source pages.

Two composition backends share the same evidence pipeline:

* **LLM mode** (``OPENAI_API_KEY`` set) — retrieved chunks are composed into
  narrative findings by an OpenAI-compatible chat model.
* **Extractive mode** (offline default) — the most informative sentences are
  selected directly from the retrieved chunks (deterministic, fully
  traceable, no model-memory answers).

Every statement keeps its ``[n]`` marker in both modes, so page-level
traceability is guaranteed regardless of backend.
"""

import re
import time
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.document import Document
from app.models.extraction import ChunkEmbedding
from app.schemas.report import (
    ReportCitation,
    ReportKeyFigure,
    ReportOut,
    ReportRequest,
    ReportSection,
)
from app.services.llm_client import post_chat_completion

settings = get_settings()

# Per-report-section retrieval size (spread across the scoped corpus).
CHUNKS_PER_SECTION = 6
MAX_CITATIONS = 12

REPORT_TYPE_SPECS: dict[str, dict] = {
    "geological_brief": {
        "label": "Geological / Exploration Brief",
        "title_suffix": "Geological & Exploration Brief",
        "noun": "geological findings",
        "sections": [
            "Executive Summary",
            "Geological Findings",
            "Key Observations & Recommended Actions",
        ],
        "queries": [
            "geology exploration borehole drilling results structure",
            "coal seam thickness quality grade reserves",
            "stratigraphy overburden depth observations",
        ],
    },
    "production_review": {
        "label": "Production Performance Review",
        "title_suffix": "Production Performance Review",
        "noun": "production results",
        "sections": [
            "Executive Summary",
            "Production Results",
            "Key Observations & Recommended Actions",
        ],
        "queries": [
            "coal production output achievement target",
            "overburden removal dispatch despatch rake",
            "pithead stock offtake performance",
        ],
    },
    "parliamentary_response": {
        "label": "Parliamentary Response Note",
        "title_suffix": "Parliamentary Response Note",
        "noun": "facts for parliamentary reply",
        "sections": [
            "Question Context",
            "Facts on Record",
            "Suggested Reply Points",
        ],
        "queries": [
            "coal india production statistics figures",
            "subsidiary performance summary highlights",
            "dispatch supply commitment status",
        ],
    },
}
DEFAULT_REPORT_TYPE = "geological_brief"

# Boilerplate that must not become a "key finding" in extractive mode.
_NOISE_TOKENS = {
    "annexure", "annex", "appendix", "table", "figure", "page", "refer",
    "respectively", "hereby", "aforementioned", "enclosed",
}


def _split_sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?])\s+|[\n•]+", text)
    return [p.strip() for p in parts if p and len(p.strip()) > 25]


def _is_informative(sentence: str) -> bool:
    """Heuristic: prefer sentences carrying numbers, units or figures."""
    lowered = sentence.lower()
    if any(tok in lowered for tok in _NOISE_TOKENS):
        return False
    informative = bool(
        re.search(r"\d", sentence)
        or re.search(r"\b(MT|Mcum|BCM|teu|LCM|percent|%)", sentence, re.I)
    )
    return informative or len(sentence.split()) >= 14


def _compress(sentence: str, max_words: int = 46) -> str:
    words = sentence.split()
    if len(words) <= max_words:
        return sentence.rstrip()
    return " ".join(words[:max_words]).rstrip(",;:") + "…"


# A leading run of section numbers / small-caps headings that sits in front of
# real prose ("LOCATION 3.1 The Gurwani block …", "8 10.0 EXPLORATION SCHEME
# 10.1 Drilling: …") is PDF layout noise, not part of the statement.
_PEEL_LEAD = re.compile(
    r"^(?:(?:\d+(?:\.\d+)*[).]?|[A-Z][A-Z0-9&/()\-.]*)\s+)+(?=[A-Z][a-z])"
)

# Fragments that read like sentences, not table rows or drawing title blocks.
_FUNCTION_WORDS = {
    "the", "of", "in", "to", "and", "for", "is", "was", "are", "were", "has",
    "have", "by", "on", "at", "as", "with", "from", "which", "that", "it",
}


def _clean_lead(sentence: str) -> str | None:
    """Strip OCR/layout artefacts from the head of a candidate finding.

    Returns ``None`` when the fragment is not usable prose: it begins mid-word
    (a truncated chunk tail), it is an all-caps drawing title block / table
    row, or it is a short token soup with no sentence structure.
    """
    text = sentence.strip().lstrip("-–—•*> \t")
    lead = _PEEL_LEAD.match(text)
    if lead:
        head = lead.group(0)
        # Only peel when the lead is clearly layout noise (carries a section
        # number or several caps words) so acronyms such as "GSI" survive.
        if re.search(r"\d", head) or len(head.split()) >= 2:
            text = text[lead.end() :].strip()
    if not text or text[0].islower():
        return None
    # A bare section number followed by a lowercase word ("9 suitably
    # incorporating …") is a chunk tail, not a statement. Quantities that open
    # with a number plus a unit ("4950 m of drilling …") stay valid.
    _units = r"(?:m|km|mt|mcum|bcm|lcm|sq|ha|mw|nos|no|day|days|month|months|year|years|per|crore|crores|lakh|rupees|%)"
    if re.match(rf"^\d+(?:\.\d+)*\s+(?!{_units}\b)[a-z]", text):
        return None
    words = [w for w in text.split() if any(ch.isalpha() for ch in w)]
    if not words or not any(ch.islower() for ch in text):
        return None
    if sum(1 for w in words if w.isupper()) / len(words) > 0.6:
        return None
    # Gantt rows, arrow runs and underscore rules are page layout, not prose.
    if re.search(r"[<>↔→←⇄⇒]|\.{3,}|_{3,}|[^\w\s]{6,}", text):
        return None
    lowered = set(re.findall(r"[a-z]+", text.lower()))
    if len(words) < 14 and not lowered & _FUNCTION_WORDS:
        return None
    return text


def _fiscal_year_of(doc: Document) -> str:
    return doc.fiscal_year or "FY (unspecified)"


async def _select_docs(
    db: AsyncSession, document_ids: list[str] | None
) -> list[Document]:
    """Resolve the committed scope: explicit ids or the whole corpus."""
    stmt = select(Document).where(Document.status == "committed")
    if document_ids:
        stmt = stmt.where(Document.id.in_(document_ids))
    else:
        stmt = stmt.order_by(Document.committed_at.desc().nullslast())
    stmt = stmt.limit(24)
    return list((await db.execute(stmt)).scalars().all())


def _cosine(a: list[float], b: list[float]) -> float:
    num = sum(x * y for x, y in zip(a, b))
    na = sum(x * x for x in a) or 1.0
    nb = sum(y * y for y in b) or 1.0
    return num / (na**0.5 * nb**0.5)


async def _select_chunks(
    db: AsyncSession,
    doc_ids: list[str],
    topic: str | None,
    limit: int,
) -> list[ChunkEmbedding]:
    """Evidence selection: topic-guided similarity, else a page-ordered
    spread across the scoped documents (similarity is computed over the
    scoped chunk set — no dedicated vector index round-trip needed)."""
    if not doc_ids:
        return []
    if topic:
        from app.services.rag_service import embed_texts

        query_vec = (await embed_texts([topic]))[0]
        stmt = (
            select(ChunkEmbedding)
            .where(ChunkEmbedding.document_id.in_(doc_ids))
            .limit(600)
        )
        chunks = (await db.execute(stmt)).scalars().all()
        scored = sorted(
            (c for c in chunks if c.embedding is not None),
            key=lambda c: _cosine(query_vec, c.embedding),
            reverse=True,
        )
        return scored[:limit]
    stmt = (
        select(ChunkEmbedding)
        .where(ChunkEmbedding.document_id.in_(doc_ids))
        .order_by(ChunkEmbedding.page_number.asc())
        .limit(limit * max(len(doc_ids), 1))
    )
    return list((await db.execute(stmt)).scalars().all())


async def _llm_findings(
    spec: dict, focus: str, chunks: list[ChunkEmbedding]
) -> list[str] | None:
    """Compose findings via an OpenAI-compatible model (when configured).

    Returns ``None`` when no key is set or the API fails, so the caller can
    fall back to extractive composition (offline-safe).
    """
    if not settings.chat_api_key_effective:
        return None
    import json as _json

    context = "\n\n".join(
        f"[{i + 1}] (doc {c.document_id}, p.{c.page_number}) {c.chunk_text}"
        for i, c in enumerate(chunks)
    )
    prompt = (
        "You are compiling an official CIL report. Using ONLY the numbered "
        f"evidence below, write {CHUNKS_PER_SECTION} short findings "
        "(max 40 words each). Every finding MUST end with the [n] marker of "
        "the evidence it uses. Output strict JSON: "
        '{"findings": ["...", "..."]}\n\n'
        f"Report focus: {focus}\n\nEVIDENCE:\n{context}"
    )
    try:
        content = (
            await post_chat_completion(
                {
                    "model": settings.chat_model,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.2,
                    "max_tokens": 700,
                },
                timeout=45,
            )
        )["choices"][0]["message"]["content"]
        start, end = content.find("{"), content.rfind("}")
        if start == -1 or end <= start:
            return None
        payload = _json.loads(content[start : end + 1])
        findings = [
            str(f).strip()
            for f in payload.get("findings", [])
            if str(f).strip()
        ]
        return findings[:CHUNKS_PER_SECTION] or None
    except Exception:  # pragma: no cover - provider/network dependent
        # Any provider failure degrades silently to extractive composition.
        return None


def _extractive_findings(
    chunks: list[ChunkEmbedding], per_doc_cap: int = 3
) -> list[str]:
    """Deterministic offline composition: pick informative sentences,
    de-duplicate, and cap per document so one report can't monopolise."""
    seen: set[str] = set()
    per_doc: dict[str, int] = {}
    findings: list[str] = []
    for chunk in chunks:
        if per_doc.get(chunk.document_id, 0) >= per_doc_cap:
            continue
        for sentence in _split_sentences(chunk.chunk_text):
            cleaned = _clean_lead(sentence)
            if cleaned is None or not _is_informative(cleaned):
                continue
            normalized = re.sub(r"\s+", " ", cleaned.lower())[:80]
            if normalized in seen:
                continue
            seen.add(normalized)
            findings.append(f"{_compress(cleaned)} [{_marker(chunk)}]")
            per_doc[chunk.document_id] = per_doc.get(chunk.document_id, 0) + 1
            break
        if len(findings) >= CHUNKS_PER_SECTION * 2:
            break
    return findings


_CITATION_MARKERS: dict[str, str] = {}


def _marker(chunk: ChunkEmbedding) -> str:
    """Citation markers are assigned per chunk id in ``compose_report``."""
    return _CITATION_MARKERS.setdefault(
        chunk.id, str(len(_CITATION_MARKERS) + 1)
    )


def _extract_key_figures(chunks: list[ChunkEmbedding]) -> list[ReportKeyFigure]:
    """Pull quotable quantities (numbers + units) out of the evidence."""
    pattern = re.compile(
        r"(?P<value>\d[\d,]*(?:\.\d+)?)\s*"
        r"(?P<unit>%|MT|Mt|Mcum|BCM|LCM|km|sq\.?\s?km|m\b|tonnes|boreholes?|"
        r"holes?|seams?|MW|crores?|lakh|INR|Rs\.?|metres|sq km)",
    )
    figures: list[ReportKeyFigure] = []
    seen: set[str] = set()
    for chunk in chunks:
        for match in pattern.finditer(chunk.chunk_text):
            value = match.group("value")
            unit = re.sub(r"\s+", " ", match.group("unit")).strip()
            figure = f"{value} {unit}"
            if figure in seen or len(figure) > 24:
                continue
            seen.add(figure)
            figures.append(ReportKeyFigure(label="From corpus", value=figure))
            if len(figures) >= 6:
                return figures
    return figures


async def compose_report(db: AsyncSession, request: ReportRequest) -> ReportOut:
    """Build the full report: docs → evidence → findings → citations."""
    started = time.perf_counter()
    global _CITATION_MARKERS
    _CITATION_MARKERS = {}

    report_type = (
        request.report_type
        if request.report_type in REPORT_TYPE_SPECS
        else DEFAULT_REPORT_TYPE
    )
    spec = REPORT_TYPE_SPECS[report_type]
    topic = (request.topic or "").strip()

    docs = await _select_docs(db, request.document_ids)
    if not docs:
        return ReportOut(
            id=str(uuid.uuid4()),
            report_type=report_type,
            title=f"CIL {spec['title_suffix']}",
            preamble=(
                "No committed documents are available in the selected scope "
                "yet. Ingest and commit reports through the Subsidiary "
                "Ingestion Hub, then regenerate."
            ),
            sections=[],
            key_figures=[],
            citations=[],
            generated_at=datetime.now(timezone.utc),
            compile_seconds=round(time.perf_counter() - started, 2),
            source_count=0,
        )

    doc_ids = [d.id for d in docs]
    chunks = await _select_chunks(
        db, doc_ids, topic or None, CHUNKS_PER_SECTION * 2
    )

    findings = await _llm_findings(spec, topic or spec["label"], chunks)
    composition = "llm" if findings else "extractive"
    if not findings:
        # Spread the evidence budget across the scoped documents: with a
        # single-document scope a fixed cap of 3 would starve the report,
        # while a wide scope still keeps any one source from monopolising it.
        scope_count = len({c.document_id for c in chunks}) or 1
        target = CHUNKS_PER_SECTION * 2
        per_doc_cap = max(3, -(-target // scope_count))
        findings = _extractive_findings(chunks, per_doc_cap=per_doc_cap) or [
            "The selected scope contained no machine-extractable findings. "
            "Verify extraction in the Ingestion Hub and re-commit."
        ]

    # Numbered citations, in first-use order; findings reference them via [n].
    citations: list[ReportCitation] = []
    marker_to_citation: dict[str, ReportCitation] = {}
    for chunk in chunks:
        number = _marker(chunk)
        if number in marker_to_citation:
            continue
        citation = ReportCitation(
            id=chunk.id,
            documentName=next(
                (d.file_name for d in docs if d.id == chunk.document_id),
                "document",
            ),
            pageNumber=chunk.page_number,
            documentId=chunk.document_id,
            quote=chunk.chunk_text[:160],
        )
        citations.append(citation)
        marker_to_citation[number] = citation
        if len(citations) >= MAX_CITATIONS:
            break

    # Distribute findings across the section plan.
    sections: list[ReportSection] = []
    buckets: list[list[str]] = [[] for _ in spec["sections"]]
    if findings and topic and len(spec["sections"]) == 3:
        buckets[0].append(
            f"Focus of this report: {topic} — compiled from the committed corpus."
        )
    for i, finding in enumerate(findings):
        index = min(
            i * len(spec["sections"]) // max(len(findings), 1),
            len(spec["sections"]) - 1,
        )
        buckets[index].append(finding)
    for heading, items in zip(spec["sections"], buckets):
        sections.append(
            ReportSection(
                heading=heading, body="\n".join(f"- {item}" for item in items)
            )
        )

    scope = topic or ", ".join(d.file_name for d in docs[:2]) + (
        f" (+{len(docs) - 2} more)" if len(docs) > 2 else ""
    )
    title = (
        f"CIL {spec['title_suffix']} — {scope[:90]} "
        f"({_fiscal_year_of(docs[0])})"
    )
    preamble = (
        f"Compiled on demand from {len(docs)} committed document(s) — "
        f"{', '.join(d.file_name for d in docs[:3])}"
        f"{'…' if len(docs) > 3 else ''}. Composition mode: {composition}. "
        "Every statement carries a [n] citation resolvable to document and page."
    )

    return ReportOut(
        id=str(uuid.uuid4()),
        report_type=report_type,
        title=title,
        preamble=preamble,
        sections=sections,
        key_figures=_extract_key_figures(chunks),
        citations=citations,
        generated_at=datetime.now(timezone.utc),
        compile_seconds=round(time.perf_counter() - started, 2),
        source_count=len(citations),
    )
