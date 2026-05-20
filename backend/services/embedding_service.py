"""
Sinemood — Gemini Embedding Service
Ultra-fast query vectorization using Google's text-embedding-004.

Execution budget: <100ms per call (Google's embedding endpoint returns
float arrays only — no generation tokens, no output sampling — making it
~15-20x faster than any text-generation LLM call).

Embedding dimension: 768 (text-embedding-004 default)
Transport: httpx (already a project dependency — no new packages needed)
Auth: GEMINI_API_KEY env var (same key used for generative calls if any)

Thread-safety: Single shared httpx.AsyncClient with connection pooling.
"""

import json
import logging
import struct
import asyncio
from typing import Optional
import httpx
from backend.config import GEMINI_API_KEY

logger = logging.getLogger("embedding_service")

EMBEDDING_MODEL    = "text-embedding-004"
EMBEDDING_DIM      = 768
_GEMINI_EMBED_URL  = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    f"{EMBEDDING_MODEL}:embedContent"
)
# Hard cap on request text to avoid API errors on very long inputs
_MAX_INPUT_CHARS   = 2000


class GeminiEmbeddingService:
    """
    Wraps Google's text-embedding-004 endpoint.
    Keeps a single warm httpx.AsyncClient for connection reuse (<5ms
    overhead on cached connections vs ~30ms cold TCP handshake).
    """

    def __init__(self, api_key: str = ""):
        self._api_key = (api_key or GEMINI_API_KEY or "").strip()
        self._client: Optional[httpx.AsyncClient] = None

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=httpx.Timeout(8.0, connect=3.0),
                limits=httpx.Limits(
                    max_keepalive_connections=5,
                    max_connections=10,
                    keepalive_expiry=60.0,
                ),
            )
        return self._client

    @property
    def is_available(self) -> bool:
        return bool(self._api_key)

    async def get_embedding(self, text: str) -> list[float]:
        """
        Vectorize text using text-embedding-004.
        Returns a 768-dimensional float list.
        Raises on API error. Caller should handle with fallback.
        """
        if not self._api_key:
            raise RuntimeError("GEMINI_API_KEY is not set — embedding service unavailable.")

        # Truncate to avoid Gemini 400 errors on very long inputs
        text = str(text or "").strip()[:_MAX_INPUT_CHARS]
        if not text:
            raise ValueError("Cannot embed empty text.")

        payload = {
            "model": f"models/{EMBEDDING_MODEL}",
            "content": {
                "parts": [{"text": text}]
            },
        }

        client = self._get_client()
        response = await client.post(
            _GEMINI_EMBED_URL,
            params={"key": self._api_key},
            json=payload,
            headers={"Content-Type": "application/json"},
        )

        if response.status_code != 200:
            raise RuntimeError(
                f"Gemini embedding API error {response.status_code}: {response.text[:200]}"
            )

        data = response.json()
        values = data.get("embedding", {}).get("values")
        if not values or len(values) != EMBEDDING_DIM:
            raise RuntimeError(
                f"Unexpected embedding shape: got {len(values) if values else 0} dims"
            )

        return values

    async def get_embedding_safe(self, text: str) -> list[float] | None:
        """
        Same as get_embedding() but returns None on any failure.
        Use in background jobs where one bad movie shouldn't abort the batch.
        """
        try:
            return await self.get_embedding(text)
        except Exception as e:
            logger.warning("[EmbeddingService] get_embedding_safe failed: %s", e)
            return None

    async def close(self):
        if self._client and not self._client.is_closed:
            await self._client.aclose()


# ─── Serialization helpers (store/load embeddings as raw float32 BLOBs) ──────

def encode_embedding(values: list[float]) -> bytes:
    """Pack a float list into a compact binary blob (4 bytes × 768 = 3072 bytes)."""
    return struct.pack(f"{len(values)}f", *values)


def decode_embedding(blob: bytes) -> list[float]:
    """Unpack a binary blob back to a float list."""
    n = len(blob) // 4
    return list(struct.unpack(f"{n}f", blob))


# ─── Module-level singleton ────────────────────────────────────────────────────

embedding_service = GeminiEmbeddingService()
