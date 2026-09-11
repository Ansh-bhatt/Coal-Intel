"""Ingestion endpoints: verification grid CRUD, commit."""

from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.documents import _get_scoped_document
from app.core.config import get_settings
from app.core.deps import get_current_user, get_db
from app.models.extraction import ExtractedRecord
from app.models.user import User
from app.models.draft import AuditLog
from app.schemas.extraction import (
    CommitResponse,
    ExtractedRecordListOut,
    ExtractedRecordOut,
    RecordUpdate,
)
from app.workers.embedding_worker import embed_document

router = APIRouter(prefix="/documents", tags=["ingestion"])


def _record_out(r: ExtractedRecord) -> ExtractedRecordOut:
    return ExtractedRecordOut(
        id=r.id, key=r.key, value=r.value, confidence=r.confidence, status=r.status
    )


@router.get("/{document_id}/records", response_model=ExtractedRecordListOut)
async def list_records(
    document_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return extracted records for the HITL verification grid."""
    # Scope the document to the caller (subsidiary isolation) instead of a
    # bare db.get() — previously any user could read another subsidiary's
    # extracted records by id.
    doc = await _get_scoped_document(db, document_id, current_user)
    rows = (
        (
            await db.execute(
                select(ExtractedRecord).where(
                    ExtractedRecord.document_id == document_id
                )
            )
        )
        .scalars()
        .all()
    )
    return ExtractedRecordListOut(
        items=[_record_out(r) for r in rows], total=len(rows)
    )


@router.patch("/records/{record_id}")
async def update_record(
    record_id: str,
    payload: RecordUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Inline correction in the HITL grid (PATCH /api/v1/records/{id})."""
    record = await db.get(ExtractedRecord, record_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Record not found")

    # The record alone carries no ownership — scope through its parent
    # document so subsidiary users cannot PATCH other subsidiaries' records.
    await _get_scoped_document(db, record.document_id, current_user)

    old_value = record.value
    record.value = payload.value
    record.corrected_value = payload.value
    record.corrected_by = current_user.id
    record.corrected_at = datetime.now(timezone.utc)
    record.status = "corrected"

    # Audit trail.
    db.add(
        AuditLog(
            actor_id=current_user.id,
            action="record.correct",
            entity_type="extracted_record",
            entity_id=record.id,
            before_value={"value": old_value},
            after_value={"value": payload.value},
        )
    )
    await db.commit()
    return {"id": record.id, "status": record.status, "value": record.value}


@router.post("/{document_id}/commit", response_model=CommitResponse)
async def commit_document(
    document_id: str,
    background: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Commit a document: locks all flagged records, flips status, triggers embedding."""
    doc = await _get_scoped_document(db, document_id, current_user)
    if doc.status != "verified":
        raise HTTPException(
            status_code=400, detail="Document must be in 'verified' status to commit"
        )

    # Flagged records must be resolved before commit. With HITL_AUTO_RESOLVE
    # enabled (prototype default) the commit auto-accepts them in bulk: the
    # extracted value becomes the accepted value (kept in corrected_value),
    # every flip is audited, and the commit proceeds. Set
    # HITL_AUTO_RESOLVE=false for strict human-in-the-loop behaviour.
    settings = get_settings()
    flagged = (
        (
            await db.execute(
                select(ExtractedRecord).where(
                    ExtractedRecord.document_id == document_id,
                    ExtractedRecord.status == "flagged",
                )
            )
        )
        .scalars()
        .all()
    )
    if flagged and not settings.hitl_auto_resolve:
        raise HTTPException(
            status_code=400,
            detail=f"{len(flagged)} flagged records must be corrected before commit",
        )
    for record in flagged:
        record.corrected_value = record.value
        record.corrected_by = current_user.id
        record.corrected_at = datetime.now(timezone.utc)
        record.status = "corrected"
        db.add(
            AuditLog(
                actor_id=current_user.id,
                action="record.auto_resolve",
                entity_type="extracted_record",
                entity_id=record.id,
                before_value={"value": record.value, "status": "flagged"},
                after_value={"value": record.value, "status": "corrected"},
            )
        )

    doc.status = "committed"
    doc.committed_at = datetime.now(timezone.utc)
    db.add(
        AuditLog(
            actor_id=current_user.id,
            action="document.commit",
            entity_type="document",
            entity_id=doc.id,
        )
    )
    await db.commit()
    await db.refresh(doc)

    # Embedding is pure I/O against a fresh session (see embed_document) and
    # can take seconds with the API-backed embedder — run it as a background
    # task so the commit response returns immediately instead of blocking the
    # request until every chunk is embedded.
    background.add_task(embed_document, doc.id)

    return CommitResponse(
        document_id=doc.id, status=doc.status, committed_at=doc.committed_at
    )