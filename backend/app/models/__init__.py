"""Import all models so Alembic can discover them."""

from app.models.user import User
from app.models.subsidiary import Subsidiary, Coalfield
from app.models.document import Document
from app.models.extraction import ExtractedRecord, DocumentPage, ChunkEmbedding
from app.models.chat import ChatSession, ChatMessage, ChatCitation
from app.models.draft import Draft, AuditLog

__all__ = [
    "User",
    "Subsidiary",
    "Coalfield",
    "Document",
    "ExtractedRecord",
    "DocumentPage",
    "ChunkEmbedding",
    "ChatSession",
    "ChatMessage",
    "ChatCitation",
    "Draft",
    "AuditLog",
]

