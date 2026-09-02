"""User / account ORM model."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Integer, String, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(Text, nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False)  # EXECUTIVE | SUBSIDIARY | ADMIN
    subsidiary_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("subsidiaries.id"), nullable=True
    )
    coalfield_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("coalfields.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    # relationships
    subsidiary = relationship("Subsidiary", back_populates="users", lazy="joined")
    coalfield = relationship("Coalfield", back_populates="users", lazy="joined")