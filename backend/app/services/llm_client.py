"""Thin OpenAI-compatible chat-completion client shared by RAG + OCR + reports.

Chat generation can target a different provider than the embedder — e.g.
GLM-5.3-Flash via the api.b.ai gateway for chat while Gemini (Google AI
Studio) produces the embeddings and vision OCR (see ``CHAT_*`` settings in
app.core.config).
Vision OCR can still target yet another provider through the ``OCR_*``
settings (some gateways' model catalog is text-only). Retries once on
rate-limit / transient server errors so
free-tier bursts (429 under load) don't immediately degrade answers to the
extractive fallback.
"""

import asyncio
import json
import logging

import httpx

from app.core.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)

# Transient statuses worth a single retry: free tiers return 429 when busy,
# and a 402 can also be transient when the account sits near its credit floor
# while bounded max_tokens keeps most requests affordable.
_RETRY_STATUS = {402, 429, 500, 502, 503, 504}


async def post_chat_completion(
    payload: dict,
    timeout: float = 60.0,
    *,
    base_url: str = "",
    api_key: str = "",
) -> dict:
    """POST /chat/completions to the configured chat provider.

    ``base_url``/``api_key`` override the CHAT_* settings — OCR passes the
    OCR_* values so vision can target a different provider than text chat.
    Retries once on 402/429/5xx, then raises — callers catch any exception
    and degrade to their extractive fallbacks.
    """
    # Some OpenAI-compatible gateways stream by default and answer HTTP 200
    # with an EMPTY body when "stream" is omitted; pin non-streaming mode
    # unless the caller explicitly asked for a stream.
    payload.setdefault("stream", False)
    last_error: Exception | None = None
    for attempt in range(2):
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{base_url or settings.chat_base_url_effective}/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key or settings.chat_api_key_effective}"
                },
                json=payload,
                timeout=timeout,
            )
        if resp.status_code not in _RETRY_STATUS or attempt == 1:
            if resp.is_error:
                # The provider's error body (invalid token, unknown model id,
                # insufficient balance, …) is far more actionable than a bare
                # status code — log a truncated excerpt before raising so the
                # extractive fallback is diagnosable from the log alone.
                logger.error(
                    "chat provider returned %s — body: %s",
                    resp.status_code,
                    resp.text[:500],
                )
            resp.raise_for_status()
            return resp.json()
        last_error = httpx.HTTPStatusError(
            f"chat provider returned {resp.status_code}",
            request=resp.request,
            response=resp,
        )
        logger.warning(
            "chat provider returned %s — retrying once", resp.status_code
        )
        await asyncio.sleep(1.5)
    raise last_error  # pragma: no cover - both attempts are handled above


async def stream_chat_completion(payload: dict, timeout: float = 60.0):
    """POST /chat/completions with ``stream: true``; yield content deltas.

    Same retry-once policy as :func:`post_chat_completion`, applied while the
    request is still pre-stream (429/5xx/402). Once deltas start arriving a
    failure propagates to the caller — the consumer has already shown partial
    text and must decide how to surface the interruption.

    Yields only non-empty ``choices[0].delta.content`` strings, stopping at the
    provider's ``data: [DONE]`` sentinel.
    """
    payload = dict(payload)
    payload["stream"] = True
    last_error: Exception | None = None
    for attempt in range(2):
        retry = False
        async with httpx.AsyncClient() as client:
            async with client.stream(
                "POST",
                f"{settings.chat_base_url_effective}/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.chat_api_key_effective}"
                },
                json=payload,
                timeout=timeout,
            ) as resp:
                if resp.status_code in _RETRY_STATUS and attempt == 0:
                    await resp.aread()  # drain so the connection closes cleanly
                    last_error = httpx.HTTPStatusError(
                        f"chat provider returned {resp.status_code}",
                        request=resp.request,
                        response=resp,
                    )
                    logger.warning(
                        "chat provider returned %s — retrying once (stream)",
                        resp.status_code,
                    )
                    retry = True
                elif resp.is_error:
                    await resp.aread()
                    logger.error(
                        "chat provider returned %s — body: %s",
                        resp.status_code,
                        resp.text[:500],
                    )
                    resp.raise_for_status()
                else:
                    async for line in resp.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        data = line[5:].strip()
                        if data == "[DONE]":
                            break
                        if not data:
                            continue
                        try:
                            chunk = json.loads(data)
                        except ValueError:
                            continue
                        choices = chunk.get("choices") or []
                        delta = (
                            (choices[0].get("delta") or {}).get("content")
                            if choices
                            else None
                        )
                        if delta:
                            yield delta
                    return
        if retry:
            await asyncio.sleep(1.5)
    if last_error is not None:
        raise last_error