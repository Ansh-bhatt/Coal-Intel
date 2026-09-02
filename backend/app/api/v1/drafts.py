"""Draft endpoints: generate + export."""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db
from app.models.chat import ChatCitation, ChatMessage, ChatSession
from app.models.draft import Draft
from app.models.user import User
from app.schemas.draft import DraftCreate, DraftOut
from app.schemas.chat import BoundingBox, CitationOut
from app.services.draft_service import compose_draft
from app.services.export_service import export_draft_docx_bytes, export_draft_pdf_bytes

router = APIRouter(prefix="/drafts", tags=["drafts"])


@router.post("", response_model=DraftOut)
async def generate_draft(
    payload: DraftCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate a parliamentary draft from a chat session."""
    draft = await compose_draft(db, payload.session_id, current_user.id)
    # Fetch citations for the response.
    messages = (
        (
            await db.execute(
                select(ChatMessage)
                .where(ChatMessage.session_id == payload.session_id)
                .order_by(ChatMessage.created_at)
            )
        )
        .scalars()
        .all()
    )
    citations: list[CitationOut] = []
    for m in messages:
        for c in m.citations:
            citations.append(
                CitationOut(
                    id=c.id,
                    documentName="source-document",
                    pageNumber=c.page_number,
                    boundingBox=BoundingBox(
                        x1=c.bbox_x1 or 0, y1=c.bbox_y1 or 0,
                        x2=c.bbox_x2 or 0, y2=c.bbox_y2 or 0,
                    ),
                )
            )
    return DraftOut(
        id=draft.id,
        title=draft.title,
        preamble=draft.preamble or "",
        body=draft.body,
        created_at=draft.created_at,
        citations=citations,
    )


@router.get("/{draft_id}/export")
async def export_draft(
    draft_id: str,
    format: str = "pdf",
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    draft = await db.get(Draft, draft_id)
    if draft is None:
        raise HTTPException(status_code=404, detail="Draft not found")

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
    citations: list[CitationOut] = []
    for m in messages:
        for c in m.citations:
            citations.append(
                CitationOut(
                    id=c.id,
                    documentName="source-document",
                    pageNumber=c.page_number,
                    boundingBox=BoundingBox(
                        x1=c.bbox_x1 or 0, y1=c.bbox_y1 or 0,
                        x2=c.bbox_x2 or 0, y2=c.bbox_y2 or 0,
                    ),
                )
            )

    draft_out = DraftOut(
        id=draft.id, title=draft.title, preamble=draft.preamble or "",
        body=draft.body, created_at=draft.created_at, citations=citations,
    )

    if format == "pdf":
        body = export_draft_pdf_bytes(draft_out)
        filename = draft.title.replace("\u2014", "-").replace("?", "").replace("/", "_")[:100]
        return Response(content=body, media_type="application/pdf",
                        headers={"Content-Disposition": f"attachment; filename={filename}.pdf"})
    elif format == "docx":
        body = export_draft_docx_bytes(draft_out)
        filename = draft.title.replace("\u2014", "-").replace("?", "").replace("/", "_")[:100]
        return Response(content=body,
                        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                        headers={"Content-Disposition": f"attachment; filename={filename}.docx"})
    raise HTTPException(status_code=400, detail=f"Unsupported format: {format}")