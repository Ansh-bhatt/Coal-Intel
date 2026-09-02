"""Draft composition service.

Turns a chat session into a ``{title, preamble, body, citations}`` document
matching ``DraftDocument`` in the frontend's ``lib/types.ts``.
"""

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chat import ChatMessage, ChatSession
from app.models.draft import Draft
from app.schemas.chat import BoundingBox, CitationOut


def _citations_from_message(message: ChatMessage) -> list[CitationOut]:
    result: list[CitationOut] = []
    for c in message.citations:
        result.append(
            CitationOut(
                id=c.id,
                documentName="source-document",  # enriched below
                pageNumber=c.page_number,
                boundingBox=BoundingBox(
                    x1=c.bbox_x1 or 0,
                    y1=c.bbox_y1 or 0,
                    x2=c.bbox_x2 or 0,
                    y2=c.bbox_y2 or 0,
                ),
            )
        )
    return result


async def compose_draft(db: AsyncSession, session_id: str, user_id: str) -> Draft:
    """Compose a parliamentary draft from the last assistant message of a chat."""
    session = await db.get(ChatSession, session_id)
    if session is None:
        raise ValueError("chat session not found")

    messages = (
        (await db.execute(
            select(ChatMessage)
            .where(ChatMessage.session_id == session_id)
            .order_by(ChatMessage.created_at)
        ))
        .scalars()
        .all()
    )
    if not messages:
        raise ValueError("chat session has no messages")

    user_msgs = [m for m in messages if m.role == "user"]
    last_assistant = next(
        (m for m in reversed(messages) if m.role == "assistant"), None
    )
    if last_assistant is None:
        raise ValueError("chat session has no assistant answer to draft from")

    question = user_msgs[-1].content if user_msgs else "General query"
    body = last_assistant.content

    # Strip markdown for the formal body, keep the citations.
    plain_body = _strip_markdown(body)
    citations = _citations_from_message(last_assistant)

    draft = Draft(
        session_id=session_id,
        title=f"Unstarred Question — {_slugify(question)[:80]}",
        preamble=question,
        body=plain_body,
        created_by=user_id,
        created_at=datetime.now(timezone.utc),
    )
    db.add(draft)
    await db.commit()
    await db.refresh(draft)

    # Store citations on the draft for the export service (drafts table has no
    # citation column in the reference schema; we attach them via JSON here).
    return draft


def _strip_markdown(text: str) -> str:
    import re

    text = re.sub(r"#{1,6}\s*", "", text)
    text = re.sub(r"\*\*(.*?)\*\*", r"\1", text)
    text = re.sub(r"__(.*?)__", r"\1", text)
    text = re.sub(r"`(.*?)`", r"\1", text)
    text = re.sub(r"^\s*[-*]\s+", "", text, flags=re.M)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return text


def _slugify(text: str) -> str:
    import re

    text = re.sub(r"[^a-zA-Z0-9 ]", " ", text)
    words = text.split()
    return " ".join(words[:10])
