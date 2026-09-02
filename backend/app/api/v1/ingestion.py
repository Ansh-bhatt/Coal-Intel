"""Ingestion endpoints: verification grid CRUD, commit."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db, require_role
from app.models.extraction import ExtractedRecord
from app.models.user import User
from app.models.document import Document
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
    doc = await db.get(Document, document_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
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
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Commit a document: locks all flagged records, flips status, triggers embedding."""
    doc = await db.get(Document, document_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
    if doc.status != "verified":
        raise HTTPException(
            status_code=400, detail="Document must be in 'verified' status to commit"
        )

    # Check all flagged records are resolved.
    flagged = (
        (
            await db.execute(
                select(func.count()).where(
                    ExtractedRecord.document_id == document_id,
                    ExtractedRecord.status == "flagged",
                )
            )
        )
        .scalar_one()
    )
    if flagged > 0:
        raise HTTPException(
            status_code=400,
            detail=f"{flagged} flagged records must be corrected before commit",
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

    # Trigger embedding in background.
    await embed_document(doc.id)

    return CommitResponse(
        document_id=doc.id, status=doc.status, committed_at=doc.committed_at
    )