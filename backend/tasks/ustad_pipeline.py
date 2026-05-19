"""
Üstad Notu ön-üretim (warm) pipeline'ı.

Üstad Notu zaten ilk görüntülemede Claude ile üretilip movie_cache'e
yazılıyor ve sonraki isteklerde Claude'a gitmeden statik dönüyor. Tek
eksik: filmi ilk açan kişi bekliyor. Bu pipeline, repository'de olup
henüz cache'lenmemiş filmler için Üstad Notu'nu PROAKTİF üretip kalıcı
kaydeder → kimse beklemez, film başına ömür boyu tek Claude çağrısı.

Maliyet kontrolü: tek seferde KÜÇÜK, throttle'lı batch. Yalnızca
admin endpoint'i tetikler — başlangıçta otomatik binlerce çağrı YOK.
Kullanılan her şey mevcut servisler (yeni model/torch yok, OOM yok).

NOT: enriched şeması main.py'deki /analyze ucuyla aynı tutulmalı
(orası kaynak doğrudur). Buradaki sıra onun 3-7. adımlarını yansıtır.
"""
import asyncio
import logging

logger = logging.getLogger("ustad_pipeline")


async def _generate_one(movie_id: int) -> str:
    """Tek film: details→cast→ratings→Claude analiz→enriched→kaydet.

    Dönen: 'generated' | 'skipped' | 'error:<sebep>'
    """
    from backend.database import cache
    from backend.services.tmdb_service import tmdb_service
    from backend.services.omdb_service import omdb_service
    from backend.services.claude_service import claude_service

    # Yarış durumu: bu arada başka istek üretmiş olabilir → atla
    if await cache.get_movie(movie_id):
        return "skipped"

    try:
        details = await tmdb_service.get_movie_details(movie_id)
    except Exception as e:
        return f"error:tmdb_details:{e}"
    if not details or not details.get("title"):
        return "error:no_details"

    year = details.get("release_date", "")[:4] if details.get("release_date") else None

    try:
        cast = await tmdb_service.get_movie_credits(movie_id)
    except Exception:
        cast = []

    try:
        ratings = await omdb_service.get_ratings(details["title"], year=year)
    except Exception as e:
        return f"error:omdb:{e}"

    try:
        analysis = await claude_service.analyze_movie(
            title=details["title"],
            overview=details.get("overview", ""),
            ratings=ratings,
            genres=details.get("genres", []),
            year=year,
            vote_average=details.get("vote_average"),
        )
    except Exception as e:
        return f"error:claude:{e}"

    if not analysis or not analysis.get("analysis"):
        return "error:empty_analysis"

    # /analyze ucundaki enriched ile aynı anahtarlar (kaynak: main.py adım 6)
    enriched = {
        **details,
        "cast": cast,
        "ratings": ratings["ratings"],
        "imdb_id": ratings.get("imdb_id"),
        "imdb_rating": ratings["imdb_rating"],
        "imdb_votes": ratings.get("imdb_votes", 0),
        "rotten_tomatoes": ratings["rotten_tomatoes"],
        "metacritic": ratings["metacritic"],
        "director": ratings["director"],
        "awards": ratings["awards"],
        "mood": analysis["mood"],
        "ai_analysis": analysis["analysis"],
        "analyzed": True,
        "in_watchlist": False,
        "personal_note": None,
    }
    # watch_providers/streaming bilerek eklenmiyor — gerçek görüntülemede
    # cache'li yol bunları lazily ekliyor (ekstra TMDB çağrısından kaçınılır).

    await cache.save_movie(movie_id, details["title"], enriched)

    # Mood sınıflandırması (main.py adım 7 ile aynı mantık, geç import)
    try:
        import backend.main as _main
        raw_mood = (analysis.get("mood") or "").lower()
        for mid, label in _main.MOOD_ID_LABELS.items():
            if label.lower() in raw_mood:
                await cache.save_mood_classification(movie_id, mid)
                break
    except Exception:
        pass  # sınıflandırma opsiyonel — Üstad Notu yine kaydedildi

    return "generated"


async def warm_ustad_notes(limit: int = 10, delay: float = 1.5) -> dict:
    """Cache'lenmemiş repository filmleri için Üstad Notu'nu sırayla üretir.

    limit  : bu çağrıda işlenecek max film (maliyet sınırı)
    delay  : filmler arası bekleme (0.1 CPU + Anthropic rate koruması)
    """
    from backend.database import cache

    candidates = await cache.get_movies_needing_ustad_note(limit)
    summary = {"requested": limit, "candidates": len(candidates),
               "generated": 0, "skipped": 0, "errors": 0, "error_samples": []}

    for row in candidates:
        movie_id = row[0]
        title = row[1] if len(row) > 1 else "?"
        try:
            result = await _generate_one(movie_id)
        except Exception as e:
            result = f"error:unhandled:{e}"

        if result == "generated":
            summary["generated"] += 1
            logger.info("[Ustad] generated #%s %s", movie_id, title)
        elif result == "skipped":
            summary["skipped"] += 1
        else:
            summary["errors"] += 1
            if len(summary["error_samples"]) < 5:
                summary["error_samples"].append(f"{movie_id}:{result}")
            logger.warning("[Ustad] %s — %s (%s)", result, movie_id, title)

        await asyncio.sleep(delay)  # throttle

    logger.info("[Ustad] warm batch bitti: %s", summary)
    return summary
