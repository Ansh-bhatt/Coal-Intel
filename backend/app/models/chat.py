"""Chat session, message, and citation models."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Integer, String, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id"), nullable=False
    )
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    # relationships
    messages = relationship(
        "ChatMessage", back_populates="session", cascade="all, delete-orphan",
        order_by="ChatMessage.created_at", lazy="selectin"
    )
    drafts = relationship("Draft", back_populates="session", cascade="all, delete-orphan")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    session_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(10), nullable=False)  # user | assistant
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    # relationships
    session = relationship("ChatSession", back_populates="messages")
    citations = relationship(
        "ChatCitation", back_populates="message", cascade="all, delete-orphan", lazy="selectin"
    )


class ChatCitation(Base):
    """Citation linking an assistant message back to a source document + page + bbox."""

    __tablename__ = "chat_citations"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    message_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("chat_messages.id", ondelete="CASCADE"), nullable=False
    )
    document_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("documents.id"), nullable=False
    )
    page_number: Mapped[int] = mapped_column(Integer, nullable=False)
    bbox_x1: Mapped[int | None] = mapped_column(Integer, nullable=True)
    bbox_y1: Mapped[int | None] = mapped_column(Integer, nullable=True)
    bbox_x2: Mapped[int | None] = mapped_column(Integer, nullable=True)
    bbox_y2: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # relationships
    message = relationship("ChatMessage", back_populates="citations")