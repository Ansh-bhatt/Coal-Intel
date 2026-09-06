"""Re-embed every committed document with the currently configured embedder.

    python -m scripts.reembed_corpus

Run from ``backend/`` after switching the embedding provider in ``.env``
(e.g. to Gemini's ``gemini-embedding-001``). Vectors from different models
live in incompatible spaces, so old embeddings must be regenerated for
retrieval to stay meaningful. The embedding worker deletes each document's
stale vectors before inserting, so this script is safe to re-run anytime.

With no key configured it re-embeds via the offline deterministic embedder —
handy as a smoke test before pasting your API key.
"""

import asyncio

from sqlalchemy import select

from app.db.session import async_session_factory
from app.models.document import Document
from app.workers.embedding_worker import embed_document


async def reembed_corpus() -> None:
    async with async_session_factory() as db:
        doc_ids = (
            (
                await db.execute(
                    select(Document.id).where(Document.status == "committed")
                )
            )
            .scalars()
            .all()
        )

    if not doc_ids:
        print("No committed documents — nothing to re-embed.")
        return

    total = 0
    for doc_id in doc_ids:
        chunks = await embed_document(doc_id)
        total += chunks
        print(f"{doc_id}: {chunks} chunks embedded")

    print(f"Done — re-embedded {len(doc_ids)} document(s), {total} chunks.")


async def main() -> None:
    await reembed_corpus()


if __name__ == "__main__":
    asyncio.run(main())
