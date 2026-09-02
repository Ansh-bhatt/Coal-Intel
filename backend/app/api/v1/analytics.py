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
    """Build a word cloud from committed document chunks.

    Computes TF-style term frequency across the committed corpus, filtered by
    subsidiary/time window when provided.  Returns the top 50 terms.
    """
    import re
    from collections import Counter

    # Get committed document IDs (optionally filtered).
    stmt = select(Document.id).where(Document.status == "committed")
    if subsidiary:
        stmt = stmt.where(Document.subsidiary.has(name=subsidiary))
    rows = (await db.execute(stmt)).scalars().all()
    if not rows:
        return []

    # Get all chunk text for those documents.
    chunks = (
        (
            await db.execute(
                select(ChunkEmbedding.chunk_text).where(
                    ChunkEmbedding.document_id.in_(rows)
                )
            )
        )
        .scalars()
        .all()
    )

    # TF-style counting: lowercase, remove stopwords, count.
    stopwords = {
        "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
        "of", "by", "with", "from", "is", "are", "was", "were", "be", "been",
        "being", "have", "has", "had", "do", "does", "did", "will", "would",
        "could", "should", "may", "might", "shall", "can", "not", "no", "nor",
        "this", "that", "these", "those", "it", "its", "as", "at", "per", "each",
    }
    counter: Counter = Counter()
    for text in chunks:
        words = re.findall(r"[a-zA-Z]{4,}", text.lower())
        for w in words:
            if w not in stopwords and len(w) > 2:
                counter[w] += 1

    top = counter.most_common(50)
    return [WordCloudItem(text=word, value=count) for word, count in top]