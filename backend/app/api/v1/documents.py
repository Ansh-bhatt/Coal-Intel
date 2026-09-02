"""Document endpoints: upload, list, get, status, metadata, file stream."""

import uuid
from pathlib import Path

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    HTTPException,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.deps import get_current_user, get_db
from app.models.document import Document
from app.models.subsidiary import Coalfield, Subsidiary
from app.models.user import User
from app.schemas.document import DocumentListOut, DocumentOut, MetadataUpdate
from app.workers.extraction_worker import run_extraction

router = APIRouter(prefix="/documents", tags=["documents"])
settings = get_settings()
ALLOWED_TYPES = {"pdf", "xlsx", "docx"}


def _to_out(doc: Document) -> DocumentOut:
    return DocumentOut(
        id=doc.id,
        file_name=doc.file_name,
        file_type=doc.file_type,
        subsidiary=doc.subsidiary.name if doc.subsidiary else None,
        coalfield=doc.coalfield.name if doc.coalfield else None,
        category=doc.category,
        fiscal_year=doc.fiscal_year,
        status=doc.status,
        uploaded_at=doc.uploaded_at,
        committed_at=doc.committed_at,
    )


async def _get_scoped_document(db: AsyncSession, document_id: str, current_user: User) -> Document:
    doc = await db.get(Document, document_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
    if current_user.role == "SUBSIDIARY" and current_user.subsidiary_id is not None and doc.subsidiary_id != current_user.subsidiary_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    return doc


@router.post("", status_code=status.HTTP_201_CREATED)
async def upload_document(
    background: BackgroundTasks,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    name = file.filename or "document"
    suffix = Path(name).suffix.lstrip(".").lower()
    if suffix not in ALLOWED_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unsupported file type '{suffix}'")
    data = await file.read()
    if len(data) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=f"File exceeds {settings.max_upload_mb} MB limit")
    storage_root = Path(settings.storage_dir)
    storage_root.mkdir(parents=True, exist_ok=True)
    doc_id = str(uuid.uuid4())
    storage_path = f"{doc_id}/{name}"
    dest = storage_root / storage_path
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    doc = Document(id=doc_id, file_name=name, file_type=suffix, storage_path=storage_path, status="queued", uploaded_by=current_user.id)
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    background.add_task(run_extraction, doc.id)
    return {"document_id": doc.id, "status": doc.status, "file_name": doc.file_name}


@router.get("", response_model=DocumentListOut)
async def list_documents(limit: int = 20, offset: int = 0, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    stmt = select(Document)
    count_stmt = select(func.count()).select_from(Document)
    if current_user.role == "SUBSIDIARY" and current_user.subsidiary_id is not None:
        stmt = stmt.where(Document.subsidiary_id == current_user.subsidiary_id)
        count_stmt = count_stmt.where(Document.subsidiary_id == current_user.subsidiary_id)
    total = (await db.execute(count_stmt)).scalar_one()
    rows = (await db.execute(stmt.order_by(Document.uploaded_at.desc()).limit(limit).offset(offset))).scalars().all()
    return DocumentListOut(items=[_to_out(d) for d in rows], total=total, limit=limit, offset=offset)


@router.get("/{document_id}", response_model=DocumentOut)
async def get_document(document_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    doc = await _get_scoped_document(db, document_id, current_user)
    return _to_out(doc)


@router.patch("/{document_id}/metadata", response_model=DocumentOut)
async def update_metadata(document_id: str, payload: MetadataUpdate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    doc = await _get_scoped_document(db, document_id, current_user)
    sub = (await db.execute(select(Subsidiary).where(Subsidiary.name == payload.subsidiary))).scalar_one_or_none()
    if sub is None:
        raise HTTPException(status_code=404, detail="Subsidiary not found")
    coalfield = (await db.execute(select(Coalfield).where(Coalfield.name == payload.coalfield, Coalfield.subsidiary_id == sub.id))).scalar_one_or_none()
    if coalfield is None:
        raise HTTPException(status_code=404, detail="Coalfield not found")
    doc.subsidiary_id = sub.id
    doc.coalfield_id = coalfield.id
    doc.category = payload.category
    doc.fiscal_year = payload.fiscal_year
    await db.commit()
    await db.refresh(doc)
    return _to_out(doc)


@router.get("/{document_id}/file")
async def stream_document_file(document_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    doc = await _get_scoped_document(db, document_id, current_user)
    path = Path(settings.storage_dir) / doc.storage_path
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    media_type = {"pdf": "application/pdf", "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"}.get(doc.file_type, "application/octet-stream")
    return FileResponse(path, media_type=media_type, filename=doc.file_name)