"""Regression tests for per-subsidiary document scoping (ingestion 403 fix).

Documents uploaded via ``POST /documents`` are stored with ``subsidiary_id``
unset — one is only assigned when metadata is submitted through
``PATCH /documents/{id}/metadata``. The scope check must therefore treat an
in-flight upload as accessible to the user who uploaded it; otherwise a
subsidiary user can never tag their own upload (the reported 403
"Not authorized" in the ingestion flow).
"""

import asyncio

import pytest
from fastapi import HTTPException

from app.api.v1.documents import _get_scoped_document
from app.models.document import Document
from app.models.user import User

SUBSIDIARY_ID = 7  # e.g. Mahanadi Coalfields Ltd


class FakeDB:
    """Minimal ``AsyncSession.get`` stand-in backed by one in-memory document."""

    def __init__(self, doc: Document | None):
        self._doc = doc

    async def get(self, model, pk):  # noqa: ANN001
        if self._doc is not None and pk == self._doc.id:
            return self._doc
        return None


def make_user(**overrides) -> User:
    fields = dict(id="user-1", role="SUBSIDIARY", subsidiary_id=SUBSIDIARY_ID)
    fields.update(overrides)
    return User(**fields)


def make_doc(**overrides) -> Document:
    fields = dict(
        id="doc-1",
        file_name="q4-production.pdf",
        file_type="pdf",
        storage_path="doc-1/q4-production.pdf",
        status="queued",
    )
    fields.update(overrides)
    return Document(**fields)


def fetch(db, doc_id: str, user: User) -> Document:
    return asyncio.run(_get_scoped_document(db, doc_id, user))


def test_fresh_upload_is_accessible_to_its_uploader():
    """The reported bug: metadata PATCH on a fresh upload must not 403."""
    user = make_user()
    doc = make_doc(uploaded_by=user.id)  # subsidiary_id unset (fresh upload)
    assert fetch(FakeDB(doc), doc.id, user) is doc


def test_same_subsidiary_document_is_accessible():
    user = make_user()
    doc = make_doc(subsidiary_id=SUBSIDIARY_ID, uploaded_by=user.id)
    assert fetch(FakeDB(doc), doc.id, user) is doc


def test_other_subsidiary_document_is_forbidden():
    user = make_user()
    doc = make_doc(subsidiary_id=SUBSIDIARY_ID + 1, uploaded_by="other-user")
    with pytest.raises(HTTPException) as excinfo:
        fetch(FakeDB(doc), doc.id, user)
    assert excinfo.value.status_code == 403


def test_unassigned_document_of_another_user_is_forbidden():
    """In-flight uploads of other users stay hidden (per-subsidiary privacy)."""
    user = make_user()
    doc = make_doc(uploaded_by="other-user")  # subsidiary_id unset
    with pytest.raises(HTTPException) as excinfo:
        fetch(FakeDB(doc), doc.id, user)
    assert excinfo.value.status_code == 403


def test_executive_is_not_subsidiary_scoped():
    user = make_user(role="EXECUTIVE", subsidiary_id=None)
    doc = make_doc(subsidiary_id=SUBSIDIARY_ID + 1, uploaded_by="other-user")
    assert fetch(FakeDB(doc), doc.id, user) is doc


def test_admin_is_not_subsidiary_scoped():
    user = make_user(role="ADMIN", subsidiary_id=None)
    doc = make_doc(subsidiary_id=SUBSIDIARY_ID + 1, uploaded_by="other-user")
    assert fetch(FakeDB(doc), doc.id, user) is doc


def test_missing_document_is_404():
    user = make_user()
    with pytest.raises(HTTPException) as excinfo:
        fetch(FakeDB(None), "does-not-exist", user)
    assert excinfo.value.status_code == 404