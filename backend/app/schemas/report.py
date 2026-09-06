"""Report generation schemas (Report Generation Studio)."""

from datetime import datetime

from pydantic import BaseModel, Field


class ReportRequest(BaseModel):
    """User-driven request for POST /reports/generate."""

    report_type: str = Field(
        default="geological_brief",
        description="geological_brief | production_review | parliamentary_response",
    )
    topic: str | None = Field(
        default=None, max_length=400, description="Optional topic/question focus"
    )
    document_ids: list[str] | None = Field(
        default=None,
        description="Explicit committed-document scope; omitted = whole corpus",
    )


class ReportCitation(BaseModel):
    id: str
    documentName: str
    pageNumber: int
    documentId: str | None = None
    quote: str | None = None


class ReportSection(BaseModel):
    heading: str
    body: str


class ReportKeyFigure(BaseModel):
    label: str
    value: str


class ReportOut(BaseModel):
    id: str
    report_type: str
    title: str
    preamble: str
    sections: list[ReportSection]
    key_figures: list[ReportKeyFigure]
    citations: list[ReportCitation]
    generated_at: datetime
    compile_seconds: float = 0.0
    source_count: int = 0


class ReportExportRequest(BaseModel):
    """Stateless export: the client echoes the generated report back."""

    report: ReportOut
    format: str = Field(default="pdf", description="pdf | docx")