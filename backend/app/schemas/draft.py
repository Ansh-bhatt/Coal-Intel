"""Draft schemas — mirror lib/types.ts DraftDocument."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.chat import CitationOut


class DraftOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    preamble: str | None = None
    body: str
    created_at: datetime
    citations: list[CitationOut] = []


class DraftCreate(BaseModel):
    """POST /drafts body.

    ``session_id`` is a validated UUID so the /docs placeholder ``"string"``
    yields a clean 422 instead of an asyncpg UUID-encode 500.
    """

    model_config = ConfigDict(
        json_schema_extra={
            "example": {"session_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6"}
        }
    )

    session_id: UUID = Field(
        examples=["3fa85f64-5717-4562-b3fc-2c963f66afa6"],
        description="Chat session to compose the draft from.",
    )
