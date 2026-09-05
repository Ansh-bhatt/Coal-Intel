"""Report generation schemas (on-demand executive reports)."""

from datetime import datetime

from pydantic import BaseModel


class ReportCitation(BaseModel):
    id: str
    documentName: str
    pageNumber: int


class ReportOut(BaseModel):
    id: str
    title: str
    preamble: str
    body: str
    citations: list[ReportCitation]
    generated_at: datetime