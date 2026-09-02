# 04_Phases.md (Full Project) — supersedes the frontend-only phase list

Frontend Phases 1–5 from the original `Phases.md` are done in the prototype and remain accurate. This adds the backend + RAG + integration phases needed to take Coal-Intel from a mocked frontend to a working, deployable prototype.

## Track A — Frontend (existing, reference only)
1. Repository Setup & Design System Foundations
2. Landing Page, Dual Portals Entry & Authentication
3. Portal 1 (Executive Search Studio) Implementation
4. Portal 2 (Subsidiary Ingestion Hub) Implementation
5. Executive Analytics Dashboard & UI Polish

*(unchanged — see `Phases.md`)*

## Track B — Backend & Data (new)

### Phase 6: Backend Foundations
- Scaffold FastAPI project (`app/` layout from `03_Architecture.md`), `pydantic-settings` config, async SQLAlchemy engine, health-check endpoint.
- Stand up PostgreSQL locally + enable `pgvector`; set up Alembic and generate the initial migration from the models in `03_Architecture.md`.
- Seed master data: subsidiaries, coalfields, categories (matches `SUBSIDIARY_OPTIONS`/`COALFIELD_OPTIONS`/`CATEGORY_OPTIONS` already in `lib/mockData.ts`).
- Implement JWT auth (`/auth/login`, `/auth/refresh`), password hashing, and role-based `deps.py` guards.

### Phase 7: Ingestion & Extraction Pipeline
- File upload endpoint (multipart, size/type validation for PDF/XLSX/DOCX) writing to object storage + a `documents` row (`status=queued`).
- OCR/text-extraction worker: PDF → per-page text + bounding boxes; XLSX/DOCX → structured key-value rows. Produces `extracted_records` with confidence scores.
- Metadata endpoint wiring `MetadataForm` to `PATCH /documents/{id}/metadata`.
- Verification grid endpoints (`GET/PATCH` records) with the `< 0.85` confidence flag rule enforced server-side (not just visually on the frontend).
- Commit endpoint: locks the document once all flagged records are resolved, writes an `audit_log` entry, flips status to `committed`.

### Phase 8: RAG — Indexing & Retrieval
- Chunking service: committed `document_pages` → overlapping text chunks with provenance (`document_id`, `page_number`, `bounding_box`).
- Embedding worker: chunk → vector → `chunk_embeddings` row; triggered automatically on commit.
- Retrieval service: query embedding → `pgvector` similarity search with subsidiary/coalfield/date filters.
- Generation service: retrieved chunks + prompt template → LLM call → answer + citation list; expose as `POST /chat` returning Server-Sent Events so the frontend can stream tokens into `ChatInterface.tsx`/`ResponseCard.tsx` the same way it already animates the mocked stream.

### Phase 9: Reporting, Drafts & Analytics
- Draft generation endpoint: takes a chat session, produces `{title, preamble, body, citations}` (matches `DraftDocument` in `lib/types.ts` exactly).
- PDF/DOCX export service replacing `lib/exportStubs.ts` with real file generation.
- Analytics endpoints: metric cards (ingestion volume, extraction accuracy, throughput) computed from `documents`/`extracted_records`/`audit_log`; word cloud from a keyphrase-extraction job over committed chunks, cached per subsidiary/time window.

## Track C — Integration & Hardening (new)

### Phase 10: Frontend ⇄ Backend Wiring
- Replace every `lib/mockData.ts` read in the frontend with a real API call (one component/store slice at a time, in this order: auth → ingestion upload/verify → chat/citations → drafts → analytics), so each piece stays demoable throughout.
- Add `NEXT_PUBLIC_API_BASE_URL` env var and a thin typed API client; keep `lib/types.ts` as the single source of truth so backend Pydantic schemas and frontend TS types stay in sync.
- Wire SSE streaming for chat into `ChatInterface.tsx` in place of the simulated typing effect.

### Phase 11: Testing, Seed Data & Demo Readiness
- Backend: pytest for services (extraction thresholding, retrieval filters, RBAC) + a couple of end-to-end API tests against a test database.
- Seed a realistic demo corpus (a handful of real/representative subsidiary PDFs) so the RAG answers and citations are meaningful in a live demo, not placeholder text.
- Timed before/after script to produce the "% reduction in report preparation time" number requested by the problem statement's success metrics.

### Phase 12: Deployment
- Containerize the backend; deploy frontend (Vercel) and backend (Render/Railway/Fly.io) to separate origins with CORS configured.
- Managed PostgreSQL with `pgvector` enabled; run Alembic migrations against it as part of the deploy step, not manually.
- Environment/secrets checklist (DB URL, JWT secret, embedding/LLM API keys, storage bucket credentials) — see `06_Setup_Instructions.md`.

## Suggested Sequencing
Phases 1–5 (frontend) can run in parallel with Phases 6–9 (backend/RAG) since the frontend is already contract-first (`lib/types.ts` defines the shape backend schemas must match). Phase 10 (wiring) is the first point the two tracks must synchronize; do it incrementally rather than as one big-bang integration at the end.
