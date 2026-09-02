"""Application settings via pydantic-settings.

Every environment variable is read here — never scatter `os.environ[...]`
through the codebase (see 05_Rules.md).
"""

from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- Database ---
    database_url: str = (
        "postgresql+asyncpg://coal_intel_app:devpassword@localhost:5432/coal_intel"
    )

    # --- Security / JWT ---
    jwt_secret: str = "dev-only-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7

    # --- CORS ---
    cors_origins: str = "http://localhost:3000"

    # --- Storage ---
    storage_dir: str = "storage"

    # --- Ingestion ---
    low_confidence_threshold: float = 0.85
    # PDFs above this page count are processed by the extraction worker.
    max_upload_mb: int = 50

    # --- RAG / embeddings ---
    embedding_dim: int = 1536
    # When set, embeddings + chat generation call an OpenAI-compatible API.
    # When empty, a local deterministic embedding fallback is used so the
    # prototype runs fully offline (see services/rag_service.py).
    openai_api_key: str = ""
    openai_base_url: str = "https://api.openai.com/v1"
    embedding_model: str = "text-embedding-3-small"
    chat_model: str = "gpt-4o-mini"
    rag_top_k: int = 5
    rag_chunk_size: int = 800
    rag_chunk_overlap: int = 120

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
