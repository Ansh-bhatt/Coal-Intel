"""Analytics schemas."""

from pydantic import BaseModel


class WordCloudItem(BaseModel):
    text: str
    value: int


class AnalyticsMetrics(BaseModel):
    total_documents: int
    committed_documents: int
    total_records: int
    verified_records: int
    average_confidence: float | None = None
    extraction_accuracy: float | None = None
    total_chunks: int
