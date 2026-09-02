"""Subsidiary and Coalfield ORM models."""

from sqlalchemy import Integer, String, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Subsidiary(Base):
    __tablename__ = "subsidiaries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)

    # relationships
    coalfields = relationship("Coalfield", back_populates="subsidiary", cascade="all, delete-orphan")
    users = relationship("User", back_populates="subsidiary")
    documents = relationship("Document", back_populates="subsidiary")


class Coalfield(Base):
    __tablename__ = "coalfields"
    __table_args__ = (UniqueConstraint("name", "subsidiary_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    subsidiary_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("subsidiaries.id", ondelete="CASCADE"), nullable=False
    )

    # relationships
    subsidiary = relationship("Subsidiary", back_populates="coalfields")
    users = relationship("User", back_populates="coalfield")
    documents = relationship("Document", back_populates="coalfield")