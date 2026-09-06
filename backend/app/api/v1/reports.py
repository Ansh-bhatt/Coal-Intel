"""Report Generation Studio endpoints — POST /reports/generate + /reports/export.

Report compilation here is strictly user-triggered: the frontend only calls
``/generate`` from an explicit "Generate Report" action (never on page mount
or dialog open), per Instructions.md §2. ``/export`` is stateless — the
client echoes the generated report back and receives a rendered PDF/DOCX,
so no extra table or migration is required.
"""

import re

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db, require_role
from app.models.user import User
from app.schemas.report import ReportExportRequest, ReportOut, ReportRequest
from app.services.export_service import (
    export_report_docx_bytes,
    export_report_pdf_bytes,
)
from app.services.report_service import compose_report

router = APIRouter(prefix="/reports", tags=["reports"])


@router.post("/generate", response_model=ReportOut)
async def generate_report(
    payload: ReportRequest | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("EXECUTIVE", "ADMIN")),
):
    """Compile a structured, citation-numbered report from the committed corpus.

    Accepts ``{report_type, topic, document_ids}``. The body is grounded in
    the selected committed documents (default: the whole corpus) — statements
    are either extracted from retrieved chunks or, when an LLM key is set,
    narrative-composed from the same evidence. Either way every claim keeps
    its [n] citation marker.
    """
    request = payload or ReportRequest()
    return await compose_report(db, request)


def _export_filename(title: str, extension: str) -> str:
    """Sanitise a report title into a safe Content-Disposition filename."""
    safe = "".join(ch if ch.isalnum() or ch in "-_ " else "-" for ch in title)
    safe = "-".join(safe.split())[:100].strip("-") or "report"
    return f"{safe}.{extension}"


@router.post("/export")
async def export_report(
    payload: ReportExportRequest,
    current_user: User = Depends(require_role("EXECUTIVE", "ADMIN")),
):
    """Render a generated report to PDF or DOCX (stateless, no persistence)."""
    report = payload.report
    fmt = (payload.format or "pdf").lower()
    if fmt == "pdf":
        return Response(
            content=export_report_pdf_bytes(report),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{_export_filename(report.title, "pdf")}"'
            },
        )
    if fmt == "docx":
        return Response(
            content=export_report_docx_bytes(report),
            media_type=(
                "application/vnd.openxmlformats-officedocument"
                ".wordprocessingml.document"
            ),
            headers={
                "Content-Disposition": f'attachment; filename="{_export_filename(report.title, "docx")}"'
            },
        )
    raise HTTPException(status_code=400, detail=f"Unsupported format: {fmt}")