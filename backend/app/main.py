"""Coal-Intel FastAPI application entrypoint.

Sets up CORS, lifespan (startup/shutdown), health check, and mounts the v1
API router under ``/api/v1``.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.core.config import get_settings
from app.db.session import engine
from app.api.v1.auth import router as auth_router
from app.api.v1.documents import router as documents_router
from app.api.v1.ingestion import router as ingestion_router
from app.api.v1.chat import router as chat_router
from app.api.v1.drafts import router as drafts_router
from app.api.v1.analytics import router as analytics_router
from app.api.v1.reports import router as reports_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("coal_intel")

settings = get_settings()

# Health check router defined here to avoid a circular import.
from fastapi import APIRouter  # noqa: E402

health_router = APIRouter(tags=["health"])


@health_router.get("/health")
async def health() -> dict:
    db_ok = False
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
            db_ok = True
    except Exception:  # noqa: BLE001
        logger.exception("health check DB ping failed")
    return {"status": "ok" if db_ok else "degraded", "database": "up" if db_ok else "down"}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown lifecycle — modern FastAPI (no deprecated on_event)."""
    logger.info("Coal-Intel backend starting (storage=%s)", settings.storage_dir)
    yield
    await engine.dispose()
    logger.info("Coal-Intel backend shut down")


app = FastAPI(
    title="Coal-Intel API",
    version="1.0.0",
    description="AI-powered geological, mining and reporting solution for CMPDI/CIL",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api = APIRouter(prefix="/api/v1")
api.include_router(health_router)
api.include_router(auth_router)
api.include_router(documents_router)
api.include_router(ingestion_router)
api.include_router(chat_router)
api.include_router(drafts_router)
api.include_router(analytics_router)
api.include_router(reports_router)

app.include_router(api)


@app.get("/")
async def root() -> dict:
    return {"service": "coal-intel", "docs": "/docs"}
