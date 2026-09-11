"""Chat / RAG schemas — mirror lib/types.ts Citation + ChatMessage."""

from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class BoundingBox(BaseModel):
    x1: float
    y1: float
    x2: float
    y2: float


class CitationOut(BaseModel):
    id: str
    documentName: str
    pageNumber: int
    # Source document UUID — None for synthetic/demo citations that do not map
    # to an ingested document row.
    documentId: str | None = None
    boundingBox: BoundingBox


class ChatRequest(BaseModel):
    """POST /chat body.

    ``session_id`` is a validated UUID: the Swagger "Try it out" panel
    prefills string fields with the literal placeholder ``"string"``, which
    used to reach asyncpg's UUID codec and surface as an unhandled 500. The
    model-level example gives /docs a valid prefilled body out of the box.
    """

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "message": "Tell about coal status",
                "session_id": None,
                "subsidiary": None,
                "coalfield": None,
                "fiscal_year": None,
            }
        }
    )

    message: str = Field(min_length=1, examples=["Tell about coal status"])
    session_id: UUID | None = Field(
        default=None,
        examples=["3fa85f64-5717-4562-b3fc-2c963f66afa6"],
        description="Existing chat session (omit to start a new one).",
    )
    subsidiary: str | None = Field(default=None, examples=["NCL"])
    coalfield: str | None = Field(default=None, examples=["Singrauli"])
    fiscal_year: str | None = Field(default=None, examples=["2024-25"])


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
