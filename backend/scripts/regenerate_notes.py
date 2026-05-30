"""
Üstad'ın Notu — tek seferlik toplu yenileme.

Cache'li tüm filmleri gezer; notu eski sürümle (ANALYSIS_VERSION'dan farklı)
üretilmiş olanlar için Claude'u CACHE'DEKİ veriyle yeniden çağırır (TMDB/OMDb'ye
GİTMEZ — yalnız Claude) ve `ai_analysis` + `analysis_version`'ı günceller.

Bir kez çalıştırılır; sonuç kalıcı olarak cache'lenir → 1000 kullanıcıda bile
tekrar/aylık fatura olmaz. İdempotent: yeniden çalıştırınca güncel notları atlar.

Kullanım:
    python -m backend.scripts.regenerate_notes              # tümünü (eksik sürüm) yenile, ucuz Haiku
    python -m backend.scripts.regenerate_notes --limit 5    # ilk 5'i yenile (test)
    python -m backend.scripts.regenerate_notes --force      # sürümü yok say, hepsini yenile
    python -m backend.scripts.regenerate_notes --model claude-sonnet-4-20250514   # daha yüksek kalite (pahalı)
"""
import argparse
import asyncio
import logging

from backend.database import cache
from backend.services.claude_service import claude_service, ANALYSIS_VERSION
from backend.config import CLAUDE_FAST_MODEL

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("regenerate_notes")


def _genre_names(data: dict) -> list:
    g = data.get("genres") or []
    if g and isinstance(g[0], dict):
        return [x.get("name", "") for x in g if x.get("name")]
    return [str(x) for x in g if x]


def _ratings_from_cache(data: dict) -> dict:
    return {
        "imdb_rating": data.get("imdb_rating"),
        "rotten_tomatoes": data.get("rotten_tomatoes"),
        "metacritic": data.get("metacritic"),
        "director": data.get("director"),
    }


async def _regen_one(data: dict, model: str) -> bool:
    """Tek filmin notunu yeniden üretir + cache'i günceller. Başarı → True."""
    tmdb_id = data.get("id") or data.get("tmdb_id")
    title = (data.get("title") or "").strip()
    if not tmdb_id or not title:
        return False
    year = (data.get("release_date") or "")[:4] or None
    try:
        result = await claude_service.analyze_movie(
            title=title,
            overview=data.get("overview") or "",
            ratings=_ratings_from_cache(data),
            genres=_genre_names(data),
            year=year,
            vote_average=data.get("vote_average"),
            model=model,
        )
        analysis = result.get("analysis")
        if not analysis:
            return False
        data["ai_analysis"] = analysis          # YALNIZ not güncellenir
        data["analysis_version"] = ANALYSIS_VERSION  # mood/sınıflandırma korunur
        await cache.save_movie(tmdb_id, title, data)
        return True
    except Exception as e:
        log.warning("[%s] '%s' yenilenemedi: %s", tmdb_id, title, e)
        return False


async def main():
    ap = argparse.ArgumentParser(description="Üstad'ın Notu toplu yenileme")
    ap.add_argument("--limit", type=int, default=0, help="En fazla N film (0 = hepsi)")
    ap.add_argument("--force", action="store_true", help="Sürümü yok say, hepsini yenile")
    ap.add_argument("--model", default=CLAUDE_FAST_MODEL, help="Claude modeli (varsayılan: ucuz Haiku)")
    ap.add_argument("--chunk", type=int, default=10, help="Eşzamanlı toplu boyut")
    args = ap.parse_args()

    all_movies = await cache.get_all_cached()
    todo = [
        m for m in all_movies
        if args.force or m.get("analysis_version") != ANALYSIS_VERSION
    ]
    if args.limit > 0:
        todo = todo[: args.limit]

    log.info("Toplam cache'li film: %d | yenilenecek: %d | model: %s",
             len(all_movies), len(todo), args.model)
    if not todo:
        log.info("Güncel — yapılacak iş yok.")
        return

    done = ok = 0
    for i in range(0, len(todo), args.chunk):
        batch = todo[i:i + args.chunk]
        results = await asyncio.gather(*[_regen_one(m, args.model) for m in batch])
        done += len(batch)
        ok += sum(1 for r in results if r)
        log.info("İlerleme: %d/%d (başarılı: %d)", done, len(todo), ok)

    log.info("Bitti. %d/%d not yenilendi (sürüm: %s).", ok, len(todo), ANALYSIS_VERSION)


if __name__ == "__main__":
    asyncio.run(main())
