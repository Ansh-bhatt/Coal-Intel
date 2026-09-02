"""Background embedding worker.

On document commit: split each committed page's text into overlapping chunks,
embed them, and persist ``chunk_embeddings`` rows with provenance
(document_id, page_number, bounding_box).
"""

import logging

from sqlalchemy import select

from app.db.session import async_session_factory
from app.models.document import Document
from app.models.extraction import ChunkEmbedding, DocumentPage
from app.services.rag_service import chunk_text, embed_texts

logger = logging.getLogger("coal_intel.embedding")


async def embed_document(document_id: str) -> int:
    """Embed every page of a committed document. Returns number of chunks."""
    async with async_session_factory() as db:
        doc = await db.get(Document, document_id)
        if doc is None or doc.status != "committed":
            logger.warning("embed_document: %s not committed", document_id)
            return 0

        pages = (
            (await db.execute(
                select(DocumentPage).where(DocumentPage.document_id == document_id)
            ))
            .scalars()
            .all()
        )
        if not pages:
            return 0

        # Remove any stale embeddings (re-embed after re-commit).
        await db.execute(
            ChunkEmbedding.__table__.delete().where(
                ChunkEmbedding.document_id == document_id
            )
        )

        # Build chunk → text pairs.
        to_embed: list[str] = []
        chunk_meta: list[tuple[DocumentPage, str]] = []
        for page in pages:
            for chunk in chunk_text(page.raw_text):
                to_embed.append(chunk)
                chunk_meta.append((page, chunk))

        if not to_embed:
            return 0

        vectors = await embed_texts(to_embed)

        count = 0
        for (page, text), vector in zip(chunk_meta, vectors):
            db.add(
                ChunkEmbedding(
                    document_id=document_id,
                    page_id=page.id,
                    page_number=page.page_number,
                    chunk_text=text,
                    embedding=vector,
                )
            )
            count += 1
        await db.commit()
        logger.info("embed_document: %s → %d chunks", document_id, count)
        return count
