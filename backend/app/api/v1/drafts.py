"""Draft endpoints: generate + export."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db
from app.models.chat import ChatCitation, ChatMessage, ChatSession
from app.models.document import Document
from app.models.draft import Draft
from app.models.user import User
from app.schemas.draft import DraftCreate, DraftOut
from app.schemas.chat import BoundingBox, CitationOut
from app.services.draft_service import compose_draft
from app.services.export_service import export_draft_docx_bytes, export_draft_pdf_bytes

router = APIRouter(prefix="/drafts", tags=["drafts"])


async def _citations_out(
    db: AsyncSession, messages: list[ChatMessage]
) -> list[CitationOut]:
    """Map persisted ChatCitation rows to CitationOut with real document names."""
    doc_ids = {c.document_id for m in messages for c in m.citations if c.document_id}
    names_by_id: dict[str, str] = {}
    if doc_ids:
        name_rows = (
            await db.execute(
                select(Document.id, Document.file_name).where(Document.id.in_(doc_ids))
            )
        ).all()
        names_by_id = {r.id: r.file_name for r in name_rows}

    result: list[CitationOut] = []
    for m in messages:
        for c in m.citations:
            result.append(
                CitationOut(
                    id=c.id,
                    documentName=names_by_id.get(c.document_id or "", "source-document"),
                    pageNumber=c.page_number,
                    documentId=c.document_id,
                    boundingBox=BoundingBox(
                        x1=c.bbox_x1 or 0, y1=c.bbox_y1 or 0,
                        x2=c.bbox_x2 or 0, y2=c.bbox_y2 or 0,
                    ),
                )
            )
    return result


@router.post("", response_model=DraftOut)
async def generate_draft(
    payload: DraftCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate a parliamentary draft from a chat session."""
    # DraftCreate.session_id arrives as a validated UUID (schema) — normalise
    # to the string form the UUID(as_uuid=False) model columns expect.
    session_id = str(payload.session_id)
    session = await db.get(ChatSession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Chat session not found")
    if session.user_id != current_user.id:
        raise HTTPException(
            status_code=403, detail="Not authorized to access this chat session"
        )

    try:
        draft = await compose_draft(db, session_id, current_user.id)
    except ValueError as exc:
        # compose_draft signals missing sessions / empty transcripts / no
        # assistant reply with ValueError — surface them as 4xx instead of
        # letting the exception bubble into an unhandled 500.
        detail = str(exc)
        status_code = 404 if "not found" in detail else 400
        raise HTTPException(status_code=status_code, detail=detail) from exc

    messages = (
        (
            await db.execute(
                select(ChatMessage)
                .where(ChatMessage.session_id == session_id)
                .order_by(ChatMessage.created_at)
            )
        )
        .scalars()
        .all()
    )
    citations = await _citations_out(db, messages)
    return DraftOut(
        id=draft.id,
        title=draft.title,
        preamble=draft.preamble or "",
        body=draft.body,
        created_at=draft.created_at,
        citations=citations,
    )


def _export_filename(title: str, extension: str) -> str:
    """Sanitise a draft title into a safe Content-Disposition filename."""
    safe = "".join(ch if ch.isalnum() or ch in "-_ " else "-" for ch in title)
    safe = "-".join(safe.split())[:100].strip("-") or "draft"
    return f"{safe}.{extension}"


@router.get("/{draft_id}/export")
async def export_draft(
    draft_id: UUID,
    format: str = "pdf",
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    draft = await db.get(Draft, str(draft_id))
    if draft is None:
        raise HTTPException(status_code=404, detail="Draft not found")

    # Owner-only export: the draft must belong to a chat session owned by the
    # caller (prevents cross-user draft content disclosure).
    session = await db.get(ChatSession, draft.session_id)
    if session is None or session.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to export this draft")

    # Build a DraftOut for the export service.
    messages = (
        (
            await db.execute(
                select(ChatMessage)
                .where(ChatMessage.session_id == draft.session_id)
                .order_by(ChatMessage.created_at)
            )
        )
        .scalars()
        .all()
    )
    citations = await _citations_out(db, messages)

    draft_out = DraftOut(
        id=draft.id, title=draft.title, preamble=draft.preamble or "",
        body=draft.body, created_at=draft.created_at, citations=citations,
    )

    if format == "pdf":
        body = export_draft_pdf_bytes(draft_out)
        filename = _export_filename(draft.title, "pdf")
        return Response(content=body, media_type="application/pdf",
                        headers={"Content-Disposition": f'attachment; filename="{filename}"'})
    elif format == "docx":
        body = export_draft_docx_bytes(draft_out)
        filename = _export_filename(draft.title, "docx")
        return Response(content=body,
                        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                        headers={"Content-Disposition": f'attachment; filename="{filename}"'})
    raise HTTPException(status_code=400, detail=f"Unsupported format: {format}")