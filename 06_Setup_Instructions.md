# 06_Setup_Instructions.md — Local Environment Setup

## 1. PostgreSQL Setup

### 1.1 Install & start
```bash
# macOS
brew install postgresql@16
brew services start postgresql@16

# Ubuntu/Debian
sudo apt update && sudo apt install postgresql postgresql-contrib
sudo systemctl enable --now postgresql

# Or skip local install entirely and use Docker (recommended for consistency across the team):
docker run --name coal-intel-db -e POSTGRES_PASSWORD=devpassword \
  -e POSTGRES_DB=coal_intel -p 5432:5432 -d pgvector/pgvector:pg16
```
Using the `pgvector/pgvector:pg16` image is the easiest way to get the `vector` extension without compiling anything.

### 1.2 Create the database & enable pgvector (if not using the pgvector image)
```bash
psql -U postgres
```
```sql
CREATE DATABASE coal_intel;
\c coal_intel
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";  -- or rely on gen_random_uuid() from pgcrypto
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

### 1.3 Create a dedicated app user (don't use `postgres` superuser in the app)
```sql
CREATE USER coal_intel_app WITH PASSWORD 'devpassword';
GRANT ALL PRIVILEGES ON DATABASE coal_intel TO coal_intel_app;
```
Connection string for the backend `.env`:
```
DATABASE_URL=postgresql+asyncpg://coal_intel_app:devpassword@localhost:5432/coal_intel
```

### 1.4 Create tables — via Alembic, not by hand
Don't paste the SQL from `03_Architecture.md` straight into `psql` for anything beyond local experimentation — generate it through Alembic so schema history is tracked and repeatable in every environment.

```bash
cd backend
alembic init alembic                       # one-time
# edit alembic/env.py to import Base from app/db/base.py and set target_metadata = Base.metadata
# edit alembic.ini (or env.py) to read DATABASE_URL from settings, not a hardcoded string

alembic revision --autogenerate -m "initial schema"
alembic upgrade head
```
Whenever a model in `app/models/` changes, repeat `alembic revision --autogenerate` + `alembic upgrade head` — never edit a table with raw SQL and forget to reflect it in a migration, or environments will drift apart.

### 1.5 Seed master data
Write a small `scripts/seed.py` that inserts the subsidiary/coalfield/category lists already defined in the frontend's `lib/mockData.ts` (`SUBSIDIARY_OPTIONS`, `COALFIELD_OPTIONS`, `CATEGORY_OPTIONS`) so the two stay in sync, then run it once after `alembic upgrade head`.

---

## 2. Backend Setup (FastAPI)

```bash
mkdir backend && cd backend
python3 -m venv .venv
source .venv/bin/activate            # .venv\Scripts\activate on Windows

pip install fastapi "uvicorn[standard]" sqlalchemy[asyncio] asyncpg alembic \
  pydantic pydantic-settings python-multipart passlib[argon2] pyjwt \
  pgvector httpx python-dotenv
```
- `sqlalchemy[asyncio]` + `asyncpg` → async DB access end-to-end.
- `python-multipart` → required for FastAPI file uploads; **pin it explicitly** in `requirements.txt`, don't leave it to transitive resolution.
- `pgvector` (the Python package) → gives SQLAlchemy a `Vector` column type matching the `vector` extension.
- `passlib[argon2]` → password hashing; `pyjwt` → access/refresh tokens.

Create `backend/.env`:
```
DATABASE_URL=postgresql+asyncpg://coal_intel_app:devpassword@localhost:5432/coal_intel
JWT_SECRET=<generate a long random string, e.g. `openssl rand -hex 32`>
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
CORS_ORIGINS=http://localhost:3000
STORAGE_DIR=./uploads          # swap for an S3 bucket config in prod
EMBEDDING_MODEL=<provider/model id>
LLM_MODEL=<provider/model id>
```
Load these through a `pydantic-settings` `Settings` class in `app/core/config.py` — never `os.environ[...]` scattered through the code.

Run it:
```bash
uvicorn app.main:app --reload --port 8000
```
Confirm the interactive API docs load at `http://localhost:8000/docs` — this alone verifies routing, schemas, and CORS config are wired correctly before touching the frontend.

---

## 3. Frontend Setup (Next.js)

```bash
cd Coal-Intel-main
npm install
```
Create `.env.local`:
```
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1
```
```bash
npm run dev
```
Visit `http://localhost:3000`. While the backend isn't wired in yet, the app keeps working off `lib/mockData.ts` — replace those reads incrementally per Phase 10 in `04_Phases.md`, one store/component at a time, so the app is demoable at every step.

---

## 4. Running Both Together
- Backend on `:8000`, frontend on `:3000` — two separate processes/terminals (or a `docker-compose.yml` with `db`, `backend`, `frontend` services once things stabilize).
- Confirm CORS: with `CORS_ORIGINS=http://localhost:3000` on the backend, a `fetch` from the frontend to `http://localhost:8000/api/v1/...` should succeed without a browser CORS error. If it doesn't, check the FastAPI `CORSMiddleware` config before touching anything else.

---

## 5. Things an AI Agent Commonly Gets Wrong Here

**Frontend**
- Forgetting `NEXT_PUBLIC_` prefix on client-readable env vars → API base URL silently becomes `undefined` in the browser.
- Forgetting `"use client"` on a component that now calls `fetch` inside a `useEffect`.
- Re-uploading the same `pdf.worker.min.mjs` after bumping `pdfjs-dist` — versions must match exactly or PDF rendering breaks with a cryptic worker-version-mismatch error.

**Backend**
- Mixing async and sync SQLAlchemy sessions in the same app — pick async everywhere, don't add a "quick sync helper" for one script.
- Doing OCR/embedding inline in a request handler "just for now" — it blocks the event loop and the upload endpoint starts timing out under any real file size; wire it through `BackgroundTasks` from the start, even in the prototype.
- Storing confidence as `FLOAT`/`float` instead of `NUMERIC`/`Decimal` — fine for the demo, but will bite once real figures are compared for the `< 0.85` threshold at boundary values.
- Forgetting to scope subsidiary-role queries — a `SUBSIDIARY` user's `GET /documents` must filter by `current_user.subsidiary_id` server-side; a frontend-only filter is not access control.
- Setting `chunk_embeddings.embedding` dimension to whatever "seems right" instead of the exact output dimension of the chosen embedding model — a mismatch fails at insert time, not at design time, and re-embedding everything after the fact is expensive.
- Not indexing the vector column (`ivfflat`/`hnsw`) — similarity search works without an index but degrades badly as the corpus grows past a few thousand chunks; add the index as part of the initial migration, not as an afterthought.

**Database**
- Running the reference SQL from `03_Architecture.md` directly against a shared database instead of going through Alembic — makes every environment diverge and autogenerate unreliable afterward.
- Forgetting `ON DELETE CASCADE` where it's specified — deleting a `documents` row should also clean up its `extracted_records`/`document_pages`/`chunk_embeddings`, otherwise orphaned rows accumulate silently.

**Deployment**
- Hardcoding `localhost` anywhere in a config that ships — always read host/port/URLs from environment variables so dev/staging/prod don't require code changes.
- Not checking `pgvector` extension availability on the chosen managed Postgres provider **before** building the RAG pipeline against it.
