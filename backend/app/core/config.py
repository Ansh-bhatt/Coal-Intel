"""Application settings via pydantic-settings.

Every environment variable is read here — never scatter `os.environ[...]`
through the codebase (see 05_Rules.md).
"""

import logging
from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)

# Anchor the .env file to this package's directory (…/backend) instead of the
# current working directory, so settings load identically whether uvicorn is
# started from backend/ or the repository root. Real environment variables
# still take precedence over values read from the file.
BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
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
    # Set to "production" in real deployments; refuses to boot with the
    # default development JWT secret when so configured.
    environment: str = "development"

    # --- CORS ---
    cors_origins: str = "http://localhost:3000"

    # --- Storage ---
    storage_dir: str = "storage"

    # --- Ingestion ---
    low_confidence_threshold: float = 0.85
    # PDFs above this page count are processed by the extraction worker.
    max_upload_mb: int = 50
    # Prototype default: commit auto-accepts remaining flagged records (each
    # flip is audited). Set false for strict human-in-the-loop behaviour —
    # commit is refused until every flagged record is manually corrected.
    hitl_auto_resolve: bool = True

    # --- RAG / embeddings ---
    embedding_dim: int = 1536
    # When set, embeddings + chat generation call an OpenAI-compatible API.
    # When empty, a local deterministic embedding fallback is used so the
    # prototype runs fully offline (see services/rag_service.py).
    openai_api_key: str = ""
    openai_base_url: str = "https://generativelanguage.googleapis.com/v1beta/openai"
    embedding_model: str = "text-embedding-3-small"
    chat_model: str = "gemini-3.8-flash"
    # Chat generation can target a different OpenAI-compatible provider than
    # the embedder (e.g. GLM-5.3-Flash via the api.b.ai gateway while Gemini
    # produces the embeddings). Empty values fall back to the OPENAI_* above.
    chat_base_url: str = "https://openrouter.ai/api/v1"
    chat_api_key: str = ""
    # Vision OCR (image transcription) can target yet another OpenAI-compatible
    # provider than chat — e.g. a gateway whose model catalog is text-only.
    # Empty values fall back to the CHAT_* settings above.
    ocr_base_url: str = ""
    ocr_api_key: str = ""
    ocr_model: str = ""
    rag_top_k: int = 5
    rag_chunk_size: int = 800
    rag_chunk_overlap: int = 120

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def chat_base_url_effective(self) -> str:
        """Base URL for chat completions (falls back to the embedder's)."""
        return self.chat_base_url or self.openai_base_url

    @property
    def chat_api_key_effective(self) -> str:
        """API key for chat completions.

        The OPENAI_API_KEY fallback applies only when chat uses the embedder's
        provider wholesale (CHAT_BASE_URL empty). If CHAT_BASE_URL points at a
        different provider (e.g. OpenRouter) while CHAT_API_KEY is empty,
        there is no usable credential for that endpoint — sending the
        embedder's key there guarantees a 401 — so return "" and let callers
        (OCR, RAG) degrade to their offline fallbacks instead.
        """
        if self.chat_base_url:
            return self.chat_api_key
        return self.chat_api_key or self.openai_api_key

    @property
    def ocr_base_url_effective(self) -> str:
        """Base URL for image transcription (falls back to the chat's)."""
        return self.ocr_base_url or self.chat_base_url_effective

    @property
    def ocr_api_key_effective(self) -> str:
        """API key for image transcription.

        Same no-cross-provider rule as chat_api_key_effective: when
        OCR_BASE_URL points at a different provider with no OCR_API_KEY,
        return "" so callers degrade to their offline fallbacks instead of
        sending the chat provider's key to a foreign endpoint.
        """
        if self.ocr_base_url:
            return self.ocr_api_key
        return self.ocr_api_key or self.chat_api_key_effective


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    # Fail fast instead of silently running production sign-in on a secret
    # that is committed to the repository.
    if settings.environment == "production" and settings.jwt_secret == "dev-only-change-me":
        raise RuntimeError(
            "JWT_SECRET must be overridden when ENVIRONMENT=production "
            "(refusing to start with the default development secret)"
        )
    _warn_on_placeholder_keys(settings)
    return settings


def _warn_on_placeholder_keys(settings: Settings) -> None:
    """Warn once at startup when a configured key is still a template value.

    A placeholder key otherwise only surfaces as provider 4xx errors at
    request time (and silent degradations to the offline fallbacks).
    """
    for name in ("openai_api_key", "chat_api_key", "ocr_api_key"):
        value: str = getattr(settings, name)
        if value.lower().startswith("your-"):
            logger.warning(
                "%s looks like a template placeholder (%s…) — AI calls that "
                "use it will fail and degrade to offline fallbacks",
                name.upper(),
                value[:9],
            )
