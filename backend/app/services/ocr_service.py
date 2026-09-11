"""OCR for image uploads via the configured multimodal chat provider.

Scanned report pages, map legends and handwritten field logs arrive as
PNG/JPG images. The image is sent as a base64 ``image_url`` content part to
the OpenAI-compatible chat endpoint (Gemini 2.5 Flash via Google AI Studio,
or the fallback provider) and the returned transcript becomes the document's
page layer — so RAG retrieval, citations and word-cloud aggregation work on it
unchanged, and ``Key: Value`` lines surface as records for the HITL grid.

Offline behaviour: with no chat key configured the extractor degrades to a
single low-confidence placeholder page so the document still completes the
pipeline instead of failing.
"""

import base64
import logging
from pathlib import Path

from app.core.config import get_settings
from app.services.ingestion_service import (
    ExtractedPage,
    ExtractionResult,
    _extract_records_from_page,
)
from app.services.llm_client import post_chat_completion

settings = get_settings()
logger = logging.getLogger(__name__)

# Media types the multimodal provider accepts for data-URL image parts.
MEDIA_TYPES = {
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "webp": "image/webp",
    "bmp": "image/bmp",
}

_OCR_PROMPT = (
    "Transcribe ALL text visible in this image (it is a page from a mining "
    "or geological document: a report page, data table, map legend or "
    "handwritten field log). Preserve reading order; render table rows as "
    "lines and field labels as 'Key: Value' pairs. Output only the "
    "transcription — no commentary, no markdown fences."
)

# OCR output is machine-read, so it always lands under the HITL threshold
# (0.85 default) and shows up flagged in the verification grid.
OCR_PAGE_CONFIDENCE = 0.75


async def ocr_image(path: Path, file_type: str) -> ExtractionResult:
    """Transcribe a stored image via the chat provider and extract records."""
    media_type = MEDIA_TYPES.get(file_type.lower())
    if media_type is None:
        raise ValueError(f"Unsupported image type: {file_type}")

    if not settings.ocr_api_key_effective:
        logger.warning(
            "no OCR API key configured — image %s stored without OCR text",
            path.name,
        )
        note = (
            f"(image upload: {path.name} — OCR unavailable without a chat API key)"
        )
        return ExtractionResult(
            pages=[ExtractedPage(page_number=1, text=note, confidence=0.1)],
            records=[],
        )

    data = path.read_bytes()
    data_url = f"data:{media_type};base64,{base64.b64encode(data).decode('ascii')}"
    content = (
        await post_chat_completion(
            {
                "model": settings.ocr_model or settings.chat_model,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": _OCR_PROMPT},
                            {"type": "image_url", "image_url": {"url": data_url}},
                        ],
                    }
                ],
                "temperature": 0.0,
                "max_tokens": 2000,
            },
            timeout=120,
            base_url=settings.ocr_base_url_effective,
            api_key=settings.ocr_api_key_effective,
        )
    )["choices"][0]["message"]["content"]

    transcript = (content or "").strip()
    page = ExtractedPage(
        page_number=1,
        text=transcript,
        confidence=OCR_PAGE_CONFIDENCE if transcript else 0.1,
    )
    return ExtractionResult(
        pages=[page], records=_extract_records_from_page(page)
    )