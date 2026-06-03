"""
Basit, bağımlılıksız in-memory rate limiter (IP + path bazlı).

main.py ve router'lar (social.py vb.) ortak kullanır → tek implementasyon.
Tek instance/proses için yeterli; yatay ölçeklemede Redis'e taşınmalı.
"""
import time
from collections import defaultdict

from fastapi import HTTPException, Request

from backend.config import RATE_LIMIT_GENERAL, RATE_LIMIT_AI

# Yazma/spam'a açık endpoint'ler için sıkı limit (dk/IP). Arkadaşlık isteği,
# öneri gönderimi, push aboneliği gibi yan-etkili çağrıları korur.
RATE_LIMIT_STRICT = 20

_rate_store: dict[str, list[float]] = defaultdict(list)


def _check_rate_limit(request: Request, limit: int) -> None:
    """Dakikada `limit` istek (IP + path başına). Aşılırsa 429."""
    ip = request.client.host if request.client else "unknown"
    now = time.time()
    window = 60  # 1 dakika
    key = f"{ip}:{request.url.path}"
    _rate_store[key] = [t for t in _rate_store[key] if now - t < window]
    if len(_rate_store[key]) >= limit:
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Please try again later.")
    _rate_store[key].append(now)
    # Bellek sınırı: max 50K key
    if len(_rate_store) > 50000:
        oldest = sorted(_rate_store.keys(), key=lambda k: min(_rate_store[k]) if _rate_store[k] else 0)[:10000]
        for k in oldest:
            del _rate_store[k]


def rate_limit_general(request: Request) -> None:
    _check_rate_limit(request, RATE_LIMIT_GENERAL)


def rate_limit_ai(request: Request) -> None:
    _check_rate_limit(request, RATE_LIMIT_AI)


def rate_limit_strict(request: Request) -> None:
    _check_rate_limit(request, RATE_LIMIT_STRICT)
