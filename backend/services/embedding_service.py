"""
Sinemood — Gemini Embedding Service (SDK-based, circuit-breaker protected)
Ultra-fast query vectorization using Google's text-embedding-004 via the
official google-generativeai SDK. Guarantees stable endpoint resolution,
correct model naming, and built-in auth headers.

Execution budget: <100ms per call.
Embedding dimension: 768 (text-embedding-004 default).

Thread-safety: google-generativeai's genai.embed_content is thread-safe
and uses its own connection pooling under the hood.
"""

import logging
import struct
import time
from typing import Optional

from backend.config import GEMINI_API_KEY

logger = logging.getLogger("embedding_service")

EMBEDDING_MODEL  = "models/text-embedding-004"
EMBEDDING_DIM    = 768
_MAX_INPUT_CHARS = 2000

# ── Circuit-breaker state ─────────────────────────────────────────────────────
# Prevents runaway retries from spiking memory under 404/auth errors.
_CB_FAILURES      = 0
_CB_OPEN_UNTIL    = 0.0
_CB_THRESHOLD     = 5       # open circuit after 5 consecutive failures
_CB_RECOVERY_SEC  = 60.0    # try one request after 60s

_sdk_configured = False


def _ensure_sdk():
    """Lazy SDK init — import heavy google.generativeai only when API key is set."""
    global _sdk_configured
    if not _sdk_configured and GEMINI_API_KEY:
        try:
            import google.generativeai as genai
            genai.configure(api_key=GEMINI_API_KEY)
            _sdk_configured = True
        except ImportError:
            logger.warning("[EmbeddingService] google.generativeai not installed — embeddings unavailable")


class GeminiEmbeddingService:
    """
    Wraps Google's text-embedding-004 via the official SDK with a
    circuit-breaker guard to prevent memory leaks on repeated failures.
    """

    def __init__(self, api_key: str = ""):
        self._api_key = (api_key or GEMINI_API_KEY or "").strip()
        _ensure_sdk()

    @property
    def is_available(self) -> bool:
        return bool(self._api_key)

    async def get_embedding(self, text: str) -> list[float]:
        """
        Vectorize text using genai.embed_content with circuit-breaker.
        Returns 768-dimensional float list. Raises on API/throttle error.
        """
        global _CB_FAILURES, _CB_OPEN_UNTIL

        if not self._api_key:
            raise RuntimeError("GEMINI_API_KEY is not set — embedding service unavailable.")

        # ── Circuit-breaker: open? ──────────────────────────────────────
        if _CB_FAILURES >= _CB_THRESHOLD:
            if time.monotonic() < _CB_OPEN_UNTIL:
                raise RuntimeError(
                    f"Embedding circuit open ({_CB_FAILURES} failures) — "
                    f"retry in {_CB_OPEN_UNTIL - time.monotonic():.0f}s"
                )
            # Recovery attempt: half-open — counter sıfırlanmaz,
            # başarılı olursa satır 129'da reset edilir, başarısızsa
            # _CB_FAILURES +1 ile hemen tekrar açılır.
            pass

        text = str(text or "").strip()[:_MAX_INPUT_CHARS]
        if not text:
            raise ValueError("Cannot embed empty text.")

        # Sanitize input for clean transmission
        sanitized = text.replace("\n", " ")

        try:
            try:
                import google.generativeai as genai
            except ImportError:
                raise RuntimeError("google.generativeai package not installed")
            response = genai.embed_content(
                model=EMBEDDING_MODEL,
                content=sanitized,
                task_type="retrieval_query",
            )
        except Exception as e:
            _CB_FAILURES += 1
            if _CB_FAILURES >= _CB_THRESHOLD:
                _CB_OPEN_UNTIL = time.monotonic() + _CB_RECOVERY_SEC
                logger.error(
                    "[EmbeddingService] Circuit opened: %d consecutive failures. "
                    "Suppressing for %.0fs.", _CB_FAILURES, _CB_RECOVERY_SEC,
                )
            raise RuntimeError(f"Gemini embedding failed: {e}")

        # Normalise response (SDK may return dict or object)
        if isinstance(response, dict):
            embedding_data = response.get("embedding") or {}
            if isinstance(embedding_data, dict):
                values = embedding_data.get("values")
            else:
                values = getattr(embedding_data, "values", None)
        else:
            values = getattr(response, "embedding", None)
            if values is not None:
                values = getattr(values, "values", None) or values

        if not values or len(values) != EMBEDDING_DIM:
            raise RuntimeError(
                f"Unexpected embedding shape: got {len(values) if values else 0} dims "
                f"(expected {EMBEDDING_DIM})"
            )

        # Success — reset circuit-breaker
        _CB_FAILURES = 0
        return values

    async def get_embedding_safe(self, text: str) -> Optional[list[float]]:
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
        """No-op — SDK manages its own connection pool."""
        pass


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
