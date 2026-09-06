"""Analytics endpoints: metric cards + word cloud."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db, require_role
from app.models.document import Document
from app.models.extraction import ChunkEmbedding, ExtractedRecord
from app.models.user import User
from app.schemas.analytics import AnalyticsMetrics, TopicItem, WordCloudItem

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
        average_confidence=round(avg_conf, 3) if avg_conf is not None else None,
        extraction_accuracy=accuracy,
        total_chunks=total_chunks,
    )


# Module-level stop word list shared by /wordcloud and /topics.
STOP_WORDS = {
    # Generic English function words.
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "by", "with", "from", "is", "are", "was", "were", "be", "been",
    "being", "have", "has", "had", "do", "does", "did", "will", "would",
    "could", "should", "may", "might", "shall", "can", "not", "no", "nor",
    "this", "that", "these", "those", "it", "its", "as", "per", "each",
    "their", "them", "they", "than", "then", "there", "here", "such",
    "also", "into", "over", "under", "between", "during", "without",
    "about", "across", "after", "before", "along", "already", "any",
    "because", "both", "either", "every", "following", "further",
    "however", "itself", "least", "less", "made", "make", "more", "most",
    "much", "near", "need", "next", "only", "other", "others", "out",
    "same", "several", "some", "still", "take", "taken", "through",
    "towards", "toward", "upon", "use", "used", "uses", "using", "various",
    "very", "well", "what", "when", "where", "which", "while", "whole",
    "within", "yet", "thereof", "thereby", "hereby", "www", "http",
    # Reporting boilerplate / administrative noise.
    "coal", "subsidiary", "report", "year", "data", "cmpdi", "cil",
    "limited", "ltd", "annexure", "annex", "appendix", "table", "figure",
    "total", "above", "below", "given", "shown", "respectively", "april",
    "march", "january", "february", "december", "november", "october",
    "september", "august", "july", "june", "month", "months", "quarter",
    "section", "page", "pages", "note", "notes", "source", "hence",
    "thus", "therefore", "whereas", "including", "included", "plate",
    "plates", "enclosed", "enclosure", "reference", "references",
    "considered", "required", "regard", "regards",
}


async def _corpus_term_scores(
    db: AsyncSession, subsidiary: str | None = None
) -> list[tuple[str, float, int]]:
    """TF-IDF term ranking over the committed corpus.

    Each chunk is a document in the TF-IDF space; the score aggregates
    tf * idf per term across the selected corpus. Returns
    ``[(term, score, chunk_count)]`` sorted by score descending.
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

    term_freqs: list[Counter] = []
    doc_freq: Counter = Counter()
    for text in chunks:
        words = re.findall(r"[a-zA-Z]{4,}", text.lower())
        tf = Counter(w for w in words if w not in STOP_WORDS)
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

    # Terms must recur in at least 2 chunks (single-chunk OCR noise),
    # unless the corpus itself only has one chunk.
    min_df = 2 if n_chunks >= 2 else 1
    ranked = [
        (term, score, doc_freq[term])
        for term, score in scores.items()
        if doc_freq[term] >= min_df
    ]
    ranked.sort(key=lambda item: item[1], reverse=True)
    return ranked


@router.get("/wordcloud", response_model=list[WordCloudItem])
async def get_wordcloud(
    subsidiary: str | None = Query(None),
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Top 50 TF-IDF keyphrases over the committed corpus (word cloud).

    Stop words (generic + reporting boilerplate) are filtered and terms that
    only occur in a single chunk are suppressed as extraction noise.
    """
    ranked = await _corpus_term_scores(db, subsidiary)
    return [
        WordCloudItem(text=term, value=int(round(score)))
        for term, score, _ in ranked[:50]
    ]


@router.get("/topics", response_model=list[TopicItem])
async def get_topics(
    subsidiary: str | None = Query(None),
    limit: int = Query(12, ge=5, le=25),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Ranked topic identification over the committed corpus.

    Same TF-IDF ranking as the word cloud, surfaced as an explicit ranked
    list (term, weight, chunk coverage) for the Analytics "Top Topics" panel
    — the problem statement's topic-identification requirement.
    """
    ranked = await _corpus_term_scores(db, subsidiary)
    return [
        TopicItem(text=term, value=int(round(score)), chunks=chunks)
        for term, score, chunks in ranked[:limit]
    ]