"""
Fast search embedding'leri Gemini ile hesaplar.
movie_fast_search tablosu boş olduğu için tüm repository filmleri taranır.

Kullanım:
  python scripts/compute_embeddings.py              # tüm filmler
  python scripts/compute_embeddings.py --limit 1000  # ilk 1000 film
  python scripts/compute_embeddings.py --batch 50    # batch boyutu
"""
import asyncio
import logging
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.database import cache
from backend.services.embedding_service import embedding_service
from backend.services.fast_search import fast_search_engine

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("compute_embeddings")


async def compute_embeddings(limit: int = None, batch_size: int = 50):
    await cache.init_db()
    await embedding_service.start()

    # Repodaki tüm filmleri al
    movies = await cache.get_all_repository_movies()
    if not movies:
        logger.error("Repository'de film bulunamadı!")
        return

    logger.info(f"Toplam {len(movies)} film bulundu.")
    if limit:
        movies = movies[:limit]
        logger.info(f"Limit uygulandı: {limit} film işlenecek.")

    total = len(movies)
    processed = 0
    errors = 0

    for i in range(0, total, batch_size):
        batch = movies[i : i + batch_size]
        batch_num = i // batch_size + 1
        total_batches = (total + batch_size - 1) // batch_size

        logger.info(f"Batch {batch_num}/{total_batches} işleniyor...")

        for movie in batch:
            try:
                tmdb_id = movie.get("id") or movie.get("tmdb_id")
                if not tmdb_id:
                    errors += 1
                    continue

                title = movie.get("title", "")
                overview = movie.get("overview", "")
                genres = movie.get("genre_ids") or []
                mood_id = movie.get("mood_id") or movie.get("primary_mood_id") or ""

                # Embedding için arama dokümanı oluştur
                search_doc = f"{title}. {overview}" if overview else title

                if not search_doc.strip():
                    errors += 1
                    continue

                # Embedding hesapla ve kaydet
                ok = await fast_search_engine.index_movie(
                    tmdb_id=tmdb_id,
                    title=title,
                    search_document=search_doc,
                    poster_url=movie.get("poster_url") or "",
                    backdrop_url=movie.get("backdrop_url") or "",
                    overview=overview,
                    release_date=movie.get("release_date") or "",
                    vote_average=movie.get("vote_average") or 0,
                    genre_ids=genres,
                    primary_mood_id=mood_id,
                    original_language=movie.get("original_language") or "",
                )

                if ok:
                    processed += 1
                else:
                    errors += 1

            except Exception as e:
                logger.warning(f"Film {movie.get('id')} embedding hatası: {e}")
                errors += 1

        logger.info(f"Batch {batch_num} tamam: {processed + errors}/{total} (başarılı: {processed}, hata: {errors})")

        # Rate limit için kısa bekle
        if i + batch_size < total:
            await asyncio.sleep(0.5)

    logger.info(f"=== İşlem tamamlandı ===")
    logger.info(f"Başarılı: {processed}, Hata: {errors}, Toplam: {total}")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Gemini embedding hesapla")
    parser.add_argument("--limit", type=int, default=None, help="Maksimum film sayısı")
    parser.add_argument("--batch", type=int, default=50, help="Batch boyutu")
    args = parser.parse_args()

    asyncio.run(compute_embeddings(limit=args.limit, batch_size=args.batch))
