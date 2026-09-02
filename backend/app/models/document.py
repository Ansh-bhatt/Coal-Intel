"""Document ORM model."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Integer, String, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_type: Mapped[str] = mapped_column(String(10), nullable=False)  # pdf | xlsx | docx
    storage_path: Mapped[str] = mapped_column(Text, nullable=False)
    subsidiary_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("subsidiaries.id"), nullable=True
    )
    coalfield_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("coalfields.id"), nullable=True
    )
    category: Mapped[str | None] = mapped_column(String(255), nullable=True)
    fiscal_year: Mapped[str | None] = mapped_column(String(20), nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="queued"
    )  # queued | processing | verified | committed | error
    uploaded_by: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id"), nullable=True
    )
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    committed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # relationships
    subsidiary = relationship("Subsidiary", back_populates="documents", lazy="joined")
    coalfield = relationship("Coalfield", back_populates="documents", lazy="joined")
    extracted_records = relationship(
        "ExtractedRecord", back_populates="document", cascade="all, delete-orphan", lazy="selectin"
    )
    pages = relationship(
        "DocumentPage", back_populates="document", cascade="all, delete-orphan", lazy="selectin"
    )
    chunk_embeddings = relationship(
        "ChunkEmbedding", back_populates="document", cascade="all, delete-orphan", lazy="selectin"
    )