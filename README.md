# Coal-Intel

AI-powered geological, mining and reporting solution for CMPDI/CIL subsidiaries.

## Overview

- **Frontend**: Next.js 15 App Router, Tailwind CSS, Zustand, Radix UI
- **Backend**: FastAPI, PostgreSQL + pgvector, async SQLAlchemy, JWT auth
- **RAG**: Deterministic offline embedding + extractive answer (or OpenAI-compatible API when configured)

## Quick Start

### Prerequisites
- Python 3.11+
- Node.js 20+
- PostgreSQL 16 with `pgvector` extension

### 1. Database Setup

```bash
sudo -u postgres psql <<'EOSQL'
CREATE DATABASE coal_intel;
CREATE USER coal_intel_app WITH PASSWORD 'devpassword';
GRANT ALL PRIVILEGES ON DATABASE coal_intel TO coal_intel_app;
\c coal_intel
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
GRANT ALL ON SCHEMA public TO coal_intel_app;
EOSQL
```

### 2. Backend Setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env if needed (defaults work for local dev)

# Run migrations
alembic upgrade head

# Seed master data + demo users (password: Demo@1234)
python -m scripts.seed

# Start backend
uvicorn app.main:app --reload --port 8000
```

### 3. Frontend Setup

```bash
# From project root
npm install
echo "NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1" > .env.local
npm run dev
```

### 4. Verify

- Backend: http://localhost:8000/docs
- Frontend: http://localhost:3000
- Login with `a.bhattacharya@cil.co.in` / `Demo@1234`

## Demo Users

| Name | Email | Password | Role |
|------|-------|----------|------|
| A. Bhattacharya | a.bhattacharya@cil.co.in | Demo@1234 | EXECUTIVE |
| R. Verma | r.verma@mcl.co.in | Demo@1234 | SUBSIDIARY |

## Architecture

See `03_Architecture.md` for the full system topology, API surface, and database schema.

## Project Structure

```
├── app/                    # Next.js frontend
│   ├── executive/          # Executive Search Studio
│   ├── ingestion/          # Subsidiary Ingestion Hub
│   ├── analytics/          # Analytics Dashboard
│   └── login/              # Auth page
├── backend/
│   ├── app/
│   │   ├── api/v1/         # FastAPI routers
│   │   ├── core/           # Config, security, deps
│   │   ├── db/             # SQLAlchemy engine + session
│   │   ├── models/         # ORM models
│   │   ├── schemas/        # Pydantic schemas (mirrors lib/types.ts)
│   │   ├── services/       # Business logic
│   │   └── workers/        # Background jobs
│   ├── scripts/            # Seed data
│   └── tests/              # pytest tests
├── lib/                    # Shared types, API client, mock data
├── store/                  # Zustand stores
└── public/                 # Static assets + sample PDF
```

## Testing

```bash
cd backend && source .venv/bin/activate && pytest -v
```

## Deployment

### Docker Compose

```bash
docker compose up --build
```

### Backend Container

```bash
cd backend
docker build -t coal-intel-backend .
docker run -p 8000:8000 --env-file .env coal-intel-backend
```

## Key Design Decisions

- **Offline-first RAG**: When `OPENAI_API_KEY` is not set, the system uses a deterministic local embedding (hash-based) and an extractive summarizer — no API key needed, fully traceable.
- **HITL Verification**: Records below 0.85 confidence are flagged red and require manual correction before commit (server-side enforced).
- **SSE Chat**: The chat endpoint streams tokens via Server-Sent Events, consumed by the frontend's `fetch` + `ReadableStream` reader.
- **Row-level RBAC**: `SUBSIDIARY` users can only see/upload documents for their own subsidiary.
# Coal-Intel-With-Backend
