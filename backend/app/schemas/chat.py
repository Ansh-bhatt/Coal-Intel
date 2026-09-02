"""Chat / RAG schemas — mirror lib/types.ts Citation + ChatMessage."""

from pydantic import BaseModel, ConfigDict


class BoundingBox(BaseModel):
    x1: float
    y1: float
    x2: float
    y2: float


class CitationOut(BaseModel):
    id: str
    documentName: str
    pageNumber: int
    boundingBox: BoundingBox


class ChatRequest(BaseModel):
    message: str
    session_id: str | None = None
    subsidiary: str | None = None
    coalfield: str | None = None
    fiscal_year: str | None = None


class ChatSessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str | None = None
    created_at: str


class ChatHistoryMessage(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    role: str
    content: str
    citations: list[CitationOut] = []
