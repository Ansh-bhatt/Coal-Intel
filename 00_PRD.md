# 00_PRD.md — Product Requirement Document

## 1. Project
**Coal-Intel** — AI-Powered Geological, Mining and Reporting Solution for CMPDI/CIL Subsidiaries
SIH 2026 · Organization: Ministry of Coal

## 2. Problem Recap
CMPDI/CIL subsidiaries manually compile geological and mining data — scanned PDFs, spreadsheets, images, historical archives — to answer parliamentary and administrative inquiries. This is slow, error-prone, and depends on individual expertise. Coal-Intel automates ingestion, verification, retrieval and report drafting while keeping every generated figure traceable to its source page.

## 3. Objectives (from the problem statement)
1. Automated Report Generation Platform
2. Automated Word Cloud and Topic Identification Module
3. AI-Based Query and Response System (conversational RAG with citations)

## 4. User Roles

| Role | Portal | Description |
|---|---|---|
| **Executive / Ministry Viewer** | Executive Search Studio (`/executive`) | Queries consolidated data in plain language, inspects source PDFs, generates parliamentary response drafts. Read-mostly. |
| **Subsidiary Field Operative** | Subsidiary Ingestion Hub (`/ingestion`) | Uploads subsidiary reports (PDF/XLSX/DOCX), tags metadata, verifies/corrects OCR-extracted records before they enter the central store. |
| **Admin** (v1.1, stretch) | Shared | Manages subsidiary/coalfield master data, user accounts, and re-indexing jobs. |

Role is chosen at `/login` (`?portal=executive` or `?portal=subsidiary`), matching the existing frontend prototype.

## 5. Core Modules & Functional Requirements

### 5.1 Landing & Role Selection
- Editorial hero page with live system metrics (engine latency, docs indexed, citations verified) and a current advisory summary — sourced from real aggregate queries once backend is live, not hardcoded.
- Two portal entry cards routing to role-scoped login.

### 5.2 Authentication & Access Control
- Executive: SSO-style or executive credential login.
- Subsidiary: field-operative login scoped to a chosen Subsidiary + Coalfield.
- Session persisted via JWT (access + refresh token), role encoded in the token, enforced both client-side (route guards) and server-side (FastAPI dependency).

### 5.3 Executive Search Studio (AI Query & Response System)
- Natural-language chat over ingested documents (RAG), with suggested prompt pills.
- Every assistant claim carries one or more citation tags (`documentName`, `pageNumber`, `boundingBox`).
- Split-screen PDF viewer: clicking a citation opens the source PDF to the exact page and draws a bounding-box overlay over the supporting text/table.
- Parliamentary Response Draft Generator: turns a chat answer into a formal draft (title, preamble, body, citations) with PDF/DOCX export.
- Conversation history persisted per user session.

### 5.4 Subsidiary Ingestion Hub (Automated Report Generation — intake side)
- Drag-and-drop upload restricted to PDF, XLSX, DOCX, with per-file progress and status (`queued → processing → verified → committed / error`).
- Metadata form: Subsidiary, Coalfield, Category, Fiscal Year — required before processing starts.
- OCR/parsing pipeline extracts key-value records with a confidence score (0.0–1.0).
- Human-in-the-Loop (HITL) verification grid: records below the confidence threshold (**< 0.85**) are flagged in red and must be manually corrected or confirmed before batch commit to the central database.
- Committed records become searchable by the Executive Studio (and re-embedded for RAG retrieval).

### 5.5 Analytics Dashboard
- Metric cards: ingestion volume, extraction accuracy, operational throughput — computed from real backend aggregates.
- Word Cloud: keyphrase frequency across a selectable corpus (all documents, a subsidiary, a date range), driven by the Topic Identification module.

## 6. Non-Functional Requirements
- **Traceability**: every number surfaced by the AI system must resolve to a stored `(document, page, bounding box)` triple. No un-cited generative claims in report drafts.
- **Auditability**: every ingestion commit and every manual correction in the HITL grid is logged (who, when, before/after value).
- **Security**: role-based access control; subsidiary operatives can only see/write their own subsidiary's data; executives have read access across subsidiaries.
- **Performance**: chat response should stream (first token quickly) even while retrieval runs in the background; target end-to-end answer latency in the low single-digit seconds for a warm index.
- **Scalability**: ingestion and embedding must run as background jobs, not inline in the HTTP request, so large PDF batches don't block the API.
- **Deployability**: every dependency chosen must be actively maintained and deployable on standard managed hosting (see `05_Rules.md`) — no library that blocks a clean `next build` or a FastAPI container build.

## 7. Success Metrics (for the SIH demo/judging)
- % reduction in report preparation time vs. manual baseline (simulate with a timed before/after demo).
- % structured-extraction accuracy on a seeded sample set (compare OCR output vs. ground truth).
- % of repetitive reporting/response workflow steps automated end-to-end.
- Citation precision: % of chat answers whose cited page/bbox actually contains the claimed figure.

## 8. Out of Scope for the Prototype (v1)
- Real SSO/AD integration (stub with email+password / role selector).
- Multi-language OCR beyond English/Hindi numerals.
- Full admin console (basic master-data seeding is enough).
- Production-grade OCR model training — use an existing OCR/document-AI service or open model behind an abstraction so it can be swapped later.

## 9. Assumptions & Constraints
- Frontend is already scaffolded (Next.js App Router, Zustand, mock data) — backend must match its existing type contracts (`lib/types.ts`) rather than force a frontend rewrite.
- Backend: FastAPI + PostgreSQL, deployed independently from the frontend (separate origin → CORS required).
- RAG/document processing is a distinct concern from the CRUD API but is exposed through the same FastAPI service as async endpoints/background jobs in v1 (can be split into its own worker service later without changing the API contract).
