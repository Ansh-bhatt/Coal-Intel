"""Chat endpoints: SSE streaming chat, session management."""

import json
import logging
import time
import uuid
from datetime import datetime, timezone
from uuid import UUID

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
from app.services.rag_service import generate_answer_stream, retrieve

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])


async def _load_history(
    db: AsyncSession, session_id: str, limit: int = 10
) -> list[dict[str, str]]:
    """Recent transcript turns (oldest→newest) for conversation continuity."""
    rows = (
        (
            await db.execute(
                select(ChatMessage)
                .where(ChatMessage.session_id == session_id)
                .order_by(ChatMessage.created_at.desc())
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )
    return [
        {"role": m.role, "content": m.content}
        for m in reversed(rows)
        if m.role in ("user", "assistant") and m.content
    ]


async def _stream_answer(
    session_id: str,
    query: str,
    db: AsyncSession,
    subsidiary: str | None = None,
    coalfield: str | None = None,
    fiscal_year: str | None = None,
):
    """SSE generator: yields token events and a final citations event."""
    # Conversation memory: recent transcript (oldest→newest) so follow-up
    # questions can resolve references like "it" or "that block". Loaded
    # before the new user message is written so it is not duplicated.
    history = await _load_history(db, session_id)
    logger.info("chat history: %d prior turn(s) for session %s", len(history), session_id)

    # Persist the user message.
    msg = ChatMessage(
        session_id=session_id, role="user", content=query,
        created_at=datetime.now(timezone.utc),
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)

    # Retrieve + generate. The LLM is consumed as a true token stream so the
    # first SSE token lands in ~1-2s (provider TTFT) instead of after the
    # whole completion — a slow provider previously starved the UI's 30s
    # first-token watchdog even though the stream was alive.
    t0 = time.monotonic()
    chunks = await retrieve(db, query, subsidiary=subsidiary, coalfield=coalfield, fiscal_year=fiscal_year)
    logger.info(
        "chat stream start session=%s chunks=%d retrieve=%.1fs",
        session_id, len(chunks), time.monotonic() - t0,
    )

    parts: list[str] = []
    citations: list[CitationOut] = []
    ttft: float | None = None
    failure: str | None = None
    try:
        async for event in generate_answer_stream(query, chunks, history=history):
            if event["type"] == "delta":
                if ttft is None:
                    ttft = time.monotonic() - t0
                parts.append(event["text"])
                yield {"event": "token", "data": json.dumps({"token": event["text"]})}
            elif event["type"] == "citations":
                citations = event["citations"]
    except Exception:  # noqa: BLE001 — surfaced to the client as an SSE error event
        logger.exception("chat stream failed session=%s", session_id)
        failure = (
            "The query engine was interrupted while answering. What is shown "
            "may be incomplete — please try again."
        )

    answer = "".join(parts)
    if answer:
        # Persist once the stream ends, keeping the transcript consistent with
        # what the user actually saw (a mid-stream failure persists the partial
        # text; a client abort cancels the generator before persistence).
        assist = ChatMessage(
            session_id=session_id, role="assistant", content=answer,
            created_at=datetime.now(timezone.utc),
        )
        db.add(assist)
        await db.commit()
        await db.refresh(assist)

        # Persist citations (real rows — previously a no-op stub, so drafts and
        # history lost all source traceability). Only present on clean streams:
        # a mid-stream failure never receives the citations event.
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
    else:
        assist = None

    if failure is not None:
        # Explicit error event — the client must never have to guess whether a
        # closed stream means success.
        yield {"event": "error", "data": json.dumps({"message": failure})}
        return
    if assist is None:
        yield {
            "event": "error",
            "data": json.dumps({"message": "The query engine returned no answer. Please try again."}),
        }
        return

    logger.info(
        "chat stream complete session=%s ttft=%.1fs total=%.1fs chars=%d",
        session_id, ttft or 0.0, time.monotonic() - t0, len(answer),
    )
    yield {"event": "citations", "data": json.dumps([c.model_dump() for c in citations])}
    yield {"event": "done", "data": json.dumps({"message_id": assist.id, "session_id": session_id})}


@router.post("")
async def chat(
    payload: ChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """POST /api/v1/chat returns an SSE stream of tokens + citations."""
    # payload.session_id is a validated UUID (ChatRequest) — normalise to the
    # string form the UUID(as_uuid=False) model columns expect.
    session_id = str(payload.session_id) if payload.session_id else str(uuid.uuid4())

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
    # Path UUID: a garbage id now yields a clean 422 instead of a DB 500.
    session_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the transcript of a chat session (owner-only)."""
    session_id = str(session_id)  # models use UUID(as_uuid=False) strings
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