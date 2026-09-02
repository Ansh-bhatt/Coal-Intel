"""SQLAlchemy declarative Base — the single source of truth for Alembic."""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass
