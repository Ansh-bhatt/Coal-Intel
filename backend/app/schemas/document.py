"""Document schemas."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    file_name: str
    file_type: str
    subsidiary: str | None = None
    coalfield: str | None = None
    category: str | None = None
    fiscal_year: str | None = None
    status: str
    uploaded_at: datetime
    committed_at: datetime | None = None


class DocumentListOut(BaseModel):
    items: list[DocumentOut]
    total: int
    limit: int
    offset: int


class MetadataUpdate(BaseModel):
    subsidiary: str
    coalfield: str
    category: str
    fiscal_year: str
