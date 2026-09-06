"""Seed the flagship Gurwani geological report into the corpus (one command).

    python -m scripts.seed_corpus

Run from ``backend/`` with the API venv active. Steps:

1. copy ``public/gurwani-block-coal-mp.pdf`` (the CIL/CMPDI flagship doc)
   into backend storage under a fixed idempotency key;
2. create the ``Document`` row (Northern Coalfields Ltd · Singrauli Coalfield ·
   Geological Report) if it does not exist yet;
3. run the production extraction worker (text layer → pages + records);
4. auto-verify all extracted records and commit the document
   (re-runnable: an already-committed seed is left untouched);
5. run the embedding worker so the report becomes RAG-searchable.

Fixes the "corpus is a near-empty stub" problem: after this the Analytics
word cloud / topics panel, Report Studio and chat all operate on real,
page-cited content.
"""

import asyncio
import shutil
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select

from app.core.config import get_settings
from app.db.session import async_session_factory
from app.models.document import Document
from app.models.subsidiary import Coalfield, Subsidiary
from app.models.user import User
from app.workers.embedding_worker import embed_document
from app.workers.extraction_worker import run_extraction_and_wait

settings = get_settings()

PUBLIC_PDF = Path(__file__).resolve().parents[2] / "public" / "gurwani-block-coal-mp.pdf"
STORAGE_SUBDIR = "seed"
FILE_NAME = "63b810daa71bd17 Gurwani block_Coal_MP.pdf"

SUBSIDIARY_NAME = "Northern Coalfields Ltd"
COALFIELD_NAME = "Singrauli Coalfield"
CATEGORY = "Geological Report"
FISCAL_YEAR = "2023-24"


async def _resolve_metadata(db) -> tuple[int | None, int | None, str | None]:
    """Resolve subsidiary/coalfield ids and an uploader id for the seed doc."""
    sub = (
        await db.execute(select(Subsidiary).where(Subsidiary.name == SUBSIDIARY_NAME))
    ).scalar_one_or_none()
    coalfield = (
        await db.execute(
            select(Coalfield).where(
                Coalfield.name == COALFIELD_NAME,
                Coalfield.subsidiary_id == sub.id if sub else True,
            )
        )
    ).scalar_one_or_none() if sub else None
    user = (
        await db.execute(select(User).where(User.role == "SUBSIDIARY").limit(1))
    ).scalar_one_or_none()
    return (
        sub.id if sub else None,
        coalfield.id if coalfield else None,
        user.id if user else None,
    )


async def seed_corpus() -> None:
    if not PUBLIC_PDF.exists():
        raise SystemExit(
            f"Seed PDF not found at {PUBLIC_PDF}. Copy the Gurwani block PDF "
            "into the project's public/ directory first."
        )

    storage_root = Path(settings.storage_dir) / STORAGE_SUBDIR
    storage_root.mkdir(parents=True, exist_ok=True)
    dest = storage_root / PUBLIC_PDF.name
    if not dest.exists():
        shutil.copyfile(PUBLIC_PDF, dest)
        print(f"[1/5] Copied PDF → {dest}")
    else:
        print(f"[1/5] PDF already at {dest}")

    # Relative storage path (same shape the upload API writes).
    storage_path = f"{STORAGE_SUBDIR}/{PUBLIC_PDF.name}"
    idempotency_key = storage_path  # stable, unique per seeded file

    async with async_session_factory() as db:
        existing = (
            await db.execute(
                select(Document).where(Document.storage_path == idempotency_key)
            )
        ).scalar_one_or_none()

        if existing is None:
            subsidiary_id, coalfield_id, uploader_id = await _resolve_metadata(db)
            doc = Document(
                file_name=FILE_NAME,
                file_type="pdf",
                storage_path=idempotency_key,
                subsidiary_id=subsidiary_id,
                coalfield_id=coalfield_id,
                category=CATEGORY,
                fiscal_year=FISCAL_YEAR,
                status="queued",
                uploaded_by=uploader_id,
            )
            db.add(doc)
            await db.commit()
            await db.refresh(doc)
            print(f"[2/5] Created document {doc.id} (queued)")
        else:
            doc = existing
            print(f"[2/5] Document already exists: {doc.id} (status={doc.status})")

        doc_id = doc.id

    if doc.status in {"queued", "error"}:
        await run_extraction_and_wait(doc_id)
        print(f"[3/5] Extraction complete for {doc_id}")
    else:
        print(f"[3/5] Skipping extraction (status={doc.status})")

    async with async_session_factory() as db:
        doc = await db.get(Document, doc_id)
        if doc.status == "committed":
            print(f"[4/5] Already committed — skipping verify/commit")
        else:
            # HITL was satisfied for the seed: auto-verify every record and
            # flip the document to committed.
            from app.models.extraction import ExtractedRecord

            records = (
                (
                    await db.execute(
                        select(ExtractedRecord).where(
                            ExtractedRecord.document_id == doc_id
                        )
                    )
                )
                .scalars()
                .all()
            )
            for record in records:
                record.status = "verified"
            doc.status = "committed"
            doc.committed_at = datetime.now(timezone.utc)
            await db.commit()
            print(f"[4/5] Verified {len(records)} records and committed {doc_id}")

    chunks = await embed_document(doc_id)
    print(f"[5/5] Embedded {chunks} chunks — corpus is RAG-searchable.")
    print("Done. The Gurwani report now feeds chat, reports, word cloud and topics.")


async def main() -> None:
    await seed_corpus()


if __name__ == "__main__":
    asyncio.run(main())