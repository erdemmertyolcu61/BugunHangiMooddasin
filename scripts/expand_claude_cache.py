"""
Claude analiz cache'ini genişletir. Şu an sadece 132 film cache'de.
Popüler filmleri Claude ile analiz ederek cache'e ekler.

Kullanım:
  python scripts/expand_claude_cache.py              # tüm cache'siz filmler
  python scripts/expand_claude_cache.py --limit 500  # ilk 500 film
  python scripts/expand_claude_cache.py --force      # tümünü yeniden analiz et

Maliyet: Her film ~1 Claude Sonnet çağrısı (~$0.01-0.03/film).
500 film ~$5-15 arası.
"""
import asyncio
import logging
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.database import cache
from backend.services.claude_service import claude_service, ANALYSIS_VERSION

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("expand_claude_cache")


async def expand_cache(limit: int = None, force: bool = False, batch_size: int = 5):
    await cache.init_db()

    # Cache'lenmemiş popüler filmleri bul
    sql = """
        SELECT r.tmdb_id, r.title, r.overview, r.vote_average, r.vote_count,
               r.genre_ids, r.release_date, r.poster_url, r.backdrop_url
        FROM movie_repository r
        LEFT JOIN movie_cache c ON r.tmdb_id = c.tmdb_id
        WHERE c.tmdb_id IS NULL AND r.vote_count >= 50
        ORDER BY r.vote_count DESC
    """
    async with cache._get_connection(cache.db_path) as db:
        cur = await db.execute(sql)
        rows = await cur.fetchall()

    if not rows:
        logger.info("Cache'lenmemiş film bulunamadı!")
        return

    logger.info(f"Cache'lenmemiş {len(rows)} popüler film bulundu.")
    if limit:
        rows = rows[:limit]
        logger.info(f"Limit uygulandı: {limit} film işlenecek.")

    total = len(rows)
    processed = 0
    errors = 0

    for i in range(0, total, batch_size):
        batch = rows[i : i + batch_size]
        batch_num = i // batch_size + 1

        logger.info(f"Batch {batch_num} başlıyor ({len(batch)} film)...")

        tasks = []
        for row in batch:
            movie_data = {
                "id": row[0],
                "title": row[1],
                "overview": row[2] or "",
                "vote_average": row[3],
                "vote_count": row[4],
                "genre_ids": row[5],
                "release_date": row[6] or "",
                "poster_url": row[7] or "",
                "backdrop_url": row[8] or "",
            }
            tasks.append(_analyze_single(movie_data))

        results = await asyncio.gather(*tasks, return_exceptions=True)
        for r in results:
            if r is True:
                processed += 1
            else:
                errors += 1
                if isinstance(r, Exception):
                    logger.warning(f"Analiz hatası: {r}")

        logger.info(f"Batch {batch_num} tamam: {processed}/{total} (hata: {errors})")

        # Rate limit koruması
        if i + batch_size < total:
            await asyncio.sleep(2.0)

    logger.info(f"=== İşlem tamamlandı ===")
    logger.info(f"Başarılı: {processed}, Hata: {errors}")


async def _analyze_single(movie: dict) -> bool:
    try:
        tmdb_id = movie["id"]
        # Cache'de var mı?
        cached = await cache.get_analysis(tmdb_id)
        if cached and cached.get("analysis_version") == ANALYSIS_VERSION:
            return True

        analysis = await claude_service.analyze_movie_from_tmdb(movie)
        if analysis:
            await cache.save_analysis(tmdb_id, analysis)
            return True
        return False
    except Exception as e:
        logger.warning(f"Film {movie.get('id')} ({movie.get('title')}): {e}")
        return False


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Claude cache genişlet")
    parser.add_argument("--limit", type=int, default=None, help="Maksimum film sayısı")
    parser.add_argument("--force", action="store_true", help="Tümünü yeniden analiz et")
    parser.add_argument("--batch", type=int, default=5, help="Batch boyutu")
    args = parser.parse_args()

    asyncio.run(expand_cache(limit=args.limit, force=args.force, batch_size=args.batch))
