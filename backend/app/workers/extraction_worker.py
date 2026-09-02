"""Background extraction worker.

Runs out of the request/response cycle (FastAPI BackgroundTasks for the
prototype).  Reads the stored file, extracts pages + records, persists
``document_pages`` and ``extracted_records`` rows, and flips the document
status to ``verified``.
"""

import logging
from pathlib import Path

from sqlalchemy import select

from app.core.config import get_settings
from app.db.session import async_session_factory
from app.models.document import Document
from app.models.extraction import ExtractedRecord, DocumentPage
from app.services.ingestion_service import compute_status, extract_document

logger = logging.getLogger("coal_intel.extraction")

settings = get_settings()


async def run_extraction(document_id: str) -> None:
    """Extract text + records from a stored document (background task)."""
    async with async_session_factory() as db:
        doc = await db.get(Document, document_id)
        if doc is None:
            logger.error("extraction: document %s not found", document_id)
            return

        doc.status = "processing"
        await db.commit()

        try:
            path = Path(settings.storage_dir) / doc.storage_path
            result = extract_document(path, doc.file_type)

            # Persist page text layer.
            for page in result.pages:
                db.add(
                    DocumentPage(
                        document_id=doc.id,
                        page_number=page.page_number,
                        raw_text=page.text,
                    )
                )

            # Persist extracted records with HITL status.
            for rec in result.records:
                db.add(
                    ExtractedRecord(
                        document_id=doc.id,
                        key=rec["key"],
                        value=rec["value"],
                        confidence=rec["confidence"],
                        status=compute_status(rec["confidence"]),
                    )
                )

            doc.status = "verified"
            await db.commit()
            logger.info("extraction: document %s → verified", document_id)
        except Exception as exc:  # noqa: BLE001
            logger.exception("extraction failed for %s", document_id)
            doc.status = "error"
            await db.commit()


async def run_extraction_and_wait(document_id: str) -> None:
    """Run extraction synchronously for tests/seed scripts."""
    await run_extraction(document_id)
