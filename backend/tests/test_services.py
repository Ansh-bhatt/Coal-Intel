"""Tests for the extraction + RAG services (Phase 11)."""

from app.services.ingestion_service import compute_status, _estimate_confidence
from app.services.rag_service import chunk_text, _cosine, _local_embedding


def test_confidence_threshold_rule():
    assert compute_status(0.99) == "pending"
    assert compute_status(0.84) == "flagged"
    assert compute_status(0.85) == "pending"


def test_estimate_confidence():
    assert _estimate_confidence("Raw coal production 217.9 MT during Q4 FY24") > 0.8
    assert _estimate_confidence("") == 0.1


def test_chunk_text_overlap():
    text = " ".join(f"word{i}" for i in range(200))
    chunks = chunk_text(text, chunk_size=200, overlap=50)
    assert len(chunks) >= 1
    assert all(len(c) <= 200 for c in chunks)


def test_cosine_similarity_same_vectors():
    v = _local_embedding("raw coal production")
    assert _cosine(v, v) > 0.999


def test_local_embedding_dimension():
    v = _local_embedding("overburden removal")
    assert len(v) == 1536