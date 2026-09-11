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


class ReportTable(BaseModel):
    """A structured data table rendered inside the report.

    Rows come from the human-verified extraction grid of the committed
    documents, so every cell traces back to a reviewed record.
    """

    title: str
    columns: list[str]
    rows: list[list[str]]
    note: str | None = None


class ReportChartSeries(BaseModel):
    """One bar in a report chart: a label and its numeric value."""

    label: str
    value: float
    unit: str | None = None


class ReportChart(BaseModel):
    """Numeric series rendered as a horizontal bar chart in report outputs.

    ``unit`` pins the whole series to one unit of measure — figures in MT are
    never charted on the same axis as metres.
    """

    title: str
    kind: str = Field(default="bar", description="Renderer hint: horizontal bar")
    unit: str | None = None
    series: list[ReportChartSeries]
    note: str | None = None


class ReportOut(BaseModel):
    id: str
    report_type: str
    title: str
    preamble: str
    sections: list[ReportSection]
    key_figures: list[ReportKeyFigure]
    tables: list[ReportTable] = []
    charts: list[ReportChart] = []
    citations: list[ReportCitation]
    generated_at: datetime
    compile_seconds: float = 0.0
    source_count: int = 0


class ReportExportRequest(BaseModel):
    """Stateless export: the client echoes the generated report back."""

    report: ReportOut
    format: str = Field(default="pdf", description="pdf | docx")
