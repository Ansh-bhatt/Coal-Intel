"""Extraction / verification schemas — mirror lib/types.ts ExtractedRecord."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ExtractedRecordOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    key: str
    value: str
    confidence: float
    status: str


class ExtractedRecordListOut(BaseModel):
    items: list[ExtractedRecordOut]
    total: int


class RecordUpdate(BaseModel):
    value: str


class CommitResponse(BaseModel):
    document_id: str
    status: str
    committed_at: datetime
