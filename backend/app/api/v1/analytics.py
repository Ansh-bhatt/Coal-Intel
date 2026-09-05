"""Analytics endpoints: metric cards + word cloud."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db, require_role
from app.models.document import Document
from app.models.extraction import ChunkEmbedding, ExtractedRecord
from app.models.user import User
from app.schemas.analytics import AnalyticsMetrics, WordCloudItem

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/metrics", response_model=AnalyticsMetrics)
async def get_metrics(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Aggregate metrics for the Analytics Dashboard metric cards."""
    total_documents = (
        await db.execute(select(func.count()).select_from(Document))
    ).scalar_one()
    committed_documents = (
        await db.execute(
            select(func.count()).where(Document.status == "committed")
        )
    ).scalar_one()
    total_records = (
        await db.execute(select(func.count()).select_from(ExtractedRecord))
    ).scalar_one()
    verified_records = (
        await db.execute(
            select(func.count()).where(
                ExtractedRecord.status.in_(["verified", "corrected"])
            )
        )
    ).scalar_one()
    avg_confidence = (
        await db.execute(
            select(func.avg(ExtractedRecord.confidence)).where(
                ExtractedRecord.confidence.isnot(None)
            )
        )
    ).scalar_one()
    total_chunks = (
        await db.execute(select(func.count()).select_from(ChunkEmbedding))
    ).scalar_one()

    avg_conf = float(avg_confidence) if avg_confidence is not None else None
    accuracy = round(avg_conf * 100, 1) if avg_conf is not None else None

    return AnalyticsMetrics(
        total_documents=total_documents,
        committed_documents=committed_documents,
        total_records=total_records,
        verified_records=verified_records,
        average_confidence=round(avg_conf, 3) if avg_conf else None,
        extraction_accuracy=accuracy,
        total_chunks=total_chunks,
    )


@router.get("/wordcloud", response_model=list[WordCloudItem])
async def get_wordcloud(
    subsidiary: str | None = Query(None),
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """TF-IDF keyword extraction over the committed corpus.

    Each chunk is treated as a document in the TF-IDF space: term frequency is
    counted per chunk, inverse document frequency is derived from how many
    chunks contain the term, and the score aggregates tf * idf across the
    selected corpus. Generic English stop words plus geological/mining domain
    noise (coal, subsidiary, report, year, data, cmpdi, cil, …) are filtered
    before scoring. Returns the top 50 terms.
    """
    import math
    import re
    from collections import Counter, defaultdict

    stmt = select(Document.id).where(Document.status == "committed")
    if subsidiary:
        stmt = stmt.where(Document.subsidiary.has(name=subsidiary))
    doc_ids = (await db.execute(stmt)).scalars().all()
    if not doc_ids:
        return []

    chunks = (
        (
            await db.execute(
                select(ChunkEmbedding.chunk_text).where(
                    ChunkEmbedding.document_id.in_(doc_ids)
                )
            )
        )
        .scalars()
        .all()
    )

    stop_words = {
        # Generic English function words.
        "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
        "of", "by", "with", "from", "is", "are", "was", "were", "be", "been",
        "being", "have", "has", "had", "do", "does", "did", "will", "would",
        "could", "should", "may", "might", "shall", "can", "not", "no", "nor",
        "this", "that", "these", "those", "it", "its", "as", "per", "each",
        "their", "them", "they", "than", "then", "there", "here", "such",
        "also", "into", "over", "under", "between", "during", "without",
        # Reporting boilerplate / geological-mining domain noise.
        "coal", "subsidiary", "report", "year", "data", "cmpdi", "cil",
        "limited", "ltd", "annexure", "annex", "appendix", "table", "figure",
        "total", "above", "below", "given", "shown", "respectively", "april",
        "march", "january", "february", "december", "november", "october",
        "september", "august", "july", "june", "month", "months", "quarter",
        "section", "page", "pages", "note", "notes", "source", "hence",
        "thus", "however", "therefore", "whereas", "including", "included",
    }

    term_freqs: list[Counter] = []
    doc_freq: Counter = Counter()
    for text in chunks:
        words = re.findall(r"[a-zA-Z]{4,}", text.lower())
        tf = Counter(w for w in words if w not in stop_words)
        if not tf:
            continue
        term_freqs.append(tf)
        doc_freq.update(tf.keys())

    if not term_freqs:
        return []

    n_chunks = len(term_freqs)
    scores: dict[str, float] = defaultdict(float)
    for tf in term_freqs:
        for term, freq in tf.items():
            idf = math.log((1 + n_chunks) / (1 + doc_freq[term])) + 1.0
            scores[term] += freq * idf

    top = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)[:50]
    return [
        WordCloudItem(text=term, value=int(round(score)))
        for term, score in top
    ]