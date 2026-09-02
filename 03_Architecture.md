# 03_Architecture.md (Full Stack) — supersedes the frontend-only draft for backend/DB/RAG

This extends the existing `Architecture.md` (frontend component tree + Zustand state, kept as-is and accurate) with the backend, database, and RAG layers needed to make the prototype real.

---

## 0. Frontend Recap (already implemented — see component tree below)

The frontend is a client-side Next.js App Router app split across the Executive Search Studio and the Subsidiary Data Ingestion Hub, with cross-tree state synchronized via a centralized Zustand store.

**Component tree**
- `app/layout.tsx` — root layout, typography providers (Inter, Space Grotesk, JetBrains Mono), cream editorial background.
- `app/page.tsx` — landing page: hero, live metrics, dual portal entry cards.
- `app/login/page.tsx` — unified auth view, Executive vs. Subsidiary role selection.
- `app/executive/` — Search Studio: `HeaderNav`, `ChatInterface`, `ResponseCard`, `PdfSplitViewer`, `BoundingBoxOverlay`, `ParliamentaryDraftModal`.
- `app/ingestion/` — Ingestion Hub: `FileDropzone`, `MetadataForm`, `VerificationGrid`.
- `app/analytics/` — `MetricCard`, `WordCloud`.

**Zustand state**
- `activePortal`: `EXECUTIVE | INGESTION` — global nav context.
- `pdfUrl`, `activeCitation` (`{id, documentName, pageNumber, boundingBox:{x1,y1,x2,y2}}`) — split-screen PDF + overlay state.
- `uploadedFiles`, `extractedRecords` — ingestion staging + HITL review state.

This part is unchanged from the original prototype; everything below is what turns it into a working full-stack system.

---

## 1. System Topology

```
┌────────────────────┐      HTTPS/JSON       ┌──────────────────────────┐      SQL      ┌──────────────┐
│   Next.js Frontend  │ ───────────────────▶  │   FastAPI Backend         │ ────────────▶ │  PostgreSQL   │
│  (Executive Studio, │ ◀─────────────────── │   (REST + SSE streaming)  │ ◀───────────── │  + pgvector   │
│   Ingestion Hub,    │      JWT auth         │  - auth                   │               │  extension    │
│   Analytics)        │                       │  - documents/ingestion    │               └──────────────┘
└────────────────────┘                        │  - chat/RAG               │
                                               │  - drafts/export          │        ┌────────────────────┐
                                               │  - analytics              │───────▶│  Object Storage     │
                                               └──────────────┬────────────┘        │  (S3-compatible /   │
                                                               │                     │  local disk in dev) │
                                                     enqueue    │                     └────────────────────┘
                                                               ▼
                                               ┌──────────────────────────┐
                                               │  Background Worker(s)     │
                                               │  - OCR / text extraction  │
                                               │  - chunking + embedding   │
                                               │  - word-cloud aggregation │
                                               └──────────────────────────┘
```

- **Frontend**: unchanged from `Architecture.md` — Next.js App Router, Zustand stores (`activePortal`, `pdfUrl`, `activeCitation`, `uploadedFiles`, `extractedRecords`), talks to the backend over `fetch`/`EventSource` instead of `lib/mockData.ts`.
- **Backend**: FastAPI, single deployable service in v1. Internally layered so the RAG/ingestion logic can be split into a separate worker process later without changing the public API.
- **Database**: PostgreSQL with the `pgvector` extension — one database for both relational (metadata, users, audit) and vector (chunk embeddings) data. Keeps the prototype to one managed instance.
- **Object storage**: raw uploaded files (PDF/XLSX/DOCX) are never stored as DB blobs — store on disk (dev) or S3-compatible bucket (prod), DB holds only the path/URL.
- **Background processing**: OCR, chunking, and embedding run out of the request/response cycle (FastAPI `BackgroundTasks` for the prototype; swappable for a real queue like Celery/RQ/Arq later — see `05_Rules.md`).

---

## 2. Backend Structure (FastAPI)

```
backend/
  app/
    main.py                 # FastAPI() app, lifespan (startup/shutdown), router registration, CORS
    core/
      config.py             # Settings via pydantic-settings (env vars)
      security.py           # JWT create/verify, password hashing (passlib/argon2)
      deps.py                # get_db, get_current_user, require_role() dependencies
    db/
      base.py                # SQLAlchemy declarative Base, session/engine setup (async)
      session.py             # async_sessionmaker, get_session()
    models/                  # SQLAlchemy ORM models — one file per domain
      user.py, subsidiary.py, document.py, extraction.py, chat.py, draft.py
    schemas/                 # Pydantic v2 request/response models — mirror lib/types.ts
      user.py, document.py, extraction.py, chat.py, draft.py, analytics.py
    api/
      v1/
        auth.py              # POST /auth/login, /auth/refresh
        documents.py         # upload, list, get, status
        ingestion.py         # metadata tagging, verification grid CRUD, commit
        chat.py               # POST /chat (SSE stream), GET /chat/sessions
        drafts.py             # generate + export parliamentary draft
        analytics.py          # metric cards + word cloud
    services/                 # business logic, framework-agnostic where possible
      ingestion_service.py    # OCR orchestration, confidence thresholding
      rag_service.py          # chunk → embed → retrieve → prompt → cite
      draft_service.py        # compose draft from chat context, render PDF/DOCX
      export_service.py
    workers/
      extraction_worker.py    # background job: file -> text/tables -> ExtractedRecord rows
      embedding_worker.py     # background job: committed record/page -> chunks -> pgvector rows
  alembic/                    # migrations (never hand-edit prod schema)
  tests/
  pyproject.toml / requirements.txt
```

**Design rules baked into this layout** (see `05_Rules.md` for the full list):
- Routers stay thin — request parsing + calling a service + shaping the response. No business logic in `api/`.
- All I/O is `async def` end-to-end (async SQLAlchemy engine + asyncpg driver), so the event loop isn't blocked by DB calls.
- Use FastAPI's `lifespan` context manager for startup/shutdown — the old `@app.on_event("startup")` pattern is deprecated.
- Config only via `pydantic-settings`, never hardcoded secrets/URLs.

---

## 3. API Surface (mirrors the frontend's existing state contracts)

| Frontend need (Zustand field / component) | Endpoint |
|---|---|
| Login (`SessionUser`) | `POST /api/v1/auth/login` → `{access_token, refresh_token, user}` |
| `activePortal` route guard | JWT `role` claim checked client-side + server-side |
| `FileDropzone` → `uploadedFiles` | `POST /api/v1/documents` (multipart) → `{document_id, status: "queued"}` |
| Upload progress/status | `GET /api/v1/documents/{id}` (poll) or SSE `GET /api/v1/documents/{id}/events` |
| `MetadataForm` | `PATCH /api/v1/documents/{id}/metadata` |
| `VerificationGrid` → `extractedRecords` | `GET /api/v1/documents/{id}/records`, `PATCH /api/v1/records/{id}` (inline correction) |
| Commit to central store | `POST /api/v1/documents/{id}/commit` (triggers `embedding_worker`) |
| `ChatInterface` → messages | `POST /api/v1/chat` (SSE token stream, request includes session id) |
| `ResponseCard` citations / `activeCitation` | Citations are part of the streamed chat payload: `{id, documentName, pageNumber, boundingBox}` |
| `PdfSplitViewer` | `GET /api/v1/documents/{id}/file` (signed URL or streamed bytes) |
| `ParliamentaryDraftModal` | `POST /api/v1/drafts` (from a chat session) → `{title, preamble, body, citations}`; `POST /api/v1/drafts/{id}/export?format=pdf|docx` |
| `MetricCard` | `GET /api/v1/analytics/metrics` |
| `WordCloud` | `GET /api/v1/analytics/wordcloud?subsidiary=&from=&to=` |

All list endpoints are paginated (`limit`/`offset` or cursor); all mutating endpoints require the JWT and enforce subsidiary scoping for the `SUBSIDIARY` role.

---

## 4. RAG Pipeline (AI-Based Query and Response System)

1. **Ingest** — uploaded file → text + table extraction (OCR for scans) → raw `ExtractedRecord` rows with confidence scores, plus a page-indexed text layer with bounding boxes.
2. **HITL gate** — records below `confidence < 0.85` block commit until a human edits/confirms (matches `Design_Patterns.md` HITL pattern).
3. **Commit → chunk** — on commit, page text is split into overlapping chunks (~500–800 tokens), each chunk keeps `document_id`, `page_number`, and `bounding_box` provenance.
4. **Embed** — each chunk embedded (a single embedding model, swappable behind `services/rag_service.py`) and stored in a `chunk_embeddings` pgvector column.
5. **Retrieve** — on a chat query: embed the query → `pgvector` cosine/ANN search (`ivfflat` or `hnsw` index) filtered by subsidiary/coalfield/date if the user narrows scope → top-k chunks.
6. **Generate** — retrieved chunks + conversation history → LLM prompt that must answer only from the provided chunks and attach a citation per claim; response streamed to the frontend as SSE.
7. **Cite** — the citation objects returned to the frontend point straight back at `(document_id, page_number, bounding_box)`, which is exactly what `BoundingBoxOverlay.tsx` already expects — no frontend contract change needed.
8. **Word cloud / topics** — a separate lightweight job (keyphrase extraction, e.g. YAKE/RAKE or TF-IDF over committed chunks) aggregated per subsidiary/time window and cached, not computed on every dashboard load.

---

## 5. Database Schema (PostgreSQL)

```sql
-- Extension for vector search
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE subsidiaries (
    id            SERIAL PRIMARY KEY,
    name          TEXT UNIQUE NOT NULL,
    code          TEXT UNIQUE NOT NULL
);

CREATE TABLE coalfields (
    id             SERIAL PRIMARY KEY,
    name           TEXT NOT NULL,
    subsidiary_id  INTEGER REFERENCES subsidiaries(id) ON DELETE CASCADE,
    UNIQUE (name, subsidiary_id)
);

CREATE TYPE user_role AS ENUM ('EXECUTIVE', 'SUBSIDIARY', 'ADMIN');

CREATE TABLE users (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name           TEXT NOT NULL,
    email          TEXT UNIQUE NOT NULL,
    hashed_password TEXT NOT NULL,
    role           user_role NOT NULL,
    subsidiary_id  INTEGER REFERENCES subsidiaries(id),
    coalfield_id   INTEGER REFERENCES coalfields(id),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TYPE document_status AS ENUM ('queued', 'processing', 'verified', 'committed', 'error');

CREATE TABLE documents (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_name      TEXT NOT NULL,
    file_type      TEXT NOT NULL,               -- pdf | xlsx | docx
    storage_path   TEXT NOT NULL,                -- object storage key/URL
    subsidiary_id  INTEGER REFERENCES subsidiaries(id),
    coalfield_id   INTEGER REFERENCES coalfields(id),
    category       TEXT,
    fiscal_year    TEXT,
    status         document_status NOT NULL DEFAULT 'queued',
    uploaded_by    UUID REFERENCES users(id),
    uploaded_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    committed_at   TIMESTAMPTZ
);

CREATE TYPE record_status AS ENUM ('pending', 'flagged', 'verified', 'corrected');

CREATE TABLE extracted_records (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id    UUID REFERENCES documents(id) ON DELETE CASCADE,
    key            TEXT NOT NULL,
    value          TEXT NOT NULL,
    confidence     NUMERIC(4,3) NOT NULL,        -- 0.000 - 1.000
    status         record_status NOT NULL DEFAULT 'pending',
    corrected_value TEXT,
    corrected_by   UUID REFERENCES users(id),
    corrected_at   TIMESTAMPTZ
);

CREATE TABLE document_pages (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id    UUID REFERENCES documents(id) ON DELETE CASCADE,
    page_number    INTEGER NOT NULL,
    raw_text       TEXT NOT NULL,
    UNIQUE (document_id, page_number)
);

CREATE TABLE chunk_embeddings (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id    UUID REFERENCES documents(id) ON DELETE CASCADE,
    page_number    INTEGER NOT NULL,
    bbox_x1        INTEGER, bbox_y1 INTEGER, bbox_x2 INTEGER, bbox_y2 INTEGER,
    chunk_text     TEXT NOT NULL,
    embedding      VECTOR(1536)                  -- dimension matches the chosen embedding model
);
CREATE INDEX chunk_embeddings_ivfflat
    ON chunk_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE TABLE chat_sessions (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID REFERENCES users(id),
    title          TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE chat_messages (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id     UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role           TEXT NOT NULL,                 -- user | assistant
    content        TEXT NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE chat_citations (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id     UUID REFERENCES chat_messages(id) ON DELETE CASCADE,
    document_id    UUID REFERENCES documents(id),
    page_number    INTEGER NOT NULL,
    bbox_x1        INTEGER, bbox_y1 INTEGER, bbox_x2 INTEGER, bbox_y2 INTEGER
);

CREATE TABLE drafts (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id     UUID REFERENCES chat_sessions(id),
    title          TEXT NOT NULL,
    preamble       TEXT,
    body           TEXT NOT NULL,
    created_by     UUID REFERENCES users(id),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id       UUID REFERENCES users(id),
    action         TEXT NOT NULL,                 -- e.g. "record.correct", "document.commit"
    entity_type    TEXT NOT NULL,
    entity_id      UUID NOT NULL,
    before_value   JSONB,
    after_value    JSONB,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Notes:
- Schema is created/evolved through **Alembic migrations**, this SQL is the reference shape, not something to run by hand in prod.
- `NUMERIC` (not `FLOAT`) for confidence and any money/production figures — avoids floating-point drift on figures that end up in parliamentary drafts.
- `chunk_embeddings.embedding` dimension must match whatever embedding model `rag_service.py` actually calls — set it once and keep it consistent, changing it requires re-embedding everything.

---

## 6. Deployment Architecture
- **Frontend**: Vercel (already the target — see the deployed URL in the prototype), env var `NEXT_PUBLIC_API_BASE_URL` pointing at the backend.
- **Backend**: containerized FastAPI (Docker) on a managed host (Render/Railway/Fly.io/EC2) — anything that supports a long-running ASGI process (`uvicorn`/`gunicorn -k uvicorn.workers.UvicornWorker`) for SSE streaming.
- **Database**: managed PostgreSQL with `pgvector` available (Neon, Supabase, or RDS + the extension) — verify `pgvector` is installable on whatever managed host is chosen before committing to it.
- **Object storage**: S3-compatible bucket (or the platform's own, e.g. Supabase Storage) — never the app server's local disk in prod.
- **CORS**: backend allow-list must include the exact deployed frontend origin(s); wildcard `*` cannot be used together with credentialed requests (cookies/auth headers).
