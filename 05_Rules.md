# 05_Rules.md — Engineering Rules (Deployment-Safety First)

These rules exist because an AI coding agent left unchecked will happily pull in a deprecated API, a package that doesn't build on a serverless/container target, or a pattern that works in `dev` but breaks in `build`/`prod`. Follow them for **every** change, not just new features.

## 1. General Rules (both stacks)
- **Pin real, currently-maintained versions.** Before adding any dependency, check it has had a release in roughly the last 12 months and isn't marked deprecated/archived on its repo or package registry page.
- **Never introduce a second state-management, second CSS, or second HTTP-client library** when one is already chosen (Zustand / Tailwind / native `fetch` on the frontend; `httpx` on the backend). Consistency beats novelty.
- **Every new dependency must survive a clean build**, not just `dev`: run the frontend's `next build` and the backend's container build locally before considering a task done.
- **No secrets in code.** All keys/URLs come from environment variables (`.env.local` for Next.js, `pydantic-settings` for FastAPI), never hardcoded, never committed.
- **Don't invent endpoints or fields.** The frontend's `lib/types.ts` and the backend's Pydantic schemas must describe the same shapes — treat a mismatch as a bug, not a frontend-only or backend-only fix.

## 2. Frontend (Next.js / React) Rules
- **Next.js App Router only** — no `pages/` directory, no mixing routing paradigms.
- **React 19 / Next 15 APIs only.** Do not use `getServerSideProps`/`getStaticProps` (Pages Router only). Do not use the deprecated `next/legacy/image`. Use Server/Client Components correctly — anything using `useState`, `useEffect`, Zustand, or browser APIs needs `"use client"`.
- **No `localStorage`/`sessionStorage`** for anything that must survive across users/devices — session state belongs in the JWT + a Zustand store hydrated from the backend, not browser storage.
- **`pdfjs-dist` version must match the worker file** already vendored at `public/pdf.worker.min.mjs` — if the package is upgraded, regenerate/replace the worker file in the same change, or PDF rendering silently breaks.
- **Keep `d3-cloud` isolated to `WordCloud.tsx`** — it's an old, lightly-maintained package; if it becomes a build/type problem, replace it with a hand-rolled SVG layout rather than fighting its types, don't let its typing issues leak into shared `lib/types.ts`.
- **Tailwind config stays source of truth for design tokens** (`canvas`, `ink`, `accent`, `hairline` in `tailwind.config.ts`) — never hardcode a hex color in a component; reference the token.
- **Environment variables read by the browser must be prefixed `NEXT_PUBLIC_`** (e.g. `NEXT_PUBLIC_API_BASE_URL`); anything without that prefix is server-only and will be `undefined` in client components — this is a very common agent mistake.

## 3. Backend (FastAPI / Python) Rules
- **Use FastAPI's `lifespan` context manager**, never `@app.on_event("startup")`/`"shutdown"` — those are deprecated and will be removed.
- **Pydantic v2 only.** Do not mix in Pydantic v1 syntax (`class Config`, `.dict()`, `validator`) — use `model_config`, `.model_dump()`, `field_validator`. Mixing versions is the single most common source of confusing runtime errors in FastAPI projects right now.
- **SQLAlchemy 2.0 style, async only** (`AsyncSession`, `async_sessionmaker`, `select()` constructs) with the `asyncpg` driver. Do not use the legacy `Query` API or a sync `Session` inside an `async def` route — it will block the event loop under load.
- **Don't do heavy work (OCR, embedding, PDF/DOCX rendering) inside a request handler.** Use `BackgroundTasks` (v1 prototype) or a real queue (Celery/RQ/Arq — pick one before Phase 8, don't half-adopt two) so uploads/chat stay responsive.
- **Avoid `python-multipart` version drift** — pin it explicitly; FastAPI's file-upload support depends on it and silent version mismatches are a known source of "it works locally, fails on deploy" bugs.
- **CORS must be explicit**, never `allow_origins=["*"]` combined with `allow_credentials=True` (the two are mutually exclusive per spec and some browsers/servers will reject or silently misbehave) — list the real deployed frontend origin(s).
- **Migrations only through Alembic.** Never hand-run `CREATE TABLE`/`ALTER TABLE` against a shared/prod database; the SQL in `03_Architecture.md` is a reference for what the migration should produce, not a script to execute directly there.
- **`pgvector`'s Python binding and index type must match what the chosen managed Postgres actually supports** — confirm `ivfflat`/`hnsw` availability on the target host before relying on it; some managed providers lag on `pgvector` versions.
- **Don't let the RAG prompt answer from model memory.** The system prompt must instruct the LLM to answer only from retrieved chunks and to omit/qualify anything it can't cite — this is a product requirement (traceability), not just a nicety.

## 4. Deployment Gotchas to Check Explicitly
- Frontend build must not depend on any backend being reachable at build time (no server-side data fetching against a not-yet-deployed API in `generateStaticParams`/build-time fetches).
- Backend container must bind to `0.0.0.0` and read `PORT` from the environment — most managed hosts inject `PORT` dynamically; a hardcoded port will fail to receive traffic.
- SSE streaming (chat) needs the host/proxy to not buffer responses — verify the chosen host supports streaming responses before committing the whole chat UX to SSE.
- File upload size limits exist at three layers (Next.js API/proxy if used, FastAPI/`Request` body size, and the hosting platform's own request limit) — set them consistently, not just on the framework.
