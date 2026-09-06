"""Chat endpoints: SSE streaming chat, session management."""

import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from app.core.deps import get_current_user, get_db
from app.models.chat import ChatCitation, ChatMessage, ChatSession
from app.models.document import Document
from app.models.user import User
from app.schemas.chat import (
    ChatHistoryMessage,
    ChatRequest,
    ChatSessionOut,
    CitationOut,
    BoundingBox,
)
from app.services.rag_service import generate_answer, retrieve

router = APIRouter(prefix="/chat", tags=["chat"])


async def _stream_answer(
    session_id: str,
    query: str,
    db: AsyncSession,
    subsidiary: str | None = None,
    coalfield: str | None = None,
    fiscal_year: str | None = None,
):
    """SSE generator: yields token events and a final citations event."""
    # Persist the user message.
    msg = ChatMessage(
        session_id=session_id, role="user", content=query,
        created_at=datetime.now(timezone.utc),
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)

    # Retrieve + generate.
    chunks = await retrieve(db, query, subsidiary=subsidiary, coalfield=coalfield, fiscal_year=fiscal_year)
    answer, citations = await generate_answer(query, chunks)

    # Persist the assistant message.
    assist = ChatMessage(
        session_id=session_id, role="assistant", content=answer,
        created_at=datetime.now(timezone.utc),
    )
    db.add(assist)
    await db.commit()
    await db.refresh(assist)

    # Persist citations (real rows — previously a no-op stub, so drafts and
    # history lost all source traceability).
    for c in citations:
        db.add(
            ChatCitation(
                message_id=assist.id,
                document_id=c.documentId,
                page_number=c.pageNumber,
                bbox_x1=int(c.boundingBox.x1),
                bbox_y1=int(c.boundingBox.y1),
                bbox_x2=int(c.boundingBox.x2),
                bbox_y2=int(c.boundingBox.y2),
            )
        )
    await db.commit()

    # Stream tokens.
    words = answer.split(" ")
    for i, word in enumerate(words):
        chunk = word + (" " if i < len(words) - 1 else "")
        yield {"event": "token", "data": json.dumps({"token": chunk})}

    yield {"event": "citations", "data": json.dumps([c.model_dump() for c in citations])}
    yield {"event": "done", "data": json.dumps({"message_id": assist.id, "session_id": session_id})}


@router.post("")
async def chat(
    payload: ChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """POST /api/v1/chat returns an SSE stream of tokens + citations."""
    session_id = payload.session_id or str(uuid.uuid4())

    # Create or verify session.
    if payload.session_id is None:
        db.add(
            ChatSession(
                id=session_id,
                user_id=current_user.id,
                title=payload.message[:80],
                created_at=datetime.now(timezone.utc),
            )
        )
        await db.commit()
    else:
        # Validate the caller-supplied session before opening the stream:
        # without this, any user could append messages to (or read history
        # from) someone else's session, and unknown ids blow up mid-stream
        # with a raw FK-violation 500 (the offline fallback client invents
        # placeholder session ids).
        session = await db.get(ChatSession, session_id)
        if session is None:
            raise HTTPException(status_code=404, detail="Chat session not found")
        if session.user_id != current_user.id:
            raise HTTPException(
                status_code=403, detail="Not authorized to access this chat session"
            )

    return EventSourceResponse(
        _stream_answer(
            session_id,
            payload.message,
            db,
            subsidiary=payload.subsidiary,
            coalfield=payload.coalfield,
            fiscal_year=payload.fiscal_year,
        )
    )


@router.get("/sessions", response_model=list[ChatSessionOut])
async def list_sessions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = (
        (
            await db.execute(
                select(ChatSession)
                .where(ChatSession.user_id == current_user.id)
                .order_by(ChatSession.created_at.desc())
                .limit(50)
            )
        )
        .scalars()
        .all()
    )
    return [ChatSessionOut(id=s.id, title=s.title, created_at=s.created_at.isoformat()) for s in rows]


@router.get("/sessions/{session_id}/messages", response_model=list[ChatHistoryMessage])
async def get_session_messages(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the transcript of a chat session (owner-only)."""
    session = await db.get(ChatSession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Chat session not found")
    if session.user_id != current_user.id:
        raise HTTPException(
            status_code=403, detail="Not authorized to access this chat session"
        )
    rows = (
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

    # Resolve citation document names in one query instead of N+1 lookups.
    doc_ids = {
        c.document_id
        for m in rows
        for c in m.citations
        if c.document_id is not None
    }
    names_by_id: dict[str, str] = {}
    if doc_ids:
        name_rows = (
            await db.execute(
                select(Document.id, Document.file_name).where(Document.id.in_(doc_ids))
            )
        ).all()
        names_by_id = {r.id: r.file_name for r in name_rows}

    def _citation_out(c: ChatCitation) -> CitationOut:
        doc_id = c.document_id
        return CitationOut(
            id=c.id,
            documentName=names_by_id.get(doc_id or "", "source-document"),
            pageNumber=c.page_number,
            documentId=doc_id,
            boundingBox=BoundingBox(
                x1=c.bbox_x1 or 0,
                y1=c.bbox_y1 or 0,
                x2=c.bbox_x2 or 0,
                y2=c.bbox_y2 or 0,
            ),
        )

    return [
        ChatHistoryMessage(
            id=m.id,
            role=m.role,
            content=m.content,
            citations=[_citation_out(c) for c in m.citations],
        )
        for m in rows
    ]