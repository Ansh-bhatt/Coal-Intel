"""Analytics schemas."""

from pydantic import BaseModel


class WordCloudItem(BaseModel):
    text: str
    value: int


class TopicItem(BaseModel):
    """One ranked topic (keyphrase) for the topic-identification panel."""

    text: str
    value: int
    chunks: int


class AnalyticsMetrics(BaseModel):
    total_documents: int
    committed_documents: int
    total_records: int
    verified_records: int
    average_confidence: float | None = None
    extraction_accuracy: float | None = None
    total_chunks: int
