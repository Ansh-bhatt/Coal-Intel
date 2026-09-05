"""On-demand executive report generation — POST /reports/generate.

Report compilation here is strictly user-triggered: the frontend only calls
this endpoint from an explicit "Generate Report" action (never on page mount
or dialog open), per Instructions.md §2.
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db, require_role
from app.models.document import Document
from app.models.extraction import ChunkEmbedding
from app.models.user import User
from app.schemas.report import ReportCitation, ReportOut

router = APIRouter(prefix="/reports", tags=["reports"])

MAX_SOURCES = 12


def _summarise(chunk_text: str, max_sentences: int = 2) -> str:
    """Condense a chunk to its leading sentences (offline-safe)."""
    sentences = [
        s.strip()
        for s in chunk_text.replace("\n", " ").split(". ")
        if s.strip()
    ]
    if not sentences:
        return chunk_text.strip()
    return ". ".join(sentences[:max_sentences]).rstrip(".") + "."


@router.post("/generate", response_model=ReportOut)
async def generate_report(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("EXECUTIVE", "ADMIN")),
):
    """Compile an executive intelligence brief from the committed corpus.

    Deterministic, offline-safe compilation: selects the most recently
    committed documents, condenses their leading chunks into structured
    findings, and attaches a source citation (document + page) to each claim.
    """
    doc_rows = (
        (
            await db.execute(
                select(Document)
                .where(Document.status == "committed")
                .order_by(Document.committed_at.desc().nullslast())
                .limit(5)
            )
        )
        .scalars()
        .all()
    )

    body_lines: list[str] = []
    citations: list[ReportCitation] = []

    for doc in doc_rows:
        chunks = (
            (
                await db.execute(
                    select(ChunkEmbedding)
                    .where(ChunkEmbedding.document_id == doc.id)
                    .order_by(ChunkEmbedding.page_number.asc())
                    .limit(3)
                )
            )
            .scalars()
            .all()
        )
        for chunk in chunks:
            if len(citations) >= MAX_SOURCES:
                break
            citations.append(
                ReportCitation(
                    id=chunk.id,
                    documentName=doc.file_name,
                    pageNumber=chunk.page_number,
                )
            )
            body_lines.append(
                f"- {_summarise(chunk.chunk_text)} [{len(citations)}]"
            )
        if len(citations) >= MAX_SOURCES:
            break

    if body_lines:
        title = f"Executive Intelligence Brief — {doc_rows[0].file_name}"
        preamble = (
            "Compiled on request from the latest committed documents in the "
            "Coal-Intel corpus. Every statement is traceable to its source "
            "page via the numbered citations below."
        )
        body = "\n".join(body_lines)
    else:
        title = "Executive Intelligence Brief"
        preamble = (
            "No committed documents are available yet. Ingest and commit "
            "reports through the subsidiary ingestion hub, then regenerate."
        )
        body = (
            "The corpus currently holds no committed documents, so no "
            "source-grounded statements can be compiled."
        )

    return ReportOut(
        id=str(uuid.uuid4()),
        title=title,
        preamble=preamble,
        body=body,
        citations=citations,
        generated_at=datetime.now(timezone.utc),
    )