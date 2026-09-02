"""Extraction-related models: ExtractedRecord, DocumentPage, ChunkEmbedding."""

import uuid
from datetime import datetime, timezone

from pgvector.sqlalchemy import Vector
from sqlalchemy import DateTime, Integer, Numeric, String, Text, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.config import get_settings
from app.db.base import Base

settings = get_settings()


class ExtractedRecord(Base):
    """Key-value record extracted from a document (OCR / table parsing)."""

    __tablename__ = "extracted_records"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    document_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False
    )
    key: Mapped[str] = mapped_column(Text, nullable=False)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    confidence: Mapped[float] = mapped_column(
        Numeric(4, 3), nullable=False
    )  # 0.000 – 1.000
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending"
    )  # pending | flagged | verified | corrected
    corrected_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    corrected_by: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id"), nullable=True
    )
    corrected_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # relationships
    document = relationship("Document", back_populates="extracted_records")


class DocumentPage(Base):
    """Per-page extracted text layer from a document."""

    __tablename__ = "document_pages"
    __table_args__ = (UniqueConstraint("document_id", "page_number"),)

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    document_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False
    )
    page_number: Mapped[int] = mapped_column(Integer, nullable=False)
    raw_text: Mapped[str] = mapped_column(Text, nullable=False)

    # relationships
    document = relationship("Document", back_populates="pages")
    chunk_embeddings = relationship(
        "ChunkEmbedding", back_populates="page", cascade="all, delete-orphan"
    )


class ChunkEmbedding(Base):
    """Overlapping text chunk with its vector embedding."""

    __tablename__ = "chunk_embeddings"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    document_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False
    )
    page_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("document_pages.id", ondelete="SET NULL"), nullable=True
    )
    page_number: Mapped[int] = mapped_column(Integer, nullable=False)
    bbox_x1: Mapped[int | None] = mapped_column(Integer, nullable=True)
    bbox_y1: Mapped[int | None] = mapped_column(Integer, nullable=True)
    bbox_x2: Mapped[int | None] = mapped_column(Integer, nullable=True)
    bbox_y2: Mapped[int | None] = mapped_column(Integer, nullable=True)
    chunk_text: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[list[float] | None] = mapped_column(
        Vector(settings.embedding_dim), nullable=True
    )

    # relationships
    document = relationship("Document", back_populates="chunk_embeddings")
    page = relationship("DocumentPage", back_populates="chunk_embeddings")