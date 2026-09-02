"""Draft schemas — mirror lib/types.ts DraftDocument."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict

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
    session_id: str
