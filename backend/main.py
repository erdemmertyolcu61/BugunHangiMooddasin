"""
Film Connoisseur API - FastAPI backend for AI-powered movie mood analysis.

Endpoints:
  GET  /api/movies              - Popular movies from TMDB (fast, no Claude call)
  GET  /api/movies/search       - Search movies by title
  GET  /api/movies/{id}/analyze - Full analysis for a single movie (cached)
  GET  /health                  - Health check
"""
import logging
import time
import os
import html
import json
import re
import hashlib
import hmac
from typing import Optional

from backend.dns_resolver import setup_dns_bypass, refresh_dns
from backend.config import (
    ALLOWED_ORIGINS, BETA_PASSWORD, ADMIN_PASSWORD, JWT_SECRET,
    IS_PRODUCTION, ENVIRONMENT, RATE_LIMIT_GENERAL, RATE_LIMIT_AI,
    TMDB_API_KEY, ANTHROPIC_API_KEY, GOOGLE_CLIENT_ID, GEMINI_API_KEY,
    FRONTEND_BASE_URL,
    VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT,
)
from backend.services.embedding_service import embedding_service
from backend.services.fast_search import fast_search_engine
from backend.services.semantic_search import semantic_engine
from backend.services.search import SearchEngine
from backend.services.taste_map import TasteMapEngine, score_movie_for_profile
from backend.auth_utils import (
    _safe_http_500, _create_token, _verify_token, _auth_response,
    USER_TOKEN_HOURS, optional_user_id, verify_user,
    verify_beta, verify_admin,
)
from fastapi import FastAPI, HTTPException, Query, Path, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, HTMLResponse, RedirectResponse, Response
from contextlib import asynccontextmanager
import jwt as pyjwt
from collections import defaultdict
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import asyncio
import aiosqlite
from pydantic import BaseModel  # used by all request model classes
from backend.database import cache, _get_connection as _db_conn
from backend.services.streaming_links import build_streaming_availability
from backend.services.tmdb_service import tmdb_service
from backend.services.omdb_service import omdb_service
from backend.services.claude_service import claude_service, ANALYSIS_VERSION
from backend.services import ustad_note
from backend.mood_profiles import MOOD_PROFILES, get_tmdb_params, get_positive_genres, GENRE_NAMES

# Unified search engine with 4-tier fallback (semantic → vector → regex → curated)
search_engine = SearchEngine(
    semantic_engine=semantic_engine,
    embedding_service=embedding_service,
    fast_search_engine=fast_search_engine,
    cache=cache,
)

# Mood → TMDB discover parametreleri (mood_profiles.py merkezli)
MOOD_GENRE_MAP = {}
for mid, profile in MOOD_PROFILES.items():
    params = get_tmdb_params(mid)
    MOOD_GENRE_MAP[mid] = {
        "genres": get_positive_genres(mid),
        "without_genres": params.get("without_genres"),
        "with_keywords": params.get("with_keywords"),
        "max_vote_count": params.get("max_vote_count"),
        "sort_by": params.get("sort_by", "vote_average.desc"),
    }

# Claude'dan gelen etiketler ile mood_id eşlemesi
MOOD_ID_LABELS = {
    "battaniye": "battaniye",
    "yolculuk": "yolculuk",
    "gece": "gece",
    "kahkaha": "kahkaha",
    "gozyasi": "gozyasi",
    "adrenalin": "adrenalin",
    "askbahcesi": "askbahcesi",
    "zamanyolcusu": "zamanyolcusu",
    "sessiz": "sessiz",
    "zihin": "zihin",
    "kalp": "kalp",
    "karmakar": "karmakar",
    "sipsak": "sipsak",
    "deep-chills": "deep-chills",
    "kadraj-estetigi": "kadraj-estetigi",
    "geceyarisi-itirafi": "geceyarisi-itirafi",
}

def _normalize_mood_id(mood_id: str) -> str:
    """Normalize mood ID to match MOOD_ID_LABELS keys."""
    if not mood_id:
        return "battaniye"
    m = mood_id.strip()
    return m.lower()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("film_elestirimeni")

# ─── TMDB Response Cache helper ──────────────────────────────
# Caches TMDB API responses in SQLite for TTL seconds.
# Composite cache_key: "{endpoint}:{args}"
_TMDB_CACHE_TTL = {
    "movie":       86400,  # 24h — movie details rarely change
    "similar":     86400,  # 24h
    "recommend":   86400,  # 24h
    "discover":    43200,  # 12h
    "search":      21600,  # 6h
    "upcoming":    21600,  # 6h
    "nowplaying":  21600,  # 6h
    "turkish":     43200,  # 12h
    "providers":   86400,  # 24h
    "videos":      86400,  # 24h — trailer key
}

async def _cached_tmdb(endpoint: str, params_str: str, fetch_fn, max_age: int = None):
    """Generic TMDB cache wrapper. Returns cached data or fetches + caches. Returns None on failure."""
    from backend.database import cache as _db_cache
    ttl = max_age or _TMDB_CACHE_TTL.get(endpoint, 86400)
    cache_key = f"{endpoint}:{params_str}"
    try:
        cached = await _db_cache.get_tmdb_response(cache_key, max_age_hours=ttl // 3600)
        if cached is not None:
            return cached
        data = await fetch_fn()
        if data:
            await _db_cache.set_tmdb_response(cache_key, data)
        return data
    except Exception:
        return None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize the database cache, DNS bypass, seed movie repository, and download audio."""
    await setup_dns_bypass()
    await cache.init_db()
    from backend.database import init_pool as _init_pool
    await _init_pool(cache.db_path)
    # Cache budama kritik DEĞİL — DB kilitli/erişilemezse (ör. başka bir backend
    # örneği yazıyorsa) startup'ı çökertme; uyar ve devam et.
    try:
        await cache.prune_tmdb_cache()
        await cache.prune_mood_query_cache()
    except Exception as e:
        logger.warning(f"[Startup] Cache budama atlandı (DB meşgul olabilir): {e}")
    logger.info("🎬 [Backend] Film Connoisseur API starting...")
    logger.info("📡 [Health] http://127.0.0.1:8002/health")
    logger.info("🎵 [AudioDebug] http://127.0.0.1:8002/api/audio/debug")

    # Download CC0 music tracks from open-lofi GitHub releases
    AUDIO_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "audio_files")
    os.makedirs(AUDIO_DIR, exist_ok=True)

    async def download_audio():
        """Download open-lofi CC0 tracks if not already present."""
        import zipfile, io, httpx as hx

        # Check if we already have tracks recursively
        existing_mp3s = []
        for root, dirs, files in os.walk(AUDIO_DIR):
            for f in files:
                if f.lower().endswith('.mp3'):
                    existing_mp3s.append(os.path.join(root, f))
        
        if len(existing_mp3s) >= 13:
            logger.info(f"[Audio] {len(existing_mp3s)} müzik dosyası mevcut, atlanıyor.")
            return

        zip_url = "https://github.com/btahir/open-lofi/releases/latest/download/openlofi.zip"
        logger.info("[Audio] CC0 müzik paketi indiriliyor...")
        try:
            async with hx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
                resp = await client.get(zip_url)
                resp.raise_for_status()
                zip_data = io.BytesIO(resp.content)
                with zipfile.ZipFile(zip_data) as zf:
                    # Find all mp3 files
                    mp3_files = [f for f in zf.namelist() if f.endswith('.mp3')]
                    logger.info(f"[Audio] {len(mp3_files)} MP3 bulundu, çıkartılıyor...")
                    # Extract all to AUDIO_DIR
                    for mp3 in mp3_files:
                        # Rename: keep relative path structure but flatten
                        dir_part = os.path.dirname(mp3)
                        fname = os.path.basename(mp3)
                        if dir_part:
                            # Create category subfolder
                            cat_dir = os.path.join(AUDIO_DIR, dir_part)
                            os.makedirs(cat_dir, exist_ok=True)
                            dest = os.path.join(cat_dir, fname)
                        else:
                            dest = os.path.join(AUDIO_DIR, fname)
                        if not os.path.exists(dest):
                            with zf.open(mp3) as src, open(dest, 'wb') as dst:
                                dst.write(src.read())
                    logger.info(f"[Audio] Müzik dosyaları {AUDIO_DIR} klasörüne çıkartıldı.")
        except Exception as e:
            logger.error(f"[Audio] İndirme hatası: {e}")

    import asyncio
    # Production'da ses indirme atla — Render ephemeral disk, dosyalar kalmaz
    if not IS_PRODUCTION:
        asyncio.create_task(download_audio())
    logger.info("[Perf] Persistent TMDB client aktif (connection pooling + retry).")

    # Target: her mood'da mumkun oldugunca fazla film
    TARGET_MOVIES_PER_MOOD = 500
    MIN_MOVIES_PER_MOOD = 300
    SEED_PAGES = 25
    TR_SEED_PAGES = 12

    async def auto_seed():
        import time as _time
        t0 = _time.monotonic()

        # Hızlı kontrol: tüm mood'lar doluysa pipeline'ı tamamen atla
        try:
            all_full = True
            total_all = 0
            for mid in MOOD_GENRE_MAP:
                cnt = await cache.count_repository_movies(mid, 0.0)
                total_all += cnt
                if cnt < TARGET_MOVIES_PER_MOOD * 0.8:
                    all_full = False
            if all_full:
                logger.info(f"[Seed] Tüm mood'lar dolu (~{total_all} film), seed atlanıyor.")
                return
            logger.info(f"[Seed] Repository kısmen dolu (~{total_all} film), sadece eksik mood'lar doldurulacak.")
        except Exception as e:
            # Hızlı kontrol başarısız olursa tam seed'e düşeriz; ama sessiz kalma —
            # sürekli başarısızlık repository'nin hiç dolmadığını gizleyebilir.
            logger.warning(f"[Seed] Doluluk ön-kontrolü başarısız, tam seed denenecek: {e}", exc_info=True)

        # Phase 1: Discover-based seeding — 3 moods at a time (parallel)
        mood_items = list(MOOD_GENRE_MAP.items())
        BATCH_SIZE = 3  # Seed 3 moods concurrently

        async def _seed_one_mood(mid, config):
            count = await cache.count_repository_movies(mid, 0.0)
            if count >= TARGET_MOVIES_PER_MOOD:
                logger.info(f"[Seed] {mid} zaten yeterli ({count} film).")
                return 0
            logger.info(f"[Seed] {mid} ({count}/{TARGET_MOVIES_PER_MOOD}) dolduruluyor...")
            tmdb_params = get_tmdb_params(mid)
            rls_lte = tmdb_params.get("primary_release_date_lte")
            saved = await cache.seed_mood_repository(
                mid, config["genres"], tmdb_service,
                pages=SEED_PAGES,
                min_vote=tmdb_params.get("min_vote_average", 6.0),
                with_keywords=config.get("with_keywords"),
                max_vote_count=config.get("max_vote_count"),
                without_genres=config.get("without_genres"),
                seed_turkish=True,
                primary_release_date_lte=rls_lte,
                tr_pages=TR_SEED_PAGES,
                tr_min_vote_override=tmdb_params.get("min_vote_average", 6.0) - 1.0,
                with_runtime_lte=90 if mid == "sipsak" else None,
            )
            after = await cache.count_repository_movies(mid, 0.0)
            logger.info(f"[Seed] {mid} -> +{saved} yeni (toplam: {after}).")
            return saved

        total_seeded = 0
        for i in range(0, len(mood_items), BATCH_SIZE):
            batch = mood_items[i:i + BATCH_SIZE]
            results = await asyncio.gather(
                *[_seed_one_mood(mid, cfg) for mid, cfg in batch],
                return_exceptions=True
            )
            for r in results:
                if isinstance(r, int):
                    total_seeded += r
                elif isinstance(r, Exception):
                    logger.error(f"[Seed] Batch hatasi: {r}")

        t1 = _time.monotonic()
        logger.info(f"[Seed] Discover seeding tamamlandi: +{total_seeded} film, {t1 - t0:.1f}s")

        # Phase 2: Top-rated seeding — only if repo is almost empty (first-ever startup)
        # (Skip if system already has movies — avoids repeated slow startup)
        should_top_rate = await cache.count_repository_movies("kalp", 0.0) < 100
        if should_top_rate:
            from backend.mood_scoring import calculate_mood_scores, get_best_moods, classify_movie
            try:
                logger.info("[Seed] Top-rated filmler ekleniyor...")
                top_pages = await asyncio.gather(
                    *[tmdb_service.get_top_rated(page=p) for p in range(1, 8)],
                    return_exceptions=True
                )
                mood_batches = {}
                for r in top_pages:
                    if isinstance(r, Exception):
                        continue
                    for movie in r.get("movies", []):
                        classification = classify_movie(
                            movie.get("genre_ids", []),
                            movie.get("vote_average"),
                            tmdb_id=movie.get("id"),
                            vote_count=movie.get("vote_count"),
                            overview=movie.get("overview"),
                            release_date=movie.get("release_date"),
                        )
                        target_moods = classification["primaryMoods"][:3]
                        if not target_moods:
                            best = classification["bestMood"]
                            if classification["moodScores"].get(best, 0) >= 30:
                                target_moods = [best]
                        for mood_id in target_moods:
                            mood_batches.setdefault(mood_id, []).append(movie)
                top_rated_added = 0
                for mood_id, movies in mood_batches.items():
                    await cache.bulk_save_repository_movies(movies, mood_id)
                    top_rated_added += len(movies)
                logger.info(f"[Seed] Top-rated: +{top_rated_added} film eklendi.")
            except Exception as e:
                logger.error(f"[Seed] Top-rated hatasi: {e}")
        else:
            logger.info("[Seed] Top-rated atlandi (repo zaten dolu).")

        # Phase 3 & 4: Classify + Keywords — deferred to avoid blocking endpoint
        # These run AFTER the server is fully ready to serve requests
        logger.info("[Seed] Phase 3-4 (classify + keywords) deferred to post-startup.")

        async def _deferred_enrichment():
            """Run classification and keyword enrichment without blocking endpoints."""
            await asyncio.sleep(5)  # Let server warm up first
            # Phase 3: Auto-classify
            try:
                unclassified = await cache.get_unclassified_movies(200)
                if unclassified and len(unclassified) > 10:
                    classified_count = 0
                    for movie in unclassified:
                        try:
                            stored_kw = await cache.get_movie_keywords(movie.get("id"))
                            scores = calculate_mood_scores(
                                movie.get("genre_ids", []),
                                movie.get("vote_average"),
                                tmdb_id=movie.get("id"),
                                vote_count=movie.get("vote_count"),
                                overview=movie.get("overview"),
                                release_date=movie.get("release_date"),
                                tmdb_keywords=stored_kw,
                            )
                            best = get_best_moods(
                                movie.get("genre_ids", []),
                                movie.get("vote_average"),
                                tmdb_id=movie.get("id"),
                                vote_count=movie.get("vote_count"),
                                overview=movie.get("overview"),
                                release_date=movie.get("release_date"),
                                top_n=1, tmdb_keywords=stored_kw,
                            )
                            if best:
                                best_mood, best_score = best[0]
                                if best_score >= 40:
                                    await cache.save_mood_classification(movie["id"], best_mood)
                                    await cache.save_mood_scores(movie["id"], scores)
                                    classified_count += 1
                            await asyncio.sleep(0)  # Yield to event loop
                        except Exception as e:
                            pass
                    if classified_count > 0:
                        logger.info(f"[Classify] {classified_count} film siniflandirildi.")
            except Exception as e:
                logger.error(f"[Classify] Hata: {e}")

            # Phase 4: Keyword enrichment
            try:
                movies_needing_kw = await cache.get_movies_without_keywords(limit=100)
                if movies_needing_kw and len(movies_needing_kw) > 50:
                    movie_ids = [m["id"] for m in movies_needing_kw]
                    kw_count = 0
                    for i in range(0, len(movie_ids), 10):
                        batch_ids = movie_ids[i:i + 10]
                        results = await tmdb_service.get_keywords_batch(batch_ids)
                        for mid, keywords in results.items():
                            if keywords:
                                await cache.save_movie_keywords(mid, keywords)
                                kw_count += 1
                        await asyncio.sleep(0.1)  # Yield between batches
                    logger.info(f"[Keywords] {kw_count} film keyword enrichment tamamlandi.")
            except Exception as e:
                logger.error(f"[Keywords] Hata: {e}")

        # Production'da enrichment atla — pre-seeded DB yeterli, TMDB yükü gereksiz
        if not IS_PRODUCTION:
            asyncio.create_task(_deferred_enrichment())

        # Phase 5: Mood score pre-computation — SKIPPED if scores already exist
        # (Scores persist in DB from previous runs)
        try:
            from backend.database import _get_connection as _db_conn
            async with _db_conn(cache.db_path) as db:
                cursor = await db.execute(
                    "SELECT COUNT(*) FROM movie_repository WHERE mood_score > 0"
                )
                scored_count = (await cursor.fetchone())[0]
            if scored_count < 100:
                # Only pre-compute if scores are missing (first-ever run)
                logger.info("[MoodScore] Scoring needed, will run in background...")
                async def _bg_score():
                    for mid in MOOD_GENRE_MAP:
                        try:
                            n = await cache.update_mood_scores_for_mood(mid)
                            logger.info(f"[MoodScore] {mid}: {n} film skorlandi.")
                            await asyncio.sleep(0.1)  # yield to event loop
                        except Exception as e:
                            logger.error(f"[MoodScore] {mid} hata: {e}")
                asyncio.create_task(_bg_score())
            else:
                logger.info(f"[MoodScore] {scored_count} film zaten skorlu, atlandi.")
        except Exception as e:
            logger.error(f"[MoodScore] Check hata: {e}")

        t2 = _time.monotonic()
        logger.info(f"[Seed] Startup pipeline: {t2 - t0:.1f}s")

    asyncio.create_task(auto_seed())

    async def _cleanup_sipsak_long_films():
        """Remove non-documentary sipsak films > 90 min from repository."""
        try:
            movies = await cache.get_all_repository_movies_by_mood("sipsak", min_vote=0.0)
            if not movies:
                return
            to_check = [m for m in movies if 99 not in m.get("genre_ids", [])]
            if not to_check:
                logger.info("[SipsakCleanup] Tüm sipsak filmleri belgesel, temizlik gerekmedi.")
                return
            async def _check(m):
                try:
                    details = await tmdb_service.get_movie_details(m["id"])
                    runtime = details.get("runtime")
                    if runtime and runtime > 90:
                        return m["id"]
                except Exception:
                    pass
                return None
            results = await asyncio.gather(*[_check(m) for m in to_check])
            to_remove = [r for r in results if r is not None]
            if to_remove:
                await cache.remove_movies_from_repository(to_remove, "sipsak")
                logger.info(f"[SipsakCleanup] {len(to_remove)}/{len(to_check)} uzun film temizlendi.")
            else:
                logger.info(f"[SipsakCleanup] {len(to_check)} film kontrol edildi, temizlik gerekmedi.")
        except Exception as e:
            logger.warning(f"[SipsakCleanup] Hata: {e}")

    asyncio.create_task(_cleanup_sipsak_long_films())

    # ── Poster'siz film temizliği ──────────────────────────────────────────────
    async def _cleanup_posterless():
        try:
            removed = await cache.remove_posterless_movies()
            if removed:
                logger.info(f"[Cleanup] {removed} poster'siz film temizlendi.")
        except Exception as e:
            logger.warning(f"[Cleanup] Poster temizliği hatası: {e}")

    asyncio.create_task(_cleanup_posterless())

    # ── All heavy initializations deferred to background ──
    # Fast Search, Semantic Search, NPZ Cache, Embedding, Model pre-warm
    # run as a single background task so server starts in <2s.
    # Endpoints fall back gracefully when engines aren't ready yet.
    async def _init_engines():
        """Load engines in background after server starts accepting requests."""
        await asyncio.sleep(2)

        # 1. Fast Search Engine (pre-computed Gemini embeddings)
        try:
            n = await fast_search_engine.load_from_db(cache)
            if n > 0:
                logger.info(f"[FastSearch] {n} film embeddingi belleğe yüklendi.")
        except Exception as e:
            logger.error(f"[FastSearch] Yükleme hatası: {e}")

        # 2. Semantic Search Engine (NPZ cache or DB build)
        try:
            n = await semantic_engine.load_from_db(cache)
            if n > 0:
                logger.info(f"[SemanticSearch] {n} film lokal vektör indeksine yüklendi.")
            else:
                await asyncio.sleep(30)
                n2 = await semantic_engine.load_from_db(cache)
                if n2 > 0:
                    logger.info(f"[SemanticSearch] Retry başarılı: {n2} film indekslendi.")
        except Exception as e:
            logger.error(f"[SemanticSearch] Yükleme hatası: {e}")

        # 3. Background embedding job (Gemini text-embedding-004)
        if embedding_service.is_available:
            try:
                batch = await cache.get_unembedded_movies(limit=300)
                if not batch:
                    logger.info("[EmbedJob] Tüm filmler zaten embed edilmiş.")
                else:
                    logger.info(f"[EmbedJob] {len(batch)} film embed edilecek...")
                    embedded = 0
                    failed = 0
                    for movie in batch:
                        try:
                            from backend.services.fast_search import _GENRE_NAMES, _build_ustad_notu
                            genre_ids = movie.get("genre_ids", [])
                            genre_names = [_GENRE_NAMES.get(g, "") for g in genre_ids if g in _GENRE_NAMES]
                            genre_str = ", ".join(genre_names) if genre_names else "film"
                            title = movie.get("title", "")
                            overview = (movie.get("overview") or "")[:400]
                            release_year = (movie.get("release_date") or "")[:4]
                            doc = f"Title: {title}. Year: {release_year}. Genres: {genre_str}. {overview}"
                            vec = await embedding_service.get_embedding_safe(doc)
                            if vec is None:
                                failed += 1; continue
                            from backend.services.embedding_service import encode_embedding
                            blob = encode_embedding(vec)
                            ustad = _build_ustad_notu(title, genre_ids, movie.get("release_date", ""))
                            primary_mood = await cache.get_mood_for_movie(movie.get("id"))
                            await cache.save_fast_search_row(
                                tmdb_id=movie["id"], embedding_data=blob, search_document=doc,
                                ustad_notu=ustad, title=title, poster_url=movie.get("poster_url"),
                                backdrop_url=movie.get("backdrop_url"), overview=overview,
                                release_date=movie.get("release_date", ""), vote_average=movie.get("vote_average", 0.0),
                                genre_ids=genre_ids, primary_mood_id=primary_mood or "",
                            )
                            embedded += 1
                            await asyncio.sleep(0.05)
                        except Exception as e:
                            failed += 1
                            logger.debug(f"[EmbedJob] Film {movie.get('id')} hata: {e}")
                    logger.info(f"[EmbedJob] Tamamlandı: {embedded} embed, {failed} hata.")
                    if embedded > 0:
                        n = await fast_search_engine.load_from_db(cache)
                        logger.info(f"[FastSearch] Matrix yenilendi: {n} film.")
            except Exception as e:
                logger.error(f"[EmbedJob] Genel hata: {e}")
        else:
            logger.warning("[EmbedJob] GEMINI_API_KEY yok — embedding atlanıyor.")

        # 4. Pre-warm sentence-transformers model (lazy-loaded on first request anyway)
        try:
            from backend.services.semantic_search import _get_model as _warm_model
            await asyncio.to_thread(_warm_model)
            logger.info("[SemanticSearch] Model pre-warm tamam.")
        except Exception as e:
            logger.debug(f"[SemanticSearch] Model pre-warm atlandı: {e}")

    asyncio.create_task(_init_engines())

    # ── Günlük push zamanlayıcı (18:00 İstanbul) ─────────────────────────────
    async def _daily_push_scheduler():
        """Her 60 sn'de bir saati kontrol eder, 18:00 İstanbul'da
        sadece PWA kullanıcılarına günün filmi push'unu gönderir."""
        from backend.services.push_service import send_push_broadcast, send_push_for_hour, PUSH_ENABLED as _push_ok
        from backend.database import cache as _cache_for_push
        tz = ZoneInfo("Europe/Istanbul")
        last_push = None  # (date, hour) — saat başı bir kez
        last_weekly = None
        last_game_push = None  # date — günde bir kez
        last_reengage = None   # (date) — günde bir kez
        while True:
            try:
                now_tr = datetime.now(tz)

                # ── Günlük film push'u — KULLANICI-AYARLI SAAT ──
                # Her saat başı (HH:00), o saati seçmiş abonelere günün filmini gönderir.
                # Varsayılan saat 18 (mevcut kullanıcılar 18:00'da almaya devam eder).
                push_key = (now_tr.date(), now_tr.hour)
                if now_tr.minute == 0 and last_push != push_key:
                    last_push = push_key
                    if _push_ok:
                        payload = await _get_daily_film()
                        if payload and payload.get("movie"):
                            m = payload["movie"]
                            n = await send_push_for_hour(
                                now_tr.hour,
                                "Üstad'ın Bugünkü Filmi",
                                f"{m.get('title') or 'Bugünün Filmi'} — {m.get('vote_average', 0):.1f} ⭐",
                                url="/gunun-filmi", tag="daily-film", pwa_only=False,
                            )
                            if n:
                                logger.info("[DailyPush] %02d:00 push gonderildi (%d cihaz): %s",
                                            now_tr.hour, n, m.get("title"))

                # ── Mood Kâhini sıfırlanma push'u (gece yarısı 00:00) ──
                game_key = now_tr.date()
                if now_tr.hour == 0 and now_tr.minute == 0 and _push_ok and last_game_push != game_key:
                    last_game_push = game_key
                    await send_push_broadcast(
                        "Sinemood",
                        "Mood Kâhini yenilendi 🔮 Bugünün filmlerini keşfet.",
                        url="/oyun", tag="mood-oracle-daily", pwa_only=False,
                    )
                    logger.info("[GamePush] Gece yarısı oyun push'u gonderildi: %s", game_key)

                # ── Pasif kullanıcı re-engagement push'u (günde 1 kez 10:00) ──
                if now_tr.hour == 10 and now_tr.minute == 0 and _push_ok and last_reengage != game_key:
                    last_reengage = game_key
                    try:
                        inactive_subs = await _cache_for_push.get_inactive_user_subs(days=7)
                        if inactive_subs:
                            from backend.services.push_service import _send_web_push as __send_push
                            _payload = {
                                "title": "Sinemood",
                                "body": "Seni özledik 🎬 Uzun zamandır yoktun, Üstad'ın yeni seçkileri seni bekliyor.",
                                "url": "/kesfet",
                                "tag": "re-engage",
                            }
                            sent = 0
                            for sub in inactive_subs:
                                result = await asyncio.to_thread(__send_push, sub, _payload)
                                if result == "ok":
                                    sent += 1
                                elif result == "gone":
                                    try:
                                        await _cache_for_push.delete_push_subscription(sub["endpoint"])
                                    except Exception:
                                        pass
                            if sent:
                                logger.info("[ReEngage] %d pasif kullaniciya re-engagement push gonderildi", sent)
                    except Exception as e:
                        logger.warning("[ReEngage] Hata: %s", e)

                # ── Haftalık rapor push (Pazar 19:00 İstanbul) ──
                week_key = now_tr.isocalendar()[:2]  # (yıl, ISO hafta no)
                if now_tr.weekday() == 6 and now_tr.hour == 19 and now_tr.minute == 0 and last_weekly != week_key:
                    last_weekly = week_key
                    if _push_ok:
                        await send_push_broadcast(
                            "Sinemood",
                            "Haftalık raporun hazır 📊 Bu hafta ne kadar yol geldin, Üstad özetledi.",
                            url="/profil", tag="weekly-report", pwa_only=False,
                        )
                        logger.info("[WeeklyPush] Pazar 19:00 haftalik rapor push gonderildi: %s", week_key)
            except Exception as e:
                logger.warning("[DailyPush] Scheduler hatasi: %s", e)
            await asyncio.sleep(60)

    asyncio.create_task(_daily_push_scheduler())

    yield

    # Cleanup persistent TMDB client
    await tmdb_service.close()
    # Cleanup persistent Turso HTTP client (pooled connections)
    from backend.database import _turso_client as _tc
    if _tc is not None:
        try:
            await _tc.aclose()
        except Exception:
            pass
    # Cleanup SQLite connection pool
    from backend.database import close_pool as _close_pool
    await _close_pool()
    # Cleanup Gemini embedding client
    await embedding_service.close()


app = FastAPI(
    title="Film Connoisseur API",
    description="AI-powered movie mood analysis using Claude",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Admin-Password", "X-Beta-Token"],
)

# ── Modüler router'lar ──
from backend.routers.social import router as social_router
app.include_router(social_router)
from backend.routers.lists_user import router as user_content_router
app.include_router(user_content_router)
from backend.routers.push import router as push_router
app.include_router(push_router)
from backend.routers.admin import router as admin_router
app.include_router(admin_router)

# ── Statik dosyalar: Avatar yüklemeleri ──
import os
from fastapi.staticfiles import StaticFiles
_uploads_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads")
os.makedirs(_uploads_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=_uploads_dir), name="uploads")

@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    ms = (time.time() - start) * 1000
    logger.info(f"{request.method} {request.url.path} status={response.status_code} {ms:.0f}ms")
    return response


_error_counter = 0

@app.middleware("http")
async def production_error_handler(request: Request, call_next):
    """In production, hide stack traces from users but include a traceable error ID."""
    if not IS_PRODUCTION:
        return await call_next(request)
    global _error_counter
    try:
        return await call_next(request)
    except HTTPException:
        raise
    except Exception as e:
        _error_counter += 1
        err_id = f"E{_error_counter:04d}"
        logger.error(f"[{err_id}] Unhandled error on {request.method} {request.url.path}: {type(e).__name__}: {e}", exc_info=True)
        return JSONResponse(status_code=500, content={"detail": "Internal server error", "error_id": err_id})



# ─── Cache-Control Middleware ────────────────────────────────
# Per-endpoint TTL so browsers/CDNs cache aggressively.
_CACHE_CONTROL_TTL = {
    "/api/movies/turkish":       300,
    "/api/movies/upcoming":      300,
    "/api/movies/now-playing":   300,
    "/api/movies/discover":      300,
    "/api/movies/search":        120,
    "/api/repository":            60,
    "/api/movies/":              600,
}

@app.middleware("http")
async def cache_control_middleware(request: Request, call_next):
    response = await call_next(request)
    if request.method == "GET" and response.status_code == 200:
        path = request.url.path
        # SW dosyaları asla cache'lenmesin — her açılışta en güncel versiyon alınmalı
        if path in ("/sw.js", "/registerSW.js"):
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            return response
        ttl = None
        for prefix, sec in _CACHE_CONTROL_TTL.items():
            if path.startswith(prefix):
                ttl = sec
                break
        if ttl is not None:
            response.headers["Cache-Control"] = f"public, max-age={ttl}, stale-while-revalidate=60"
    return response


# ─── Payload Strip-Down for Mobile Clients ─────────────────────────────────
# Frontend grid cards only render: id, title, overview (2 lines), poster_url,
# release_date, vote_average, genre_ids.
# Stripping heavy nested objects (ai_analysis, mood, keywords, etc.)
# cuts wire size by ~60-70% per movie — critical for 3G/4G mobile.

_OVERVIEW_TRUNCATE = 120   # ~2 lines on a mobile card

def _truncate_overview(text: str, max_len: int = _OVERVIEW_TRUNCATE) -> str:
    if not text or len(text) <= max_len:
        return text or ""
    cut = text[:max_len].rsplit(" ", 1)[0]
    return cut + "…"


def _slim_movie(movie: dict) -> dict:
    """
    Strip a movie dict to the minimal fields needed by the frontend grid.
    Drops: ai_analysis, mood (nested), primaryMoods, secondaryMoods,
    blockedMoods, moodReason, keywords, tagline, cast, credits, etc.
    Truncates overview to 120 chars.
    """
    return {
        "id":              movie.get("id") or movie.get("tmdb_id"),
        "title":           movie.get("title", ""),
        "poster_url":      movie.get("poster_url") or movie.get("poster_path"),
        "overview":        _truncate_overview(movie.get("overview") or ""),
        "release_date":    movie.get("release_date", ""),
        "vote_average":    movie.get("vote_average", 0.0),
        "genre_ids":       movie.get("genre_ids", []),
        # Optional fields — only include if present and non-null
        **({"mood_score": movie["mood_score"]} if movie.get("mood_score") is not None else {}),
        **({"mood_match_label": movie["mood_match_label"]} if movie.get("mood_match_label") else {}),
        **({"analyzed": movie["analyzed"]} if "analyzed" in movie else {}),
        **({"matched_moods": movie["matched_moods"]} if movie.get("matched_moods") else {}),
        **({"reason": movie["reason"]} if movie.get("reason") else {}),
        **({"ustad_notu": movie["ustad_notu"]} if movie.get("ustad_notu") else {}),
    }


def _slim_movie_list(movies: list[dict]) -> list[dict]:
    """Apply _slim_movie to a list of movies."""
    return [_slim_movie(m) for m in movies]


# ─── Rate Limiter (paylaşılan modül — social.py vb. de aynı limiter'ı kullanır) ───
from backend.services.rate_limit import (
    rate_limit_general, rate_limit_ai,
)



# ─── Auth Endpoints ───

@app.post("/api/auth/beta")
async def beta_login(request: Request):
    """Validate beta password and return a JWT token."""
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid request body")
    password = body.get("password", "")
    if not BETA_PASSWORD:
        raise HTTPException(status_code=403, detail="Beta erişim yapılandırılmamış")
    if hmac.compare_digest(password, BETA_PASSWORD):
        token = _create_token({"type": "beta"}, expires_hours=168)
        return _auth_response({"token": token, "expires_in": 604800}, token)
    raise HTTPException(status_code=401, detail="Invalid beta password")

@app.post("/api/auth/admin")
async def admin_login(request: Request):
    """Validate admin password and return an admin JWT token."""
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid request body")
    password = body.get("password", "")
    if not ADMIN_PASSWORD:
        raise HTTPException(status_code=403, detail="Admin access not configured")
    if hmac.compare_digest(password, ADMIN_PASSWORD):
        token = _create_token({"type": "admin"}, expires_hours=4)
        return _auth_response({"token": token, "expires_in": 14400}, token)
    raise HTTPException(status_code=401, detail="Invalid admin password")

@app.post("/api/auth/google")
async def google_login(request: Request):
    """Google OAuth login — verify ID token, upsert user, return JWT."""
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=503, detail="Google OAuth yapılandırılmamış")
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Geçersiz istek gövdesi")

    credential = body.get("credential", "")
    if not credential:
        raise HTTPException(status_code=400, detail="Google credential eksik")

    idinfo = None
    primary_err = None
    # 1) google-auth ile doğrula (tercih edilen)
    try:
        from google.oauth2 import id_token
        from google.auth.transport import requests as grequests
        idinfo = id_token.verify_oauth2_token(credential, grequests.Request(), GOOGLE_CLIENT_ID)
    except Exception as e:
        primary_err = e
        logger.warning(f"[GoogleAuth] google-auth doğrulama hatası: {e}")
        # 2) Yedek: httpx ile Google tokeninfo (requests/google-auth gerekmez)
        try:
            import httpx
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.get(
                    "https://oauth2.googleapis.com/tokeninfo",
                    params={"id_token": credential},
                )
            if r.status_code == 200:
                info = r.json()
                aud = (info.get("aud") or "").strip()
                iss = info.get("iss", "")
                if aud == (GOOGLE_CLIENT_ID or "").strip() and iss in (
                    "accounts.google.com", "https://accounts.google.com"
                ):
                    idinfo = info
                    logger.info("[GoogleAuth] tokeninfo fallback başarılı")
        except Exception as fe:
            logger.warning(f"[GoogleAuth] tokeninfo fallback hatası: {fe}")

    if not idinfo:
        e = primary_err or Exception("verification failed")
        # Kesin teşhis: token'ı imzasız çözüp aud (token'ın ait olduğu Client ID)
        # ile backend'deki GOOGLE_CLIENT_ID'yi karşılaştır. Client ID'ler gizli
        # değildir (frontend bundle'ında zaten görünür) — mesajda göstermek güvenli.
        detail = "Geçersiz Google token"
        try:
            unverified = pyjwt.decode(credential, options={"verify_signature": False})
            token_aud = (unverified.get("aud") or "").strip()
            cfg = (GOOGLE_CLIENT_ID or "").strip()
            if token_aud and cfg and token_aud != cfg:
                detail = (
                    "Google Client ID eşleşmiyor. "
                    f"Token'ın aud'u …{token_aud[-16:]} ama Render'daki "
                    f"GOOGLE_CLIENT_ID …{cfg[-16:]}. Vercel (VITE_GOOGLE_CLIENT_ID) "
                    "ve Render aynı OAuth Client ID olmalı."
                )
            elif not cfg:
                detail = "Render'da GOOGLE_CLIENT_ID tanımlı değil."
            else:
                exp = unverified.get("exp")
                detail = f"Token doğrulanamadı ({type(e).__name__}). Sunucu saati/exp: {exp}."
        except Exception:
            pass
        raise HTTPException(status_code=401, detail=detail)

    google_id = idinfo.get("sub")
    email = idinfo.get("email", "")
    name = idinfo.get("name", "")
    picture = idinfo.get("picture", "")

    # Davet atıfı (referral) — frontend ?ref=<username> ile gelir
    ref_username = ""
    try:
        ref_username = str(body.get("ref") or "").strip().lower()[:32]
    except Exception:
        ref_username = ""

    # Upsert user — custom fotoğrafı olan kullanıcıda picture korunur
    avatar_data = None
    async with _db_conn(cache.db_path, user_data=True) as db:
        # avatar_data kolonu Turso'da yoksa patlama — eski SELECT'e düş
        try:
            cur = await db.execute("SELECT id, avatar_data FROM users WHERE google_id = ?", (google_id,))
            existing = await cur.fetchone()
            if existing:
                uid, avatar_data = existing
        except Exception:
            cur = await db.execute("SELECT id FROM users WHERE google_id = ?", (google_id,))
            existing = await cur.fetchone()

        is_new = existing is None

        if existing:
            uid = existing[0]
            if avatar_data:
                await db.execute("UPDATE users SET email=?, name=? WHERE id=?", (email, name, uid))
            else:
                await db.execute("UPDATE users SET email=?, name=?, picture=? WHERE id=?", (email, name, picture, uid))
        else:
            await db.execute(
                "INSERT INTO users (google_id, email, name, picture) VALUES (?, ?, ?, ?)",
                (google_id, email, name, picture),
            )

        await db.commit()
        cur = await db.execute("SELECT id, created_at FROM users WHERE google_id = ?", (google_id,))
        row = await cur.fetchone()
        user_id = row[0] if row else 0
        created_at = row[1] if row and len(row) > 1 else None

    if avatar_data:
        picture = f"/api/users/{user_id}/avatar?v={int(time.time())}"

    # Sosyal ağ için benzersiz username garantile (yoksa email öneki + id ile üret)
    username = ""
    try:
        username = await cache.ensure_username(user_id, email)
    except Exception as e:
        logger.warning("[Auth] ensure_username failed for user_id=%s: %s", user_id, e)

    # Yeni kullanıcı + geçerli davet eden → atıf kaydet
    if is_new and ref_username and ref_username != (username or "").lower():
        try:
            referrer = await cache.get_user_by_username(ref_username)
            if referrer and referrer.get("id"):
                await cache.record_referral(referrer["id"], user_id)
        except Exception as e:
            logger.warning("[Auth] referral kaydı başarısız (ref=%s): %s", ref_username, e)

    token = _create_token({"type": "user", "user_id": user_id, "google_id": google_id, "email": email}, expires_hours=USER_TOKEN_HOURS)
    return _auth_response({"token": token, "user": {"id": user_id, "username": username, "email": email, "name": name, "picture": picture, "created_at": created_at}, "is_new": is_new}, token)


@app.post("/api/auth/dev-login")
async def dev_login():
    """SADECE YEREL/GELİŞTİRME — Google olmadan sahte bir kullanıcıyla giriş.
    Üretimde tamamen kapalı (403). Profil/sosyal özellikleri yerelde test etmek için."""
    if IS_PRODUCTION:
        raise HTTPException(status_code=403, detail="Dev giriş üretimde kapalıdır")

    google_id = "dev-local"
    email = "dev@sinemood.local"
    name = "Dev Kullanıcı"
    picture = ""

    avatar_data = None
    async with _db_conn(cache.db_path, user_data=True) as db:
        try:
            cur = await db.execute("SELECT id, avatar_data FROM users WHERE google_id = ?", (google_id,))
            existing = await cur.fetchone()
            if existing:
                uid, avatar_data = existing
        except Exception:
            cur = await db.execute("SELECT id FROM users WHERE google_id = ?", (google_id,))
            existing = await cur.fetchone()

        is_new = existing is None

        if existing:
            uid = existing[0]
            if avatar_data:
                await db.execute("UPDATE users SET email=?, name=? WHERE id=?", (email, name, uid))
            else:
                await db.execute("UPDATE users SET email=?, name=?, picture=? WHERE id=?", (email, name, picture, uid))
        else:
            await db.execute(
                "INSERT INTO users (google_id, email, name, picture) VALUES (?, ?, ?, ?)",
                (google_id, email, name, picture),
            )

        await db.commit()
        cur = await db.execute("SELECT id, created_at FROM users WHERE google_id = ?", (google_id,))
        row = await cur.fetchone()
        user_id = row[0] if row else 0
        created_at = row[1] if row and len(row) > 1 else None

    if avatar_data:
        picture = f"/api/users/{user_id}/avatar?v={int(time.time())}"

    username = ""
    try:
        username = await cache.ensure_username(user_id, email)
    except Exception as e:
        logger.warning("[DevAuth] ensure_username failed: %s", e)

    token = _create_token({"type": "user", "user_id": user_id, "google_id": google_id, "email": email}, expires_hours=USER_TOKEN_HOURS)
    return _auth_response({"token": token, "user": {"id": user_id, "username": username, "email": email, "name": name, "picture": picture, "created_at": created_at}, "is_new": is_new}, token)


# ─── E-posta + Şifre Girişi (Google'dan bağımsız) ───────────────────────────
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _hash_password(pw: str) -> str:
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", pw.encode("utf-8"), salt, 200_000)
    return f"pbkdf2_sha256$200000${salt.hex()}${dk.hex()}"


def _verify_password(pw: str, stored: str) -> bool:
    try:
        _algo, iters, salt_hex, hash_hex = stored.split("$")
        dk = hashlib.pbkdf2_hmac("sha256", pw.encode("utf-8"), bytes.fromhex(salt_hex), int(iters))
        return hmac.compare_digest(dk.hex(), hash_hex)
    except Exception:
        return False


@app.post("/api/auth/register")
async def email_register(request: Request):
    """E-posta + şifre ile kayıt. Google hesaplarından bağımsız (gid='email:<e-posta>')."""
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Geçersiz istek")

    email = str(body.get("email") or "").strip().lower()
    password = str(body.get("password") or "")
    name = str(body.get("name") or "").strip()[:50]

    if not _EMAIL_RE.match(email):
        raise HTTPException(status_code=400, detail="Geçerli bir e-posta gir")
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Şifre en az 6 karakter olmalı")
    if not name:
        name = email.split("@", 1)[0]

    gid = f"email:{email}"
    pw_hash = _hash_password(password)

    async with _db_conn(cache.db_path, user_data=True) as db:
        cur = await db.execute("SELECT id FROM users WHERE google_id = ?", (gid,))
        if await cur.fetchone():
            raise HTTPException(status_code=409, detail="Bu e-posta zaten kayıtlı")
        await db.execute(
            "INSERT INTO users (google_id, email, name, picture, password_hash) VALUES (?, ?, ?, ?, ?)",
            (gid, email, name, "", pw_hash),
        )
        await db.commit()
        cur = await db.execute("SELECT id, created_at FROM users WHERE google_id = ?", (gid,))
        row = await cur.fetchone()
        user_id = row[0] if row else 0
        created_at = row[1] if row and len(row) > 1 else None

    username = ""
    try:
        username = await cache.ensure_username(user_id, email)
    except Exception as e:
        logger.warning("[EmailAuth] ensure_username failed for user_id=%s: %s", user_id, e)

    token = _create_token({"type": "user", "user_id": user_id, "google_id": gid, "email": email}, expires_hours=USER_TOKEN_HOURS)
    return _auth_response({"token": token, "user": {"id": user_id, "username": username, "email": email, "name": name, "picture": "", "created_at": created_at}, "is_new": True}, token)


@app.post("/api/auth/login")
async def email_login(request: Request):
    """E-posta + şifre ile giriş."""
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Geçersiz istek")

    email = str(body.get("email") or "").strip().lower()
    password = str(body.get("password") or "")
    if not email or not password:
        raise HTTPException(status_code=400, detail="E-posta ve şifre gerekli")

    gid = f"email:{email}"
    async with _db_conn(cache.db_path, user_data=True) as db:
        cur = await db.execute(
            "SELECT id, name, picture, password_hash, created_at, username FROM users WHERE google_id = ?",
            (gid,),
        )
        row = await cur.fetchone()

    if not row or not row[3] or not _verify_password(password, row[3]):
        raise HTTPException(status_code=401, detail="E-posta veya şifre hatalı")

    user_id, name, picture, _pw, created_at, username = row[0], row[1], row[2], row[3], row[4], row[5]
    token = _create_token({"type": "user", "user_id": user_id, "google_id": gid, "email": email}, expires_hours=USER_TOKEN_HOURS)
    return _auth_response({"token": token, "user": {"id": user_id, "username": username or "", "email": email, "name": name, "picture": picture or "", "created_at": created_at}, "is_new": False}, token)



@app.get("/api/auth/verify")
async def verify_token_endpoint(request: Request):
    """Verify if a token is still valid (header or cookie)."""
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth.replace("Bearer ", "")
    else:
        token = request.cookies.get("fc_user_token", "")
        if not token:
            raise HTTPException(status_code=401, detail="No token provided")
    payload = _verify_token(token)
    return {"valid": True, "type": payload.get("type"), "exp": payload.get("exp")}



@app.get("/api/user/referrals")
async def get_my_referrals(request: Request, user=Depends(verify_user)):
    """Giriş yapmış kullanıcının davet (referral) istatistikleri + davet linki + ödüller."""
    uid = user["user_id"]
    try:
        count = await cache.get_referral_count(uid)
    except Exception:
        count = 0
    try:
        info = await cache.get_user_by_username_by_id(uid)
    except Exception:
        info = None
    username = (info or {}).get("username", "") or ""
    # Ödül eşikleri (rozet / kilit açma)
    rewards = [(1, "Davetçi"), (3, "Sinefil Elçi"), (10, "Üstad'ın Çırağı")]
    unlocked = [name for thr, name in rewards if count >= thr]
    nxt = next(((thr, name) for thr, name in rewards if count < thr), None)
    return {
        "username": username,
        "count": count,
        "invite_url": f"{FRONTEND_BASE_URL}/?ref={username}" if username else "",
        "rewards_unlocked": unlocked,
        "next_reward": ({"at": nxt[0], "name": nxt[1]} if nxt else None),
    }



@app.post("/api/users/ping")
async def user_ping(request: Request):
    """Kullanıcının son aktif olma zamanını günceller (frontend periyodik çağırır)."""
    uid = optional_user_id(request)
    if uid:
        await cache.update_last_active(uid)
    return {"ok": True}



# ─── Topluluk Önerileri (Community Sharing) ───

@app.post("/api/community/recommend", dependencies=[Depends(rate_limit_general)])
async def community_recommend(request: Request, user=Depends(verify_user)):
    """Giriş yapmış kullanıcı bir filmi topluluğa önerir."""
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Geçersiz istek gövdesi")
    tmdb_id = body.get("tmdb_id")
    if not tmdb_id:
        raise HTTPException(status_code=400, detail="tmdb_id gerekli")
    user_id = user.get("user_id", 0)

    async with _db_conn(cache.db_path, user_data=True) as db:
        cur = await db.execute("SELECT username, name, picture FROM users WHERE id = ?", (user_id,))
        row = await cur.fetchone()
        username = (row[0] if row and row[0] else user.get("email", "Sinemasever"))
        avatar = (row[2] if row and len(row) > 2 else "") or ""
        await db.execute("""
            INSERT INTO community_recommendations (tmdb_id, user_id, username, avatar)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(tmdb_id, user_id) DO UPDATE SET username=excluded.username,
                avatar=excluded.avatar, created_at=CURRENT_TIMESTAMP
        """, (int(tmdb_id), user_id, username, avatar))
        await db.commit()
    return {"success": True, "shared_by": {"uid": user_id, "username": username, "avatar": avatar}}


@app.get("/api/community/recommendations/{tmdb_id}", dependencies=[Depends(rate_limit_general)])
async def community_recommendations(tmdb_id: int = Path(..., ge=1)):
    """Bir filmi topluluğa öneren kullanıcıları döndürür (en yeniler önce)."""
    async with _db_conn(cache.db_path, user_data=True) as db:
        cur = await db.execute("""
            SELECT user_id, username, avatar FROM community_recommendations
            WHERE tmdb_id = ? ORDER BY created_at DESC LIMIT 10
        """, (tmdb_id,))
        rows = await cur.fetchall()
    recommenders = [{"uid": r[0], "username": r[1], "avatar": r[2]} for r in rows]
    return {"count": len(recommenders), "recommenders": recommenders}


@app.delete("/api/community/recommend/{tmdb_id}", dependencies=[Depends(rate_limit_general)])
async def community_unrecommend(tmdb_id: int = Path(..., ge=1), user=Depends(verify_user)):
    """Kullanıcı topluluk önerisini geri alır (yalnız kendi önerisini)."""
    user_id = user.get("user_id", 0)
    async with _db_conn(cache.db_path, user_data=True) as db:
        await db.execute(
            "DELETE FROM community_recommendations WHERE tmdb_id = ? AND user_id = ?",
            (int(tmdb_id), user_id),
        )
        await db.commit()
    return {"success": True}


@app.get("/api/community/my-recommendations", dependencies=[Depends(rate_limit_general)])
async def my_community_recommendations(user=Depends(verify_user)):
    """Kullanıcının topluluğa önerdiği filmler (poster + puan dahil)."""
    user_id = user.get("user_id", 0)

    # Adım 1: Turso'dan sadece tmdb_id'leri al (movie_repository Turso'da yok)
    async with _db_conn(cache.db_path, user_data=True) as db:
        cur = await db.execute("""
            SELECT tmdb_id, MAX(created_at) as created_at
            FROM community_recommendations
            WHERE user_id = ?
            GROUP BY tmdb_id
            ORDER BY created_at DESC
            LIMIT 50
        """, (user_id,))
        rows = await cur.fetchall()

    if not rows:
        return {"recommendations": [], "count": 0}

    ids = [r[0] for r in rows]
    rec_at_map = {r[0]: r[1] for r in rows}
    ids_str = ",".join(str(i) for i in ids)

    # Adım 2: Local SQLite'dan film detaylarını al (movie_repository + movie_cache)
    async with _db_conn(cache.db_path, user_data=False) as db:
        cur = await db.execute(f"""
            SELECT tmdb_id, title, poster_url, vote_average, release_date, genre_ids
            FROM movie_repository WHERE tmdb_id IN ({ids_str})
        """)
        repo_rows = {r[0]: r for r in await cur.fetchall()}

    # movie_repository'de yoksa movie_cache'e bak
    missing_ids = [tid for tid in ids if tid not in repo_rows]
    cache_rows = {}
    if missing_ids:
        missing_str = ",".join(str(i) for i in missing_ids)
        async with _db_conn(cache.db_path, user_data=False) as db:
            cur = await db.execute(f"""
                SELECT tmdb_id, title, poster_url, vote_average, release_date
                FROM movie_cache WHERE tmdb_id IN ({missing_str})
            """)
            cache_rows = {r[0]: r for r in await cur.fetchall()}

    results = []
    for tid in ids:
        r = repo_rows.get(tid)
        if r:
            results.append({
                "tmdb_id": tid, "recommended_at": rec_at_map[tid],
                "title": r[1], "poster_url": r[2],
                "vote_average": r[3], "release_date": r[4],
                "genre_ids": json.loads(r[5]) if r[5] else [],
            })
        else:
            c = cache_rows.get(tid)
            results.append({
                "tmdb_id": tid, "recommended_at": rec_at_map[tid],
                "title": c[1] if c else f"Film #{tid}",
                "poster_url": c[2] if c else None,
                "vote_average": c[3] if c else 0,
                "release_date": c[4] if c else None,
                "genre_ids": [],
            })

    return {"recommendations": results, "count": len(results)}


@app.get("/api/perf-test", dependencies=[Depends(verify_admin)])
async def perf_test():
    """Raw DB performance test — bypasses all background task contention."""
    import sqlite3
    t0 = time.time()
    # Use synchronous sqlite3 directly for zero contention
    conn = sqlite3.connect(cache.db_path)
    conn.execute("PRAGMA journal_mode=WAL")
    cursor = conn.execute(
        """SELECT tmdb_id, title, poster_url, mood_score, vote_average
           FROM movie_repository
           WHERE mood_id = 'battaniye' AND vote_average >= 5.0
           ORDER BY mood_score DESC, vote_average DESC
           LIMIT 20"""
    )
    rows = cursor.fetchall()
    conn.close()
    t1 = time.time()
    return {
        "count": len(rows),
        "time_ms": round((t1 - t0) * 1000, 1),
        "first": rows[0][1] if rows else None,
    }


@app.get("/api/movies/turkish", dependencies=[Depends(rate_limit_general)])
async def get_turkish_movies(
    page: int = Query(1, ge=1, le=100),
    sort_by: str = Query("popularity.desc", regex="^(popularity.desc|vote_average.desc|primary_release_date.desc|revenue.desc)$"),
    min_vote_count: int = Query(0, ge=0),
    min_vote_average: float = Query(0.0, ge=0, le=10),
    year_from: Optional[int] = Query(None, ge=1900, le=2099),
    year_to: Optional[int] = Query(None, ge=1900, le=2099),
):
    """Türk filmlerini TMDB'den çeker (12h cache)."""
    params = f"turkish:p{page}:s{sort_by}:vc{min_vote_count}:va{min_vote_average}:y{year_from}-{year_to}"
    result = await _cached_tmdb("turkish", params, lambda: tmdb_service.get_turkish_movies(
        page=page, sort_by=sort_by, min_vote_count=min_vote_count,
        min_vote_average=min_vote_average, year_from=year_from, year_to=year_to,
    ))
    if result is None:
        raise HTTPException(status_code=500, detail="Türk filmleri yüklenemedi.")
    return {"movies": result["movies"], "page": result["page"], "total_pages": min(result["total_pages"], 100), "total_results": result["total_results"]}


@app.get("/api/movies/upcoming", dependencies=[Depends(rate_limit_general)])
async def get_upcoming_movies():
    """Fetch upcoming releases (6h cache)."""
    result = await _cached_tmdb("upcoming", "upcoming:1", tmdb_service.get_upcoming_movies)
    if result is None:
        raise HTTPException(status_code=500, detail="Vizyona girecek filmler yüklenemedi.")
    return {"movies": result["movies"], "page": result.get("page", 1), "total_pages": result.get("total_pages", 1)}


@app.get("/api/movies/now-playing", dependencies=[Depends(rate_limit_general)])
async def get_now_playing():
    """Fetch movies currently in theaters (6h cache)."""
    result = await _cached_tmdb("nowplaying", "nowplaying:1", tmdb_service.get_now_playing)
    if result is None:
        raise HTTPException(status_code=500, detail="Vizyondaki filmler yüklenemedi.")
    return {"movies": result["movies"], "page": result.get("page", 1), "total_pages": result.get("total_pages", 1)}


@app.get("/api/movies/search", dependencies=[Depends(rate_limit_general)])
async def search_movies(q: str = Query(..., min_length=1, max_length=200)):
    """Search TMDB for movies by title (6h cache)."""
    q_clean = q.strip()
    if not q_clean:
        raise HTTPException(status_code=422, detail="Arama terimi boş olamaz.")
    result = await _cached_tmdb("search", f"q:{q_clean}", lambda: tmdb_service.search_movies(q_clean))
    if result is None:
        raise HTTPException(status_code=500, detail="Film araması başarısız.")
    return {"movies": result, "query": q_clean}


@app.get("/api/movies/discover", dependencies=[Depends(rate_limit_general)])
async def discover_movies(
    genres: str = Query(..., description="Comma-separated TMDB genre IDs"),
    page: int = Query(1, ge=1, le=3),
    sort_by: str = Query("popularity.desc"),
    slim: bool = Query(True, description="Strip payloads for mobile"),
):
    """Discover movies by genre. Max 3 pages (12h cache)."""
    try:
        genre_ids = [int(g.strip()) for g in genres.split(",") if g.strip()]
        if not genre_ids:
            raise HTTPException(status_code=422, detail="En az bir tür ID'si gerekli.")

        params = f"discover:g{'-'.join(map(str,genre_ids))}:p{page}:s{sort_by}"
        result = await _cached_tmdb("discover", params, lambda: tmdb_service.discover_movies(genre_ids, page=page, sort_by=sort_by))
        if result is None:
            raise HTTPException(status_code=500, detail="Film keşfi başarısız.")
        movies = result["movies"]
        enriched = []
        for movie in movies:
            cached_data = await cache.get_movie(movie["id"])
            if cached_data:
                movie["mood"] = cached_data.get("mood")
                movie["ai_analysis"] = cached_data.get("ai_analysis")
                movie["analyzed"] = True
            else:
                movie["mood"] = None
                movie["ai_analysis"] = None
                movie["analyzed"] = False
            enriched.append(movie)

        return {
            "movies": _slim_movie_list(enriched) if slim else enriched,
            "page": result["page"],
            "total_pages": min(result["total_pages"], 3),
        }
    except ValueError:
        raise HTTPException(status_code=422, detail="Geçersiz tür ID formatı.")
    except Exception as e:
        raise _safe_http_500(e)


@app.get("/api/movies", dependencies=[Depends(rate_limit_general)])
async def get_movies(
    page: int = Query(1, ge=1, le=500),
    slim: bool = Query(True, description="Strip payloads for mobile"),
):
    """
    Fetch popular movies from TMDB.
    Returns basic info + cached mood/analysis if previously analyzed.
    """
    try:
        result = await tmdb_service.get_popular_movies(page=page)
        movies = result["movies"]

        # Enrich with cached analysis data where available
        enriched = []
        for movie in movies:
            cached_data = await cache.get_movie(movie["id"])
            if cached_data:
                movie["mood"] = cached_data.get("mood")
                movie["ai_analysis"] = cached_data.get("ai_analysis")
                movie["analyzed"] = True
            else:
                movie["mood"] = None
                movie["ai_analysis"] = None
                movie["analyzed"] = False
            enriched.append(movie)

        return {
            "movies": _slim_movie_list(enriched) if slim else enriched,
            "page": result["page"],
            "total_pages": result["total_pages"],
        }
    except Exception as e:
        raise _safe_http_500(e)


# --- Movie Repository Endpoints (kaliteli film havuzu) ---

@app.get("/api/repository/seed", dependencies=[Depends(verify_admin)])
async def seed_repository(mood_id: str = Query(None)):
    """
    Pre-fetch high-rated movies for all moods (or a specific mood) and store locally.
    Uses mood profile parameters for diverse, characterful seeding.
    """
    try:
        moods_to_seed = [mood_id] if mood_id else list(MOOD_GENRE_MAP.keys())
        total = 0
        results = {}
        for mid in moods_to_seed:
            config = MOOD_GENRE_MAP.get(mid)
            if not config:
                continue
            tmdb_params = get_tmdb_params(mid)
            saved = await cache.seed_mood_repository(
                mid, config["genres"], tmdb_service,
                pages=15,
                min_vote=tmdb_params.get("min_vote_average", 5.5),
                with_keywords=config.get("with_keywords"),
                max_vote_count=config.get("max_vote_count"),
                without_genres=config.get("without_genres"),
                primary_release_date_lte=tmdb_params.get("primary_release_date_lte"),
                seed_turkish=True,
                tr_pages=8,
            )
            results[mid] = saved
            total += saved
        return {
            "status": "success",
            "total_movies_seeded": total,
            "details": results,
        }
    except Exception as e:
        raise _safe_http_500(e)


@app.post("/api/repository/classify", dependencies=[Depends(verify_admin)])
async def classify_repository_movies(
    limit: int = Query(20, ge=1, le=100),
    use_claude: bool = Query(False)
):
    """
    Sınıflandırılmamış filmleri mood'larına göre etiketler.
    use_claude=True → Claude AI kullanır (pahalı, yavaş),
    use_claude=False → genre-based scoring (hızlı, ücretsiz).
    """
    try:
        unclassified = await cache.get_unclassified_movies(limit)
        if not unclassified:
            return {"status": "success", "classified": 0, "message": "Siniflandirilacak film kalmadi."}

        from backend.mood_scoring import calculate_mood_scores, get_best_moods, classify_movie
        classified_count = 0
        claude_count = 0
        for movie in unclassified:
            try:
                # Get stored keywords for better classification
                stored_kw = await cache.get_movie_keywords(movie.get("id"))

                if use_claude:
                    # Claude ile derin analiz (her film ayri API call)
                    overview = movie.get("overview", "")[:500]
                    title = movie.get("title", "")
                    from backend.services.claude_service import claude_service
                    analysis = await claude_service.analyze_movie(
                        title=title,
                        overview=overview,
                        ratings={"imdb_rating": None},
                        genres=[],
                        vote_average=movie.get("vote_average"),
                    )
                    raw_mood = analysis.get("mood", "")
                    best_mood = None
                    for mid, label in MOOD_ID_LABELS.items():
                        if label.lower() in raw_mood.lower():
                            best_mood = mid
                            break
                    if best_mood:
                        scores = calculate_mood_scores(
                            movie.get("genre_ids", []),
                            movie.get("vote_average"),
                            vote_count=movie.get("vote_count"),
                            overview=movie.get("overview"),
                            release_date=movie.get("release_date"),
                            tmdb_keywords=stored_kw,
                        )
                        await cache.save_mood_classification(movie["id"], best_mood)
                        await cache.save_mood_scores(movie["id"], scores)
                        claude_count += 1
                        classified_count += 1
                else:
                    # Rule-based classification with keywords (hizli + daha dogru)
                    classification = classify_movie(
                        movie.get("genre_ids", []),
                        movie.get("vote_average"),
                        tmdb_id=movie.get("id"),
                        vote_count=movie.get("vote_count"),
                        overview=movie.get("overview"),
                        release_date=movie.get("release_date"),
                        tmdb_keywords=stored_kw,
                    )
                    best_mood = classification["bestMood"]
                    best_score = classification["moodScores"].get(best_mood, 0)
                    if best_score >= 40:
                        await cache.save_mood_classification(movie["id"], best_mood)
                        await cache.save_mood_scores(movie["id"], classification["moodScores"])
                        classified_count += 1

            except Exception as e:
                logger.error(f"Classify error for movie {movie.get('id')}: {e}")
                continue

        return {
            "status": "success",
            "classified": classified_count,
            "claude_used": claude_count,
            "total_unclassified": len(unclassified),
        }
    except Exception as e:
        raise _safe_http_500(e)


# ── Curator Override: Üstad'ın kişisel seçkileri ─────────────────────
# Premium odalara giren kullanıcıların boş ekran görmemesi için,
# semantic/seed pipeline'ı hazır olana kadar bu başyapıtlar gösterilir.
# ── Üstad'ın Seçkisi: her mood için elle küratörlük (4 dünya + 1 Türk filmi) ──
# Başlıklar "Başlık (YIL)" biçiminde; yıl belirsiz başlıkların doğru filme
# çözülmesi için kullanılır (bkz. _parse_curated_title / _pick_movie_by_year).
CURATED_TITLES_BY_MOOD = {
    "battaniye": [
        "Gülen Gözler (1977)", "Hababam Sınıfı (1975)", "Süt Kardeşler (1976)",
        "Tosun Paşa (1976)", "Vizontele (2001)",
        "My Neighbor Totoro (1988)", "Klaus (2019)", "Ratatouille (2007)",
        "Our Little Sister (2015)", "Little Forest (2018)",
        "Chef (2014)", "When Harry Met Sally (1989)", "Amelie (2001)",
    ],
    "yolculuk": [
        "The Motorcycle Diaries (2004)", "The Straight Story (1999)", "Tracks (2013)",
        "The Way (2010)", "Yol (1982)",
        "Into the Wild (2007)", "Wild (2014)", "Vizontele Tuuba (2004)",
    ],
    "gece": [
        "Good Time (2017)", "Nightcrawler (2014)", "Kyua (1997)",
        "Memories of Murder (2003)", "Masumiyet (1997)",
        "Drive (2011)", "Collateral (2004)", "Thief (1981)",
    ],
    "kahkaha": [
        "What We Do in the Shadows (2014)", "Hunt for the Wilderpeople (2016)",
        "The Nice Guys (2016)", "In Bruges (2008)", "G.O.R.A. (2004)",
        "Four Lions (2010)", "The Grand Budapest Hotel (2014)", "Organize İşler (2005)",
    ],
    "gozyasi": [
        "The Broken Circle Breakdown (2012)", "Okuribito (2008)", "Still Walking (2008)",
        "A Monster Calls (2016)", "Babam ve Oğlum (2005)",
        "Manchester by the Sea (2016)", "Capernaum (2018)", "Ayla (2017)",
    ],
    "adrenalin": [
        "The Raid: Redemption (2012)", "Victoria (2015)", "13 Assassins (2010)",
        "Headhunters (2011)", "Nefes: Vatan Sağolsun (2009)",
        "Mad Max: Fury Road (2015)", "Heat (1995)", "Leon: The Professional (1994)",
    ],
    "askbahcesi": [
        "Past Lives (2023)", "Like Crazy (2011)", "Weekend (2011)",
        "5 Centimeters per Second (2007)", "Issız Adam (2008)",
        "Her (2013)", "Eternal Sunshine of the Spotless Mind (2004)", "Aşk Tesadüfleri Sever (2011)",
    ],
    "zamanyolcusu": [
        "Cinema Paradiso (1988)", "Tokyo Story (1953)", "Le Samouraï (1967)",
        "Il conformista (1971)", "Susuz Yaz (1963)",
        "Amarcord (1973)", "The Godfather (1972)", "Eşkıya (1996)",
    ],
    "sessiz": [
        "Le Quattro Volte (2010)", "The Turin Horse (2011)", "Silent Light (2007)",
        "Uncle Boonmee Who Can Recall His Past Lives (2010)", "Bal (2010)",
        "Ida (2013)", "Paterson (2016)", "Tabiat-ı Alem (2018)",
    ],
    "zihin": [
        "Coherence (2014)", "Primer (2004)", "The Man from Earth (2007)",
        "Triangle (2009)", "Vavien (2009)",
        "Arrival (2016)", "The Prestige (2006)", "Exam (2009)",
    ],
    "kalp": [
        "Aftersun (2022)", "The Florida Project (2017)", "Columbus (2017)",
        "A Ghost Story (2017)", "Uzak (2002)",
        "Beasts of the Southern Wild (2012)", "Moonrise Kingdom (2012)", "Sivas (2014)",
    ],
    "karmakar": [
        "Holy Motors (2012)", "Songs from the Second Floor (2000)", "The Holy Mountain (1973)",
        "Hausu (1977)", "Kosmos (2009)",
        "Dogtooth (2009)", "The Lobster (2015)", "Titane (2021)",
    ],
    "sipsak": [
        "La Jetée (1962)", "The Red Balloon (1956)", "World of Tomorrow (2015)",
        "Two Cars, One Night (2004)", "Sessiz / Bê Deng (2012)",
        "Paperman (2012)", "Fresh Guacamole (2012)", "Logorama (2009)",
    ],
    "deep-chills": [
        "Lake Mungo (2008)", "The Wailing (2016)", "Kill List (2011)",
        "Saint Maud (2019)", "Baskın (2015)",
        "Hereditary (2018)", "The Witch (2015)", "It Follows (2014)",
    ],
    "kadraj-estetigi": [
        "In the Mood for Love (2000)", "The Fall (2006)", "Nie Yinniang (2015)",
        "The Color of Pomegranates (1969)", "Bir Zamanlar Anadolu'da (2011)",
        "The Grand Budapest Hotel (2014)", "Stalker (1979)", "Hero (2002)",
    ],
    "geceyarisi-itirafi": [
        "Before Sunrise (1995)", "Before Sunset (2004)", "Before Midnight (2013)",
        "My Dinner with Andre (1981)", "Kış Uykusu (2014)",
        "Boyhood (2014)", "A Separation (2011)", "Bir Başkadır (2020)",
    ],
}

_CURATED_TITLE_RE = re.compile(r"^(.*?)\s*\((\d{4})\)\s*$")


def _parse_curated_title(entry: str):
    """'Başlık (YYYY)' → (başlık, yıl:int|None). Yıl yoksa (entry, None)."""
    m = _CURATED_TITLE_RE.match(entry.strip())
    if m:
        return m.group(1).strip(), int(m.group(2))
    return entry.strip(), None


def _pick_movie_by_year(candidates: list, year):
    """Aynı başlığa sahip adaylardan yıla uyanı seç. Yıl yoksa ilkini döndür."""
    if not candidates:
        return None
    if year is None:
        return candidates[0]
    for c in candidates:
        rd = (c.get("release_date") or "")[:4]
        if rd == str(year):
            return c
    return None


CURATOR_PAGE_SIZE = 20

@app.get("/api/repository/movies/{mood_id}", dependencies=[Depends(rate_limit_general)])
async def get_repository_movies(
    mood_id: str,
    page: int = Query(1, ge=1),
    min_vote: float = Query(5.0, ge=0, le=10),
    min_mood_score: float = Query(0.0, ge=0, le=100),
    sort_by: str = Query("recommended"),
    slim: bool = Query(True, description="Strip payloads to minimal fields for mobile"),
):
    """
    Get high-quality movies from local repository for a given mood.
    sort_by: recommended, rating_desc, rating_asc, mood_desc, mood_asc, newest, oldest
    min_mood_score: minimum %40 mood uyum esigi (0-100)
    """
    valid_sorts = {"recommended", "rating_desc", "rating_asc", "mood_desc", "mood_asc", "newest", "oldest"}
    if sort_by not in valid_sorts:
        sort_by = "recommended"

    try:
        config = MOOD_GENRE_MAP.get(mood_id)
        if not config:
            raise HTTPException(status_code=404, detail=f"'{mood_id}' geçerli bir mood değil.")

        tmdb_params = get_tmdb_params(mood_id)

        # ── [CURATOR OVERRIDE] Üstad'ın kişisel seçkisi ──────────────
        # Premium odalarda seed pipeline'ı beklememek için önce repository'de
        # başyapıtları title match ile ara; bulunamazsa doğrudan TMDB'den çek.
        curated_titles = CURATED_TITLES_BY_MOOD.get(mood_id)
        curated_movies = []
        if curated_titles and page == 1:
            try:
                # "Başlık (YYYY)" → [(başlık, yıl)]
                curated_entries = [_parse_curated_title(t) for t in curated_titles]
                plain_titles = [t for (t, _y) in curated_entries]

                # Repository'de başlık eşleşmesi ara; yıla göre doğru filmi seç
                repo_rows = await cache.fetch_movies_by_exact_titles(plain_titles, CURATOR_PAGE_SIZE)
                by_title = {}
                for r in repo_rows:
                    by_title.setdefault((r.get("title") or "").strip().lower(), []).append(r)

                curated = []
                seen_ids = set()
                missing = []  # repo'da bulunamayan → TMDB fallback
                for (title, year) in curated_entries:
                    pick = _pick_movie_by_year(by_title.get(title.lower(), []), year)
                    if pick and pick["id"] not in seen_ids:
                        seen_ids.add(pick["id"])
                        curated.append(pick)
                    else:
                        missing.append((title, year))

                # Phase 2: TMDB fallback — eksik başlıkları TMDB'den (yıl-duyarlı) çek
                if missing:
                    search_tasks = [tmdb_service.search_movies(t) for (t, _y) in missing]
                    s_results = await asyncio.gather(*search_tasks, return_exceptions=True)
                    new_for_db = []
                    for (title, year), results in zip(missing, s_results):
                        if isinstance(results, BaseException) or not results:
                            continue
                        m = _pick_movie_by_year(results, year) or results[0]
                        tid = m["id"]
                        if tid in seen_ids:
                            continue
                        seen_ids.add(tid)
                        m["backdrop_url"] = None
                        m["vote_count"] = 0
                        m["original_language"] = ""
                        m["popularity"] = 0
                        m["mood_score"] = 0
                        new_for_db.append(m)
                        curated.append(m)
                    # TMDB'den bulunanları repository'e kaydet (arkaplanda)
                    if new_for_db:
                        asyncio.create_task(
                            cache.bulk_save_repository_movies(new_for_db, mood_id)
                        )
                if curated:
                    ids = [m["id"] for m in curated]
                    c_map, cl_map = await asyncio.gather(
                        cache.get_movies_batch(ids),
                        cache.get_mood_classifications_batch(ids),
                    )
                    for m in curated:
                        mid = m["id"]
                        m["mood_match_label"] = "Üstad'ın Seçkisi"
                        m["ai_classified"] = cl_map.get(mid) == mood_id
                        m["primaryMoods"] = [mood_id]
                        m["secondaryMoods"] = []
                        m["blockedMoods"] = []
                        m["moodReason"] = REASON_MAP.get(mood_id, "")
                        cd = c_map.get(mid)
                        if cd:
                            m["mood"] = cd.get("mood")
                            m["ai_analysis"] = cd.get("ai_analysis")
                            m["analyzed"] = True
                        else:
                            m["mood"] = None
                            m["ai_analysis"] = None
                            m["analyzed"] = False
                    curated_movies = curated
            except Exception as e:
                logger.warning(f"[Curator] {mood_id} seçki hatası (fallback'e düşüyor): {e}")

        elif not curated_titles and page == 1:
            # ── [AUTO-CURATOR] Manuel seçki yoksa repository'den en uygun 5 film ──
            try:
                top = await cache.get_repository_movies_paginated(
                    mood_id, page=1, per_page=5,
                    min_vote=min_vote, min_mood_score=40,
                    sort_by="recommended", min_vote_count=50,
                )
                if top["movies"]:
                    auto_ids = [m["id"] for m in top["movies"]]
                    c_map, cl_map = await asyncio.gather(
                        cache.get_movies_batch(auto_ids),
                        cache.get_mood_classifications_batch(auto_ids),
                    )
                    for m in top["movies"]:
                        mid = m["id"]
                        m["mood_match_label"] = "Üstad'ın Seçkisi"
                        m["ai_classified"] = cl_map.get(mid) == mood_id
                        m["primaryMoods"] = [mood_id]
                        m["secondaryMoods"] = []
                        m["blockedMoods"] = []
                        m["moodReason"] = REASON_MAP.get(mood_id, "")
                        cd = c_map.get(mid)
                        if cd:
                            m["mood"] = cd.get("mood")
                            m["ai_analysis"] = cd.get("ai_analysis")
                            m["analyzed"] = True
                        else:
                            m["mood"] = None
                            m["ai_analysis"] = None
                            m["analyzed"] = False
                    curated_movies = top["movies"]
            except Exception as e:
                logger.warning(f"[Auto-Curator] {mood_id} oto-seçki hatası: {e}")

        # Count current movies
        count = await cache.count_repository_movies(mood_id, min_vote)

        # Auto-seed if empty (first time) — ASYNC
        if count == 0:
            rls_lte = tmdb_params.get("primary_release_date_lte")
            async def _bg_seed():
                try:
                    s = await cache.seed_mood_repository(
                        mood_id, config["genres"], tmdb_service,
                        pages=15,
                        min_vote=tmdb_params.get("min_vote_average", 5.0),
                        with_keywords=config.get("with_keywords"),
                        max_vote_count=config.get("max_vote_count"),
                        without_genres=config.get("without_genres"),
                        primary_release_date_lte=rls_lte,
                        seed_turkish=True,
                        tr_pages=8,
                    )
                    if s == 0:
                        await cache.seed_mood_repository(
                            mood_id, config["genres"], tmdb_service,
                            pages=5, min_vote=5.0,
                            primary_release_date_lte=rls_lte,
                            seed_turkish=True,
                        )
                    # Pre-compute mood scores after seeding
                    await cache.update_mood_scores_for_mood(mood_id)
                except Exception as e:
                    logger.warning(f"[Seed] {mood_id} background seed failed: {e}")
            asyncio.create_task(_bg_seed())
            if not curated_movies:
                return {
                    "movies": [],
                    "page": page,
                    "total_pages": 1,
                    "total": 0,
                    "seeding": True,
                }

        # ── FAST PATH: SQL-level pagination with pre-computed mood_score ──
        # per_page TÜM sayfalarda sabit (20). Önceden page 1'de curated için
        # per_page düşürülüyordu (20-N); bu hem total_pages'i tutarsız yapıyordu
        # (sf1'de ceil(total/15), sf2'de ceil(total/20) → "161 → 121"), hem de
        # iki sayfa arasındaki regular filmleri (15-19) atlatıyordu. Sabit 20 ile
        # sf1 sadece curated'ı en üste ekler (biraz daha uzun), pagination tutarlı.
        PER_PAGE = 20
        # Az oylu spam/yetişkin 10 puanlı filmleri filtrele (tüm mood'lar için min 50 oy)
        min_vote_count = 50
        result = await cache.get_repository_movies_paginated(
            mood_id, page=page, per_page=PER_PAGE,
            min_vote=min_vote, min_mood_score=min_mood_score,
            sort_by=sort_by, min_vote_count=min_vote_count,
        )
        page_movies = result["movies"]

        # Prepend curated movies on page 1 (regular listeden tekilleştir)
        if curated_movies and page == 1:
            seen_curated_ids = set(m["id"] for m in curated_movies)
            page_movies = curated_movies + [m for m in page_movies if m["id"] not in seen_curated_ids]

        if not page_movies:
            return {
                "movies": [],
                "page": page,
                "total_pages": result["total_pages"],
                "total": result["total"],
                "sort_by": sort_by,
                "min_mood_score": min_mood_score,
            }

        # Batch-enrich only the movies on this page (not 8000+)
        ids = [m["id"] for m in page_movies]
        cache_map, classifications_map = await asyncio.gather(
            cache.get_movies_batch(ids),
            cache.get_mood_classifications_batch(ids),
        )

        for movie in page_movies:
            mid = movie["id"]
            if movie.get("mood_match_label") != "Üstad'ın Seçkisi":
                movie["mood_match_label"] = "Mood'a Uyum"
                movie["ai_classified"] = classifications_map.get(mid) == mood_id
                movie["primaryMoods"] = []
                movie["secondaryMoods"] = []
                movie["blockedMoods"] = []
                movie["moodReason"] = ""

                cached_data = cache_map.get(mid)
                if cached_data:
                    movie["mood"] = cached_data.get("mood")
                    movie["ai_analysis"] = cached_data.get("ai_analysis")
                    movie["analyzed"] = True
                else:
                    movie["mood"] = None
                    movie["ai_analysis"] = None
                    movie["analyzed"] = False

        # ── Streaming boost: Şipşak için Netflix/Prime/Apple/MUBİ filmlerini öne çıkar ──
        if mood_id == "sipsak" and sort_by == "recommended":
            target_keywords = {"netflix", "prime", "amazon", "apple tv", "mubi", "disney", "blutv", "exxen", "paramount", "hbo", "max"}
            try:
                streaming_ids = set()
                for m in page_movies:
                    wp = await cache.get_watch_providers(m["id"], "TR")
                    if wp:
                        for cat in ("flatrate", "free", "ads"):
                            for p in wp.get(cat, []):
                                name = (p.get("provider_name", "") or "").lower()
                                if any(kw in name for kw in target_keywords):
                                    streaming_ids.add(m["id"])
                                    break
                if streaming_ids:
                    streaming = [m for m in page_movies if m["id"] in streaming_ids]
                    non_streaming = [m for m in page_movies if m["id"] not in streaming_ids]
                    page_movies = streaming + non_streaming
            except Exception:
                pass

        return {
            "movies": _slim_movie_list(page_movies) if slim else page_movies,
            "page": page,
            "total_pages": result["total_pages"],
            "total": result["total"],
            "sort_by": sort_by,
            "min_mood_score": min_mood_score,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Repository] {mood_id} error: {e}")
        return {
            "movies": [],
            "page": page,
            "total_pages": 1,
            "total": 0,
            "seeding": False,
        }


@app.get("/api/repository/debug/{mood_id}", dependencies=[Depends(verify_admin)])
async def debug_mood_repository(mood_id: str, limit: int = Query(5, ge=1, le=20)):
    """
    Debug endpoint: Bir mood için örnek filmlerin skor bileşenlerini gösterir.
    """
    try:
        from backend.mood_scoring import get_mood_score_reasons, calculate_mood_scores
        profile = MOOD_PROFILES.get(mood_id)
        if not profile:
            raise HTTPException(status_code=404, detail=f"'{mood_id}' geçerli bir mood değil.")

        result = await cache.get_repository_movies_by_mood(mood_id, page=1, per_page=limit, min_vote=0)

        sample_movies = []
        for movie in result["movies"][:limit]:
            genre_ids = movie.get("genre_ids", [])
            reasons = get_mood_score_reasons(
                mood_id, genre_ids,
                vote_average=movie.get("vote_average"),
                tmdb_id=movie.get("id"),
                vote_count=movie.get("vote_count"),
                overview=movie.get("overview"),
                release_date=movie.get("release_date")
            )
            scores = calculate_mood_scores(
                genre_ids, movie.get("vote_average"),
                tmdb_id=movie.get("id"),
                vote_count=movie.get("vote_count"),
                overview=movie.get("overview"),
                release_date=movie.get("release_date")
            )
            sample_movies.append({
                "id": movie["id"],
                "title": movie["title"],
                "vote_average": movie.get("vote_average"),
                "vote_count": movie.get("vote_count"),
                "genre_ids": genre_ids,
                "mood_score": scores.get(mood_id, 0),
                "score_reasons": reasons,
            })

        return {
            "mood_id": mood_id,
            "profile": {
                "title": profile.get("title"),
                "intent": profile.get("intent"),
                "popularity_policy": profile.get("popularity_policy"),
                "positive_genres": profile.get("positive_genres"),
                "negative_genres": profile.get("negative_genres"),
            },
            "sample_movies": sample_movies,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise _safe_http_500(e)


@app.post("/api/repository/enrich-keywords", dependencies=[Depends(verify_admin)])
async def enrich_keywords(
    mood_id: str = Query(None),
    limit: int = Query(50, ge=1, le=200),
):
    """
    Fetch TMDB keywords for movies that don't have them yet.
    Enriches movie_attributes table with keyword data for better mood scoring.
    """
    try:
        movies = await cache.get_movies_without_keywords(mood_id=mood_id, limit=limit)
        if not movies:
            return {"status": "success", "enriched": 0, "message": "Tum filmler zaten keyword'lere sahip."}

        enriched_count = 0
        for movie in movies:
            try:
                keywords = await tmdb_service.get_movie_keywords(movie["id"])
                if keywords:
                    await cache.save_movie_keywords(movie["id"], keywords)
                    enriched_count += 1
            except Exception as e:
                logger.error(f"[Keywords] {movie['id']} hatasi: {e}")
                continue

        return {
            "status": "success",
            "enriched": enriched_count,
            "total_checked": len(movies),
        }
    except Exception as e:
        raise _safe_http_500(e)


@app.post("/api/repository/expand-similar", dependencies=[Depends(verify_admin)])
async def expand_similar_movies(
    mood_id: str = Query(...),
    limit: int = Query(5, ge=1, le=20),
):
    """
    Expand movie pool by fetching similar/recommended movies for top-rated films in a mood.
    Uses TMDB similar + recommendations endpoints to discover new films.
    """
    try:
        from backend.mood_scoring import classify_movie

        config = MOOD_GENRE_MAP.get(mood_id)
        if not config:
            raise HTTPException(status_code=404, detail=f"'{mood_id}' gecerli bir mood degil.")

        # Get top-rated movies in this mood to use as seeds
        result = await cache.get_repository_movies_by_mood(mood_id, page=1, per_page=limit, min_vote=7.0)
        seed_movies = result["movies"]

        added_total = 0
        for seed in seed_movies:
            seed_id = seed["id"]
            try:
                # Fetch similar movies
                similar = await tmdb_service.get_similar_movies(seed_id)
                for movie in similar["movies"]:
                    classification = classify_movie(
                        movie.get("genre_ids", []),
                        movie.get("vote_average"),
                        tmdb_id=movie.get("id"),
                        vote_count=movie.get("vote_count"),
                        overview=movie.get("overview"),
                        release_date=movie.get("release_date"),
                    )
                    # Only add if this mood is primary or secondary
                    if mood_id in classification["primaryMoods"] or mood_id in classification["secondaryMoods"]:
                        if mood_id not in classification["blockedMoods"]:
                            await cache.bulk_save_repository_movies([movie], mood_id)
                            added_total += 1

                # Fetch recommendations
                recs = await tmdb_service.get_recommendations(seed_id)
                for movie in recs["movies"]:
                    classification = classify_movie(
                        movie.get("genre_ids", []),
                        movie.get("vote_average"),
                        tmdb_id=movie.get("id"),
                        vote_count=movie.get("vote_count"),
                        overview=movie.get("overview"),
                        release_date=movie.get("release_date"),
                    )
                    if mood_id in classification["primaryMoods"] or mood_id in classification["secondaryMoods"]:
                        if mood_id not in classification["blockedMoods"]:
                            await cache.bulk_save_repository_movies([movie], mood_id)
                            added_total += 1
            except Exception as e:
                logger.error(f"[Expand] Seed {seed_id} hatasi: {e}")
                continue

        return {
            "status": "success",
            "mood_id": mood_id,
            "seeds_used": len(seed_movies),
            "movies_added": added_total,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise _safe_http_500(e)


@app.get("/api/repository/classify-movie/{movie_id}", dependencies=[Depends(rate_limit_general)])
async def classify_single_movie(movie_id: int):
    """
    Classify a single movie — returns primaryMoods, secondaryMoods, blockedMoods, moodScores.
    Fetches TMDB keywords if not cached.
    """
    try:
        from backend.mood_scoring import classify_movie

        # Get movie details
        details = await tmdb_service.get_movie_details(movie_id)
        if not details:
            raise HTTPException(status_code=404, detail="Film bulunamadi.")

        # Get or fetch keywords
        stored_kw = await cache.get_movie_keywords(movie_id)
        if not stored_kw:
            keywords = await tmdb_service.get_movie_keywords(movie_id)
            if keywords:
                await cache.save_movie_keywords(movie_id, keywords)
                stored_kw = keywords

        # Map genre names to IDs
        genre_ids = []
        for g in details.get("genres", []):
            for gid, gname in GENRE_NAMES.items():
                if gname == g:
                    genre_ids.append(gid)
                    break

        year = details.get("release_date", "")[:4] if details.get("release_date") else ""

        classification = classify_movie(
            genre_ids,
            details.get("vote_average"),
            tmdb_id=movie_id,
            overview=details.get("overview"),
            release_date=details.get("release_date"),
            tmdb_keywords=stored_kw,
        )

        return {
            "movie_id": movie_id,
            "title": details.get("title", ""),
            "genres": details.get("genres", []),
            "genre_ids": genre_ids,
            "keywords": [kw.get("name", str(kw)) if isinstance(kw, dict) else str(kw) for kw in stored_kw[:15]],
            "year": year,
            "vote_average": details.get("vote_average"),
            **classification,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise _safe_http_500(e)


from pydantic import BaseModel
from typing import List

class WatchlistRequest(BaseModel):
    tmdb_id: int
    title: str
    poster_url: Optional[str] = None

class NoteRequest(BaseModel):
    content: str

class FuturePlanRequest(BaseModel):
    tmdb_id: int
    title: str
    poster_url: Optional[str] = None
    priority: int = 0
    watch_date: Optional[str] = None
    notes: Optional[str] = None

# --- Watchlist (Defterim) Endpoints ---

@app.get("/api/watchlist", dependencies=[Depends(rate_limit_general)])
async def get_watchlist(request: Request):
    """Get all movies in the watchlist (kullanıcıya özel)."""
    try:
        uid = optional_user_id(request)
        movies = await cache.get_watchlist(user_id=uid)
        return {"movies": movies}
    except Exception as e:
        raise _safe_http_500(e)

@app.post("/api/watchlist", dependencies=[Depends(rate_limit_general)])
async def add_to_watchlist(req: WatchlistRequest, request: Request):
    """Add a movie to the watchlist."""
    try:
        uid = optional_user_id(request)
        await cache.add_to_watchlist(req.tmdb_id, req.title, req.poster_url, user_id=uid)
        if uid:
            await cache.invalidate_taste_profile(uid)
        # Seed movie metadata into movie_cache so taste analysis can use it
        try:
            details = await tmdb_service.get_movie_details(req.tmdb_id)
            if details:
                await cache.save_movie(req.tmdb_id, req.title, details)
        except Exception:
            pass
        return {"status": "success"}
    except Exception as e:
        raise _safe_http_500(e)

@app.delete("/api/watchlist/{tmdb_id}", dependencies=[Depends(rate_limit_general)])
async def remove_from_watchlist(tmdb_id: int, request: Request):
    """Remove a movie from the watchlist."""
    try:
        uid = optional_user_id(request)
        await cache.remove_from_watchlist(tmdb_id, user_id=uid)
        if uid:
            await cache.invalidate_taste_profile(uid)
        return {"status": "success"}
    except Exception as e:
        raise _safe_http_500(e)

@app.post("/api/watchlist/{tmdb_id}/toggle-watched", dependencies=[Depends(rate_limit_general)])
async def toggle_watched(request: Request, tmdb_id: int = Path(..., ge=1)):
    """Toggle the watched status of a movie in the watchlist."""
    try:
        uid = optional_user_id(request)
        new_state = await cache.toggle_watched(tmdb_id, user_id=uid)
        if uid:
            await cache.invalidate_taste_profile(uid)
        return {"tmdb_id": tmdb_id, "watched": new_state}
    except Exception as e:
        logger.error(f"Toggle watched error: {e}")
        raise _safe_http_500(e)

# --- Personal Notes Endpoints ---

@app.get("/api/movies/{movie_id}/notes", dependencies=[Depends(rate_limit_general)])
async def get_movie_note(movie_id: int, request: Request):
    """Get the personal note for a movie."""
    try:
        uid = optional_user_id(request)
        note = await cache.get_note(movie_id, user_id=uid)
        return {"note": note}
    except Exception as e:
        raise _safe_http_500(e)

@app.post("/api/movies/{movie_id}/notes", dependencies=[Depends(rate_limit_general)])
async def save_movie_note(movie_id: int, req: NoteRequest, request: Request):
    """Save or update a personal note for a movie."""
    try:
        uid = optional_user_id(request)
        await cache.save_note(movie_id, req.content, user_id=uid)
        if uid:
            await cache.invalidate_taste_profile(uid)
        return {"status": "success"}
    except Exception as e:
        raise _safe_http_500(e)


async def _resolve_mood_id(movie_id: int, details: dict) -> str:
    """Filmin mood_id'sini Claude'suz çöz: önce mevcut sınıflandırma, yoksa kural-tabanlı."""
    try:
        existing = await cache.get_mood_classification(movie_id)
        if existing:
            return existing
    except Exception:
        pass
    try:
        from backend.mood_scoring import classify_movie
        result = classify_movie(
            details.get("genre_ids", []),
            vote_average=details.get("vote_average"),
            tmdb_id=movie_id,
            overview=details.get("overview"),
            release_date=details.get("release_date"),
        )
        return result.get("bestMood") or "battaniye"
    except Exception:
        return "battaniye"


@app.get("/api/movies/{movie_id}/analyze", dependencies=[Depends(rate_limit_ai)])
async def analyze_movie(request: Request, movie_id: int = Path(..., ge=1)):
    """
    Get full connoisseur analysis for a movie.
    Checks cache first; on miss, fetches from OMDb + Claude and caches result.
    """
    uid = optional_user_id(request)
    # 1. Check cache
    cached_data = await cache.get_movie(movie_id)

    # Check watchlist status and notes (dynamic, kullanıcıya özel)
    in_watchlist = await cache.is_in_watchlist(movie_id, user_id=uid)
    personal_note = await cache.get_note(movie_id, user_id=uid)

    if cached_data:
        cached_data["in_watchlist"] = in_watchlist
        cached_data["personal_note"] = personal_note

        # Türkçe özet garantisi: cache İngilizce olabilir, her seferinde tr-TR dene
        try:
            tr_details = await asyncio.wait_for(
                tmdb_service.get_movie_details(movie_id), timeout=4.0
            )
            if tr_details.get("overview"):
                cached_data["overview"] = tr_details["overview"]
        except Exception:
            pass  # cache'deki overview'u koru

        # Add/refresh watch providers for cached movies
        if "watch_providers" not in cached_data:
            try:
                wp = await cache.get_watch_providers(movie_id, "TR")
                if not wp:
                    wp = await tmdb_service.get_movie_watch_providers(movie_id, region="TR")
                    await cache.save_watch_providers(movie_id, "TR", wp)
                cached_data["watch_providers"] = wp
            except Exception:
                cached_data["watch_providers"] = {"region": "TR", "link": None, "flatrate": [], "rent": [], "buy": [], "free": [], "ads": []}
        cached_data["streaming_availability"] = build_streaming_availability(
            cached_data.get("watch_providers"),
            cached_data.get("title"),
            cached_data.get("release_date"),
        )

        # Eski ŞABLON notunu sıfır maliyetle güncel sürüme yükselt.
        # Gerçek Claude notlarına (note_source != "template") ASLA dokunma.
        try:
            ver = cached_data.get("analysis_version")
            is_template = cached_data.get("note_source") == "template" or ver == "v4-template"
            if is_template and ver != ustad_note.TEMPLATE_VERSION:
                seed_details = {
                    "id": movie_id,
                    "title": cached_data.get("title"),
                    "genre_ids": cached_data.get("genre_ids") or [],
                    "genres": cached_data.get("genres") or [],
                    "release_date": cached_data.get("release_date"),
                    "vote_average": cached_data.get("vote_average"),
                }
                rgen = {"imdb_rating": cached_data.get("imdb_rating"), "director": cached_data.get("director")}
                mood_for_note = cached_data.get("mood") or await _resolve_mood_id(movie_id, seed_details)
                cached_data["ai_analysis"] = ustad_note.generate_note(seed_details, rgen, mood_for_note)
                cached_data["analysis_version"] = ustad_note.TEMPLATE_VERSION
                cached_data["note_source"] = "template"
                try:
                    await cache.save_movie(movie_id, cached_data.get("title") or "", cached_data)
                except Exception as e:
                    logger.warning(f"[analyze] template not yükseltme kaydı atlandı ({movie_id}): {e}")
        except Exception as e:
            logger.warning(f"[analyze] template not yükseltme atlandı ({movie_id}): {e}")

        return _with_layout(cached_data)

    # 2. Fetch movie details from TMDB
    try:
        details = await tmdb_service.get_movie_details(movie_id)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Movie not found on TMDB: {e}")

    # 3. Fetch cast
    cast = await tmdb_service.get_movie_credits(movie_id)

    # 4. Fetch ratings from OMDb
    year = details.get("release_date", "")[:4] if details.get("release_date") else None
    ratings = await omdb_service.get_ratings(details["title"], year=year)

    # 5. Üstad notu — SIFIR MALİYET (kural-tabanlı şablon motoru).
    #    Claude artık kullanıcı akışında çağrılmıyor; yalnız admin "warm-ustad"
    #    yolu seçili filmleri Claude kalitesine yükseltebilir (claude_service).
    details.setdefault("id", movie_id)  # not seed'i deterministik + regen ile tutarlı kalsın
    mood_id = await _resolve_mood_id(movie_id, details)
    analysis = {
        "mood": MOOD_ID_LABELS.get(mood_id, mood_id),
        "analysis": ustad_note.generate_note(details, ratings, mood_id),
    }

    # 6. Build the enriched result
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
        "analysis_version": ustad_note.TEMPLATE_VERSION,
        "note_source": "template",
        "analyzed": True,
        "in_watchlist": in_watchlist,
        "personal_note": personal_note
    }

    # 7. Mood sınıflandırmasını kaydet (mood_id zaten kesin biliniyor).
    #    DB kilitliyse (ör. açılışta eşzamanlı indeks yazımı) isteği DÜŞÜRME —
    #    not deterministik; bir sonraki istekte aynısı üretilir.
    if mood_id:
        try:
            await cache.save_mood_classification(movie_id, mood_id)
        except Exception as e:
            logger.warning(f"[analyze] mood sınıflandırma kaydı atlandı ({movie_id}): {e}")

    # 8. Add watch providers (lazy, non-blocking on error)
    try:
        watch_providers = await cache.get_watch_providers(movie_id, "TR")
        if not watch_providers:
            watch_providers = await tmdb_service.get_movie_watch_providers(movie_id, region="TR")
            await cache.save_watch_providers(movie_id, "TR", watch_providers)
        enriched["watch_providers"] = watch_providers
    except Exception as e:
        logger.warning(f"Watch providers unavailable for {movie_id}: {e}")
        enriched["watch_providers"] = {"region": "TR", "link": None, "flatrate": [], "rent": [], "buy": [], "free": [], "ads": []}
    enriched["streaming_availability"] = build_streaming_availability(
        enriched.get("watch_providers"),
        enriched.get("title"),
        enriched.get("release_date"),
    )

    # 9. Cache result (DB kilitliyse sessizce geç — not deterministik, yeniden üretilebilir)
    try:
        await cache.save_movie(movie_id, details["title"], enriched)
    except Exception as e:
        logger.warning(f"[analyze] film cache kaydı atlandı ({movie_id}): {e}")

    return _with_layout(enriched)


def _with_layout(movie: dict) -> dict:
    """Attach _layout metadata for Mobile/Web UI synchronicity.
    Both clients receive identical data + semantic layout config so that
    poster transitions, ambient lighting, and detail presentation are 1:1.
    """
    poster = movie.get("poster_url") or ""
    backdrop = movie.get("backdrop_url") or ""
    title = movie.get("title") or ""

    movie["_layout"] = {
        "poster": {
            "src": poster,
            # TMDB image variants — clients pick the right size for their viewport
            "sizes": {
                "sm":  poster.replace("/original/", "/w342/")   if "/original/" in poster else poster,
                "md":  poster.replace("/original/", "/w500/")   if "/original/" in poster else poster,
                "lg":  poster.replace("/original/", "/w780/")   if "/original/" in poster else poster,
                "full": poster,
            },
            "aspect_ratio": "2:3",
            "corner_radius": "16dp",
        },
        "backdrop": {
            "src": backdrop,
            "sizes": {
                "sm":  backdrop.replace("/original/", "/w780/")  if "/original/" in backdrop else backdrop,
                "lg":  backdrop.replace("/original/", "/w1280/") if "/original/" in backdrop else backdrop,
                "full": backdrop,
            },
            "aspect_ratio": "16:9",
        },
        "ambient": {
            "source": "backdrop",
            "effect": "blur_glow",
            "blur_radius": 80,
            "opacity": 0.35,
            "blend_mode": "soft-light",
        },
        "detail_sections": [
            "header",         # poster + title + year + rating
            "mood_badge",     # mood classification with icon
            "ustad_notu",     # ai_analysis card
            "overview",       # synopsis
            "cast_strip",     # horizontal cast scroll
            "ratings_bar",    # IMDb / RT / Metacritic
            "streaming",      # where to watch
            "similar_strip",  # similar films horizontal scroll
        ],
        "transition": {
            "type": "shared_element",
            "shared_tag": f"poster-{movie.get('id', '')}",
            "duration_ms": 350,
            "curve": "ease_out_expo",
        },
    }
    return movie


@app.get("/api/movies/{movie_id}/similar", dependencies=[Depends(rate_limit_general)])
async def get_similar_movies_endpoint(movie_id: int = Path(..., ge=1)):
    """Bir filme gerçekten yakın filmler (24h cache). Recommendations + similar, tür örtüşmesi + kalite skoruyla sıralanır."""
    async def _compute():
        src_genres = set()
        try:
            details = await asyncio.wait_for(tmdb_service.get_movie_details(movie_id), timeout=4.0)
            for g in (details.get("genre_ids") or []):
                src_genres.add(g)
            for g in (details.get("genres") or []):
                if isinstance(g, dict) and g.get("id"):
                    src_genres.add(g["id"])
        except Exception:
            pass
        rec, sim = await asyncio.gather(
            tmdb_service.get_recommendations(movie_id, page=1),
            tmdb_service.get_similar_movies(movie_id, page=1),
        )
        pool = {}
        for m in rec.get("movies", []):
            pool[m["id"]] = m
        for m in sim.get("movies", []):
            pool.setdefault(m["id"], m)
        candidates = [
            m for m in pool.values()
            if m.get("poster_url") and m["id"] != movie_id
            and (m.get("vote_count") or 0) >= 60
            and (m.get("vote_average") or 0) >= 5.8
        ]
        def relevance(m):
            gids = set(m.get("genre_ids") or [])
            overlap = len(gids & src_genres) if src_genres else 0
            return overlap * 3.0 + min((m.get("vote_average") or 0), 9.0) * 0.5 + min((m.get("vote_count") or 0) / 1000.0, 5.0) * 0.3
        candidates.sort(key=relevance, reverse=True)
        return {"movies": candidates[:12]}

    result = await _cached_tmdb("similar", f"m{movie_id}", _compute)
    return result or {"movies": []}


@app.get("/api/movies/{movie_id}/videos", dependencies=[Depends(rate_limit_general)])
async def get_movie_videos_endpoint(movie_id: int = Path(..., ge=1)):
    """Filmin en iyi resmî YouTube fragmanı (24h cache). Fragman yoksa {} döner."""
    async def _compute():
        return await tmdb_service.get_movie_videos(movie_id)
    result = await _cached_tmdb("videos", f"m{movie_id}", _compute)
    return result or {}


@app.get("/api/movies/{movie_id}/watch-providers", dependencies=[Depends(rate_limit_general)])
async def get_movie_watch_providers_endpoint(
    movie_id: int = Path(..., ge=1),
    region: str = Query("TR", min_length=2, max_length=4),
):
    """Get watch providers for a movie in a specific region."""
    try:
        # Film adı (deep-link için) — cache'deki analizden, ekstra TMDB çağrısı yok
        _m = await cache.get_movie(movie_id)
        _title = (_m or {}).get("title")
        _rdate = (_m or {}).get("release_date")

        cached = await cache.get_watch_providers(movie_id, region)
        if cached:
            return {
                "movie_id": movie_id,
                "watch_providers": cached,
                "streaming_availability": build_streaming_availability(cached, _title, _rdate),
            }

        providers = await tmdb_service.get_movie_watch_providers(movie_id, region=region)
        await cache.save_watch_providers(movie_id, region, providers)
        return {
            "movie_id": movie_id,
            "watch_providers": providers,
            "streaming_availability": build_streaming_availability(providers, _title, _rdate),
        }
    except Exception as e:
        logger.error(f"Watch providers error for {movie_id}: {e}")
        return {
            "movie_id": movie_id,
            "watch_providers": {"region": region, "link": None, "flatrate": [], "rent": [], "buy": [], "free": [], "ads": []}
        }


# --- Image Proxy with Disk Cache ---
import hashlib
_IMAGE_CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "image_cache")
os.makedirs(_IMAGE_CACHE_DIR, exist_ok=True)

def _write_cache(path: str, data: bytes) -> None:
    """Sync helper for async disk write via asyncio.to_thread."""
    with open(path, "wb") as f:
        f.write(data)

# Shared httpx client for connection pooling (reuses TCP connections)
import httpx as _hx
_image_client = _hx.AsyncClient(
    timeout=_hx.Timeout(8.0, connect=5.0),
    limits=_hx.Limits(max_connections=20, max_keepalive_connections=10),
    follow_redirects=True,
)

@app.get("/api/image-proxy")
async def image_proxy(url: str = Query(...)):
    """
    TMDB görsel proxy — ISP DNS engelini aşmak için.
    Disk cache ile aynı poster tekrar TMDB'den çekilmez.
    Connection pooling ile paralel istekler hızlı.

    NOT: Genel API rate-limit'ine (60/dk/IP) TABİ DEĞİL. Tek bir mood sayfası
    ~20 poster'ı aynı anda ister; rate-limit'e tabi olsaydı IP bütçesini anında
    tüketip 429 döndürürdü (posterler yüklenmezdi). Endpoint yalnız image.tmdb.org
    host'una izin verir ve disk cache'lidir → kötüye kullanım riski düşük.
    """
    from fastapi.responses import FileResponse, Response
    from urllib.parse import urlparse

    allowed_hosts = ["image.tmdb.org"]
    parsed = urlparse(url)
    if parsed.hostname not in allowed_hosts:
        raise HTTPException(status_code=403, detail="Sadece TMDB görselleri desteklenir.")

    # Disk cache check — URL hash ile dosya adı
    url_hash = hashlib.md5(url.encode()).hexdigest()
    ext = ".jpg" if "jpg" in url or "jpeg" in url else ".png" if "png" in url else ".jpg"
    cache_path = os.path.join(_IMAGE_CACHE_DIR, f"{url_hash}{ext}")

    if os.path.exists(cache_path):
        # Disk cache hit — çok hızlı
        content_type = "image/jpeg" if ext == ".jpg" else "image/png"
        return FileResponse(
            cache_path,
            media_type=content_type,
            headers={
                "Cache-Control": "public, max-age=604800",
                "X-Cache": "HIT",
                # html2canvas (paylaşım görseli) + native (mutlak URL) için CORS.
                "Access-Control-Allow-Origin": "*",
            },
        )

    # Disk cache miss — TMDB'den çek ve kaydet
    try:
        resp = await _image_client.get(url)
        resp.raise_for_status()
        content_type = resp.headers.get("content-type", "image/jpeg")
        body = resp.content

        # Async disk write — event loop'i bloklama
        try:
            from functools import partial
            await asyncio.to_thread(partial(_write_cache, cache_path, body))
        except Exception:
            pass  # Disk yazma hatası poster gösterimini engellemesin

        return Response(
            content=body,
            media_type=content_type,
            headers={
                "Cache-Control": "public, max-age=604800",
                "X-Cache": "MISS",
                # html2canvas (paylaşım görseli) + native (mutlak URL) için CORS.
                "Access-Control-Allow-Origin": "*",
            },
        )
    except Exception:
        raise HTTPException(status_code=502, detail="Görsel yüklenemedi.")


@app.get("/", response_class=RedirectResponse)
async def root_redirect():
    """Backend root → frontend'e yönlendir."""
    return RedirectResponse(url=FRONTEND_BASE_URL, status_code=302)

@app.get("/health")
@app.get("/api/health")
async def health_check():
    return {
        "status": "ok",
        "service": "Film Connoisseur API",
        "version": "beta-1",
        "environment": ENVIRONMENT,
        "tmdb_configured": bool(TMDB_API_KEY),
        "claude_configured": bool(ANTHROPIC_API_KEY),
        "beta_enabled": bool(BETA_PASSWORD),
        "semantic_search_ready": semantic_engine.is_ready,
        "semantic_movie_count": semantic_engine.movie_count,
    }

@app.get("/api/diag")
async def diag_endpoint():
    """Production'da 500 alınıyorsa bu endpoint ile temel hata tespiti."""
    from backend.database import _turso_client as _tc

    # DB connectivity
    db_ok = False
    db_msg = ""
    try:
        async with _db_conn(cache.db_path, user_data=True) as db:
            cur = await db.execute("SELECT 1")
            await cur.fetchone()
        db_ok = True
        db_msg = "reachable"
    except Exception as e:
        db_msg = f"{type(e).__name__}: {e}"

    # Users table + avatar_data kolonu
    avatar_col_ok = False
    avatar_col_error = ""
    try:
        async with _db_conn(cache.db_path, user_data=True) as db:
            cur = await db.execute("SELECT avatar_data FROM users LIMIT 1")
            await cur.fetchone()
        avatar_col_ok = True
    except Exception as e:
        avatar_col_error = f"{type(e).__name__}: {e}"

    # users tablosu varlığı
    users_table_ok = False
    users_table_error = ""
    try:
        async with _db_conn(cache.db_path, user_data=True) as db:
            cur = await db.execute("SELECT 1 FROM users LIMIT 1")
            await cur.fetchone()
        users_table_ok = True
    except Exception as e:
        users_table_error = f"{type(e).__name__}: {e}"

    turso_configured = bool(os.environ.get("TURSO_DATABASE_URL"))
    turso_token_set = bool(os.environ.get("TURSO_AUTH_TOKEN"))
    tc_active = _tc is not None

    return {
        "environment": ENVIRONMENT,
        "is_production": IS_PRODUCTION,
        "db_path": str(cache.db_path),
        "db_ok": db_ok,
        "db_msg": db_msg,
        "turso_configured": turso_configured,
        "turso_token_set": turso_token_set,
        "turso_client_active": tc_active,
        "users_table_exists": users_table_ok,
        "users_table_error": users_table_error,
        "avatar_column_exists": avatar_col_ok,
        "avatar_column_error": avatar_col_error,
        "google_client_configured": bool(GOOGLE_CLIENT_ID),
        "jwt_secret_configured": bool(JWT_SECRET),
        "tmdb_configured": bool(TMDB_API_KEY),
        "claude_configured": bool(ANTHROPIC_API_KEY),
        "frontend_base": FRONTEND_BASE_URL,
    }


# --- Future Plans Endpoints (Gelecek Planları) ---

@app.get("/api/future", dependencies=[Depends(rate_limit_general)])
async def get_future_plans(request: Request):
    """Get all movies in future plans (kullanıcıya özel)."""
    try:
        uid = optional_user_id(request)
        movies = await cache.get_future_plans(user_id=uid)
        return {"movies": movies}
    except Exception as e:
        raise _safe_http_500(e)

@app.post("/api/future", dependencies=[Depends(rate_limit_general)])
async def add_to_future(req: FuturePlanRequest, request: Request):
    """Add a movie to future plans."""
    try:
        uid = optional_user_id(request)
        await cache.add_to_future(req.tmdb_id, req.title, req.poster_url, req.priority, req.watch_date, req.notes, user_id=uid)
        if uid:
            await cache.invalidate_taste_profile(uid)
        return {"status": "success"}
    except Exception as e:
        raise _safe_http_500(e)

@app.delete("/api/future/{tmdb_id}", dependencies=[Depends(rate_limit_general)])
async def remove_from_future(tmdb_id: int, request: Request):
    """Remove a movie from future plans."""
    try:
        uid = optional_user_id(request)
        await cache.remove_from_future(tmdb_id, user_id=uid)
        if uid:
            await cache.invalidate_taste_profile(uid)
        return {"status": "success"}
    except Exception as e:
        raise _safe_http_500(e)

@app.put("/api/future/{tmdb_id}/priority", dependencies=[Depends(rate_limit_general)])
async def update_future_priority(tmdb_id: int, request: Request, priority: int = Query(0, ge=0, le=5)):
    """Update priority of a future plan."""
    try:
        uid = optional_user_id(request)
        await cache.update_future_priority(tmdb_id, priority, user_id=uid)
        if uid:
            await cache.invalidate_taste_profile(uid)
        return {"status": "success"}
    except Exception as e:
        raise _safe_http_500(e)

@app.put("/api/future/{tmdb_id}/date", dependencies=[Depends(rate_limit_general)])
async def update_future_date(tmdb_id: int, request: Request, watch_date: str = Query(None)):
    """Update watch date of a future plan."""
    try:
        uid = optional_user_id(request)
        await cache.update_future_date(tmdb_id, watch_date, user_id=uid)
        if uid:
            await cache.invalidate_taste_profile(uid)
        return {"status": "success"}
    except Exception as e:
        raise _safe_http_500(e)


# --- "Kafan mı Karışık?" AI Öneri Endpoint ---

@app.get("/api/repository/stats", dependencies=[Depends(rate_limit_general)])
async def repository_stats():
    """Debug: repository stats per mood."""
    try:
        stats = await cache.get_repository_stats()
        return {"moods": stats}
    except Exception as e:
        logger.error(f"Stats error: {e}")
        return {"moods": {}}


@app.get("/api/recommend/confused", dependencies=[Depends(rate_limit_ai)])
async def get_confused_recommendation(mood: str = Query(None, description="Mevcut ruh hali (opsiyonel)")):
    """Kafan mı karışık? - Legacy GET endpoint (random film)."""
    from backend.services.tmdb_service import tmdb_service
    try:
        import random
        result = await tmdb_service.discover_movies([18, 878, 35, 53], page=random.randint(1, 50))
        movies = result.get("movies", [])
        random.shuffle(movies)
        return {"mood_analysis": None, "reasoning": None, "suggested_genres": [], "movies": movies[:5]}
    except Exception as e:
        raise _safe_http_500(e)


# Confused mood keyword fallback (AI cagrisi basarisiz olursa)
_CONFUSED_KEYWORDS = {
    "yorgun": {"sessiz": 3, "battaniye": 2, "kalp": 1},
    "boş film": {"kalp": 3, "sessiz": 2, "zihin": 1, "kahkaha": -1},
    "gülmek": {"kahkaha": 4, "battaniye": 1},
    "düşünmek": {"zihin": 4, "kalp": 1, "karmakar": 1},
    "gerilmek": {"deep-chills": 4, "gece": 2},
    "karanlık": {"gece": 3, "deep-chills": 2, "zihin": 1},
    "romantik": {"askbahcesi": 4, "gozyasi": 1, "kalp": 1},
    "ağlamak": {"gozyasi": 4, "kalp": 2},
    "sakin": {"sessiz": 4, "battaniye": 2},
    "eski": {"zamanyolcusu": 4},
    "nostaljik": {"zamanyolcusu": 4},
    "klasik": {"zamanyolcusu": 4},
    "80ler": {"sipsak": 3, "zamanyolcusu": 1},
    "neon": {"sipsak": 3, "gece": 2},
    "retro": {"zamanyolcusu": 4},
    "synth": {"sipsak": 3},
    "heyecan": {"adrenalin": 4, "gece": 1},
    "macera": {"yolculuk": 4, "adrenalin": 1},
    "yol": {"yolculuk": 4},
    "keşif": {"yolculuk": 4},
    "hüzün": {"gozyasi": 3, "kalp": 2, "sessiz": 1},
    "aşk": {"askbahcesi": 4, "gozyasi": 1},
    "korku": {"deep-chills": 4, "gece": 2},
    "gizem": {"zihin": 3, "gece": 2, "karmakar": 1},
    "uzay": {"yolculuk": 2, "karmakar": 1},
    "çocuk": {"battaniye": 4, "kahkaha": 2},
    "aile": {"battaniye": 4, "kahkaha": 1},
    "sürpriz": {"battaniye": 1, "yolculuk": 1, "gece": 1, "kahkaha": 1, "gozyasi": 1, "adrenalin": 1, "askbahcesi": 1, "zamanyolcusu": 1, "sessiz": 1, "zihin": 1, "kalp": 1, "karmakar": 1, "sipsak": 1, "deep-chills": 1, "kadraj-estetigi": 1, "geceyarisi-itirafi": 1},
    "klişe": {"askbahcesi": -1, "gozyasi": -1, "battaniye": -1},
    "yavaş": {"sessiz": 3, "battaniye": 2},
    "hızlı": {"adrenalin": 3, "sipsak": 1},
    "kaliteli": {"zihin": 2, "kalp": 2, "sessiz": 1},
    "derin": {"kalp": 3, "sessiz": 2, "zihin": 1},
    "hafif": {"kahkaha": 3, "battaniye": 3, "yolculuk": 1},
    "ağır": {"gozyasi": 3, "deep-chills": 2, "zamanyolcusu": 1},
    "kafa dağıtmak": {"kahkaha": 4, "adrenalin": 2, "yolculuk": 1},
    "bilim kurgu": {"zihin": 3, "yolculuk": 2, "karmakar": 1},
    "deneysel": {"karmakar": 4, "sessiz": 1},
    "şaşırt": {"karmakar": 3, "zihin": 3, "gece": 1},
    "duygusal": {"gozyasi": 4, "kalp": 3, "askbahcesi": 2, "battaniye": 1},
    "içimi parçala": {"gozyasi": 4, "kalp": 3},
    "huzur": {"battaniye": 4, "sessiz": 3, "yolculuk": 1},
    "abi": {"battaniye": 2, "kahkaha": 2, "yolculuk": 1},
    # ─── Mevsimler (içe dönük cozy — asla istenenin tersi) ───
    "kış": {"battaniye": 3, "sessiz": 2, "gozyasi": 2, "zamanyolcusu": 1},
    "yaz": {"askbahcesi": 3, "yolculuk": 2, "adrenalin": 1},
    "sonbahar": {"sessiz": 3, "gozyasi": 2, "kalp": 2},
    "ilkbahar": {"battaniye": 2, "askbahcesi": 2, "yolculuk": 1},
    "bahar": {"battaniye": 2, "askbahcesi": 2},
    # ─── Hava durumu ───
    "kar": {"battaniye": 3, "sessiz": 2, "zamanyolcusu": 1},
    "yağmur": {"sessiz": 3, "gozyasi": 2, "battaniye": 1},
    "yağmurlu": {"sessiz": 3, "gozyasi": 2, "battaniye": 1},
    "güneş": {"yolculuk": 2, "askbahcesi": 2},
    "fırtına": {"deep-chills": 2, "gece": 2, "adrenalin": 1},
    "soğuk": {"battaniye": 3, "sessiz": 2},
    "sıcak": {"askbahcesi": 2, "battaniye": 2, "yolculuk": 1},
    # ─── Temalar ───
    "tema": {},  # no-op: eşlik eden mevsim/konu kelimesi sonucu belirlesin
    "savaş": {"gozyasi": 3, "zamanyolcusu": 2, "adrenalin": 1},
    "doğa": {"yolculuk": 3, "sessiz": 1},
    "deniz": {"yolculuk": 3, "sessiz": 1},
    "dağ": {"yolculuk": 3},
    "şehir": {"gece": 3, "zihin": 1},
    "tutkulu": {"askbahcesi": 4, "gozyasi": 1},
    "şehvetli": {"askbahcesi": 3, "gece": 4, "deep-chills": 2},
    "sevgilimle": {"askbahcesi": 3, "battaniye": 1},
    "ailemle": {"battaniye": 3, "kahkaha": 1},
    "arkadaşlarla": {"kahkaha": 3, "adrenalin": 1},
    "yalnız": {"sessiz": 2, "kalp": 2, "gozyasi": 1},
    "sinematografi": {"kadraj-estetigi": 4, "sessiz": 1},
    "görsel": {"kadraj-estetigi": 4, "karmakar": 1},
    "estetik": {"kadraj-estetigi": 4, "sessiz": 2},
    "kompozisyon": {"kadraj-estetigi": 4},
    "renk": {"kadraj-estetigi": 3, "karmakar": 1},
    "gece yarısı": {"geceyarisi-itirafi": 4, "gece": 2},
    "sohbet": {"geceyarisi-itirafi": 4, "kalp": 2},
    "diyalog": {"geceyarisi-itirafi": 4, "kalp": 2},
    "samimi": {"geceyarisi-itirafi": 3, "kalp": 2, "sessiz": 1},
    "itiraf": {"geceyarisi-itirafi": 4},
    "varoluş": {"geceyarisi-itirafi": 3, "zihin": 2},
    "felsefe": {"geceyarisi-itirafi": 3, "zihin": 2},
    "derin konuşma": {"geceyarisi-itirafi": 4, "kalp": 1},
    # ─── Yeni eklenen kelimeler (genişletilmiş duygu/tema desteği) ───
    "stres": {"sessiz": 3, "battaniye": 2},
    "stresli": {"sessiz": 3, "battaniye": 2},
    "bunalım": {"sessiz": 3, "battaniye": 2, "kalp": 1},
    "bunaldım": {"sessiz": 3, "battaniye": 2, "kalp": 1},
    "sıkıldım": {"kahkaha": 3, "adrenalin": 2, "yolculuk": 1},
    "sıkıntı": {"kahkaha": 3, "adrenalin": 2, "yolculuk": 1},
    "rahatlamak": {"battaniye": 3, "sessiz": 2, "yolculuk": 1},
    "motivasyon": {"adrenalin": 3, "yolculuk": 2},
    "umut": {"yolculuk": 3, "battaniye": 2, "kahkaha": 1},
    "umutlu": {"yolculuk": 3, "battaniye": 2, "kahkaha": 1},
    "umutsuz": {"gozyasi": 3, "kalp": 2, "sessiz": 1},
    "özlem": {"gozyasi": 3, "kalp": 2, "zamanyolcusu": 1},
    "özledim": {"gozyasi": 3, "kalp": 2, "zamanyolcusu": 1},
    "pişman": {"gozyasi": 3, "kalp": 2, "sessiz": 1},
    "hayal kırıklığı": {"gozyasi": 3, "kalp": 1, "sessiz": 1},
    "öfkeli": {"adrenalin": 3, "gece": 2, "deep-chills": 1},
    "sinirli": {"adrenalin": 3, "gece": 2},
    "mutsuz": {"gozyasi": 3, "kalp": 2, "battaniye": 1},
    "endişe": {"deep-chills": 3, "sessiz": 2, "kalp": 1},
    "endişeli": {"deep-chills": 3, "sessiz": 2, "kalp": 1},
    "yalnızlık": {"sessiz": 3, "kalp": 2, "gozyasi": 1},
    "cesaret": {"adrenalin": 3, "yolculuk": 2},
    "isyan": {"gece": 3, "adrenalin": 2, "karmakar": 1},
    "özgürlük": {"yolculuk": 4, "adrenalin": 1},
    "canım sıkkın": {"sessiz": 2, "kalp": 2, "gozyasi": 1},
    "içim daraldı": {"sessiz": 3, "kalp": 2, "gece": 1},
    "bıktım": {"kahkaha": 3, "yolculuk": 2, "adrenalin": 1},
    "kafa dinlemek": {"sessiz": 3, "battaniye": 2},
    "vakit geçsin": {"kahkaha": 2, "yolculuk": 2, "battaniye": 1},
    "sarılacak": {"battaniye": 3, "kalp": 2, "sessiz": 1},
    "içimi ısıtacak": {"battaniye": 4, "kalp": 2, "askbahcesi": 1},
    "gerilim": {"deep-chills": 3, "gece": 2, "adrenalin": 1},
    "psikolojik": {"zihin": 3, "deep-chills": 2, "karmakar": 1},
    "distopik": {"gece": 3, "zihin": 2, "deep-chills": 1},
    "fantastik": {"yolculuk": 3, "karmakar": 2, "zihin": 1},
    "sürükleyici": {"adrenalin": 2, "gece": 2, "zihin": 1},
    "düşündürücü": {"zihin": 4, "kalp": 1, "karmakar": 1},
    "etkileyici": {"kalp": 3, "zihin": 2, "gozyasi": 1},
    "güldür": {"kahkaha": 4, "battaniye": 1},
    "ağlat": {"gozyasi": 4, "kalp": 1},
    "korkut": {"deep-chills": 4, "gece": 2},
    "heyecanlandır": {"adrenalin": 4, "yolculuk": 1},
    "kaçış": {"yolculuk": 3, "adrenalin": 2},
    "unutmak": {"kahkaha": 3, "adrenalin": 2, "yolculuk": 1},
    "dalmak": {"sessiz": 3, "battaniye": 2, "zihin": 1},
    "kaybolmak": {"yolculuk": 3, "karmakar": 2, "gece": 1},
    # ─── Yetişkin temalar ───
    "seksi": {"gece": 4, "askbahcesi": 3, "deep-chills": 1},
    "erotik": {"gece": 4, "askbahcesi": 2, "deep-chills": 2},
    "yetiskin": {"gece": 4, "deep-chills": 2},
    "cesur": {"gece": 3, "deep-chills": 2, "karmakar": 1},
    # ─── Eksik türler ───
    "dram": {"gozyasi": 3, "kalp": 3, "sessiz": 2},
    "komedi": {"kahkaha": 4},
    "aksiyon": {"adrenalin": 4, "gece": 1},
    "suç": {"gece": 3, "deep-chills": 2},
    "belgesel": {"zihin": 3, "yolculuk": 2},
    "animasyon": {"battaniye": 3, "kahkaha": 2, "yolculuk": 1},
    "müzikal": {"kahkaha": 3, "battaniye": 2},
    # ─── Eksik duygu durumları ───
    "neşeli": {"kahkaha": 4, "yolculuk": 1},
    "coşkulu": {"adrenalin": 3, "kahkaha": 2},
    "gergin": {"deep-chills": 3, "gece": 2},
    "durgun": {"sessiz": 3, "battaniye": 2},
    "kırgın": {"gozyasi": 3, "kalp": 2, "sessiz": 1},
    "memnun": {"battaniye": 3, "yolculuk": 2, "kahkaha": 1},
    "huzursuz": {"deep-chills": 3, "sessiz": 2, "gece": 1},
    "şaşkın": {"karmakar": 3, "zihin": 2},
    # ─── Film özellikleri ───
    "gerçek hikaye": {"kalp": 4, "gozyasi": 3, "sessiz": 1},
    "gerçek": {"kalp": 3, "gozyasi": 2, "zihin": 1},
    "siyah beyaz": {"zamanyolcusu": 3, "kadraj-estetigi": 2},
    "bağımsız": {"karmakar": 3, "kalp": 2, "sessiz": 1},
    "güzel": {"battaniye": 1, "kalp": 1, "yolculuk": 1, "sessiz": 1, "zihin": 1, "kahkaha": 1},
    "harika": {"kalp": 2, "zihin": 2, "sessiz": 1},
    # ─── Günlük ifadeler ───
    "kafam güzel": {"battaniye": 3, "kahkaha": 2, "sipsak": 1},
    "dinlenmek": {"sessiz": 3, "battaniye": 2},
    "uyku": {"sessiz": 3, "battaniye": 2},
    "delirmek": {"karmakar": 3, "adrenalin": 2},
    "deli": {"karmakar": 3, "adrenalin": 2},
    # ─── Dönem ───
    "90lar": {"zamanyolcusu": 3, "sipsak": 2},
    "2000ler": {"sipsak": 2, "zamanyolcusu": 1},
    # ─── Yeni tema/tür keywordleri ───
    "tarih": {"zamanyolcusu": 3, "gozyasi": 2},
    "tarihi film": {"zamanyolcusu": 3, "gozyasi": 2},
    "western": {"zamanyolcusu": 3, "yolculuk": 2},
    "kovboy": {"zamanyolcusu": 3, "yolculuk": 2},
    "fantazi": {"karmakar": 3, "zihin": 1},
    "gençlik": {"kahkaha": 3, "askbahcesi": 2, "yolculuk": 1},
    "teen": {"kahkaha": 3, "askbahcesi": 2},
    "spor": {"adrenalin": 3, "yolculuk": 2},
    "korku komedi": {"karmakar": 3, "kahkaha": 3, "deep-chills": 1},
    "kült": {"karmakar": 3, "zamanyolcusu": 2, "zihin": 1},
    "sanat filmi": {"kadraj-estetigi": 3, "sessiz": 2, "karmakar": 1},
    "oscar": {"kalp": 2, "zihin": 1, "kadraj-estetigi": 1},
    "ödüllü film": {"kalp": 2, "zihin": 1},
    "gişe rekoru": {"adrenalin": 3, "gece": 2},
    "blockbuster": {"adrenalin": 3, "gece": 2},
}


_TR_SUFFIXES = (
    "temalı", "temali", "lık", "lik", "luk", "lük",
    "ları", "leri", "lar", "ler", "ında", "inde", "ında", "unda", "ünde",
    "da", "de", "ta", "te", "ın", "in", "un", "ün", "lı", "li", "lu", "lü",
)


def _tr_normalize(text: str) -> str:
    """Türkçe-güvenli küçük harf (İ/I sorununu çözer)."""
    return (text or "").replace("İ", "i").replace("I", "ı").lower()


def _strip_tr_suffix(token: str) -> str:
    """Eşleşme amaçlı ek temizleme: 'temalı'→'tema', 'kışın'→'kış'."""
    for suf in _TR_SUFFIXES:
        if len(token) > len(suf) + 1 and token.endswith(suf):
            return token[: -len(suf)]
    return token


def _rule_based_confused_analysis(text: str) -> dict:
    """Kural tabanli mood analizi (AI fallback) — Türkçe morfoloji + mevsim/tema."""
    text_lower = _tr_normalize(text)
    # Ekleri temizlenmiş token kümesi (substring kaçırırsa kök yakalansın)
    tokens = [t.strip(".,!?;:\"'()") for t in text_lower.split()]
    stripped = {_strip_tr_suffix(t) for t in tokens if t}

    scores = {m: 0 for m in [
        "battaniye","yolculuk","gece","kahkaha","gozyasi","adrenalin",
        "askbahcesi","zamanyolcusu","sessiz","zihin","kalp","karmakar",
        "sipsak","deep-chills"
    ]}

    matched_real = False
    for keyword, effects in _CONFUSED_KEYWORDS.items():
        kw = _tr_normalize(keyword)
        if kw in text_lower or kw in stripped:
            if effects:  # boş dict (örn. "tema") no-op
                matched_real = True
            for mood_id, pts in effects.items():
                if mood_id in scores:
                    scores[mood_id] += pts

    # Varsayilan bonus: hic gerçek keyword eslesmezse
    if not matched_real and all(v == 0 for v in scores.values()):
        scores["battaniye"] = 2
        scores["yolculuk"] = 2
        scores["kalp"] = 2

    top3 = sorted(scores.items(), key=lambda x: -x[1])[:3]
    total = max(sum(v for _, v in top3), 1)
    mood_mix = [{"mood_id": m, "title": MOOD_NAMES.get(m, m), "percentage": round(v / total * 100)} for m, v in top3]

    messages = {
        "sessiz": "yavaş ve içe dönük bir atmosfer",
        "kalp": "küçük ama derin hikayeler",
        "battaniye": "sıcak ve rahat bir ortam",
        "zihin": "düşündüren ve merak uyandıran filmler",
        "deep-chills": "ürpertici ve atmosferik bir gerilim",
        "gece": "karanlık ve gizemli bir gece",
        "kahkaha": "eğlenceli ve hafif bir mola",
        "gozyasi": "duygusal ve arındırıcı bir deneyim",
        "adrenalin": "yüksek tempolu ve heyecanlı bir atmosfer",
        "askbahcesi": "romantik ve sıcak bir hikaye",
        "yolculuk": "keşif dolu bir yolculuk",
        "zamanyolcusu": "vintage ve nostaljik bir his",
        "karmakar": "sıradışı ve deneysel bir deneyim",
        "sipsak": "kısa ve kompakt başyapıtlar — zamanın az, sinema aşkının sonsuz olduğu anlar için",
    }

    if not matched_real:
        # Gerçek eşleşme yok → çelişkili iddia ETME (eski hata: kış istendi
        # ama "sıcak rahat ortam" deniyordu). Taahhütsüz, dürüst mesaj.
        message = "Tam olarak çözemedim ama ruh haline yakın birkaç film seçtim. Daha net yazarsan daha iyi öneririm."
    else:
        top_mood = top3[0][0] if top3 else "battaniye"
        msg = messages.get(top_mood, "film")
        message = f"Sana en çok {msg} aradığını söyleyebilirim. Bu gece için birkaç önerim var."

    # Year filter: "yeni" tespit edilirse son yıl filmlerine yönlendir
    filters = {}
    if "yeni" in text_lower:
        filters["year_gte"] = 2025

    return {"message": message, "mood_mix": mood_mix, "filters": filters}


REASON_MAP = {
    "sessiz": "Sakin ritmi ama duygusal derinliği bu geceye iyi uyuyor.",
    "kalp": "Küçük bir hikaye ama içinde büyük bir dünya barındırıyor.",
    "battaniye": "Sıcak ve rahatlatıcı tonu, yormadan içine çekiyor.",
    "zihin": "Düşündüren yapısı ve merak uyandıran kurgusuyla bu akşama yakışıyor.",
    "deep-chills": "Yavaş yanan gerilimi ve atmosferik anlatımıyla seçildi.",
    "gece": "Karanlık ve gizemli atmosferi bu geceki ruh haline çok uygun.",
    "kahkaha": "Hafif ve eğlenceli yapısıyla kafanı dağıtmak için birebir.",
    "gozyasi": "Duygusal derinliği ve samimi anlatımıyla içine işleyecek.",
    "adrenalin": "Yüksek enerjisi ve tempolu yapısıyla seni koltuğa çivileyecek.",
    "askbahcesi": "Romantik ve sıcak atmosferiyle kalbinde kelebekler uçuşturacak.",
    "yolculuk": "Keşif hissi ve geniş ufkuyla seni bambaşka diyarlara götürecek.",
    "zamanyolcusu": "Nostaljik dokusu ve zamansız atmosferiyle geçmişe bir yolculuk vaat ediyor.",
    "karmakar": "Sıradışı yapısı ve deneysel anlatımıyla alışılmışın dışına çıkarıyor.",
    "sipsak": "Kısa sürede büyük iz bırakan, kompakt sinematik vuruşlar — perde hemen açılıyor.",
    "kadraj-estetigi": "Her kare bir tablo gibi; görsel şölen ve sinematografi başyapıtı.",
    "geceyarisi-itirafi": "Gece yarısı derin sohbetlerin ve samimi diyalogların filmi.",
}


from pydantic import BaseModel

class ConfusedRequest(BaseModel):
    text: str = ""
    limit: int = 6
    min_vote: float = 5.0
    min_mood_score: float = 0.0
    exclude_ids: list = []
    forced_mood_override: str = ""  # Session-based anti-repetition
    refine: str = ""  # "" | more_popular | newer | different | less_known (4 buton)

class QuickMoodMixRequest(BaseModel):
    mood_mix: list  # [{"mood_id": "battaniye", "percentage": 50}, ...]
    limit: int = 6
    min_vote: float = 5.0
    exclude_ids: list = []

class RandomRecommendRequest(BaseModel):
    mood_id: str = None
    mood_mix: list = None
    limit: int = 3
    min_vote: float = 5.0


class MoodQuizRequest(BaseModel):
    targets: list  # ["battaniye", "sessiz", ...]
    limit: int = 6
    min_vote: float = 5.0
    exclude_ids: list = []


SURPRISE_USTAD_LINES = [
    "Üstad bu kez seçimi sana bırakmadı; arşivin karanlık raflarından bunu çekti.",
    "Bazen en iyi film, aramadığın anda karşına çıkandır.",
    "Kader diye bir şey varsa, bu gece o senin için bu filmi seçti.",
    "Arşivin derinliklerinde bekleyen bir elmas — bugün sıra sende.",
    "Seçim yapmak yorucu; bu gece Üstad karar verdi.",
    "Bazı filmler seni bulmak için bekler. Bu onlardan biri.",
    "Titizlikle seçilmedi, rastgele uçtu geldi — ama belki tam da bu yüzden doğru.",
    "Kontrol etmeyi bırak; bu gece sinemayı sürpriz yönlendirir.",
    "Üstad'ın rafa kaldırdığı, tam bugün için sakladığı bir film bu.",
    "Algoritma değil, sezgi konuşuyor bu gece.",
    "Bazen en cesur izleyici, ne izleyeceğini bilmeyen izleyicidir.",
    "Film seni seçti. Sadece ekrana bak.",
    "Arşivin şansa bırakıldığı gecelerde en güzel filmler çıkar.",
    "Bu gece planlamak yok; sadece izlemek var.",
    "Üstad bu filmi sana özel değil, tam sana özel seçti.",
]


@app.get("/api/recommend/surprise", dependencies=[Depends(rate_limit_ai)])
async def get_surprise_movie(exclude_ids: str = Query("")):
    """
    Tüm 60bin+ film havuzundan rastgele bir film döndürür.
    Poster ve minimum puan filtresi uygular. Rastgele Üstad satırı eklenir.
    """
    import random as rnd
    excluded = set()
    if exclude_ids:
        try:
            excluded = {int(x.strip()) for x in exclude_ids.split(",") if x.strip()}
        except ValueError:
            pass

    try:
        movie = None
        attempts = 0
        max_attempts = 15  # Daha fazla deneme = daha iyi film bulma şansı

        while attempts < max_attempts:
            attempts += 1
            candidate = await cache.get_random_repository_movie()
            if not candidate:
                break

            cid = candidate.get("id") or candidate.get("tmdb_id")
            # Exclude listesinde mi?
            if cid in excluded:
                continue
            # Poster zorunlu
            if not candidate.get("poster_url"):
                continue
            # Niş/obskür Asya filmlerini sürprizde gösterme
            if is_low_quality_asian(candidate):
                continue
            # Minimum puan filtresi (çöp filmlerden kaçın)
            vote = candidate.get("vote_average", 0)
            if vote and vote >= 5.5:
                movie = candidate
                break
            # Puanı düşük ama başka seçenek yoksa sakla
            if movie is None:
                movie = candidate

        if not movie:
            return {"movie": None, "message": "Film havuzu henüz dolmamış. Lütfen birazdan tekrar dene.", "source": "empty"}

        ustad_line = rnd.choice(SURPRISE_USTAD_LINES)
        return {
            "movie": movie,
            "message": "Bu sefer işi biraz şansa bıraktık. 60 binden fazla filmlik arşivden rastgele gelen sürpriz film bu.",
            "ustad_line": ustad_line,
            "source": "repository_random",
        }
    except Exception as e:
        logger.error(f"Surprise error: {e}")
        return {"movie": None, "message": "Sürpriz film alınırken bir hata oluştu.", "source": "error"}


# ═══════════════════════════════════════════════════════════════════════════
# GÜNÜN FİLMİ — "Üstad'ın Bugünkü Filmi" (retention + dağıtım içeriği)
# Tarihe göre deterministik: gün boyu aynı film döner, gece yarısı yenilenir.
# ═══════════════════════════════════════════════════════════════════════════
_daily_film_cache: dict = {}  # { "YYYY-MM-DD_uid": {film payload} }


def _extract_top_moods(profile_data: dict, top_n: int = 3) -> list:
    if not profile_data:
        return []
    pd = profile_data.get("profile_data") or profile_data
    mood_dist = pd.get("mood_distribution") or pd.get("moods") or {}
    if isinstance(mood_dist, list):
        return [m.get("mood_id") or m.get("id") for m in mood_dist[:top_n] if m]
    return sorted(mood_dist, key=lambda k: mood_dist[k], reverse=True)[:top_n]


async def _compute_daily_film(date_key: str, user_id: int = None) -> Optional[dict]:
    """O güne özel bir film seç. Giriş yapmış kullanıcıya mood profiline göre kişisel seçim."""
    import random as rnd
    seed = int(date_key.replace("-", ""))
    rng = rnd.Random(seed + (user_id or 0))

    candidate_pool = []
    personalized = False

    if user_id:
        try:
            profile = await cache.get_taste_profile(user_id)
            top_moods = _extract_top_moods(profile, top_n=3)
            if top_moods:
                wl = await cache.get_watchlist(user_id=user_id)
                watched_ids = {m["tmdb_id"] for m in wl if m.get("watched")}
                for mood_id in top_moods:
                    result = await cache.get_repository_movies_by_mood(mood_id, page=1, per_page=30, min_vote=6.0)
                    films = result.get("movies") or []
                    candidate_pool.extend(
                        f for f in films
                        if f.get("poster_url") and f.get("id") not in watched_ids
                    )
                if candidate_pool:
                    personalized = True
        except Exception:
            pass

    if not candidate_pool:
        for _ in range(25):
            candidate = await cache.get_random_repository_movie()
            if not candidate or not candidate.get("poster_url"):
                continue
            if is_low_quality_asian(candidate):
                continue
            candidate_pool.append(candidate)
            vote = candidate.get("vote_average", 0) or 0
            if vote >= 7.0:
                break

    if not candidate_pool:
        return None

    best = rng.choice(candidate_pool)
    ustad_line = rng.choice(SURPRISE_USTAD_LINES)
    return {
        "date": date_key,
        "movie": best,
        "ustad_line": ustad_line,
        "title": "Üstad'ın Bugünkü Filmi",
        "personalized": personalized,
    }


async def _get_daily_film(user_id: int = None) -> Optional[dict]:
    date_key = datetime.utcnow().strftime("%Y-%m-%d")
    cache_key = f"{date_key}_{user_id or 'anon'}"
    if cache_key in _daily_film_cache:
        return _daily_film_cache[cache_key]
    payload = await _compute_daily_film(date_key, user_id=user_id)
    if payload:
        today_prefix = f"{date_key}_"
        stale = [k for k in _daily_film_cache if not k.startswith(today_prefix)]
        for k in stale:
            del _daily_film_cache[k]
        _daily_film_cache[cache_key] = payload
    return payload


@app.get("/api/daily/film")
async def daily_film(request: Request):
    """Günün filmi — giriş yapana kişisel, anonime genel. Gün boyu sabit."""
    uid = optional_user_id(request)
    payload = await _get_daily_film(user_id=uid)
    if not payload:
        return {"movie": None, "message": "Bugünün filmi henüz hazır değil."}
    return payload


@app.post("/api/admin/daily-push", dependencies=[Depends(verify_admin)])
async def trigger_daily_push(simulate: str = Query(None, description="Ödül testi için MM-DD")):
    """Günün filmini + (varsa) bugün töreni olan ödülü tüm abonelere push'lar (harici cron)."""
    from backend.services.push_service import send_push_broadcast, PUSH_ENABLED
    if not PUSH_ENABLED:
        return {"ok": False, "enabled": False, "sent": 0}

    film_sent = 0
    movie_id = None
    payload = await _get_daily_film()
    if payload and payload.get("movie"):
        m = payload["movie"]
        movie_id = m.get("id") or m.get("tmdb_id")
        film_sent = await send_push_broadcast(
            "Sinemood",
            f"Üstad'ın bugünkü filmi hazır: {m.get('title') or 'Bugünün Filmi'} 🎬",
            url="/gunun-filmi", tag="daily-film",
        )

    # ── Ödül günü: bugün töreni olan ödülleri duyur ──
    award_sent = 0
    awarded = []
    for aw in _awards_matching(simulate=simulate, window_days=0):  # yalnız "today"
        award_sent += await send_push_broadcast(
            "Sinemood",
            f"{aw['ceremony']} ödüllü filmleri seni bekliyor 🏆",
            url=f"/listeler/{aw['slug']}", tag=f"award-{aw['slug']}",
        )
        awarded.append(aw["slug"])

    return {"ok": True, "enabled": True, "film_sent": film_sent,
            "award_sent": award_sent, "awards": awarded, "movie_id": movie_id}


@app.get("/api/admin/push-debug/{user_id}", dependencies=[Depends(verify_admin)])
async def push_debug(user_id: int):
    """Bir kullanıcının push subscription'larını listeler + test push gönderir.
    Teşhis: subscription var mı? Gidiyor mu? is_pwa değeri ne?"""
    subs = await cache.get_push_subscriptions(user_id)
    result = {"user_id": user_id, "subscription_count": len(subs), "subscriptions": []}
    for s in subs:
        entry = {
            "endpoint_tail": s["endpoint"][-40:],  # güvenlik: tamamını gösterme
            "is_pwa": s.get("is_pwa", "N/A"),
        }
        if PUSH_ENABLED:
            from backend.services.push_service import _send_web_push
            import asyncio
            test_payload = {"title": "Sinemood Test", "body": "Push testi — bu bildirim yok sayılabilir.", "url": "/", "tag": "push-debug"}
            res = await asyncio.to_thread(_send_web_push, s, test_payload)
            entry["test_result"] = res
            if res == "gone":
                await cache.delete_push_subscription(s["endpoint"])
        result["subscriptions"].append(entry)
    return result


@app.post("/api/admin/game-push", dependencies=[Depends(verify_admin)])
async def trigger_game_push():
    """Gece yarısı Mood Kâhini sıfırlanınca tüm abonelere 'yeni oyun hazır' push'lar.
    Harici cron'la 00:00'da tetiklenir (günün filmi push'undan ayrı zamanlanabilir)."""
    from backend.services.push_service import send_push_broadcast, PUSH_ENABLED
    if not PUSH_ENABLED:
        return {"ok": False, "enabled": False, "sent": 0}
    sent = await send_push_broadcast(
        "Sinemood",
        "Mood Kâhini yenilendi 🔮 Bugünün filmlerini keşfet.",
        url="/oyun", tag="mood-oracle-daily",
    )
    return {"ok": True, "enabled": True, "sent": sent}


# ═══════════════════════════════════════════════════════════════════════════
# MİNİ OYUN — "Mood Kâhini": filmin ruh halini (mood) tahmin et
# Mood sistemini öğreten, markaya özgü oyun. Skor cihazda (localStorage) tutulur;
# bu uç yalnız tur üretir (yazma yok).
# ═══════════════════════════════════════════════════════════════════════════
MOOD_ORACLE_PRAISE = [
    "Hah! İşte sinemadan anlayan bir göz. Üstad gururlandı.",
    "Doğru bildin evlat — bu filmin ruhunu okudun resmen.",
    "Bravo. Demek perdenin ardındaki frekansı duyuyorsun.",
    "Tam isabet. Üstad'ın güveni sana biraz daha arttı.",
    "İşte bu! Filmin damarına bastın evlat.",
]
MOOD_ORACLE_ROAST = [
    "Yok evlat, tutmadı. Bu filmi o rafa koymak Üstad'ın içini sızlatır.",
    "Olmadı. Posteri güzel diye ruhunu yanlış okudun.",
    "Iskaladın. Üstad bu filmi başka bir frekansta dinliyor.",
    "Hayır evlat — bu filmin kalbi orada atmıyor.",
    "Pas geçtin. Bir dahakine perdeye biraz daha dikkatli bak.",
]


@app.get("/api/game/mood-oracle", dependencies=[Depends(rate_limit_general)])
async def mood_oracle_rounds(rounds: int = Query(5, ge=1, le=10)):
    """'Mood Kâhini' oyunu için tur üretir. Her tur: bir film + doğru mood + 4 seçenek."""
    import random as rnd
    all_moods = [m for m in REASON_MAP.keys() if m in MOOD_GENRE_MAP]
    rnd.shuffle(all_moods)

    result_rounds = []
    used_movie_ids = set()
    # Hedeflenen mood'lar + yetmezse kalanlarla doldur
    mood_queue = all_moods[:]
    attempts = 0
    while len(result_rounds) < rounds and mood_queue and attempts < rounds * 4:
        attempts += 1
        mood_id = mood_queue.pop(0)
        try:
            page = rnd.randint(1, 3)
            res = await cache.get_repository_movies_paginated(
                mood_id, page=page, per_page=10,
                min_vote=5.5, min_mood_score=55,
                sort_by="recommended", min_vote_count=100,
            )
            pool = [m for m in (res.get("movies") or [])
                    if m.get("poster_url") and m["id"] not in used_movie_ids]
            if not pool:
                # daha gevşek dene
                res2 = await cache.get_repository_movies_paginated(
                    mood_id, page=1, per_page=10, min_vote=5.0,
                    min_mood_score=40, sort_by="recommended", min_vote_count=50,
                )
                pool = [m for m in (res2.get("movies") or [])
                        if m.get("poster_url") and m["id"] not in used_movie_ids]
            if not pool:
                continue
            film = rnd.choice(pool)
            used_movie_ids.add(film["id"])

            distractors = [m for m in all_moods if m != mood_id]
            rnd.shuffle(distractors)
            options = [mood_id] + distractors[:3]
            rnd.shuffle(options)

            result_rounds.append({
                "film": {
                    "id": film["id"],
                    "title": film.get("title"),
                    "year": (film.get("release_date") or "")[:4],
                    "poster_url": film.get("poster_url"),
                    "overview": (film.get("overview") or "")[:240],
                },
                "correct_mood": mood_id,
                "options": options,
                "reason": REASON_MAP.get(mood_id, ""),
                "ustad_correct": rnd.choice(MOOD_ORACLE_PRAISE),
                "ustad_wrong": rnd.choice(MOOD_ORACLE_ROAST),
            })
        except Exception as e:
            logger.warning(f"[MoodOracle] {mood_id} tur üretilemedi: {e}")
            continue

    return {"rounds": result_rounds, "count": len(result_rounds)}


@app.post("/api/recommend/random", dependencies=[Depends(rate_limit_general)])
async def post_random_recommendation(req: RandomRecommendRequest):
    """Surpriz / random film onerisi. Mood bazli veya genel."""
    import random as rnd
    limit = max(1, min(req.limit, 12))
    min_vote = max(4.0, min(req.min_vote, 10.0))
    all_candidates = []

    try:
        if req.mood_mix and len(req.mood_mix) > 0:
            # Mood mix bazli
            for item in req.mood_mix:
                mid = item.get("mood_id")
                pct = item.get("percentage", 50)
                if not mid:
                    continue
                count = max(1, round(limit * pct / 100))
                movies = await cache.get_all_repository_movies_by_mood(mid, min_vote=min_vote)
                if movies:
                    sample = rnd.sample(movies, min(count, len(movies)))
                    for m in sample:
                        m["matched_mood"] = mid
                    all_candidates.extend(sample)
        elif req.mood_id:
            movies = await cache.get_all_repository_movies_by_mood(req.mood_id, min_vote=min_vote)
            all_candidates = rnd.sample(movies, min(limit, len(movies))) if movies else []
        else:
            # Genel random: tum moodlardan dengeli
            all_mood_ids = [
                "battaniye","yolculuk","gece","kahkaha","gozyasi","adrenalin",
                "askbahcesi","zamanyolcusu","sessiz","zihin","kalp","karmakar",
                "sipsak","deep-chills"
            ]
            rnd.shuffle(all_mood_ids)
            per_mood = max(1, limit // 3)
            for mid in all_mood_ids[:5]:
                movies = await cache.get_all_repository_movies_by_mood(mid, min_vote=min_vote)
                if movies:
                    sample = rnd.sample(movies, min(per_mood, len(movies)))
                    for m in sample:
                        m["matched_mood"] = mid
                    all_candidates.extend(sample)
                    if len(all_candidates) >= limit:
                        break

    except Exception as e:
        logger.error(f"Random recommendation error: {e}")

    if not all_candidates:
        return {"message": "Bu gece için sürpriz film bulamadım, birazdan tekrar dene.", "mode": "random", "movies": []}

    rnd.shuffle(all_candidates)
    all_candidates = all_candidates[:limit]

    # Remove duplicate ids
    seen = set()
    unique = []
    for m in all_candidates:
        if m["id"] not in seen:
            seen.add(m["id"])
            unique.append(m)

    # Add reason
    for m in unique:
        matched = m.get("matched_mood")
        m["reason"] = REASON_MAP.get(matched, "Bu geceki ruh haline sürpriz bir seçim.")

    return {
        "message": "Bu gece için sana 3 sürpriz film seçtim.",
        "mode": "random",
        "movies": unique[:limit],
    }


@app.post("/api/recommend/quick-mix", dependencies=[Depends(rate_limit_general)])
async def post_quick_mood_mix(req: QuickMoodMixRequest):
    """
    Hızlı mood karışımı — <50ms hedef.
    Pre-computed mood_score kullanır (DB'de idx_repo_mood_score index'li).
    Embedding/model/API çağrısı YOK — sadece SQL + weighted random.
    """
    import random as rnd

    limit = max(3, min(req.limit, 12))
    min_vote = max(4.0, min(req.min_vote, 10.0))
    exclude_ids = set(int(x) for x in req.exclude_ids if str(x).isdigit()) if req.exclude_ids else set()

    mood_mix = req.mood_mix
    if not mood_mix or len(mood_mix) == 0:
        raise HTTPException(400, "mood_mix gerekli")

    candidates = []
    seen_ids = set(exclude_ids)
    CANDIDATE_TARGET = 30

    for mix_item in mood_mix:
        mood_id = mix_item.get("mood_id")
        pct = mix_item.get("percentage", 50)
        if not mood_id:
            continue
        count = max(4, round(CANDIDATE_TARGET * pct / 100))
        try:
            result = await cache.get_top_scored_movies_by_mood(mood_id, min_vote=min_vote, limit=count)
            # Fallback: if mood_score all zero (seed not yet enriched), use vote-based
            if result and all(m.get("mood_score", 0) == 0 for m in result):
                result = await cache.get_top_repository_movies_by_mood(mood_id, min_vote=min_vote, limit=count)
                for m in result:
                    m["mood_score"] = round(m.get("vote_average", 0) * 10, 1)
                    m["matched_mood"] = mood_id
                    m["reason"] = REASON_MAP.get(mood_id, "Ruh haline uygun bir seçim.")
            else:
                for m in result:
                    m["matched_mood"] = mood_id
                    m["reason"] = REASON_MAP.get(mood_id, "Ruh haline uygun bir seçim.")
            for m in result:
                mid = m.get("id") or m.get("tmdb_id")
                if mid not in seen_ids:
                    seen_ids.add(mid)
                    candidates.append(m)
        except Exception:
            continue

    candidates.sort(key=lambda x: (-x.get("mood_score", 0), -x.get("vote_average", 0)))

    top_pool = candidates[:max(limit * 4, 24)]
    if len(top_pool) > limit:
        weights = [max(1, len(top_pool) - i) for i in range(len(top_pool))]
        selected = []
        pool = list(top_pool)
        w = list(weights)
        for _ in range(min(limit, len(pool))):
            picks = rnd.choices(range(len(pool)), weights=w, k=1)
            idx = picks[0]
            selected.append(pool.pop(idx))
            w.pop(idx)
        final = selected
    else:
        final = top_pool[:limit]

    mood_mix_titled = []
    for mix_item in mood_mix:
        mid = mix_item.get("mood_id")
        mood_mix_titled.append({
            "mood_id": mid,
            "title": MOOD_NAMES.get(mid, mid),
            "percentage": mix_item.get("percentage", 50),
        })

    primary_mood = mood_mix[0]["mood_id"] if mood_mix else "battaniye"
    messages = {
        "sessiz": "Bu gece sessiz bir hikaye seni bekliyor.",
        "kalp": "Kalbin sana söyleyecek bir şeyler var bu gece.",
        "battaniye": "Rahatla, bu gece seni saran filmler seçtim.",
        "zihin": "Düşünmeye hazır mısın? Bu filmler zihnini açacak.",
        "deep-chills": "Ürpertici bir atmosfere hazırlan.",
        "gece": "Karanlık bir gece, karanlık bir hikaye.",
        "kahkaha": "Bu gece gülmek serbest.",
        "gozyasi": "Derin duygulara hazır mısın?",
        "adrenalin": "Koltuktan kalkamayacaksın.",
        "askbahcesi": "Romantik bir akşam için biçilmiş kaftan.",
        "yolculuk": "Yeni ufuklara doğru yola çıkıyoruz.",
        "zamanyolcusu": "Nostaljinin büyüsüne kapılmaya hazır mısın?",
        "karmakar": "Alışılmışın dışında bir gece seni bekliyor.",
        "sipsak": "Zamanın az, sinema aşkının sonsuz. Kısa ve vurucu başyapıtlar seçtim.",
    }
    ustad_line = messages.get(primary_mood, "Bu gece için özel bir seçim hazırladım.")

    for m in final:
        if not m.get("poster_url") and m.get("poster_path"):
            m["poster_url"] = f"https://image.tmdb.org/t/p/w500{m['poster_path']}"

    return {
        "message": ustad_line,
        "ustad_line": ustad_line,
        "mood_mix": mood_mix_titled,
        "movies": final,
        "mode": "quick_mix",
        "query_understanding": None,
    }


@app.post("/api/recommend/fast", dependencies=[Depends(rate_limit_ai)])
async def post_fast_recommendation(request: Request):
    """
    Ultra-fast semantic film önerisi — <50ms hedef (lokal model).

    Öncelik sırası:
      1. LOCAL semantic_engine (sentence-transformers, 0 API key) — ~30ms
      2. Gemini fast_search_engine (API key gerekli) — ~200ms
      3. Rule-based fallback — anında

    Lokal model hem TR hem EN destekler, threshold>=0.38 ile gated.
    """
    import time as _time
    t0 = _time.monotonic()

    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Geçersiz istek gövdesi")

    text = (body.get("text") or "").strip()
    limit = max(3, min(int(body.get("limit", 6)), 12))
    min_vote = max(4.0, min(float(body.get("min_vote", 5.5)), 10.0))
    exclude_ids = [int(x) for x in body.get("exclude_ids", []) if str(x).isdigit()]

    if not text:
        raise HTTPException(status_code=400, detail="text alanı boş olamaz")

    result = await search_engine.search(
        query_text=text,
        limit=limit,
        min_vote=min_vote,
        exclude_ids=set(exclude_ids),
    )

    elapsed_ms = round((_time.monotonic() - t0) * 1000, 1)
    logger.info(
        "[FastRec] '%s' → %d film, %dms (%s%s)",
        text[:40], len(result["movies"]), elapsed_ms, result["source"],
        " fallback" if result["is_fallback"] else "",
    )

    movies = _sort_east_asian_to_end(result["movies"])

    return {
        "ok": True,
        "source": result["source"],
        "elapsed_ms": elapsed_ms,
        "is_fallback": result["is_fallback"],
        "ustad_notu": result["ustad_notu"],
        "semantic_ready": semantic_engine.is_ready,
        "fast_search_ready": fast_search_engine.is_ready,
        "movies": movies,
    }


def _confused_ustad_line(intent_type: str, mood_analysis: dict) -> str:
    """Intent tipine göre Üstad'ın sesini değiştirir."""
    lines = {
        "actor_recommendation": "Bir oyuncunun filmlerini merak ediyorsun, hemen bakalım.",
        "director_recommendation": "Bir yönetmenin izini sürüyorsun, arşivi tarıyorum.",
        "similar_to_movie": "Bir filme benzer yapımlar arıyorsun, en iyilerini seçtim.",
        "exact_movie_search": "Tam olarak aradığın filmi bulmaya çalıştım.",
        "mood_recommendation": "Kafan karışık gibi... Hadi bir bakalım arşive.",
        "genre_recommendation": "Tür bazlı arama yapıyorsun, en uygunlarını seçtim.",
        "mixed_request": "Birden fazla türü harmanlıyorsun, sana en uygun seçkileri hazırladım.",
    }
    if intent_type in ("feedback",):
        return "Geri bildirimin için teşekkürler, hemen ayarlıyorum."
    return lines.get(intent_type, "İşte sana seçtiklerim.")


# ── TMDB'den kişi adına göre film getiren üst-seviye helper ──────────────────
async def _resolve_reference_movie(reference_title: str, raw_text: str = ""):
    """Referans filmi ÖNCE yerel korpustan (tüm ~22K sistem filmi, Türkçe-duyarlı
    folded indeks) çöz; bulunamazsa TR-alias kanonik adıyla + TMDB başlık-aramasıyla
    dene. Dönüş: (src_id|None, src_title, src_genres:set)."""
    from backend.services.chat_engine import TURKISH_TITLE_ALIASES, _normalize
    ref = (reference_title or raw_text or "").strip()
    if not ref:
        return None, ref, set()
    # 1) Yerel folded indeks — sistemdeki TÜM filmler (92-alias limiti yok)
    try:
        hit = await cache.resolve_title(ref)
        if hit and hit.get("tmdb_id"):
            return hit["tmdb_id"], hit.get("title", ref), set(hit.get("genre_ids") or [])
    except Exception:
        pass
    # 2) TR-alias kanonik İngilizce ad (yerel indekste İngilizce başlık yoksa)
    alias = TURKISH_TITLE_ALIASES.get(_normalize(ref))
    # 3) TMDB başlık araması — belgesel olmayan, en popüler sonucu seç
    for q in (ref, alias):
        if not q:
            continue
        try:
            hits = await tmdb_service.search_movies(q, page=1)
            if hits:
                best = max((m for m in hits if 99 not in (m.get("genre_ids") or [])),
                           key=lambda m: (m.get("vote_count") or 0), default=hits[0])
                return best["id"], best.get("title", ref), set(best.get("genre_ids") or [])
        except Exception:
            continue
    return None, ref, set()


async def _build_similar_pool(src_id: int, src_title: str, src_genres: set,
                              limit: int, exclude_set: set) -> list:
    """src_id (tmdb) için recommendations + similar havuzu; belgesel/düşük-kalite
    elenir, genre-overlap + kalite skoruyla sıralanır. (/similar endpoint mantığı.)"""
    try:
        rec, sim = await asyncio.gather(
            tmdb_service.get_recommendations(src_id, page=1),
            tmdb_service.get_similar_movies(src_id, page=1),
        )
    except Exception:
        return []
    pool = {}
    for m in rec.get("movies", []):
        pool[m["id"]] = m
    for m in sim.get("movies", []):
        pool.setdefault(m["id"], m)
    pool.pop(src_id, None)
    candidates = []
    for m in pool.values():
        mid = m.get("id")
        if not mid or mid in exclude_set or not m.get("poster_url"):
            continue
        if 99 in (m.get("genre_ids") or []):
            continue
        if int(m.get("vote_count") or 0) < 60 or float(m.get("vote_average") or 0) < 5.8:
            continue
        candidates.append(m)

    def relevance(m):
        gids = set(m.get("genre_ids") or [])
        overlap = len(gids & src_genres) if src_genres else 0
        return (overlap * 3.0 + min((m.get("vote_average") or 0), 9.0) * 0.5
                + min((m.get("vote_count") or 0) / 1000.0, 5.0) * 0.3)

    candidates.sort(key=relevance, reverse=True)
    out = []
    for m in candidates[:limit]:
        m["mood_score"] = 85.0
        m["reason"] = f"'{src_title}' sevenler bunu da sevdi."
        exclude_set.add(m["id"])
        out.append(m)
    return out


async def _build_blend_pool(src1: int, src2: int, g1: set, g2: set,
                            t1: str, t2: str, limit: int, exclude_set: set) -> list:
    """İki referans filmin benzer havuzlarını harmanlar. ÖNCE iki havuzun
    kesişimi (her ikisine de benzeyenler), sonra birleşimi sıralanır."""
    try:
        p1, p2 = await asyncio.gather(
            _build_similar_pool(src1, t1, g1, limit * 4, set(exclude_set)),
            _build_similar_pool(src2, t2, g2, limit * 4, set(exclude_set)),
        )
    except Exception:
        return []
    ids1 = {m.get("id"): m for m in p1}
    ids2 = {m.get("id"): m for m in p2}
    blend_genres = (g1 or set()) | (g2 or set())
    inter, union = [], []
    seen = set()
    # Kesişim: her iki havuzda da olan filmler (en güçlü blend sinyali)
    for mid, m in ids1.items():
        if mid in ids2 and mid not in exclude_set:
            m["mood_score"] = 90.0
            m["reason"] = f"'{t1}' ile '{t2}' ortası."
            inter.append(m); seen.add(mid)
    # Birleşim: kalanlar, tür-örtüşmesine göre sıralı
    def _ov(m):
        return len(set(m.get("genre_ids") or []) & blend_genres)
    rest = [m for mid, m in {**ids1, **ids2}.items()
            if mid not in seen and mid not in exclude_set]
    rest.sort(key=lambda m: (_ov(m), float(m.get("vote_average") or 0)), reverse=True)
    for m in rest:
        m["mood_score"] = 84.0
        m["reason"] = f"'{t1}' ile '{t2}' karışımı."
    out = inter + rest
    for m in out[:limit]:
        exclude_set.add(m.get("id"))
    return out[:limit]


async def _search_two_cast_movies(
    name1: str, name2: str, count: int, min_vote: float, exclude_set: set,
    genre_ids: list = None, era_constraint: dict = None,
) -> tuple:
    """İki oyuncunun AYNI filmde birlikte olduğu yapımlar (TMDB discover with_cast=AND).
    Döner: (movies, resolved_name1, resolved_name2)."""
    try:
        p1, p2 = await asyncio.gather(
            tmdb_service.search_person(name1),
            tmdb_service.search_person(name2),
        )
    except Exception:
        return [], name1, name2
    if not p1 or not p2:
        return [], name1, name2
    id1, id2 = p1[0]["id"], p2[0]["id"]
    rn1, rn2 = p1[0].get("name", name1), p2[0].get("name", name2)
    kwargs = {"sort_by": "vote_average.desc", "min_vote_count": 40,
              "min_vote_average": max(min_vote, 5.5),
              "with_cast": f"{id1},{id2}"}  # virgül = AND
    if era_constraint:
        if era_constraint.get("min_year"):
            kwargs["primary_release_date_gte"] = f"{era_constraint['min_year']}-01-01"
        if era_constraint.get("max_year"):
            kwargs["primary_release_date_lte"] = f"{era_constraint['max_year']}-12-31"
    try:
        res = await tmdb_service.discover_movies(list(genre_ids or []), **kwargs)
    except Exception:
        return [], rn1, rn2
    out = []
    for m in res.get("movies", []):
        mid = m.get("id")
        if not mid or mid in exclude_set or not m.get("poster_url"):
            continue
        m["mood_score"] = 88.0
        m["reason"] = f"{rn1} ve {rn2} birlikte."
        out.append(m)
        exclude_set.add(mid)
    return out[:count], rn1, rn2


async def _search_person_movies_top(
    person_name: str, person_type: str, count: int,
    min_vote: float, exclude_set: set,
    era_constraint: dict = None, genre_ids: list = None, time_constraint: dict = None,
) -> list:
    try:
        persons = await tmdb_service.search_person(person_name)
        if not persons:
            return []
        person_id = persons[0]["id"]
        if person_type == "director":
            raw = await tmdb_service.get_director_filmography(person_id, limit=count * 3, min_vote_count=50)
        else:
            raw = await tmdb_service.get_person_movie_credits(person_id)
        if not raw:
            return []
        # Era filtreleme
        era_min = era_constraint.get("min_year") if era_constraint else None
        era_max = era_constraint.get("max_year") if era_constraint else None
        # Runtime filtreleme
        runtime_max = time_constraint.get("max_minutes") if time_constraint else None
        # Genre seti
        genre_set = set(genre_ids or [])
        result = []
        for m in raw:
            mid = m.get("id")
            if not mid or mid in exclude_set:
                continue
            if not m.get("poster_url"):
                continue
            if float(m.get("vote_average", 0) or 0) < min_vote:
                continue
            # Era filtresi
            rd = (m.get("release_date") or "")[:4]
            if rd and rd.isdigit():
                y = int(rd)
                if era_min and y < era_min:
                    continue
                if era_max and y > era_max:
                    continue
            # Genre filtresi
            if genre_set and not (set(m.get("genre_ids", [])) & genre_set):
                continue
            # Runtime filtresi
            if runtime_max and (m.get("runtime") or 0) > runtime_max:
                continue
            m["mood_score"] = 85.0
            m["matched_mood"] = "battaniye"
            m["reason"] = f"'{persons[0]['name']}' kariyerinden bir seçki."
            result.append(m)
            exclude_set.add(mid)
            if len(result) >= count:
                break
        return result
    except Exception:
        return []


async def _confused_fallback(text: str, limit: int, min_vote: float, exclude_ids: list) -> dict:
    """
    Kural tabanlı fallback — embedding/model KULLANMAZ.
    Regex intent detection + SQL sorguları + TMDB API ile anlık sonuç döndürür.
    Hedef: her türlü girdiyi (kişi adı, film adı, ruh hali) anlamak.
    """
    import json
    from backend.services.chat_engine import ChatEngine, _rule_based_confused_analysis, GENRE_KEYWORDS, parse_chat_hints

    engine = ChatEngine(db=cache)
    intent = engine.detect_intent(text)
    mood_analysis = _rule_based_confused_analysis(text)
    year_filters = mood_analysis.get("filters", {})
    year_gte = year_filters.get("year_gte")
    hints = parse_chat_hints(text)

    # ── Intent Enhancer: 4 katmanlı semantic enhancement ────────────────
    try:
        from backend.services.intent_enhancer import (
            ContextExtractor, MoodWeightEnhancer,
            SimilarMovieEnhancer, NonsenseHandler,
        )
        ctx = ContextExtractor.extract_all(text)
        if ctx.get("era") and not mood_analysis.get("era_preference"):
            mood_analysis["era_preference"] = ctx["era"]
        if ctx.get("runtime") and not mood_analysis.get("time_constraint"):
            mood_analysis["time_constraint"] = ctx["runtime"]
        extra = MoodWeightEnhancer.score(text)
        if extra:
            hints.mood_bonuses = {**getattr(hints, 'mood_bonuses', {}), **extra}
        ref = SimilarMovieEnhancer.extract_reference(text)
        if ref and not intent.reference_title:
            intent.reference_title = ref
            if intent.type in ("mood_recommendation", "general"):
                intent.type = "similar_to_movie"
    except Exception as exc:
        logger.debug("[IntentEnhancer] skipped: %s", exc)

    logger.info("[PATH3] text=%r intent=%s hints.mood=%s hints.genre=%s",
                text, intent.type, hints.mood_bonuses, hints.genre_ids)

    exclude_set = set(exclude_ids)

    # ── Kaliteli mood filmleri çeken helper (min_vote_count + poster filtresi ile) ──
    async def _search_mood_movies(mood_ids: list, count: int, genre_filter: set = None) -> list:
        collected = []
        # Sipsak modunda bucket'taki şişirilmiş (az oy, yüksek avg) filmleri ele:
        # TMDB Discover ile aynı güvenilir eşik (150 oy) uygulanır.
        _min_vc = SIPSAK_MIN_VOTE_COUNT if getattr(hints, "sipsak_mode", False) else 50
        for mid in mood_ids:
            try:
                rows = await cache.get_top_repository_movies_by_mood(mid, min_vote=min_vote, limit=count * 3, year_gte=year_gte)
                for m in rows:
                    m_id = m.get("id") or m.get("tmdb_id")
                    if not m_id or m_id in exclude_set:
                        continue
                    if not m.get("poster_url"):
                        continue
                    if int(m.get("vote_count", 0)) < _min_vc:
                        continue
                    # Genre filtre (varsa) — tür uyumlu filmleri öncele
                    if genre_filter:
                        movie_genres = set(m.get("genre_ids") or [])
                        genre_overlap = movie_genres & genre_filter
                        if not genre_overlap:
                            continue
                        # Daha fazla genre eşleşen film → daha yüksek skor
                        genre_bonus = len(genre_overlap) * 10.0
                        m["genre_match_bonus"] = genre_bonus
                    lang = (m.get("original_language") or "").lower()
                    east_asian = lang in ("ja", "ko", "zh")
                    m["mood_score"] = 40.0 if east_asian else 80.0
                    m["matched_mood"] = mid
                    m["reason"] = REASON_MAP.get(mid, "Ruh haline uygun bir seçim.")
                    collected.append(m)
                    exclude_set.add(m_id)
            except Exception:
                continue
        collected.sort(key=lambda x: (
            -x.get("genre_match_bonus", 0),   # Daha fazla genre eşleşen → önce
            -x.get("vote_average", 0),
            -x.get("vote_count", 0),
        ))
        return collected[:count]

    # ── TMDB Discover API ile genre + era + runtime + hidden_gem filtrelemesi ──
    async def _tmdb_discover_for_hints(
        genre_ids: list,
        era_c: dict,
        runtime_lte: int,
        hidden_gem: bool,
        count: int,
        tmdb_keywords: list = None,
        lang_code: str = None,
    ) -> list:
        # genre_ids zorunlu değil — runtime/era/hidden_gem/lang tek başına yeterli
        if not genre_ids and not runtime_lte and not era_c and not hidden_gem and not lang_code:
            return []
        try:
            kwargs = {
                "sort_by": "vote_average.desc",
                "min_vote_average": min_vote,
                "min_vote_count": 150,
            }
            if lang_code:
                kwargs["with_original_language"] = lang_code
            if era_c and isinstance(era_c, dict):
                if era_c.get("min_year"):
                    kwargs["primary_release_date_gte"] = f"{era_c['min_year']}-01-01"
                if era_c.get("max_year"):
                    kwargs["primary_release_date_lte"] = f"{era_c['max_year']}-12-31"
            if runtime_lte:
                kwargs["with_runtime_lte"] = runtime_lte
            if hidden_gem:
                kwargs["max_vote_count"] = 3000  # Popüler olmayan = gizli kalmış
            if tmdb_keywords:
                kwargs["with_keywords"] = "|".join(str(k) for k in tmdb_keywords)

            result = await tmdb_service.discover_movies(genre_ids, **kwargs)
            movies = []
            for m in result.get("movies", []):
                m_id = m.get("id")
                if not m_id or m_id in exclude_set or not m.get("poster_url"):
                    continue
                if int(m.get("vote_count", 0)) < 50:
                    continue
                m["mood_score"] = 70.0   # Bucket filmlerinden (80.0) biraz düşük
                m["matched_mood"] = "tmdb_discover"
                m["genre_match_bonus"] = 5.0  # TMDB discover zaten genre-filtered
                movies.append(m)
            logger.info("[TMDB-Discover] genres=%s era=%s runtime_lte=%s → %d films",
                        genre_ids, era_c, runtime_lte, len(movies))
            return movies[:count]
        except Exception as e:
            logger.warning("[TMDB-Discover] failed: %s", e)
            return []

    # ── TMDB'den referans film + benzerlerini getiren helper (kalite filtreli) ──
    async def _search_similar_via_tmdb(ref_title: str, count: int) -> list:
        try:
            tmdb_hits = await tmdb_service.search_movies(ref_title, page=1)
            if not tmdb_hits:
                return []
            ref_id = tmdb_hits[0]["id"]
            ref_genres = set(tmdb_hits[0].get("genre_ids") or [])
            # Hem recommendations hem similar (aynı /similar endpoint mantığı)
            rec, sim = await asyncio.gather(
                tmdb_service.get_recommendations(ref_id, page=1),
                tmdb_service.get_similar_movies(ref_id, page=1),
            )
            pool = {}
            for m in rec.get("movies", []):
                pool[m["id"]] = m
            for m in sim.get("movies", []):
                pool.setdefault(m["id"], m)
            pool.pop(ref_id, None)

            candidates = []
            for m in pool.values():
                mid = m.get("id")
                if not mid or mid in exclude_set:
                    continue
                if not m.get("poster_url"):
                    continue
                vc = int(m.get("vote_count") or 0)
                va = float(m.get("vote_average") or 0)
                if vc < 60 or va < 5.8:
                    continue
                candidates.append(m)

            def relevance(m):
                gids = set(m.get("genre_ids") or [])
                overlap = len(gids & ref_genres) if ref_genres else 0
                return overlap * 3.0 + min((m.get("vote_average") or 0), 9.0) * 0.5 + min((m.get("vote_count") or 0) / 1000.0, 5.0) * 0.3

            candidates.sort(key=relevance, reverse=True)
            result = []
            for m in candidates[:count]:
                m["mood_score"] = 85.0
                m["matched_mood"] = "battaniye"
                m["reason"] = f"'{tmdb_hits[0]['title']}' sevenler bunu da sevdi."
                result.append(m)
                exclude_set.add(m["id"])
            return result
        except Exception:
            return []

    movies = []
    query_understanding = ""
    # Sadece mood_recommendation dalında atanan ama dal sonrası (era filtresi,
    # sipsak sıralaması, ustad_line) okunan değişkenler — burada init edilir ki
    # tüm intent'lerde tanımlı olsunlar (locals().get() anti-pattern'i yerine).
    era_c = None
    mood_ids = []

    if intent.type == "similar_to_movie" and intent.reference_title:
        # Türkçe başlık alias'ını çöz (örn. "dövüş kulübü" → "Fight Club")
        from backend.services.chat_engine import TURKISH_TITLE_ALIASES
        ref_title_lower = intent.reference_title.lower().strip()
        resolved_title = TURKISH_TITLE_ALIASES.get(ref_title_lower, intent.reference_title)

        repo_hits = await cache.search_repository_by_title(resolved_title, limit=5)
        query_understanding = f"'{intent.reference_title}' filmine benzer yapımlar arıyorsun."

        # Referans filmi bul (repo veya TMDB'den)
        src_id = None
        src_title = intent.reference_title
        src_genres = set()

        if repo_hits:
            # Başlık benzerliğine göre en iyi eşleşmeyi seç (fuzzy LIKE yanlış film döndürebilir)
            from difflib import SequenceMatcher
            ref_norm = resolved_title.lower()
            def _title_score(m):
                t = (m.get("title") or "").lower()
                sim = SequenceMatcher(None, ref_norm, t).ratio()
                vc = m.get("vote_count") or 0
                return (sim > 0.6, sim, vc)  # Önce benzerlik eşiği, sonra oran, sonra popülerlik
            best_repo = max(
                (m for m in repo_hits if 99 not in (m.get("genre_ids") or [])),
                key=_title_score,
                default=repo_hits[0]
            )
            # Benzerlik çok düşükse repo sonucunu güvenme, TMDB'ye düş
            best_sim = SequenceMatcher(None, ref_norm, (best_repo.get("title") or "").lower()).ratio()
            if best_sim >= 0.55:
                src_id = best_repo.get("id") or best_repo.get("tmdb_id")
                src_title = best_repo.get("title", src_title)
                src_genres = set(best_repo.get("genre_ids", []) or [])
                logger.info("[SIMILAR] Repo match: %s (id=%s, sim=%.2f)", src_title, src_id, best_sim)
            else:
                logger.info("[SIMILAR] Repo match too weak (sim=%.2f for '%s'), falling to TMDB", best_sim, best_repo.get("title"))
                repo_hits = []  # TMDB'ye düş

        if not repo_hits:
            # TMDB'de ara — belgesel olmayan + en popüler sonucu seç
            try:
                tmdb_hits = await tmdb_service.search_movies(intent.reference_title, page=1)
                if tmdb_hits:
                    best = max(
                        (m for m in tmdb_hits if 99 not in (m.get("genre_ids") or [])),
                        key=lambda m: (m.get("vote_count") or 0),
                        default=tmdb_hits[0]
                    )
                    src_id = best["id"]
                    src_title = best.get("title", src_title)
                    src_genres = set(best.get("genre_ids", []) or [])
            except Exception:
                pass

        if src_id:
            # /similar endpoint ile aynı kalite mantığı:
            # hem recommendations hem similar + genre overlap + vote_count filtresi
            try:
                rec, sim = await asyncio.gather(
                    tmdb_service.get_recommendations(src_id, page=1),
                    tmdb_service.get_similar_movies(src_id, page=1),
                )
                pool = {}
                for m in rec.get("movies", []):
                    pool[m["id"]] = m
                for m in sim.get("movies", []):
                    pool.setdefault(m["id"], m)

                # Kaynak filmi havuzdan ayıkla
                pool.pop(src_id, None)

                candidates = []
                for m in pool.values():
                    m_id = m.get("id")
                    if not m_id or m_id in exclude_set:
                        continue
                    if not m.get("poster_url"):
                        continue
                    # Belgeselleri öneri havuzundan çıkar
                    if 99 in (m.get("genre_ids") or []):
                        continue
                    vc = int(m.get("vote_count") or 0)
                    va = float(m.get("vote_average") or 0)
                    if vc < 60 or va < 5.8:
                        continue
                    candidates.append(m)

                # Genre overlap + kalite skoruyla sırala (aynı relevance fonksiyonu)
                def relevance(m):
                    gids = set(m.get("genre_ids") or [])
                    overlap = len(gids & src_genres) if src_genres else 0
                    return overlap * 3.0 + min((m.get("vote_average") or 0), 9.0) * 0.5 + min((m.get("vote_count") or 0) / 1000.0, 5.0) * 0.3

                candidates.sort(key=relevance, reverse=True)
                for m in candidates[:limit]:
                    m["mood_score"] = 85.0
                    m["reason"] = f"'{src_title}' sevenler bunu da sevdi."
                    exclude_set.add(m["id"])
                    movies.append(m)
            except Exception:
                pass

        # Hala yoksa → search_engine ile başlık bazlı arama
        if not movies:
            movies = await _search_similar_via_tmdb(intent.reference_title, limit)
        # Hala yoksa → search_engine ile başlık bazlı arama
        if not movies:
            search_result = await search_engine.search(
                intent.reference_title, limit=limit, min_vote=min_vote, exclude_ids=exclude_set
            )
            movies = search_result.get("movies", [])
            if movies:
                query_understanding = f"'{intent.reference_title}' ile ilgili yapımlar."
        # Son çare: mood (kullanıcı intent'inden veya default)
        if not movies:
            fallback_moods = ["zihin", "gece", "sessiz"]
            if mood_analysis and mood_analysis.get("mood_mix"):
                fallback_moods = [m["mood_id"] for m in mood_analysis["mood_mix"][:3] if m.get("mood_id")]
                if not fallback_moods:
                    fallback_moods = ["zihin", "gece", "sessiz"]
            movies = await _search_mood_movies(fallback_moods, limit)

    elif intent.type in ("genre_recommendation", "mixed_request") and intent.genres:
        matched_genres = [k for k, v in GENRE_KEYWORDS.items() if any(g in intent.genres for g in v)]
        query_understanding = f"{' '.join(matched_genres)} türünde filmler arıyorsun."
        genre_set = set(str(g) for g in intent.genres)
        try:
            async with _db_conn(cache.db_path) as db:
                cursor = await db.execute(
                    """SELECT tmdb_id, title, poster_url, overview, release_date,
                              vote_average, genre_ids, backdrop_url, vote_count, original_language, popularity, mood_id
                       FROM movie_repository
                       WHERE poster_url IS NOT NULL AND vote_count >= 2
                       ORDER BY vote_average DESC LIMIT 200"""
                )
                for r in await cursor.fetchall():
                    m_id = r[0]
                    if m_id in exclude_set:
                        continue
                    gids = set(str(g) for g in (json.loads(r[6]) if r[6] else []))
                    if gids & genre_set:
                        m = cache._row_to_movie(r)
                        m["mood_score"] = 80.0
                        m["reason"] = "Aradığın türe uygun bir seçim."
                        movies.append(m)
                        exclude_set.add(m_id)
                        if len(movies) >= limit * 2:
                            break
        except Exception:
            pass
        if not movies:
            movies = await _search_mood_movies(["battaniye", "kahkaha", "adrenalin"], limit)

    elif intent.type == "exact_movie_search" and intent.reference_title:
        query_understanding = f"'{intent.reference_title}' filmini arıyorsun."
        repo_hits = await cache.search_repository_by_title(intent.reference_title, limit=3)
        if repo_hits:
            movies.extend(repo_hits[:limit])
        # Repo'da yoksa TMDB'de ara
        if not movies:
            try:
                tmdb_hits = await tmdb_service.search_movies(intent.reference_title, page=1)
                for m in tmdb_hits:
                    mid = m.get("id")
                    if mid and mid not in exclude_set and m.get("poster_url"):
                        m["mood_score"] = 90.0
                        m["reason"] = "Aradığın film."
                        movies.append(m)
                        if len(movies) >= limit:
                            break
            except Exception:
                pass
        if not movies:
            movies = await _search_mood_movies(["battaniye", "zihin", "gece"], limit)

    elif intent.type == "actor_recommendation" and intent.person_name:
        query_understanding = f"'{intent.person_name}' filmlerini arıyorsun."
        movies = await _search_person_movies_top(
            intent.person_name, "actor", limit, min_vote, exclude_set,
            era_constraint=intent.era_constraint,
            genre_ids=intent.genres,
            time_constraint=intent.time_constraint)
        if not movies:
            query_understanding = f"'{intent.person_name}' ile ilgili filmler."
            search_result = await search_engine.search(
                intent.person_name, limit=limit, min_vote=min_vote, exclude_ids=exclude_set
            )
            movies = search_result.get("movies", [])
        if not movies:
            movies = await _search_mood_movies(["battaniye", "zihin", "gece", "kahkaha"], limit)

    elif intent.type == "director_recommendation" and intent.person_name:
        query_understanding = f"'{intent.person_name}' yönetmenliğindeki filmler."
        movies = await _search_person_movies_top(
            intent.person_name, "director", limit, min_vote, exclude_set,
            era_constraint=intent.era_constraint,
            genre_ids=intent.genres,
            time_constraint=intent.time_constraint)
        if not movies:
            query_understanding = f"'{intent.person_name}' ile ilgili filmler."
            search_result = await search_engine.search(
                intent.person_name, limit=limit, min_vote=min_vote, exclude_ids=exclude_set
            )
            movies = search_result.get("movies", [])
        if not movies:
            movies = await _search_mood_movies(["battaniye", "zihin", "gece", "kahkaha"], limit)

    elif intent.type == "mood_recommendation":
        query_understanding = "Ruh haline göre filmler öneriyorum."
        mood_hits = mood_analysis.get("mood_mix", [])
        mood_ids = [m["mood_id"] for m in mood_hits] if mood_hits else ["battaniye", "zihin", "gece", "kahkaha"]

        # ── parse_chat_hints() ile mood_ids zenginleştir ──────────────────
        if hints.mood_bonuses:
            for mid in sorted(hints.mood_bonuses, key=hints.mood_bonuses.get, reverse=True):
                if mid not in mood_ids:
                    mood_ids.insert(0, mid)
            mood_ids.sort(key=lambda m: hints.mood_bonuses.get(m, 0.0), reverse=True)

        # ── genre_hints: hem _rule_based_confused_analysis hem parse_chat_hints
        genre_hints = list(set(mood_analysis.get("genre_hints", []) + hints.genre_ids))

        # ── time/era constraint (dict uyumlu) ─────────────────────────────
        time_c = mood_analysis.get("time_constraint")
        era_c = mood_analysis.get("era_preference")

        is_short = (isinstance(time_c, dict) and time_c.get("mode") == "short") or time_c == "short"
        if is_short and "sipsak" not in mood_ids:
            mood_ids.insert(0, "sipsak")

        is_old = isinstance(era_c, dict) and era_c.get("max_year") is not None and (era_c.get("max_year", 9999) <= 2005)
        is_recent = isinstance(era_c, dict) and era_c.get("min_year") is not None and (era_c.get("min_year", 0) >= 2015)
        if is_old:
            mood_ids = [m for m in mood_ids if m in ("zamanyolcusu", "battaniye", "sessiz", "kalp")] or mood_ids
        if is_recent:
            mood_ids = [m for m in mood_ids if m not in ("zamanyolcusu",)] or mood_ids

        # ── Genre ipuçlarını mood boost'a çevir ──────────────────────────
        genre_mood_map = {35: "kahkaha", 27: "deep-chills", 28: "adrenalin",
                          10749: "askbahcesi", 18: "gozyasi", 878: "yolculuk",
                          14: "karmakar", 53: "gece", 80: "gece"}
        for gid in genre_hints:
            mapped = genre_mood_map.get(gid)
            if mapped and mapped in mood_ids:
                mood_ids.remove(mapped)
                mood_ids.insert(0, mapped)
            elif mapped:
                mood_ids.insert(0, mapped)

        # ── query_understanding zenginleştirme ────────────────────────────
        _genre_name_map = {
            878: "bilim kurgu", 53: "gerilim", 80: "suç", 10749: "romantik",
            27: "korku", 28: "aksiyon", 35: "komedi", 18: "dram", 12: "macera",
            16: "animasyon", 99: "belgesel", 10752: "savaş", 9648: "gizem",
            14: "fantezi", 10751: "aile",
        }
        if hints.hidden_gem_mode:
            query_understanding = "Gizli kalmış, değeri bilinmeyen yapıtları arıyorsun."
        elif hints.sipsak_mode:
            rt = hints.runtime_max or 100
            query_understanding = f"Kısa ve öz, {rt} dakikayı geçmeyen filmler arıyorsun."
        elif genre_hints:
            # Spesifik türleri önce göster, yaygın türleri (Drama=18) sona at
            _ordered_genres = sorted(genre_hints, key=lambda g: (g == 18, g))
            gnames = [_genre_name_map[g] for g in _ordered_genres[:2] if g in _genre_name_map and g != 18]
            if not gnames:
                gnames = [_genre_name_map[g] for g in _ordered_genres[:2] if g in _genre_name_map]
            if gnames:
                query_understanding = f"Ruh haline göre {', '.join(gnames)} ağırlıklı filmler."

        logger.info("[PATH3-MOOD] moods=%s genres=%s qu=%r", mood_ids[:5], genre_hints, query_understanding)

        # ── Genre filtre hazırla — yaygın türleri (18=Drama) sadece spesifik tür varsa çıkar
        _NOISE_GENRES = {18}  # Drama neredeyse tüm filmlerde var
        if genre_hints:
            specific_genres = set(genre_hints) - _NOISE_GENRES
            # Spesifik tür varsa noise'u çıkar, yoksa (sadece 18 varsa) olduğu gibi bırak
            genre_filter_set = specific_genres if specific_genres else set(genre_hints)
        else:
            genre_filter_set = None
        # ── Film getir — 3 adımlı fallback zinciri ──────────────────────────
        # Adım 1: Genre filtreli bucket
        movies = await _search_mood_movies(mood_ids, limit * 2, genre_filter=genre_filter_set)

        # ── Era PRE-FİLTRE: Adım 2'nin doğru trigger alması için era filtresini
        # Adım 1'den hemen sonra uygula. Bucket 8 sci-fi döndürse de sadece 1 tanesi
        # 80'lerden olabilir; bu pre-filter sayesinde Adım 2 TMDB Discover'ı tetikler.
        if era_c and isinstance(era_c, dict):
            _pf_min = era_c.get("min_year")
            _pf_max = era_c.get("max_year")
            if _pf_min or _pf_max:
                def _pf_era_ok(m):
                    y = _extract_year(m.get("release_date"))
                    if not y:
                        return False
                    if _pf_min and y < _pf_min:
                        return False
                    if _pf_max and y > _pf_max:
                        return False
                    return True
                # Empty sonuç bile olsa uygula — Adım 2 (TMDB Discover) era parametreli
                # arama yaparak boşluğu dolduracak.
                movies = [m for m in movies if _pf_era_ok(m)]
                logger.info("[PATH3-ERA-PRE] era=%s → %d film kaldı", era_c, len(movies))

        # Adım 2: Yeterli değilse → TMDB Discover (genre + era + runtime filtreli)
        # Sipsak için her zaman çalıştır: bucket şişirilmiş oylama içerebilir (az vote, yüksek avg).
        # TMDB Discover min_vote_count=150 ile gerçek kaliteli kısa filmleri döndürür.
        _has_discover_signal = (
            genre_filter_set or genre_hints or
            hints.sipsak_mode or hints.hidden_gem_mode or
            (era_c and isinstance(era_c, dict))
        )
        _should_discover = _has_discover_signal and (len(movies) < limit or hints.sipsak_mode)
        if _should_discover:
            # Sipsak için genre yok ise geniş bir set kullan (komedi, animasyon, aile)
            if genre_filter_set:
                discover_genres = list(genre_filter_set)
            elif genre_hints:
                discover_genres = list(set(genre_hints))
            elif hints.sipsak_mode:
                discover_genres = [35, 16, 10751, 12]  # Komedi, animasyon, aile, macera
            else:
                discover_genres = []
            discover_runtime = hints.runtime_max if hints.sipsak_mode else None
            tmdb_kws = getattr(hints, "tmdb_keywords", []) or []
            tmdb_movies = await _tmdb_discover_for_hints(
                discover_genres,
                era_c,
                discover_runtime,
                hints.hidden_gem_mode,
                limit * 2,
                tmdb_kws or None,
                lang_code=mood_analysis.get("lang_filter"),
            )
            seen = {m.get("id") or m.get("tmdb_id") for m in movies}
            for m in tmdb_movies:
                mid = m.get("id") or m.get("tmdb_id")
                if mid and mid not in seen:
                    m["reason"] = REASON_MAP.get(mood_ids[0] if mood_ids else "zihin",
                                                 "Sana özel keşfedildi.")
                    movies.append(m)
                    seen.add(mid)

        # Adım 3: Hala yeterli değilse → genre filtresiz bucket
        if len(movies) < limit:
            extra = await _search_mood_movies(mood_ids, limit * 2)
            seen = {m.get("id") or m.get("tmdb_id") for m in movies}
            for m in extra:
                mid = m.get("id") or m.get("tmdb_id")
                if mid not in seen:
                    movies.append(m)
                    seen.add(mid)
                    if len(movies) >= limit * 2:
                        break

    else:
        query_understanding = "Sana en iyi filmleri öneriyorum."
        movies = await _search_mood_movies(["battaniye", "kahkaha", "zihin", "gece", "yolculuk", "kalp"], limit * 2)

    # ── Era (dönem) filtresi — mood_recommendation dalında tanımlı era_c varsa uygula
    era_c_final = era_c
    if intent.type == "mood_recommendation" and era_c_final and isinstance(era_c_final, dict):
        era_min = era_c_final.get("min_year")
        era_max = era_c_final.get("max_year")
        if era_min or era_max:
            def _era_ok(m):
                y = _extract_year(m.get("release_date"))
                if not y:
                    return False  # Tarihi bilinmeyenleri era sorgusunda hariç tut
                if era_min and y < era_min:
                    return False
                if era_max and y > era_max:
                    return False
                return True
            era_filtered = [m for m in movies if _era_ok(m)]
            if era_filtered:  # Yeterli sonuç varsa era filtresi uygula
                movies = era_filtered

    # Sipsak sorgularda bucket filmleri şişirilmiş oy ortalamasına sahip olabilir (az oy, yüksek avg).
    # IMDb tarzı Bayesian ağırlıklı puan ile sırala: az oylu filmler global ortalamaya
    # çekilir, böylece gerçekten çok izlenmiş kaliteli kısa filmler tepeye çıkar.
    if getattr(hints, "sipsak_mode", False):
        movies.sort(key=lambda x: (
            -_weighted_rating(x),
            -int(x.get("vote_count") or 0),
        ))
    else:
        movies.sort(key=lambda x: (
            -x.get("genre_match_bonus", 0),  # Genre eşleşen filmler önce
            -x.get("mood_score", 0),
            -x.get("vote_average", 0),
        ))
    movies = movies[:limit]

    # ── Layer 3: Gourmet boost (underrated/az bilinen) ────────────────────
    try:
        from backend.services.intent_enhancer import SimilarMovieEnhancer
        if SimilarMovieEnhancer.detect_gourmet_preference(text):
            for m in movies:
                boost = SimilarMovieEnhancer.compute_gourmet_boost(
                    m.get("vote_count"), m.get("vote_average")
                )
                if boost:
                    m["gourmet_boost"] = boost
            movies.sort(key=lambda x: (
                x.get("gourmet_boost", 0),
                x.get("genre_match_bonus", 0),
                x.get("mood_score", 0),
                x.get("vote_average", 0),
            ), reverse=True)
    except Exception as exc:
        logger.debug("[GourmetBoost] skipped: %s", exc)

    # Son çare: hiçbir yol film döndüremediyse, en yüksek puanlı filmleri getir
    if not movies:
        try:
            fallback_rows = await cache.get_top_repository_movies_by_mood(
                "zihin", min_vote=min(min_vote, 6.0), limit=limit * 3
            )
            for row in fallback_rows:
                mid = row.get("tmdb_id") or row.get("id")
                if mid and mid not in exclude_set and row.get("poster_url"):
                    row["reason"] = "Arşivin en beğenilen yapımlarından."
                    movies.append(row)
                    if len(movies) >= limit:
                        break
            if movies:
                query_understanding = "Tam eşleşme bulamadım ama bunlar ilgini çekebilir."
        except Exception:
            pass

    # ── Kişiselleştirilmiş ustad_line ────────────────────────────────────────
    _mood_ids_local = mood_ids
    _era_c_local    = era_c
    if intent.type == "mood_recommendation":
        if hints.sipsak_mode:
            _ustad = "Kısa ama etkili — zamanı heba etme, işte en iyi çerezlikler."
        elif hints.hidden_gem_mode:
            _ustad = "Herkesin göz ardı ettiği yapıtlar... Şimdi sır olmaktan çıksınlar."
        elif _era_c_local and isinstance(_era_c_local, dict):
            _decade = (_era_c_local.get("min_year") or 1980) // 10 * 10
            _ustad = f"{_decade}'lerin ruhunu taşıyan filmler — nostalji yüklü bir yolculuk."
        elif "askbahcesi" in _mood_ids_local and 878 in (hints.genre_ids or []):
            _ustad = "İnsan-makine aşkı, zihni zorlayan evren... Derin bir yolculuk seni bekliyor."
        elif "askbahcesi" in (_mood_ids_local[:2] if _mood_ids_local else []):
            _ustad = "Kalbini eritecek, heyecan verecek — sevgiliye özel seçimler."
        elif "zihin" in (_mood_ids_local[:2] if _mood_ids_local else []):
            _ustad = "Düşünceler, sorular, cevaplar... Zihnini zorlayacak yapıtlar geldi."
        elif "deep-chills" in (_mood_ids_local[:2] if _mood_ids_local else []):
            _ustad = "Karanlık, ürpertici ama bırakamayacağın türden..."
        elif "adrenalin" in (_mood_ids_local[:2] if _mood_ids_local else []):
            _ustad = "Kalp atışlarını hızlandıracak, nefes kesecek yapıtlar..."
        else:
            _ustad = _confused_ustad_line(intent.type, mood_analysis)
    else:
        _ustad = _confused_ustad_line(intent.type, mood_analysis)

    # Kullanıcı açıkça Doğu Asya dili istediyse (kore/japon/çin) o filmleri sona itme
    _lang = mood_analysis.get("lang_filter")
    if _lang in _EAST_ASIAN_LANGS:
        from backend.mood_scoring import is_low_quality_asian
        _final_movies = [m for m in movies if not is_low_quality_asian(m)]
    else:
        _final_movies = _sort_east_asian_to_end(movies)

    return {
        "ok": bool(_final_movies),
        "mode": "rule_fallback",
        "is_fallback": True,
        "ustad_notu": "Üstad şu anda derin düşüncelere dalmış durumda, ancak yine de sana en uygun filmleri bulmaya çalıştı.",
        "intent": intent.to_dict(),
        "query_understanding": query_understanding,
        "ustad_line": _ustad,
        "message": mood_analysis.get("message", ""),
        "mood_mix": [],
        "movies": _final_movies,
    }


async def _fast_mood_bypass(mood_id: str, limit: int, min_vote: float, exclude_ids: list, raw_text: str = "") -> dict:
    """forced_mood_override bypass: doğrudan mood_score'lu SQL, <5ms."""
    exclude_set = set(exclude_ids)
    try:
        result = await cache.get_top_scored_movies_by_mood(mood_id, min_vote=min_vote, limit=limit * 4)
    except Exception as e:
        logger.warning(f"[FastMoodBypass] get_top_scored_movies_by_mood failed ({e}), falling back to repository query")
        result = []
    
    # Fallback: if first query failed or returned empty results, use repository query
    if not result or all(m.get("mood_score", 0) == 0 for m in result):
        try:
            result = await cache.get_top_repository_movies_by_mood(mood_id, min_vote=min_vote, limit=limit * 4)
            for m in result:
                m["mood_score"] = round(m.get("vote_average", 0) * 10, 1)
        except Exception as e:
            logger.warning(f"[FastMoodBypass] get_top_repository_movies_by_mood failed ({e})")
            result = []

    movies = []
    for m in result:
        mid = m.get("id") or m.get("tmdb_id")
        if mid and mid not in exclude_set:
            m["matched_mood"] = mood_id
            m["reason"] = REASON_MAP.get(mood_id, "Ruh haline uygun bir seçim.")
            movies.append(m)
            exclude_set.add(mid)
            if len(movies) >= limit:
                break

    mood_name = MOOD_NAMES.get(mood_id, mood_id)
    return {
        "ok": bool(movies),
        "mode": "mood_bypass",
        "intent": {"type": "mood_bypass", "mood_id": mood_id},
        "query_understanding": f"{mood_name} ruh haline uygun filmler.",
        "ustad_line": f"{mood_name} havasında bir şeyler arıyorsun. İşte seçtiklerim.",
        "message": f"{mood_name} için en iyi filmleri sıralıyorum.",
        "mood_mix": [{"mood_id": mood_id, "title": mood_name, "percentage": 100}],
        "movies": movies,
    }



def _extract_year(release_date) -> int:
    """release_date (YYYY-MM-DD veya YYYY) → int yıl. Parse hatası → 0."""
    if not release_date:
        return 0
    try:
        return int(str(release_date)[:4])
    except (ValueError, TypeError):
        return 0


# Sipsak sıralaması için minimum güvenilir oy sayısı (TMDB Discover ile uyumlu).
SIPSAK_MIN_VOTE_COUNT = 150


def _weighted_rating(movie: dict, min_votes: int = SIPSAK_MIN_VOTE_COUNT,
                     mean_vote: float = 6.5) -> float:
    """
    IMDb tarzı Bayesian ağırlıklı puan (WR):

        WR = (v / (v + m)) * R + (m / (v + m)) * C

      v = filmin oy sayısı (vote_count)
      m = güvenilir kabul edilen minimum oy eşiği
      R = filmin oy ortalaması (vote_average)
      C = global prior ortalama

    Az oy almış "şişirilmiş" filmleri (örn. 60 oyla 8.5) global ortalamaya doğru
    çeker; çok oy almış filmlerin kendi ortalamasına yaklaşmasına izin verir.
    Böylece sipsak listesinde gerçek kaliteli kısa filmler tepeye çıkar.
    """
    try:
        v = int(movie.get("vote_count") or 0)
        r = float(movie.get("vote_average") or 0.0)
    except (ValueError, TypeError):
        return 0.0
    if v <= 0:
        return 0.0
    return (v / (v + min_votes)) * r + (min_votes / (v + min_votes)) * mean_vote


def _dynamic_reason_from_hints(hints) -> str:
    """
    Chat'ten yakalanan amaca göre tek cümlelik dinamik 'Üstad'ın Gerekçesi' üretir.
    Hiçbir güçlü sinyal yoksa boş döner (movie'nin mevcut mood reason'ı korunur).
    """
    if getattr(hints, "hidden_gem_mode", False):
        return ("Bunu seçtim; çünkü kalabalığın radarından kaçmış, "
                "değeri bilinmeyi hak eden nadir yapıtlardan biri.")

    if hints.sipsak_mode:
        return ("Bunu seçtim; çünkü cümlendeki o kısıtlı zaman arayışını "
                "en rafine şekilde bu kompakt sahneler karşılıyor.")

    # Tür sinyallerinden öncelikli gerekçe
    g = set(hints.genre_ids)
    if 878 in g:
        return ("Bunu seçtim; çünkü aradığın o uzay/bilim kurgu evrenini "
                "ve zihin büken atmosferi tam damarından taşıyor.")
    if 27 in g:
        return ("Bunu seçtim; çünkü istediğin o karanlık ürpertiyi "
                "yavaş yavaş içine işleyen sahnelerle veriyor.")
    if {53, 80, 9648} & g:
        return ("Bunu seçtim; çünkü aradığın gerilim ve suç gerginliğini "
                "gözünü kırpmadan izleteceğin bir kurguyla sunuyor.")
    if 10749 in g:
        return ("Bunu seçtim; çünkü içini kıpır kıpır edecek o romantik "
                "dokuyu klişeye düşmeden yakalıyor.")
    if 35 in g:
        return ("Bunu seçtim; çünkü modunu anında yukarı çekecek "
                "o neşeli enerjiyi taşıyor.")

    # Mood bonuslarından en güçlüsüne göre
    if hints.mood_bonuses:
        top_mood = max(hints.mood_bonuses, key=hints.mood_bonuses.get)
        phrases = {
            "yolculuk":           "keşif ve yolculuk hissini ufkunu açacak şekilde barındırıyor.",
            "zihin":              "bittiğinde bile saatlerce kafanda yaşayacak zihinsel bir derinlik taşıyor.",
            "gece":               "aradığın o karanlık ve gizemli atmosferi damarından veriyor.",
            "adrenalin":          "tempoyu hiç düşürmeden seni koltuğa çivileyecek bir gerilim sunuyor.",
            "askbahcesi":         "kalbinde kelebekler uçuşturacak o sıcak romantizmi taşıyor.",
            "deep-chills":        "yavaş yanan ürpertisiyle tam istediğin tedirginliği veriyor.",
            "sessiz":             "sakin ve düşündürücü atmosferiyle tam aradığın huzuru veriyor.",
            "kalp":               "samimi ve içten anlatımıyla kalbine dokunacak bir yapım.",
            "karmakar":           "sıradışı yapısıyla alışılmışın dışında bir sinema deneyimi sunuyor.",
            "kadraj-estetigi":    "görsel şölenin zirvesinde, her karesi bir tablo gibi.",
            "gozyasi":            "duygusal derinliğiyle içini titreteceğine emin olduğum bir yapım.",
            "geceyarisi-itirafi": "samimi diyaloglarıyla gece yarısı izlenesi bir itiraf gibi.",
            "battaniye":          "sıcak ve sarıp sarmalayan havasıyla tam bir battaniye altı filmi.",
            "kahkaha":            "neşeli enerjisiyle modunu anında yukarı çekecek bir yapım.",
            "zamanyolcusu":       "nostaljik atmosferiyle seni geçmişin sıcaklığına götürüyor.",
        }
        if top_mood in phrases:
            return f"Bunu seçtim; çünkü {phrases[top_mood]}"

    return ""


def _hybrid_rerank(movies: list, hints, limit: int) -> list:
    """
    Hibrit Harmanlama (Hybrid Scoring) — 3 bileşenli ağırlıklı skor:

      final = 0.40 × VEKTÖR + 0.40 × METADATA/ETİKET + 0.20 × KALİTE/POPÜLERLİK

      1) %40 Vektör: semantic engine'in cosine skoru (mood_score, entity boost dahil).
      2) %40 Metadata: ParsedHints mood bonusları + tür boolean maskesi + sipsak.
      3) %20 Kalite: vote_average + popularity (hidden_gem_mode'da ters popülerlik).

    Runtime hard-filter: hints.runtime_max varsa, uzun filmleri düşürür.
    """
    import math

    if not movies:
        return movies

    _MAX_BONUS = 0.50  # chat_engine._MAX_BONUS ile aynı
    genre_boost_set = set(hints.genre_ids)
    runtime_max = getattr(hints, "runtime_max", None)
    hidden_gem = getattr(hints, "hidden_gem_mode", False)

    # Vektör normalizasyonu için tepe skor (mood_score 0-100 ölçeğinde gelir)
    max_vec = max((m.get("mood_score", 0.0) or 0.0 for m in movies), default=0.0) or 1.0

    scored = []
    for rank, movie in enumerate(movies):
        # ── Runtime hard-filter ───────────────────────────────────────────────
        if runtime_max:
            runtime = movie.get("runtime")
            if runtime and runtime > runtime_max:
                continue

        # ── 1) Vektör skoru (%40) — gerçek anlamsal benzerlik, normalize ──────
        vec_raw = movie.get("mood_score")
        if vec_raw is None:
            vector_score = max(0.10, 1.0 - 0.08 * rank)   # mood_score yoksa proxy
        else:
            vector_score = min(1.0, vec_raw / max_vec)

        # ── 2) Metadata/etiket skoru (%40) — mood + tür + sipsak maskesi ──────
        mood_id = movie.get("mood_id") or movie.get("primary_mood_id") or ""
        candidate_moods = list(movie.get("matched_moods") or ([mood_id] if mood_id else []))
        meta_score = max(
            (hints.mood_bonuses.get(m, 0.0) for m in candidate_moods), default=0.0
        ) / _MAX_BONUS  # 0-1 normalize

        movie_genres = set(movie.get("genre_ids", []))
        if genre_boost_set & movie_genres:
            meta_score = min(1.0, meta_score + 0.40)
        if hints.sipsak_mode and "sipsak" in candidate_moods:
            meta_score = min(1.0, meta_score + 0.50)

        # ── 3) Kalite/popülerlik skoru (%20) — vote_average + popularity ──────
        vote = movie.get("vote_average", 0.0) or 0.0
        pop = movie.get("popularity") or 0.0

        if hidden_gem:
            anti_pop = max(0.0, 1.0 - min(1.0, math.log10(pop + 1) / 3.0))
            quality_score = min(1.0, 0.5 * (vote / 10.0) + 0.5 * anti_pop)
        elif pop:
            quality_score = min(
                1.0,
                0.6 * (vote / 10.0) + 0.4 * min(1.0, math.log10(pop + 1) / 3.0),
            )
        else:
            quality_score = min(1.0, vote / 10.0)

        final = 0.40 * vector_score + 0.40 * meta_score + 0.20 * quality_score
        scored.append((final, movie))

    scored.sort(key=lambda x: -x[0])
    return [m for _, m in scored[:limit]]


# ── East Asian language sorting ──────────────────────────────────────────
from backend.mood_scoring import is_low_quality_asian
_EAST_ASIAN_LANGS = {"ja", "ko", "zh", "cn"}  # Japonca, Korece, Çince

def _sort_east_asian_to_end(movies: list[dict]) -> list[dict]:
    """Niş/obskür Doğu Asya filmlerini tamamen ele; geriye kalan kaliteli
    Asya filmlerini de listenin sonuna it (Türk izleyici önceliği)."""
    # 1) Kalitesiz Asya filmlerini at
    movies = [m for m in movies if not is_low_quality_asian(m)]
    # 2) Kalan Asya filmlerini sona it
    non_east = [m for m in movies if (m.get("original_language") or "").lower() not in _EAST_ASIAN_LANGS]
    east = [m for m in movies if (m.get("original_language") or "").lower() in _EAST_ASIAN_LANGS]
    return non_east + east


# ═══════════════════════════════════════════════════════════════════════════
# TEMA + REFINE yardımcıları (Kafan mı Karışık premium tematik öneri)
# ═══════════════════════════════════════════════════════════════════════════
async def _resolve_keyword_ids(terms: list) -> list:
    """İngilizce tema terimlerini TMDB keyword ID'lerine çevirir (12h cache)."""
    ids = []
    for term in terms or []:
        try:
            res = await _cached_tmdb("keyword", term.lower(),
                                     lambda t=term: tmdb_service.search_keyword(t))
            if res:
                ids.append(res[0]["id"])
        except Exception:
            continue
    return ids


async def _discover_themed(*, keyword_ids, genre_ids, limit, min_vote, exclude_ids,
                           sort_by="vote_average.desc", min_vote_count=200,
                           max_vote_count=None, date_gte=None, page=1, reason="",
                           company_ids=None, original_language=None,
                           watch_providers=None, watch_region=None) -> list:
    """TMDB Discover ile tema/refine sonucu çek (poster + exclude filtreli)."""
    kwargs = {"sort_by": sort_by, "min_vote_average": min_vote,
              "min_vote_count": min_vote_count, "page": page}
    if keyword_ids:
        kwargs["with_keywords"] = "|".join(str(k) for k in keyword_ids)
    if max_vote_count:
        kwargs["max_vote_count"] = max_vote_count
    if date_gte:
        kwargs["primary_release_date_gte"] = date_gte
    if company_ids:
        kwargs["with_companies"] = "|".join(str(c) for c in company_ids)
    if original_language:
        kwargs["with_original_language"] = original_language
    if watch_providers:
        kwargs["with_watch_providers"] = "|".join(str(p) for p in watch_providers)
        kwargs["watch_region"] = watch_region or "TR"
    try:
        res = await tmdb_service.discover_movies(list(genre_ids or []), **kwargs)
    except Exception as e:
        logger.warning("[ThemeDiscover] failed: %s", e)
        return []
    exset = set(exclude_ids or [])
    out = []
    for m in res.get("movies", []):
        mid = m.get("id")
        if not mid or mid in exset or not m.get("poster_url"):
            continue
        if reason:
            m["reason"] = reason
        m["matched_mood"] = "theme"
        out.append(m)
    return out[:limit]


_REFINE_USTAD = {
    "more_popular": "Daha bilinenlerini istedin — işte herkesin konuştukları.",
    "newer":        "Taze yapımlar getirdim — sinemanın son sözü.",
    "different":    "Tamamen başka bir kapı araladım, bambaşka bir seçki.",
    "less_known":   "Gözden kaçmış cevherler — Üstad'ın gizli rafından.",
}


def _refine_discover_params(refine: str):
    """Discover (tema/tür) yolu için TMDB-native sıralama/filtre parametreleri."""
    import random as _rnd
    from datetime import datetime as _dt
    sort_by, min_vc, max_vc, date_gte, page, mv_override = \
        "vote_average.desc", 200, None, None, 1, None
    if refine == "more_popular":
        sort_by, min_vc = "popularity.desc", 1000
    elif refine == "newer":
        sort_by, min_vc = "primary_release_date.desc", 150
        date_gte = f"{_dt.utcnow().year - 4}-01-01"
    elif refine == "different":
        page = _rnd.randint(1, 3)
    elif refine == "less_known":
        sort_by, min_vc, max_vc, mv_override = "vote_average.desc", 80, 2500, 6.5
    return sort_by, min_vc, max_vc, date_gte, page, mv_override


def _apply_refine_modifier(movies: list, refine: str, limit: int) -> list:
    """Kişi/benzer/mood havuzu (TMDB Discover dışı) için refine sıralama/filtresi —
    metadata üzerinden yerel uygulanır."""
    import random as _rnd
    def _vc(m):  return int(m.get("vote_count") or 0)
    def _va(m):  return float(m.get("vote_average") or 0)
    def _pop(m): return float(m.get("popularity") or 0)
    def _yr(m):  return _extract_year(m.get("release_date")) or 0
    pool = list(movies)
    if refine == "more_popular":
        pool.sort(key=lambda m: (_pop(m), _vc(m)), reverse=True)
    elif refine == "newer":
        pool.sort(key=lambda m: _yr(m), reverse=True)
    elif refine == "less_known":
        # Az bilinen ama kaliteli: düşük oy sayısı + iyi puan
        lesser = [m for m in pool if _vc(m) < 3000 and _va(m) >= 6.5]
        lesser.sort(key=lambda m: (_va(m), -_vc(m)), reverse=True)
        pool = lesser or sorted(pool, key=_vc)  # hiç yoksa en az oylananlar
    elif refine == "different":
        _rnd.shuffle(pool)
    return pool[:limit]


# "X gibi ama daha Y" — benzer havuzuna uygulanan modifier (tür-yakınlığı + meta).
_SIMILAR_MOD_GENRES = {
    "funnier": {35},            # komedi
    "darker": {27, 53, 80},     # korku, gerilim, suç
    "lighter": {35, 10751},     # komedi, aile
    "heavier": {18, 10752},     # dram, savaş
    "scarier": {27, 53},        # korku, gerilim
    "romantic": {10749},        # romantik
}


def _apply_similar_modifier(movies: list, modifier: str, limit: int) -> list:
    """'X gibi ama daha Y' havuzuna modifier uygular. newer/older/popular/
    less_known meta-bazlı; funnier/darker/... tür-yakınlığıyla öne çeker."""
    if not modifier:
        return movies[:limit]
    def _vc(m):  return int(m.get("vote_count") or 0)
    def _va(m):  return float(m.get("vote_average") or 0)
    def _pop(m): return float(m.get("popularity") or 0)
    def _yr(m):  return _extract_year(m.get("release_date")) or 0
    pool = list(movies)
    if modifier in ("more_popular", "newer", "less_known", "different"):
        return _apply_refine_modifier(pool, modifier, limit)
    if modifier == "older":
        dated = [m for m in pool if _yr(m) > 0]
        dated.sort(key=_yr)
        rest = [m for m in pool if _yr(m) == 0]
        return (dated + rest)[:limit]
    target = _SIMILAR_MOD_GENRES.get(modifier)
    if target:
        matched = [m for m in pool if target & set(m.get("genre_ids") or [])]
        rest = [m for m in pool if not (target & set(m.get("genre_ids") or []))]
        matched.sort(key=lambda m: (_va(m), _vc(m)), reverse=True)
        return (matched + rest)[:limit]
    # shorter/longer: liste sonuçlarında runtime yok → sıra korunur (best-effort)
    return pool[:limit]


def _genres_from_mood(mood_analysis: dict) -> list:
    """mood_mix'in baskın mood'undan tür listesi üretir (saf mood sorgularında)."""
    try:
        from backend.services.claude_service import MOOD_TO_GENRES
    except Exception:
        return []
    mm = mood_analysis.get("mood_mix") or []
    if not mm:
        return []
    return MOOD_TO_GENRES.get(mm[0].get("mood_id"), [])[:3]


async def _refine_person_pool(person_name: str, role: str, min_vote: float,
                              exclude_set: set) -> tuple:
    """Yönetmen/oyuncu filmografisinden geniş aday havuzu (modifier sonradan)."""
    try:
        persons = await tmdb_service.search_person(person_name)
        if not persons:
            return [], ""
        pid = persons[0]["id"]
        if role == "director":
            raw = await tmdb_service.get_director_filmography(pid, limit=40, min_vote_count=20)
        else:
            raw = await tmdb_service.get_person_movie_credits(pid)
        pool = []
        for m in raw or []:
            mid = m.get("id")
            if not mid or mid in exclude_set or not m.get("poster_url"):
                continue
            if float(m.get("vote_average", 0) or 0) < min_vote:
                continue
            m["mood_score"] = 85.0
            m["matched_mood"] = "battaniye"
            pool.append(m)
        return pool, persons[0].get("name", person_name)
    except Exception as e:
        logger.warning("[Refine] person pool failed: %s", e)
        return [], ""


async def _refine_similar_pool(ref_title: str, exclude_set: set) -> tuple:
    """Referans filme benzer (recommendations + similar) aday havuzu.
    Referansı ÖNCE yerel korpustan çözer (tüm sistem filmleri), yoksa TMDB."""
    try:
        src_id, src_title, _genres = await _resolve_reference_movie(ref_title)
        if not src_id:
            return [], ""
        rec, sim = await asyncio.gather(
            tmdb_service.get_recommendations(src_id, page=1),
            tmdb_service.get_similar_movies(src_id, page=1),
        )
        pool = {}
        for m in rec.get("movies", []):
            pool[m["id"]] = m
        for m in sim.get("movies", []):
            pool.setdefault(m["id"], m)
        pool.pop(src_id, None)
        out = []
        for m in pool.values():
            mid = m.get("id")
            if not mid or mid in exclude_set or not m.get("poster_url"):
                continue
            m["mood_score"] = 85.0
            m["matched_mood"] = "battaniye"
            out.append(m)
        return out, src_title
    except Exception as e:
        logger.warning("[Refine] similar pool failed: %s", e)
        return [], ""


async def _refine_via_discover(refine: str, keyword_ids: list, genre_ids: list,
                               company_ids: list, lang_filter, label: str,
                               limit: int, min_vote: float, exclude_ids: list,
                               watch_providers: list = None) -> dict:
    """Tema/tür/platform yolu: TMDB Discover'ın native sort/filtre'siyle refine."""
    sort_by, min_vc, max_vc, date_gte, page, mv_override = _refine_discover_params(refine)
    mv = mv_override if mv_override is not None else min_vote
    # Platform sorgularında oy eşiği düşük tutulur (katalog daha dar)
    if watch_providers and refine != "less_known":
        min_vc = min(min_vc, 100)
    movies = await _discover_themed(
        keyword_ids=keyword_ids, genre_ids=genre_ids, limit=limit, min_vote=mv,
        exclude_ids=exclude_ids, sort_by=sort_by, min_vote_count=min_vc,
        max_vote_count=max_vc, date_gte=date_gte, page=page, reason=label,
        company_ids=company_ids or None, original_language=lang_filter,
        watch_providers=watch_providers, watch_region="TR" if watch_providers else None,
    )
    if not movies:
        return None
    return {
        "ok": True, "mode": f"refine_{refine}", "intent": "refine",
        "query_understanding": label,
        "ustad_line": _REFINE_USTAD.get(refine, "İşte yeni bir seçki."),
        "message": label, "movies": movies,
    }


async def _refine_recommendation(refine: str, text: str, limit: int,
                                  min_vote: float, exclude_ids: list) -> dict:
    """4 buton için INTENT-FARKINDA deterministik refine: önceki sorgunun
    NİYETİNİ (kişi / benzer film / tema / tür / mood) koruyup, o havuza
    sıralama/filtre modifier'ı uygular. Ana endpoint'in öncelik sırasını yansıtır:
    yönetmen/bilinen-oyuncu → tema → benzer film → bilinmeyen kişi → tür/mood."""
    from backend.services.theme_router import match_theme
    from backend.services.chat_engine import (
        ChatEngine, parse_chat_hints, _rule_based_confused_analysis,
        _normalize, KNOWN_PERSONS, _detect_platform_filter, STREAMING_PLATFORMS,
    )
    exclude_set = set(exclude_ids)
    engine = ChatEngine(db=cache)
    intent = engine.detect_intent(text)
    theme = match_theme(text)
    hints = parse_chat_hints(text)
    mood_analysis = _rule_based_confused_analysis(text)
    lang_filter = mood_analysis.get("lang_filter")

    # 0) Yayın platformu ("Netflix'te olan") → availability korunur, modifier uygulanır
    provider_key = _detect_platform_filter(text)
    if provider_key:
        pinfo = STREAMING_PLATFORMS.get(provider_key, {})
        pname = pinfo.get("label", provider_key.title())
        return await _refine_via_discover(
            refine, [], hints.genre_ids, [], lang_filter,
            f"{pname}'te izlenebilen filmler", limit, min_vote, exclude_ids,
            watch_providers=[pinfo.get("provider_id")] if pinfo.get("provider_id") else None,
        )

    director = intent.type == "director_recommendation" and bool(intent.person_name)
    actor = intent.type == "actor_recommendation" and bool(intent.person_name)
    person_known = bool(intent.person_name) and _normalize(intent.person_name) in KNOWN_PERSONS

    pool, source, reason = [], None, ""

    # 1) Yönetmen veya BİLİNEN oyuncu → filmografi havuzu (temadan önce gelir)
    if director or (actor and person_known):
        role = "director" if director else "actor"
        pool, pname = await _refine_person_pool(intent.person_name, role, min_vote, exclude_set)
        if pool:
            source, reason = "person", f"'{pname}' kariyerinden bir seçki."

    # 2) Tema → TMDB Discover (kişiyle çözülmediyse)
    if not pool and theme:
        kw = await _resolve_keyword_ids(theme["terms"])
        return await _refine_via_discover(refine, kw, theme["genres"],
                                          theme.get("companies", []), lang_filter,
                                          theme["label"], limit, min_vote, exclude_ids)

    # 3) Benzer / film adı → referansa benzer havuz
    if not pool and intent.reference_title:
        pool, rtitle = await _refine_similar_pool(intent.reference_title, exclude_set)
        if pool:
            source, reason = "similar", f"'{rtitle}' sevenlerin sevdiği filmler."

    # 4) BİLİNMEYEN oyuncu/yönetmen → best-effort filmografi (gerçek kişiyse tutar).
    #    Dil sorgusu varsa ("kore filmi") atla — bu kişi değil ülke isteğidir.
    if not pool and (actor or director) and not lang_filter:
        role = "director" if director else "actor"
        pool, pname = await _refine_person_pool(intent.person_name, role, min_vote, exclude_set)
        if pool:
            source, reason = "person", f"'{pname}' kariyerinden bir seçki."

    # 5) Tür / mood → Discover (mood'dan tür türet). Varsayılan mood (gerçek sinyal
    #    yokken zihin/gece) tür enjekte etmesin — özellikle saf dil sorgularını
    #    ("kore filmi") gereksiz daraltmamak için.
    if not pool:
        mm = mood_analysis.get("mood_mix") or []
        is_default_mood = (
            len(mm) == 2 and mm[0].get("mood_id") == "zihin"
            and mm[1].get("mood_id") == "gece" and not hints.mood_bonuses
        )
        genre_ids = hints.genre_ids or ([] if is_default_mood else _genres_from_mood(mood_analysis))
        return await _refine_via_discover(refine, [], genre_ids, [], lang_filter,
                                          "Senin için yeniden seçtim.", limit,
                                          min_vote, exclude_ids)

    # Havuz tabanlı (kişi/benzer) → yerel modifier
    movies = _apply_refine_modifier(pool, refine, limit)
    if not movies:
        return None
    return {
        "ok": True, "mode": f"refine_{refine}", "intent": "refine",
        "query_understanding": reason,
        "ustad_line": _REFINE_USTAD.get(refine, "İşte yeni bir seçki."),
        "message": reason, "movies": movies,
    }


@app.post("/api/recommend/confused", dependencies=[Depends(rate_limit_ai)])
async def post_confused_recommendation(req: ConfusedRequest):
    """
    Kafan mı Karışık? — Dört katmanlı yerel arama mimarisi (sıfır API maliyeti):

    PATH 0 — Exact Recipe Router (~2ms):
      Buton label'ı BUTTON_RECIPES'te tam eşleşirse SQL + NumPy pipeline çalışır.

    PATH 1 — Slug Override / Fast Mood Bypass (<5ms):
      forced_mood_override slug'ı MOOD_NAMES'te varsa mood_score SQL'i çalışır.

    PATH 2 — Yerel Intent Detection + Semantic Search (<8s):
      ChatEngine.detect_intent() ile yönetmen/oyuncu/film tespiti.
      parse_chat_hints() ile mood/genre sinyalleri.
      sentence-transformers ile yerel semantic search + hibrit reranking.

    PATH 3 — Kural Tabanlı Fallback (her durumda çalışır):
      Semantic timeout veya hata durumunda regex + SQL fallback.
    """
    limit      = max(3, min(req.limit, 12))
    min_vote   = max(4.0, min(req.min_vote, 10.0))
    exclude_ids = [int(x) for x in req.exclude_ids if str(x).isdigit()] if req.exclude_ids else []
    text       = req.text.strip()

    # ── Liste/limit/puan-eşiği parse ("top 10", "3 film", "imdb 8 üstü") ──
    try:
        from backend.services.chat_engine import parse_list_controls as _plc
        _lc = _plc(text)
        if _lc.get("limit"):
            limit = max(3, min(_lc["limit"], 12))
        if _lc.get("min_vote"):
            min_vote = max(min_vote, min(_lc["min_vote"], 10.0))
        elif _lc.get("high_rated"):
            min_vote = max(min_vote, 7.0)
    except Exception:
        pass
    override   = (req.forced_mood_override or "").strip().lower()
    refine     = (req.refine or "").strip().lower()
    from backend.services.chat_engine import _detect_platform_filter, STREAMING_PLATFORMS as _SP, parse_chat_hints as _pch
    provider_filter = _detect_platform_filter(text) or ""

    # ── PLATFORM DISCOVERY: "Netflix'te olan", "amazonda korku filmleri" ─────────
    # TMDB with_watch_providers + watch_region=TR ile gerçekten erişilebilir filmler.
    # Tür ipucu varsa birleştirilir ("netflixte korku" → Netflix + korku).
    if provider_filter and not refine:
        pinfo = _SP.get(provider_filter)
        if pinfo:
            try:
                _ph = _pch(text)
                discover = await tmdb_service.discover_movies(
                    genre_ids=_ph.genre_ids or [], min_vote_count=80,
                    min_vote_average=max(min_vote, 5.5),
                    sort_by="popularity.desc",
                    with_watch_providers=str(pinfo["provider_id"]),
                    watch_region="TR",
                )
                exset = set(exclude_ids)
                movies = [
                    m for m in discover.get("movies", [])
                    if (m.get("id") or m.get("tmdb_id")) not in exset and m.get("poster_url")
                ][:limit]
                if movies:
                    pname = pinfo.get("label", provider_filter.title())
                    return {
                        "ok": True, "mode": "platform_discover",
                        "intent": "watch_provider",
                        "query_understanding": f"{pname}'te izlenebilen filmler",
                        "ustad_line": f"İşte {pname}'te bu akşam izleyebileceklerin evlat.",
                        "message": f"{pname} kütüphanesinden seçtiklerim.",
                        "mood_mix": [],
                        "movies": movies,
                    }
            except Exception:
                logger.warning("[Confused] Platform discover failed for '%s', falling through", provider_filter)

    # ── REFINE: 4 buton (Daha Popüler/Yeni/Farklı/Az Bilinen) — deterministik ──
    if refine in _REFINE_USTAD:
        try:
            refined = await _refine_recommendation(refine, text, limit, min_vote, exclude_ids)
            if refined and refined.get("movies"):
                return refined
        except Exception as e:
            logger.warning("[Confused] Refine '%s' failed (%s), normal akışa düşülüyor", refine, e)

    # ── PATH 0: Exact text → recipe router (sıfır embedding) ────────────────
    try:
        from backend.services.exact_match_router import match_recipe, execute_recipe
        recipe = match_recipe(text)
        if recipe:
            movies = await execute_recipe(recipe, limit, exclude_ids, cache)
            if movies:
                r_mood_id   = recipe.get("mood_id", override or "battaniye")
                r_mood_name = MOOD_NAMES.get(r_mood_id, r_mood_id.replace("-", " ").title())
                return {
                    "ok":                  True,
                    "mode":                "exact_recipe",
                    "intent":              "quick_mood",
                    "query_understanding": recipe.get("query_understanding", text),
                    "ustad_line":          recipe.get("ustad_line", "İşte seçtiklerim."),
                    "message":             recipe.get("query_understanding", ""),
                    "mood_mix":            [{"mood_id": r_mood_id, "title": r_mood_name, "percentage": 100}],
                    "movies":              movies,
                }
    except Exception as e:
        logger.warning("[Confused] Recipe router failed (%s), falling through to next path", e)

    # ── PATH 1: Slug override → fast SQL bypass ──────────────────────────────
    if override and override in MOOD_NAMES:
        try:
            bypass_result = await _fast_mood_bypass(override, limit, min_vote, exclude_ids, text)
            return bypass_result
        except Exception as e:
            logger.error("[Confused] Fast mood bypass failed (%s), falling through", e, exc_info=True)

    # ── PATH 2: Serbest chat → yerel intent detection + semantic + hibrit rerank
    from backend.services.chat_engine import (
        ChatEngine, parse_chat_hints, _extract_era_constraint,
        NEGATIVE_WORDS, GENRE_KEYWORDS, _detect_lang_filter,
    )

    hints  = parse_chat_hints(text)
    result = None

    # ── Yerel intent tespiti (ChatEngine, <1ms) ───────────────────────────
    _engine_for_intent = ChatEngine(db=cache)
    local_intent = _engine_for_intent.detect_intent(text)

    # ── Dizi tespiti: platform yalnızca film önerir ─────────────────────────
    _SERIES_KEYWORDS = [
        "dizi", "dizi öner", "dizi tavsiye", "dizi ara", "güzel dizi",
        "dizi izle", "dizi bakıyorum", "dizi söyle", "dizi ver",
        "tv dizisi", "dizisi", "diziler", "netflix dizisi",
        "dizi film", "dizi ariyorum", "bi dizi", "bir dizi",
    ]
    _tl = text.lower().strip()
    if any(kw in _tl for kw in _SERIES_KEYWORDS):
        logger.info("[Confused] Dizi tespiti: '%s' → film uyarısı", text)
        return {
            "ok": True, "mode": "series_detected", "intent": "series",
            "query_understanding": "Dizi değil, film mi arıyorsun?",
            "ustad_line": "Ben filmler konusunda uzmanım — diziler için başka bir kılavuz lazım.",
            "message": "Sadece film öneriyorum, dizileri bilmem. Aklında bir film var mı?",
            "movies": [],
        }
        # providers with empty movies — skip filter

    # ── PATH 1.5: Tematik/somut konu sorgusu → TMDB keyword discover ──────────
    # "yaz temalı", "deniz", "yılbaşı filmi", "uzayda geçen", "futbol", "gerçek hikaye"…
    # Küratörlü tema eşleşmesi güçlü bir sinyal: "X gibi" (benzerlik), "X yönetmeni"
    # ya da bilinen kişi adı DIŞINDA, tema yakalanırsa gerçekten o temaya ait kaliteli
    # filmleri TMDB'den çek. (Zayıf exact/actor heuristic'lerinin tema sorgusunu
    # yanlış sınıflamasına izin verme — "deniz"/"yılbaşı filmi" film adı sanılıyordu.)
    from backend.services.chat_engine import KNOWN_PERSONS as _KNOWN_PERSONS, _normalize as _norm
    _skip_theme = (
        local_intent.type in ("similar_to_movie", "director_recommendation", "feedback")
        or (local_intent.person_name and _norm(local_intent.person_name) in _KNOWN_PERSONS)
    )
    if not _skip_theme:
        try:
            from backend.services.theme_router import match_theme
            theme = match_theme(text)
            if theme:
                kw_ids = await _resolve_keyword_ids(theme["terms"])
                if kw_ids or theme["genres"]:
                    themed = await _discover_themed(
                        keyword_ids=kw_ids, genre_ids=theme["genres"], limit=limit,
                        min_vote=min_vote, exclude_ids=exclude_ids,
                        sort_by="vote_average.desc", min_vote_count=200,
                        reason=theme["label"],
                        company_ids=theme.get("companies", []),
                    )
                    if len(themed) >= 3:
                        logger.info("[Confused] Theme '%s' → %d film (TMDB discover)", theme["key"], len(themed))
                        return {
                            "ok": True, "mode": "theme_discover", "intent": "theme",
                            "query_understanding": theme["label"],
                            "ustad_line": theme["ustad"],
                            "message": theme["label"],
                            "movies": themed,
                        }
        except Exception as e:
            logger.warning("[Confused] Theme router failed (%s), semantic'e düşülüyor", e)
    search_text = text
    exclude_set = set(exclude_ids)

    logger.info("[Confused] Local intent: type=%s, person=%s, ref=%s",
                local_intent.type, local_intent.person_name, local_intent.reference_title)

    # ── PATH 2a-0: Çoklu oyuncu birlikte ("A ve B birlikte") → ortak filmler ──
    if local_intent.type == "multi_person" and local_intent.person_name and getattr(local_intent, "person_name2", None):
        try:
            duo, rn1, rn2 = await _search_two_cast_movies(
                local_intent.person_name, local_intent.person_name2, limit, min_vote,
                exclude_set, genre_ids=local_intent.genres,
                era_constraint=local_intent.era_constraint)
            if duo:
                return {
                    "movies": duo[:limit],
                    "query_understanding": f"{rn1} ve {rn2}'nin birlikte oynadığı filmler.",
                    "ustad_line": f"{rn1} ile {rn2}'yi aynı karede buluşturan yapımlar — işte seçkim evlat.",
                    "intent": "multi_person",
                    "mode": "two_cast_discover",
                    "is_fallback": False,
                }
            # Ortak film yoksa: ilk oyuncunun filmografisine düş (boş ekran yerine)
            logger.info("[Confused] İki oyuncu ortak film yok (%s + %s), tekli akışa düşülüyor", rn1, rn2)
        except Exception as e:
            logger.warning("[Confused] Multi-person failed: %s", e)

    # ── PATH 2a: Yerel yönetmen/oyuncu tespiti → TMDB filmografisi ────────
    if local_intent.type == "director_recommendation" and local_intent.person_name:
        try:
            person_movies = await _search_person_movies_top(
                local_intent.person_name, "director", limit, min_vote, exclude_set,
                era_constraint=local_intent.era_constraint,
                genre_ids=local_intent.genres,
                time_constraint=local_intent.time_constraint)
            if person_movies:
                return {
                    "movies": person_movies[:limit],
                    "query_understanding": f"'{local_intent.person_name}' yönetmenliğindeki filmler.",
                    "ustad_line": f"Üstad {local_intent.person_name}'ın sinema evreninden bir seçki hazırladım.",
                    "intent": "director_filmography",
                    "mode": "local_director_search",
                    "is_fallback": False,
                }
        except Exception as e:
            logger.warning("[Confused] Director search failed: %s", e)

    elif local_intent.type == "actor_recommendation" and local_intent.person_name:
        try:
            person_movies = await _search_person_movies_top(
                local_intent.person_name, "actor", limit, min_vote, exclude_set,
                era_constraint=local_intent.era_constraint,
                genre_ids=local_intent.genres,
                time_constraint=local_intent.time_constraint)
            if person_movies:
                return {
                    "movies": person_movies[:limit],
                    "query_understanding": f"'{local_intent.person_name}' filmlerini arıyorsun.",
                    "ustad_line": f"'{local_intent.person_name}' performanslarından bir seçki hazırladım.",
                    "intent": "actor_filmography",
                    "mode": "local_actor_search",
                    "is_fallback": False,
                }
        except Exception as e:
            logger.warning("[Confused] Actor search failed: %s", e)

    # ── PATH 2b: "X gibi" → referansı YEREL korpustan çöz (tüm ~22K film) →
    #    TMDB recommendations/similar. 92-alias limiti yok; Türkçe-duyarlı eşleşme.
    # ── PATH 2a: Blend "X ile Y ortası" — iki referansın harmanı ──
    if (local_intent.type == "blend_movies" and local_intent.reference_title
            and getattr(local_intent, "reference_title2", None)):
        try:
            (s1, t1, g1), (s2, t2, g2) = await asyncio.gather(
                _resolve_reference_movie(local_intent.reference_title, text),
                _resolve_reference_movie(local_intent.reference_title2, text),
            )
            if s1 and s2:
                blend = await _build_blend_pool(s1, s2, g1, g2, t1, t2, limit, exclude_set)
                if blend:
                    return {
                        "movies": blend[:limit],
                        "query_understanding": f"'{t1}' ile '{t2}' ortası yapımlar.",
                        "ustad_line": f"'{t1}' ve '{t2}' sevenler için ortak bir seçki hazırladım evlat.",
                        "intent": "blend_movies",
                        "mode": "local_blend",
                        "is_fallback": False,
                    }
            elif s1 or s2:
                # Tek referans çözülebildiyse onu similar gibi işle
                _sid, _st, _sg = (s1, t1, g1) if s1 else (s2, t2, g2)
                bm = await _build_similar_pool(_sid, _st, _sg, limit, exclude_set)
                if bm:
                    return {
                        "movies": bm[:limit],
                        "query_understanding": f"'{_st}' filmine benzer yapımlar.",
                        "ustad_line": f"'{_st}' sevenler için bir seçki hazırladım evlat.",
                        "intent": "similar_to_movie",
                        "mode": "local_similar",
                        "is_fallback": False,
                    }
        except Exception as e:
            logger.warning("[Confused] Blend failed: %s", e)
        search_text = text

    if local_intent.type == "similar_to_movie" and local_intent.reference_title:
        try:
            src_id, src_title, src_genres = await _resolve_reference_movie(
                local_intent.reference_title, text)
            if src_id:
                sim_mod = getattr(local_intent, "similar_modifier", None)
                # Modifier varsa daha geniş havuz çek, sonra modifier'ı uygula
                pool_size = limit * 4 if sim_mod else limit
                sim_movies = await _build_similar_pool(
                    src_id, src_title, src_genres, pool_size, exclude_set)
                if sim_movies:
                    if sim_mod:
                        sim_movies = _apply_similar_modifier(sim_movies, sim_mod, limit)
                        _mod_tr = {
                            "newer": "daha yeni", "older": "daha eski",
                            "more_popular": "daha popüler", "less_known": "daha az bilinen",
                            "funnier": "daha komik", "darker": "daha karanlık",
                            "lighter": "daha hafif", "heavier": "daha ağır",
                            "scarier": "daha korkutucu", "romantic": "daha romantik",
                            "shorter": "daha kısa", "longer": "daha uzun",
                        }.get(sim_mod, sim_mod)
                        qu = f"'{local_intent.reference_title}' gibi ama {_mod_tr} yapımlar."
                    else:
                        qu = f"'{local_intent.reference_title}' filmine benzer yapımlar."
                    return {
                        "movies": sim_movies[:limit],
                        "query_understanding": qu,
                        "ustad_line": f"'{src_title}' sevenler için bir seçki hazırladım evlat.",
                        "intent": "similar_to_movie",
                        "mode": "local_similar",
                        "is_fallback": False,
                    }
        except Exception as e:
            logger.warning("[Confused] Similar (local) failed: %s", e)
        # Çözülemezse semantic'e düş (orijinal metni koru, entity boost çalışsın)
        search_text = text

    # ── Semantic search (yerel sentence-transformers, <35ms) ──────────────
    try:
        engine = ChatEngine(db=cache)
        result = await asyncio.wait_for(
            engine.process(
                text=search_text,
                limit=limit * 2,
                min_vote=min_vote,
                exclude_ids=exclude_ids,
            ),
            timeout=8.0,
        )
    except Exception as e:
        logger.warning("[Confused] Semantic search failed (%s), using rule fallback.", e)

    # Semantic sonuç boşsa üstad mesajını PATH 3'e taşı
    _fallback_ustad = ""
    if result and not result.get("movies"):
        _fallback_ustad = result.get("ustad_line", "")

    if result and result.get("movies"):
        movies = result["movies"]

        # Yerel genre exclusion: "korku olmasın" gibi olumsuzluk ifadelerini yakala
        text_lower = text.lower()
        excluded_genres = set()
        for genre_name, genre_ids_list in GENRE_KEYWORDS.items():
            if genre_name in text_lower:
                pos = text_lower.index(genre_name)
                before = text_lower[max(0, pos - 20):pos]
                if any(nw in before for nw in NEGATIVE_WORDS):
                    excluded_genres.update(genre_ids_list)
        if excluded_genres:
            movies = [m for m in movies
                      if not (set(m.get("genre_ids", [])) & excluded_genres)]

        # Yerel dönem kısıtlaması (min_year/max_year dict)
        era = _extract_era_constraint(text)
        if era:
            era_min = era.get("min_year")
            era_max = era.get("max_year")
            if era_min or era_max:
                def _year_ok(m):
                    y = _extract_year(m.get("release_date"))
                    if not y:
                        return True
                    if era_min and y < era_min:
                        return False
                    if era_max and y > era_max:
                        return False
                    return True
                movies = [m for m in movies if _year_ok(m)]

        # Yerel dil kısıtı: "kore korku", "japon animasyon", "fransız dram" →
        # original_language eşleşmeyenleri ele (yeterli sonuç kalıyorsa hard-filter).
        lang_filter = _detect_lang_filter(text)
        if lang_filter:
            lang_matched = [m for m in movies
                            if (m.get("original_language") or "").lower() == lang_filter]
            if len(lang_matched) >= 3:
                movies = lang_matched
            elif lang_matched:
                # Az ama var: eşleşenleri öne al, kalanları koru
                rest = [m for m in movies if m not in lang_matched]
                movies = lang_matched + rest

        # Hibrit harmanlama: %40 vektör + %40 metadata + %20 kalite
        ranked = _hybrid_rerank(movies, hints, limit)

        # Üstad'ın Gerekçesi'ni yakalanan amaca göre dinamikleştir
        dyn_reason = _dynamic_reason_from_hints(hints)
        if dyn_reason:
            for m in ranked:
                if not m.get("reason"):
                    m["reason"] = dyn_reason
        # Kullanıcı açıkça bir Doğu Asya dili istediyse o filmleri sona İTME
        # (aksi halde "kore korku" sonuçları en alta düşerdi).
        if lang_filter in _EAST_ASIAN_LANGS:
            from backend.mood_scoring import is_low_quality_asian
            result["movies"] = [m for m in ranked if not is_low_quality_asian(m)]
        else:
            result["movies"] = _sort_east_asian_to_end(ranked)
        result["mode"]   = "semantic_hybrid"
        result["is_fallback"] = False
        if local_intent.type not in ("mood_recommendation",):
            result["intent"] = local_intent.type
        return result

    # ── PATH 2.5: Saçma arama tespiti → Üstad reaksiyonu ──────────────────
    try:
        from backend.services.intent_enhancer import NonsenseHandler, MoodWeightEnhancer
        ns_mood_scores = MoodWeightEnhancer.score(text) if 'MoodWeightEnhancer' in dir() else {}
        if NonsenseHandler.is_nonsense(
            text, mood_scores=ns_mood_scores,
            genre_matches=getattr(hints, 'genre_ids', []),
            person_match=bool(local_intent.person_name),
            film_match=bool(local_intent.reference_title),
        ):
            ns = NonsenseHandler.generate_response(text)
            bypass = await _fast_mood_bypass(ns["mood_id"], limit, min_vote, exclude_ids, text)
            bypass["ustad_line"] = ns["ustad_line"]
            bypass["mode"] = ns["mode"]
            bypass["is_fallback"] = ns["is_fallback"]
            return bypass
    except Exception as exc:
        logger.debug("[NonsenseHandler] skipped: %s", exc)

    # ── PATH 3: Kural tabanlı fallback ───────────────────────────────────────
    fallback_result = await _confused_fallback(text, limit, min_vote, exclude_ids)
    # Semantic engine'in üstad mesajını koru (PATH 2'den taşındı)
    if _fallback_ustad and not fallback_result.get("ustad_line"):
        fallback_result["ustad_line"] = _fallback_ustad
    return fallback_result


@app.post("/api/recommend/mood-quiz", dependencies=[Depends(rate_limit_ai)])
async def post_mood_quiz_recommendation(req: MoodQuizRequest):
    """
    6-step mood quiz → vector-averaged semantic search.
    Accepts target mood tags, averages their pre-computed embedding prototypes,
    and returns the most semantically similar movies. Fully local, <100ms.
    """
    from backend.services.semantic_search import semantic_engine, GLOBAL_CACHE
    import numpy as np

    limit = max(3, min(req.limit, 12))
    min_vote = max(4.0, min(req.min_vote, 10.0))
    exclude_ids = set(int(x) for x in req.exclude_ids if str(x).isdigit()) if req.exclude_ids else set()

    if not req.targets or not semantic_engine.is_ready:
        return {"ok": False, "movies": [], "mode": "quiz_no_match", "targets": req.targets}

    # For each unique target tag, build a mood prototype vector by averaging
    # the embedding vectors of movies tagged with that mood.
    unique_targets = list(dict.fromkeys(req.targets))  # deduplicate, preserve order
    prototype_vectors = []

    for target in unique_targets:
        tmdb_ids = await cache.get_tmdb_ids_by_mood(target, limit=200)
        if not tmdb_ids:
            continue
        # Map tmdb_ids to matrix indices
        id_set = set(tmdb_ids)
        mask = np.isin(semantic_engine._tmdb_ids_np, list(id_set))
        if not mask.any():
            continue
        # Average the vectors of matching movies → mood prototype
        mood_vectors = semantic_engine._matrix[mask]
        prototype = mood_vectors.mean(axis=0)
        prototype_vectors.append(prototype)

    if not prototype_vectors:
        return {"ok": False, "movies": [], "mode": "quiz_no_match", "targets": req.targets}

    # Average all prototypes → final query vector
    query_vec = np.mean(prototype_vectors, axis=0).astype(np.float32)

    # Cosine similarity against full matrix
    if GLOBAL_CACHE.get("vectors") is not None:
        query_norm = np.linalg.norm(query_vec)
        if query_norm < 1e-10:
            return {"ok": False, "movies": [], "mode": "quiz_no_match", "targets": req.targets}
        dot = np.dot(GLOBAL_CACHE["vectors"], query_vec)
        scores = dot / (GLOBAL_CACHE["norms"] * query_norm + 1e-10)
    else:
        scores = semantic_engine._matrix @ query_vec

    # Vectorized filters
    if min_vote > 0 and semantic_engine._votes_np is not None:
        scores = np.where(semantic_engine._votes_np >= min_vote, scores, -1.0)
    if exclude_ids and semantic_engine._tmdb_ids_np is not None:
        exclude_arr = np.array(list(exclude_ids), dtype=np.int32)
        scores = np.where(~np.isin(semantic_engine._tmdb_ids_np, exclude_arr), scores, -1.0)

    scores = np.where(scores >= 0.38, scores, -1.0)

    # ─── Sipsak Runtime Bias ─────────────────────────────────────────────────
    if "sipsak" in req.targets and GLOBAL_CACHE.get("meta_list") is not None:
        meta_list = GLOBAL_CACHE["meta_list"]
        for idx in range(len(meta_list)):
            meta = meta_list[idx]
            runtime = meta.get("runtime") or meta.get("movie_runtime") or 0
            if runtime <= 0:
                overview = (meta.get("overview") or "").lower()
                # heuristic: kısa anlatımlı filmler muhtemelen kısadır
                if len(overview) < 200:
                    scores[idx] += 0.15
                continue
            if runtime <= 45:
                scores[idx] += 0.50  # Gerçek kısa film
            elif runtime <= 90:
                scores[idx] += 0.25  # Kompakt yapım
            elif runtime > 110:
                scores[idx] -= 0.30  # Uzun metraj — ceza

    pool_size = min(limit * 3, len(semantic_engine._tmdb_ids))
    if pool_size <= 0:
        return {"ok": False, "movies": [], "mode": "quiz_no_match", "targets": req.targets}

    top_idxs = np.argpartition(scores, -pool_size)[-pool_size:]
    top_idxs = top_idxs[np.argsort(scores[top_idxs])[::-1]]

    results = []
    for idx in top_idxs:
        if scores[idx] <= 0:
            break
        tmdb_id = int(semantic_engine._tmdb_ids_np[idx])
        meta = semantic_engine._meta.get(tmdb_id)
        if not meta:
            continue
        results.append(semantic_engine._build_slim_result(meta, float(scores[idx])))
        if len(results) >= limit:
            break

    if not results:
        return {"ok": False, "movies": [], "mode": "quiz_no_match", "targets": req.targets}

    # Count target occurrences to determine primary mood
    from collections import Counter
    target_counts = Counter(req.targets)
    primary_target = target_counts.most_common(1)[0][0]

    return {
        "ok": True,
        "movies": results,
        "primary_target": primary_target,
        "targets": req.targets,
        "mode": "quiz_vector_avg",
        "ustad_line": f"Anket sonuçlarına göre en uygun filmleri buldum evlat.",
    }



@app.post("/api/repository/purge-asian", dependencies=[Depends(verify_admin)])
async def purge_low_quality_asian_films(
    min_vote_average: float = Query(7.2, description="Asya filmi için min IMDb/TMDB puanı"),
    min_vote_count: int = Query(600, description="Asya filmi için min oy sayısı"),
):
    """Mevcut havuzdaki niş/obskür Doğu Asya filmlerini tek seferde temizler.
    Yalnız tanınmış + yüksek puanlı Asya filmleri (Parasite, Oldboy vb.) kalır."""
    result = await cache.purge_low_quality_asian(min_vote_average, min_vote_count)
    return {"success": True, **result}


# --- Movie Pool Expander ---

# Background expansion state
_expansion_task = None
_expansion_result = None

@app.post("/api/repository/expand-pool", dependencies=[Depends(verify_admin)])
async def expand_movie_pool(
    mood_id: str = Query(None, description="Belirli bir mood (opsiyonel, bos=bütün moodlar)"),
):
    """
    Multi-source TMDB film havuzu genisletici (background task).
    Hemen yanit doner, expansion arka planda calisir.
    /api/repository/expand-status ile durumu kontrol et.
    """
    global _expansion_task, _expansion_result

    if _expansion_task and not _expansion_task.done():
        return {"success": False, "error": "ALREADY_RUNNING", "message": "Bir expansion zaten çalışıyor. Lütfen bekleyin."}

    _expansion_result = None

    async def _run():
        global _expansion_result
        try:
            from backend.movie_pool_expander import expand_all_moods
            _expansion_result = await expand_all_moods(mood_filter=mood_id)
        except Exception as e:
            _expansion_result = {"success": False, "error": str(e), "message": "Expansion failed"}
            logger.error(f"Background expansion error: {e}")

    _expansion_task = asyncio.create_task(_run())

    return {
        "success": True,
        "message": f"Expansion başlatıldı (mood: {mood_id or 'all'}). Arka planda çalışıyor.",
        "check_status_at": "/api/repository/expand-status",
    }


@app.get("/api/repository/expand-status", dependencies=[Depends(verify_admin)])
async def expand_status():
    """Expansion durumunu kontrol et."""
    global _expansion_task, _expansion_result
    if _expansion_task and not _expansion_task.done():
        return {"success": True, "running": True, "message": "Expansion devam ediyor..."}
    if _expansion_result:
        return {"success": True, "running": False, "result": _expansion_result}
    return {"success": True, "running": False, "result": None, "message": "Henüz expansion başlatılmadı."}


# --- Zevk Haritasi (Taste Map) ---

MOOD_TEMPO = {"kalp": "slow", "sessiz": "slow", "gozyasi": "slow", "zamanyolcusu": "slow",
              "adrenalin": "fast", "kahkaha": "fast", "sipsak": "fast", "yolculuk": "medium",
              "gece": "medium", "zihin": "medium", "battaniye": "slow", "karmakar": "medium",
              "deep-chills": "slow", "askbahcesi": "medium", "kadraj-estetigi": "slow",
              "geceyarisi-itirafi": "slow"}

MOOD_ATMOSPHERE = {"gece": "dark", "deep-chills": "dark", "zihin": "dark", "karmakar": "dark",
                   "askbahcesi": "romantic", "gozyasi": "romantic", "kalp": "romantic", "battaniye": "romantic",
                   "kadraj-estetigi": "artistic", "geceyarisi-itirafi": "intimate"}

GENRE_NAMES_TR = {
    28: "Aksiyon", 12: "Macera", 16: "Animasyon", 35: "Komedi",
    80: "Suç", 99: "Belgesel", 18: "Drama", 10751: "Aile",
    14: "Fantastik", 36: "Tarih", 27: "Korku", 10402: "Müzik",
    9648: "Gizem", 10749: "Romantik", 878: "Bilim Kurgu",
    10752: "Savaş", 53: "Gerilim", 37: "Western", 10770: "TV Film",
}

MOOD_NAMES = {
    "battaniye": "Battaniye Modu", "yolculuk": "Yolculuk Ruhu", "gece": "Gece Kuşu",
    "kahkaha": "Kahkaha Molası", "gozyasi": "Gözyaşı Gecesi", "adrenalin": "Adrenalin Patlaması",
    "askbahcesi": "Aşk Bahçesi", "zamanyolcusu": "Zaman Yolcusu", "sessiz": "Sessiz Yolculuk",
    "zihin": "Zihin Savaşı", "kalp": "Kalbimin Sesi", "karmakar": "Karmaşakar",
    "sipsak": "Şipşak", "deep-chills": "Derin Ürperti",
    "kadraj-estetigi": "Kadraj Estetiği", "geceyarisi-itirafi": "Geceyarısı İtirafı",
}



@app.get("/api/user/taste-map", dependencies=[Depends(rate_limit_general)])
async def get_user_taste_map(request: Request):
    """
    Kullanicinin watchlist, future plans, notes verilerinden kisisel zevk profilini cikarir.
    AI/embedding cagrisi yapmaz — tamamen lokal, deterministic kurallar kullanir.
    Sonuc cache'lenir: bir sonraki sayfa yuklemesinde tekrar hesaplanmaz.
    Cache, kullanici listede degisiklik yaptiginda (on_list_change) otomatik temizlenir.
    """
    try:
        uid = optional_user_id(request)
        if uid is None:
            return {
                "dynamic_title": "Sinema Ruhu",
                "summary": [],
                "top_moods": [],
                "mood_pct": {},
                "mood_full": {},
                "top_genres": [],
                "era_preferences": {},
                "pacing_profile": {},
                "style_profile": {},
                "runtime_profile": {},
                "signals": {"total_movies": 0, "watchlist_count": 0, "future_count": 0, "notes_count": 0, "analyzed_count": 0},
                "confidence": "low",
            }

        # Cache-first: cached profile varsa ve guncelse direkt don
        cached = await cache.get_taste_profile(uid)
        if cached and cached.get("profile_data"):
            cached["profile_data"]["_cached"] = True
            cached["profile_data"]["_cached_at"] = cached.get("updated_at")
            return cached["profile_data"]

        # Hesapla ve cache'e yaz
        engine = TasteMapEngine(cache=cache, tmdb_service=tmdb_service)
        result = await engine.analyze(uid)
        if result.get("signals", {}).get("total_movies", 0) >= 3:
            try:
                await cache.save_taste_profile(uid, result)
            except Exception:
                pass  # Cache sorunu sessiz gec
        return result
    except Exception as e:
        logger.error(f"Taste map error: {e}")
        return {
            "dynamic_title": "Sinema Ruhu",
            "summary": [],
            "top_moods": [],
            "mood_pct": {},
            "mood_full": {},
            "top_genres": [],
            "era_preferences": {},
            "pacing_profile": {},
            "style_profile": {},
            "runtime_profile": {},
            "signals": {"total_movies": 0, "watchlist_count": 0, "future_count": 0, "notes_count": 0, "analyzed_count": 0},
            "confidence": "low",
            "error": str(e),
        }


@app.get("/api/movies/for-you", dependencies=[Depends(rate_limit_general)])
async def get_for_you(request: Request, limit: int = Query(18, ge=6, le=40)):
    """"Sana Özel" şeridi — kullanıcının zevk profiline göre kişisel film seçkisi.

    Tamamen deterministik/lokal (LLM yok): kullanıcının baskın moodlarından aday
    filmleri çeker, tür+mood örtüşmesine göre puanlar, ZATEN kaydedilenleri eler.
    Yetersiz sinyal (yeni kullanıcı) → boş + personalized:false.
    """
    try:
        uid = optional_user_id(request)
        if uid is None:
            return {"movies": [], "personalized": False}

        # Profil: cache-first, yoksa hesapla
        profile = None
        cached = await cache.get_taste_profile(uid)
        if cached and cached.get("profile_data"):
            profile = cached["profile_data"]
        else:
            engine = TasteMapEngine(cache=cache, tmdb_service=tmdb_service)
            profile = await engine.analyze(uid)
            if profile.get("signals", {}).get("total_movies", 0) >= 3:
                try:
                    await cache.save_taste_profile(uid, profile)
                except Exception:
                    pass

        if profile.get("signals", {}).get("total_movies", 0) < 3:
            return {"movies": [], "personalized": False}  # yetersiz sinyal

        # Zaten kaydedilen filmleri ele
        signals = await cache.get_user_movie_signals(uid)
        saved_ids = {tid for tid in signals.keys() if isinstance(tid, int)}

        # Baskın moodlardan aday topla
        top_moods = [m.get("mood_id") for m in profile.get("top_moods", [])[:3] if m.get("mood_id")]
        candidates = {}
        for mid in top_moods:
            try:
                rows = await cache.get_top_scored_movies_by_mood(mid, limit=40)
            except Exception:
                rows = []
            for mv in rows:
                if mv["id"] in saved_ids or mv["id"] in candidates:
                    continue
                mv["_mood_id"] = mid
                candidates[mv["id"]] = mv

        scored = [
            (score_movie_for_profile(profile, mv, mood_id=mv.get("_mood_id")), mv)
            for mv in candidates.values()
        ]
        scored.sort(key=lambda x: -x[0])

        out = []
        for s, mv in scored[:limit]:
            mv = {k: v for k, v in mv.items() if k != "_mood_id"}
            mv["match"] = max(60, min(99, round(s)))
            out.append(mv)
        return {"movies": out, "personalized": True}
    except Exception as e:
        raise _safe_http_500(e, "for-you")


# --- Audio Proxy (CC0 open-lofi müzikler + Pixabay fallback) ---

AUDIO_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "audio_files")

# Mood → uygun parça adları (open-lofi kataloğundan elle seçildi, duplicate yok)
# Her mood 4-6 benzersiz parça, mood karakterine ve genre etiketine en uygun sırada
# Kriter: her mood'un müzik türü (Lo-Fi, Synthwave, Funk, Cello, Orchestral, Ambient vb.) dosya adıyla uyumlu
MOOD_AUDIO_TRACKS = {
    # Lo-Fi & Coffee Shop Jazz — sıcak, rahat, kahve/çay/pijama hissi
    "battaniye":    ["butter-and-windowlight", "coffee-ring-notebook", "candlelit-at-70-bpm",
                     "honey-on-the-speakers", "first-coffee-thoughts", "grandmas-kitchen-on-sunday"],

    # Indie Folk & Akustik Gitar — yol, doğa, keşif, açık hava
    "yolculuk":     ["fieldnotes-at-dawn", "mist-over-green-fields", "hammock-in-the-shade",
                     "misty-mountain-sunrise", "warm-mile-markers", "first-light-on-the-ridge"],

    # Synthwave & Dark Ambient — gece, neon, şehir, gizem, uykusuzluk
    "gece":         ["streetlights-in-the-rearview", "blinds-and-headlights", "headlights-on-the-divider",
                     "midnight-on-my-mind", "rain-off-the-neon-signs", "dusk-between-stoops"],

    # Upbeat Funk & Swing — eğlenceli, ritmik, parti, kahkaha
    "kahkaha":      ["block-party-slow-jam", "basement-groove-86", "roller-rink-reverie",
                     "summer-curbside-glow", "rooftop-slow-jam", "sidewalk-slow-jam"],

    # Neoklasik Cello & Piyano — hüzün, duygu, katarsis, ağlayış
    "gozyasi":      ["ashes-in-the-coffee-cup", "candle-wax-heart", "old-photos-new-heart",
                     "rain-on-your-hoodie", "velvet-candle-smoke", "half-empty-coupe"],

    # Cinematic Orchestral — aksiyon, gerginlik, kovalamaca, savaş, kahramanlık
    # En yoğun, en güçlü, en sinematik parçalar — trailer müziği hissi
    "adrenalin":    ["thunder-in-the-dust", "storm-over-side-streets", "smoke-in-the-orange-sky",
                     "embers-after-midnight", "glow-on-the-overpass", "high-rise-haze"],

    # French Chanson & Soft Pop — romantik, sıcak, zarif, kelebek hissi
    "askbahcesi":   ["slow-dance-in-the-living-room", "lazy-love-letter-afternoon", 
                     "golden-afternoon-groove", "scattered-sheet-music", "barefoot-in-the-kitchen",
                     "slow-dancing-by-the-stove"],

    # Vintage Jazz & Gramofon — eski sinema, nostalji, klasik dönem
    "zamanyolcusu": ["dust-on-the-needle", "dusty-jukebox-heart", "record-player-embrace",
                     "stacks-of-quiet-books", "saxophone-in-the-rain", "winter-turntable"],

    # Ambient & Minimalist — sessizlik, meditasyon, içe dönüş yavaşlık
    "sessiz":       ["drifting-through-fog", "aurora-on-mute", "soft-weightless-hours",
                     "blue-below-the-surface", "cathedral-hiss", "orbiting-in-silence"],

    # Cinematic Tension & Puzzle — zihin oyunu, gerilimli strateji, puzzle
    "zihin":        ["brushstrokes-and-rain", "chapter-by-lamplight", "cursor-after-midnight",
                     "continue-screen-dreams", "dog-eared-pages", "margin-notes-at-dusk"],

    # Independent & Emotional — indie sinema, küçük derin hikayeler, samimiyet
    "kalp":         ["midnight-table-talk", "polaroids-in-a-shoebox", "kitchen-after-the-party",
                     "porcelain-heartbeat", "envelope-on-the-bed", "quiet-lungs-quiet-light"],

    # Surreal & Experimental — gerçeküstü, deneysel, rüya gibi, tuhaf
    # Daha yavaş, dreamy ve hipnotik parçalar — surreal atmosfer
    "karmakar":     ["drifting-through-fog", "underwater-dreamscape", "deep-space-loop",
                     "almost-floating", "moonlit-moss", "orbiting-in-silence"],

    # Quick & Compact — kısa filmler, vurucu kompakt başyapıtlar, hızlı sinematik vuruşlar
    "sipsak":       ["aurora-on-mute", "soft-weightless-hours", "blue-below-the-surface",
                     "orbiting-in-silence", "moonlit-moss", "drifting-through-fog"],

    # Slow-burn Atmospheric Tension — karanlık, ürperti, psikolojik gerilim, tedirginlik
    # Derin, rahatsız edici, yavaş yanan atmosferik parçalar — jumpscare DEĞİL
    "deep-chills":  ["antenna-after-midnight", "empty-street-static", "terminal-rain",
                     "moon-over-red-dunes", "velvet-cigarette-haze", "green-after-midnight"],

    # Minimalist Piano & Ambient Strings — sinematografi, estetik, görsel şölen, sanatsal kompozisyon
    # Sakin, zarif, zamansız parçalar — her kare bir tablo hissi
    "kadraj-estetigi": ["orbiting-in-silence", "aurora-on-mute", "soft-weightless-hours",
                        "blue-below-the-surface", "cathedral-hiss", "drifting-through-fog"],

    # Soft Jazz Piano & Lo-fi Brush Drums — gece yarısı, derin sohbet, samimi itiraf, varoluşsal sorgulama
    # Sıcak, alçak sesli, davetkar parçalar — gece yarısı mutfak sohbeti hissi
    "geceyarisi-itirafi": ["midnight-table-talk", "polaroids-in-a-shoebox", "kitchen-after-the-party",
                           "porcelain-heartbeat", "envelope-on-the-bed", "quiet-lungs-quiet-light"],
}

# Mood Duygusal Profilleri ve Keyword Skorlama (MP3 dosya adlarına göre optimize edildi)
MOOD_AUDIO_PROFILES = {
    "battaniye": {
        "positive": ["butter", "windowlight", "coffee", "candle", "honey", "speakers", "warm", "kitchen", "sunday", "first-coffee", "home", "cozy"],
        "negative": ["thunder", "storm", "ghost", "chase", "battle", "intense", "horror"]
    },
    "yolculuk": {
        "positive": ["dawn", "field", "mist", "mountain", "sunrise", "ridge", "mile", "markers", "hammock", "shade", "breeze", "road"],
        "negative": ["ghost", "midnight", "candle", "party", "basement", "tears"]
    },
    "gece": {
        "positive": ["streetlight", "headlights", "divider", "midnight", "neon", "rain-off", "dusk", "stoops", "night"],
        "negative": ["sunny", "cozy", "love", "butter", "honey", "groove"]
    },
    "kahkaha": {
        "positive": ["block-party", "slow-jam", "basement", "groove", "roller", "rink", "summer", "curbside", "rooftop", "sidewalk", "bounce", "funk"],
        "negative": ["ghost", "tears", "rain", "candle", "storm", "heartbreak", "midnight"]
    },
    "gozyasi": {
        "positive": ["ashes", "coffee-cup", "candle", "wax", "old-photos", "heart", "rain", "hoodie", "velvet", "smoke", "half-empty", "coupe"],
        "negative": ["party", "groove", "thunder", "bounce", "summer", "fun"]
    },
    "adrenalin": {
        "positive": ["thunder", "storm", "smoke", "glow", "overpass", "high-rise", "haze",
                     "dust", "red", "earth", "orange", "sky", "pulse", "fire", "blaze", "tension", "drive"],
        "negative": ["soft", "cozy", "candle", "slow-dance", "polaroid", "lullaby", "quiet", "gentle",
                     "coffee", "morning", "watercolor", "kitchen", "aurora", "fog", "cathedral",
                     "weightless", "silence", "mute", "floating", "lace", "groove", "bounce", "bass"]
    },
    "askbahcesi": {
        "positive": ["slow-dance", "living-room", "love", "letter", "golden", "afternoon", "sheet", "music", "barefoot", "kitchen", "stove"],
        "negative": ["thunder", "storm", "ghost", "chase", "block-party", "funk"]
    },
    "zamanyolcusu": {
        "positive": ["dust", "needle", "jukebox", "record", "embrace", "stacks", "books", "saxophone", "rain", "winter", "turntable", "vintage"],
        "negative": ["neon", "cyber", "funk", "basement", "bounce", "arcade"]
    },
    "sessiz": {
        "positive": ["drifting", "fog", "aurora", "mute", "soft", "weightless", "blue", "surface", "cathedral", "hiss", "orbiting", "silence"],
        "negative": ["party", "thunder", "groove", "bounce", "battle", "fire"]
    },
    "zihin": {
        "positive": ["brushstrokes", "chapter", "lamplight", "cursor", "midnight", "continue", "screen", "dreams", "dog-eared", "pages", "margin-notes", "dusk"],
        "negative": ["party", "love", "cozy", "fun", "comedy", "slow-dance"]
    },
    "kalp": {
        "positive": ["midnight-table", "table-talk", "polaroids", "shoebox", "kitchen", "porcelain", "heartbeat", "envelope", "bed", "quiet", "lungs", "light"],
        "negative": ["thunder", "storm", "epic", "party", "neon", "chase"]
    },
    "karmakar": {
        "positive": ["drifting", "fog", "underwater", "dreamscape", "deep-space", "loop", "almost", "floating", "moonlit", "moss", "orbiting", "silence", "ghost", "stained-glass"],
        "negative": ["love-letter", "slow-dance", "sunny", "groove", "block-party", "coffee", "golden", "summer"]
    },
    "sipsak": {
        "positive": ["aurora", "mute", "weightless", "blue", "surface", "orbiting", "silence", "moonlit", "moss", "drifting", "fog", "soft", "lullaby", "gentle", "minimal"],
        "negative": ["thunder", "epic", "battle", "orchestral", "choir"]
    },
    "deep-chills": {
        "positive": ["antenna", "midnight", "empty-street", "static", "terminal", "rain", "moon", "dunes", "velvet", "cigarette", "haze", "green", "after-midnight"],
        "negative": ["love", "golden", "cozy", "party", "groove", "summer", "honey", "butter"]
    },
    "kadraj-estetigi": {
        "positive": ["orbiting", "silence", "aurora", "mute", "weightless", "blue", "surface", "cathedral", "hiss", "drifting", "fog", "soft"],
        "negative": ["thunder", "party", "groove", "bass", "bounce", "aggressive"]
    },
    "geceyarisi-itirafi": {
        "positive": ["midnight-table", "table-talk", "polaroids", "shoebox", "kitchen", "porcelain", "heartbeat", "envelope", "bed", "quiet", "lungs", "light"],
        "negative": ["thunder", "storm", "epic", "neon", "chase", "action"]
    }
}

def _find_audio(mood_id: str):
    """
    Finds the best matching audio file for the given mood using preferred tracks and keyword scoring.
    Returns: (file_path, reason, score, matched_keywords)
    """
    AUDIO_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "audio_files")
    if not os.path.exists(AUDIO_DIR):
        return None, "AUDIO_DIR_NOT_FOUND", 0, []
    
    all_mp3s = []
    for root, dirs, files in os.walk(AUDIO_DIR):
        for f in files:
            if f.lower().endswith('.mp3'):
                all_mp3s.append(os.path.join(root, f))
    
    if not all_mp3s:
        return None, "NO_MP3_FILES_FOUND", 0, []

    mood_id = _normalize_mood_id(mood_id)
    preferred = MOOD_AUDIO_TRACKS.get(mood_id, [])
    profile = MOOD_AUDIO_PROFILES.get(mood_id, {})
    pos_keywords = profile.get("positive", [])
    neg_keywords = profile.get("negative", [])

    # Build set of preferred tracks already assigned to other moods (anti-duplicate)
    other_preferred = set()
    for mid, tracks in MOOD_AUDIO_TRACKS.items():
        if _normalize_mood_id(mid) != mood_id:
            for t in tracks:
                other_preferred.add(t.lower())

    candidates = []
    for path in all_mp3s:
        fname = os.path.basename(path).lower()
        fname_stem = fname.replace('.mp3', '')
        score = 0
        matched = []

        # 1. Preferred tracks (highest priority, earlier = higher bonus)
        for idx, pref in enumerate(preferred):
            if pref.lower() in fname:
                order_bonus = max(0, 30 - idx * 5)  # 1st: +30, 2nd: +25, 3rd: +20, ...
                score += 200 + order_bonus
                matched.append(f"pref:{pref}")
                break
        
        # 2. Keyword matches (lower weight than preferred)
        for p_key in pos_keywords:
            if len(p_key) > 6 and p_key.lower().replace('-', ' ') in fname_stem.replace('-', ' '):
                score += 15
                if p_key not in matched:
                    matched.append(p_key)
            elif p_key.lower() in fname:
                score += 8
                if p_key not in matched:
                    matched.append(p_key)
        
        # 3. Negative keywords (penalty)
        for n_key in neg_keywords:
            if n_key.lower() in fname:
                score -= 30
        
        # 4. Anti-duplicate penalty: track is preferred for another mood
        if fname_stem in other_preferred:
            score -= 15
        
        if score > 0:
            candidates.append((score, path, matched))

    if candidates:
        candidates.sort(key=lambda x: -x[0])
        best_score, best_path, best_matched = candidates[0]
        
        if best_score >= 100:
            reason = f"preferred: {os.path.basename(best_path)}"
        elif best_score >= 40:
            reason = f"keyword_match ({best_score}p): {os.path.basename(best_path)}"
        else:
            reason = f"weak_match ({best_score}p): {os.path.basename(best_path)}"
        return best_path, reason, best_score, best_matched
    
    # Ultimate fallback
    if all_mp3s:
        return all_mp3s[0], f"fallback: {os.path.basename(all_mp3s[0])}", 0, []
    
    return None, "NO_MATCH_FOUND", 0, []

MOOD_AUDIO_URLS = {
    "battaniye": "https://cdn.pixabay.com/audio/2024/09/10/audio_6e5d7d1db1.mp3",
    "yolculuk": "https://cdn.pixabay.com/audio/2022/01/18/audio_d0a13f69d2.mp3",
    "gece": "https://cdn.pixabay.com/audio/2023/07/07/audio_34cea2adf1.mp3",
    "kahkaha": "https://cdn.pixabay.com/audio/2024/09/24/audio_8e1f0ab42a.mp3",
    "gozyasi": "https://cdn.pixabay.com/audio/2023/10/02/audio_3bbf037e6a.mp3",
    "adrenalin": "https://cdn.pixabay.com/audio/2022/10/09/audio_39e0e70bca.mp3",
    "askbahcesi": "https://cdn.pixabay.com/audio/2023/09/06/audio_13fae70fd0.mp3",
    "zamanyolcusu": "https://cdn.pixabay.com/audio/2022/02/22/audio_d1718ab41b.mp3",
    "sessiz": "https://cdn.pixabay.com/audio/2022/10/25/audio_1e6d7b7e42.mp3",
    "zihin": "https://cdn.pixabay.com/audio/2022/03/09/audio_65a70e1ef3.mp3",
    "kalp": "https://cdn.pixabay.com/audio/2023/06/12/audio_ba5e3a3f59.mp3",
    "karmakar": "https://cdn.pixabay.com/audio/2022/08/02/audio_8c8b08c8c4.mp3",
    "sipsak": "https://cdn.pixabay.com/audio/2022/10/25/audio_1e6d7b7e42.mp3",
    "deep-chills": "https://cdn.pixabay.com/audio/2023/07/07/audio_34cea2adf1.mp3",
    "kadraj-estetigi": "https://cdn.pixabay.com/audio/2022/10/25/audio_1e6d7b7e42.mp3",
    "geceyarisi-itirafi": "https://cdn.pixabay.com/audio/2023/06/12/audio_ba5e3a3f59.mp3",
}

@app.get("/api/audio/debug")
async def audio_debug():
    """Debug info for audio files with scoring details."""
    AUDIO_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "audio_files")
    exists = os.path.exists(AUDIO_DIR)
    all_mp3s = []
    if exists:
        for root, dirs, files in os.walk(AUDIO_DIR):
            for f in files:
                if f.lower().endswith('.mp3'):
                    all_mp3s.append(os.path.relpath(os.path.join(root, f), AUDIO_DIR))
    
    mood_map = {}
    file_usage = {}
    for mid in MOOD_ID_LABELS.keys():
        found, reason, score, keywords = _find_audio(mid)
        fname = os.path.basename(found) if found else None
        
        mood_map[mid] = {
            "selected_file": fname,
            "reason": reason,
            "score": score,
            "matched_keywords": keywords
        }

        if fname:
            if fname not in file_usage:
                file_usage[fname] = []
            file_usage[fname].append(mid)

    duplicates = {fname: moods for fname, moods in file_usage.items() if len(moods) > 1}

    return {
        "audio_dir": AUDIO_DIR,
        "exists": exists,
        "mp3_count": len(all_mp3s),
        "moods": mood_map,
        "duplicates": duplicates,
        "sample_files": all_mp3s[:10]
    }

@app.get("/api/audio/{mood_id}", dependencies=[Depends(rate_limit_general)])
async def stream_audio(mood_id: str):
    """Önce lokal CC0 open-lofi dosyası, yoksa Pixabay proxy ile dene."""
    if mood_id == "debug":
        return await audio_debug()

    # 0) Normalize mood id
    normalized = _normalize_mood_id(mood_id)
    logger.info(f"[MoodAudio] requested: {mood_id} normalized: {normalized}")

    # 1) Try local file recursively
    local, reason, score, kws = _find_audio(normalized)
    if local:
        logger.info(f"[MoodAudio] playing local: {os.path.basename(local)} for {normalized} (Reason: {reason})")
        from fastapi.responses import FileResponse
        return FileResponse(
            local, media_type="audio/mpeg",
            headers={
                "Cache-Control": "public, max-age=86400", 
                "Accept-Ranges": "bytes"
            },
        )

    # 2) Fallback: Pixabay proxy
    url = MOOD_AUDIO_URLS.get(normalized)
    if not url:
        logger.warning(f"[MoodAudio] play failed: No URL for {normalized}")
        raise HTTPException(status_code=404, detail=f"'{normalized}' için ses dosyası bulunamadı")

    # Browser redirect — tarayıcı Pixabay'a doğrudan bağlanır (server proxy'si 403 alıyordu)
    logger.info(f"[MoodAudio] redirecting to URL: {url}")
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url=url, status_code=302)

# NOT: Modern tarayıcılar etkileşim olmadan ses çalmayı engelleyebilir.
# Frontend'de Audio.play() çağrısı bir tıklama aksiyonu içerisinde yapılmalıdır.

# ─────────────────────────────────────────────────────────────
# FILM LİSTELERİ — Küratöryel koleksiyonlar
# ─────────────────────────────────────────────────────────────

_LISTS_DATA = None

def _load_lists():
    global _LISTS_DATA
    if _LISTS_DATA is None:
        lists_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "lists.json")
        import json
        with open(lists_path, encoding="utf-8") as f:
            _LISTS_DATA = json.load(f)
    return _LISTS_DATA


@app.get("/api/lists", dependencies=[Depends(rate_limit_general)])
async def get_all_lists():
    """Tüm küratöryel listeleri döndür (filmler olmadan)."""
    lists = _load_lists()
    return [
        {k: v for k, v in lst.items() if k != "tmdb_ids"}
        for lst in lists
    ]


def _is_valid_list_movie(movie: dict, language_filter: str = None) -> bool:
    """Bir filmin listede gösterilmeye uygun olup olmadığını kontrol eder."""
    # Başlık kontrolü
    title = (movie.get("title") or "").strip()
    if not title or title in ("—", "-", "N/A", "Unknown"):
        return False
    # Puan kontrolü — 0 veya tanımsız filmleri filtrele
    vote = movie.get("vote_average")
    if vote is None or vote < 0.5:
        return False
    # Dil filtresi
    if language_filter:
        orig_lang = movie.get("original_language", "")
        if orig_lang and orig_lang != language_filter:
            return False
    return True


def _build_movie_entry(raw: dict, fallback_id: int = None) -> dict:
    """Ham TMDB/cache verisinden temiz bir film dict'i oluşturur."""
    mid = raw.get("id") or fallback_id
    poster = raw.get("poster_url")
    if not poster and raw.get("poster_path"):
        poster = f"https://image.tmdb.org/t/p/w500{raw['poster_path']}"
    return {
        "id": mid,
        "title": (raw.get("title") or "").strip(),
        "original_title": raw.get("original_title", ""),
        "original_language": raw.get("original_language", ""),
        "poster_url": poster,
        "release_date": raw.get("release_date", ""),
        "vote_average": raw.get("vote_average"),
        "mood": raw.get("mood"),
        "ai_analysis": raw.get("ai_analysis"),
        "director": raw.get("director"),
        "overview": raw.get("overview", ""),
    }


@app.get("/api/lists/{slug}", dependencies=[Depends(rate_limit_general)])
async def get_list_detail(slug: str):
    """Tek bir listenin detayı + filmlerin TMDB verileri.

    Üç katmanlı strateji:
    1. Liste'deki tmdb_ids → cache veya TMDB'den çek, dil/puan filtrele
    2. Eğer yeterli film bulunamazsa → TMDB discover ile dil/tür filtresi uygula
    3. Discover da yetersizse → static_fallback listesini kullan
    """
    lists = _load_lists()
    lst = next((l for l in lists if l["slug"] == slug), None)
    if not lst:
        raise HTTPException(status_code=404, detail="Liste bulunamadı")

    filters = lst.get("filters", {})
    language_filter = filters.get("with_original_language")
    director_id = filters.get("director_tmdb_id")
    static_fallback = lst.get("static_fallback", [])
    MIN_MOVIES = 5  # bu kadardan az film kalırsa fallback devreye girer

    movies = []
    seen_ids = set()

    async def _fetch_one(tmdb_id: int) -> dict | None:
        try:
            cached = await cache.get_movie(tmdb_id)
            if cached:
                return _build_movie_entry(cached, tmdb_id)
            # Cache'de yok → TMDB'den çek
            details = await asyncio.wait_for(
                tmdb_service.get_movie_details(tmdb_id), timeout=5.0
            )
            if details:
                return _build_movie_entry(details, tmdb_id)
        except Exception as e:
            logger.warning(f"[Lists] tmdb_id={tmdb_id} fetch failed: {e}")
        return None

    async def _resolve_by_title(title: str, year=None) -> dict | None:
        """Bir filmi başlık (+yıl) ile TMDB'de arayıp en iyi eşleşmeyi döndürür.

        Elle girilen ID'ler hatalı olabilir (kanıtlanmış sorun); başlık araması
        küratöryel listeler için en güvenilir çözüm — "Kış Uykusu 2014" daima
        doğru filmi bulur, ID ne olursa olsun.
        """
        try:
            results = await asyncio.wait_for(
                tmdb_service.search_movies(title), timeout=5.0
            )
            if not results:
                return None
            norm = lambda s: "".join(ch.lower() for ch in (s or "") if ch.isalnum())
            want = norm(title)
            best, best_score = None, -1
            for r in results[:8]:
                rt = norm(r.get("title"))
                ro = norm(r.get("original_title"))
                ry = (r.get("release_date") or "")[:4]
                score = 0
                if want and (want == rt or want == ro):
                    score += 100
                elif want and (want in rt or want in ro or rt in want or ro in want):
                    score += 50
                # Yıl güçlü bir ayırt edici: aynı isimli eski filmlerin doğru
                # yılı ezmesini engelle (örn. "Parasite 2019" vs "Parasite 1982").
                if year and ry:
                    try:
                        dy = abs(int(ry) - int(year))
                        if dy <= 1:
                            score += 60
                        elif dy >= 3:
                            score -= 70
                    except ValueError:
                        pass
                score += min((r.get("vote_count", 0) or 0) / 500.0, 10)
                if score > best_score:
                    best_score, best = score, r
            if best and best_score >= 40:
                return _build_movie_entry(best, best.get("id"))
        except Exception as e:
            logger.warning(f"[Lists] title resolve '{title}' failed: {e}")
        return None

    # ─── KATMAN 0a: Küratöryel statik liste (Türk sineması vb.) ──
    # static_fallback varsa bu, listenin OTORİTER kaynağıdır. Her filmi
    # başlık+yıl ile aratıp doğru TMDB kaydını buluruz — yanlış ID sorunu biter.
    if static_fallback:
        resolve_tasks = [
            _resolve_by_title(fb.get("title", ""), fb.get("year"))
            for fb in static_fallback
        ]
        resolved = await asyncio.gather(*resolve_tasks, return_exceptions=True)
        for i, item in enumerate(resolved):
            fb_meta = static_fallback[i] if i < len(static_fallback) else {}
            if isinstance(item, dict) and item.get("id") and item["id"] not in seen_ids:
                seen_ids.add(item["id"])
                if not item.get("director") and fb_meta.get("director"):
                    item["director"] = fb_meta["director"]
                if fb_meta.get("award"):
                    item["award"] = fb_meta["award"]   # ödül etiketi (örn. "En İyi Film · 2024")
                movies.append(item)
            elif fb_meta.get("tmdb_id") and fb_meta["tmdb_id"] not in seen_ids:
                # Arama da başarısız → ID ile dene, o da olmazsa meta ile bas
                got = await _fetch_one(fb_meta["tmdb_id"])
                if isinstance(got, dict) and got.get("id"):
                    seen_ids.add(got["id"])
                    if fb_meta.get("award"):
                        got["award"] = fb_meta["award"]
                    movies.append(got)
                else:
                    seen_ids.add(fb_meta["tmdb_id"])
                    movies.append({
                        "id": fb_meta["tmdb_id"],
                        "title": fb_meta.get("title", ""),
                        "original_language": language_filter or "",
                        "poster_url": None,
                        "release_date": str(fb_meta.get("year", "")),
                        "vote_average": None,
                        "director": fb_meta.get("director"),
                        "award": fb_meta.get("award"),
                        "mood": None, "ai_analysis": None, "overview": "",
                    })
        # Statik liste otoriter olduğu için diğer katmanları atla
        movies = [
            m for m in movies
            if (m.get("title") or "").strip() and m.get("title") not in ("—", "-")
        ]
        final_movies, final_ids = [], set()
        for m in movies:
            if m["id"] not in final_ids:
                final_ids.add(m["id"])
                final_movies.append(m)
        response_lst = {k: v for k, v in lst.items() if k not in ("static_fallback",)}
        return {**response_lst, "movies": final_movies}

    # ─── KATMAN 0: Yönetmen listesi → TMDB resmi filmografisi ──
    # En güvenilir kaynak: elle ID girmek hatalı (Nolan listesine The Departed
    # girmiş gibi). director_tmdb_id varsa o yönetmenin GERÇEK yönettiği
    # filmleri TMDB'den çekeriz — liste %100 listenin tanımıyla uyumlu olur.
    if director_id:
        try:
            directed = await asyncio.wait_for(
                tmdb_service.get_director_filmography(director_id, limit=12, min_vote_count=80),
                timeout=8.0,
            )
            for m in directed:
                mid = m.get("id")
                if mid and mid not in seen_ids and _is_valid_list_movie(m):
                    seen_ids.add(mid)
                    movies.append(_build_movie_entry(m, mid))
        except Exception as e:
            logger.warning(f"[Lists] director filmography failed for {slug}: {e}")

    # ─── KATMAN 1: Tanımlı tmdb_ids'den filmleri çek ───────────
    if len(movies) < MIN_MOVIES:
        fetch_tasks = [_fetch_one(tid) for tid in lst.get("tmdb_ids", []) if tid not in seen_ids]
        fetch_results = await asyncio.gather(*fetch_tasks, return_exceptions=True)

        for item in fetch_results:
            if isinstance(item, dict) and item.get("id"):
                if item["id"] not in seen_ids and _is_valid_list_movie(item, language_filter):
                    seen_ids.add(item["id"])
                    movies.append(item)

    # ─── KATMAN 2: Yetersiz film → TMDB discover ile doldur ────
    if len(movies) < MIN_MOVIES and language_filter:
        logger.info(f"[Lists] {slug}: only {len(movies)} valid movies, trying discover ({language_filter})")
        try:
            discover_result = await asyncio.wait_for(
                tmdb_service.discover_movies(
                    genre_ids=[],
                    with_original_language=language_filter,
                    min_vote_average=6.0,
                    min_vote_count=200,
                    sort_by="vote_average.desc",
                    page=1,
                ),
                timeout=8.0,
            )
            for m in discover_result.get("movies", []):
                mid = m.get("id")
                if mid and mid not in seen_ids and _is_valid_list_movie(m, language_filter):
                    seen_ids.add(mid)
                    movies.append(_build_movie_entry(m, mid))
                    if len(movies) >= 10:
                        break
        except Exception as e:
            logger.warning(f"[Lists] Discover fallback failed for {slug}: {e}")

    # ─── KATMAN 3: Hâlâ yetersizse → static_fallback ──────────
    if len(movies) < MIN_MOVIES and static_fallback:
        logger.info(f"[Lists] {slug}: using static_fallback ({len(static_fallback)} items)")
        fallback_ids = [fb["tmdb_id"] for fb in static_fallback if fb.get("tmdb_id") and fb["tmdb_id"] not in seen_ids]
        fallback_tasks = [_fetch_one(tid) for tid in fallback_ids]
        fallback_results = await asyncio.gather(*fallback_tasks, return_exceptions=True)

        for i, item in enumerate(fallback_results):
            fb_meta = static_fallback[i] if i < len(static_fallback) else {}
            if isinstance(item, dict) and item.get("id"):
                if item["id"] not in seen_ids:
                    seen_ids.add(item["id"])
                    # Eğer dil filtresi var ama film geçemiyorsa static meta ile ekle (Türk filmleri bazen TMDB'de dil eksik)
                    movies.append(item)
            elif fb_meta.get("tmdb_id") and fb_meta["tmdb_id"] not in seen_ids:
                # TMDB'den çekme başarısız → static meta'dan oluştur
                seen_ids.add(fb_meta["tmdb_id"])
                movies.append({
                    "id": fb_meta["tmdb_id"],
                    "title": fb_meta.get("title", ""),
                    "original_language": language_filter or "",
                    "poster_url": None,
                    "release_date": str(fb_meta.get("year", "")),
                    "vote_average": None,
                    "director": fb_meta.get("director"),
                    "mood": None,
                    "ai_analysis": None,
                    "overview": "",
                })

    # ─── Son temizlik: sıfır puan + başlıksız filmler ──────────
    movies = [
        m for m in movies
        if (m.get("title") or "").strip() and m.get("title") not in ("—", "-")
        and (m.get("vote_average") is None or m.get("vote_average", 0) >= 0.5)
    ]

    # Duplicate ID koruması
    final_movies = []
    final_ids = set()
    for m in movies:
        if m["id"] not in final_ids:
            final_ids.add(m["id"])
            final_movies.append(m)

    # static_fallback alanını response'a dahil etme (frontend gereksiz veri almasın)
    response_lst = {k: v for k, v in lst.items() if k not in ("static_fallback",)}
    return {**response_lst, "movies": final_movies}


# ─────────────────────────────────────────────────────────────
# ÖDÜL TAKVİMİ — bugün/yakında verilen ödüller (banner + push)
# ─────────────────────────────────────────────────────────────
def _awards_matching(simulate: str = None, window_days: int = 3) -> list:
    """award_date'i bugüne (±window) denk gelen listeleri döndürür.
    simulate: 'MM-DD' verilirse o tarihi bugünmüş gibi kabul eder (test)."""
    from datetime import datetime as _dt, date as _date
    if simulate:
        try:
            mm, dd = simulate.split("-")
            today = _date(_dt.utcnow().year, int(mm), int(dd))
        except Exception:
            today = _dt.utcnow().date()
    else:
        today = _dt.utcnow().date()

    out = []
    for lst in _load_lists():
        ad = lst.get("award_date")
        if not ad:
            continue
        try:
            mm, dd = ad.split("-")
            adate = _date(today.year, int(mm), int(dd))
        except Exception:
            continue
        delta = (adate - today).days
        # Yıl dönümü kenarı (Ara/Oca) için ±window içinde mi bak
        if abs(delta) > 180:
            delta = delta - 365 if delta > 0 else delta + 365
        if delta == 0:
            status = "today"
        elif 0 < delta <= window_days:
            status = "soon"
        else:
            continue
        out.append({
            "slug": lst["slug"],
            "title": lst.get("title", ""),
            "badge": lst.get("badge", ""),
            "ceremony": lst.get("ceremony", lst.get("title", "")),
            "status": status,
            "days_until": delta,
        })
    # "today" önce
    out.sort(key=lambda x: (x["status"] != "today", x["days_until"]))
    return out


@app.get("/api/awards/today", dependencies=[Depends(rate_limit_general)])
async def get_awards_today(simulate: str = Query(None, description="Test için MM-DD")):
    """Bugün veya yakında (±3 gün) töreni olan ödül listeleri (uygulama içi banner)."""
    return {"awards": _awards_matching(simulate=simulate)}


# ─────────────────────────────────────────────────────────────
# FİLM PAYLAŞIM SAYFASI — OG meta tag'lı HTML
# ─────────────────────────────────────────────────────────────

_DEFAULT_OG_IMAGE = f"{FRONTEND_BASE_URL}/sinemod-mark.png"


def _render_og_page(title: str, description: str, image: str, redirect_url: str) -> str:
    """OG/Twitter meta'lı, crawler-dostu + insanı SPA'ya yönlendiren ince HTML."""
    safe_title = html.escape(title)
    safe_desc = html.escape(description)
    safe_image = html.escape(image)
    safe_redirect = html.escape(redirect_url)
    return f"""<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{safe_title}</title>
  <meta name="description" content="{safe_desc}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="{safe_title}">
  <meta property="og:description" content="{safe_desc}">
  <meta property="og:image" content="{safe_image}">
  <meta property="og:url" content="{safe_redirect}">
  <meta property="og:site_name" content="Sinemood">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{safe_title}">
  <meta name="twitter:description" content="{safe_desc}">
  <meta name="twitter:image" content="{safe_image}">
  <meta http-equiv="refresh" content="0;url={safe_redirect}">
  <link rel="canonical" href="{safe_redirect}">
  <style>
    body {{ background: #120d0b; color: #f5f0e8; font-family: serif; display: flex;
            align-items: center; justify-content: center; min-height: 100vh; margin: 0; }}
    p {{ opacity: 0.5; font-style: italic; }}
  </style>
</head>
<body>
  <p>Yönlendiriliyorsunuz...</p>
  <script>window.location.replace("{safe_redirect}")</script>
</body>
</html>"""


@app.get("/share/{movie_id}", response_class=HTMLResponse)
async def share_movie_page(movie_id: int):
    """Film paylaşım sayfası — OG meta tag'larıyla önizleme."""
    title = "Film Eleştirmeni"
    description = "Ruh haline göre yapay zeka destekli film keşif platformu."
    poster = _DEFAULT_OG_IMAGE

    try:
        cached = await cache.get_movie(movie_id)
        if cached:
            title = f"{cached.get('title', 'Film')} — Üstad Öneriyor"
            raw_analysis = cached.get("ai_analysis") or ""
            clean = raw_analysis.replace("Üstadın Notu:", "").strip()
            description = clean[:160] if clean else description
            poster = cached.get("poster_url") or poster
    except Exception:
        pass

    redirect_url = f"{FRONTEND_BASE_URL}/?film={movie_id}"
    return HTMLResponse(content=_render_og_page(title, description, poster, redirect_url))


@app.get("/share/u/{username}", response_class=HTMLResponse)
async def share_profile_page(username: str, request: Request):
    """Herkese açık profil paylaşım sayfası — kişiye özel OG önizlemesi.

    Crawler (WhatsApp/X/Telegram) buraya gelir → kişiselleştirilmiş kart görür.
    İnsan → gerçek SPA profiline (`/u/{username}`) yönlendirilir.
    """
    title = "Sinemood Profili"
    description = "Sinema zevkini keşfet — Sinemood'da ruh haline göre film bul."
    image = _DEFAULT_OG_IMAGE

    try:
        info = await cache.get_user_by_username(username)
        if info:
            uid = info["id"]
            display = info.get("name") or info.get("username") or username
            title = f"{display} — Sinema Zevki | Sinemood"

            try:
                watchlist = await cache.get_watchlist(uid)
            except Exception:
                watchlist = []
            watched_n = sum(1 for m in watchlist if m.get("watched"))
            saved_n = len(watchlist)

            taste_desc = ""
            try:
                prof = await cache.get_taste_profile(uid)
                tm = (prof or {}).get("profile_data") or {}
                top = tm.get("top_genres") or tm.get("genres") or []
                names = [g.get("name") if isinstance(g, dict) else g for g in top[:3]]
                names = [n for n in names if n]
                if names:
                    taste_desc = " · ".join(names)
            except Exception:
                pass

            bits = []
            if taste_desc:
                bits.append(taste_desc)
            bits.append(f"{watched_n} izlenen, {saved_n} listede")
            description = f"{display}'in sinema zevki: " + " — ".join(bits) + ". Sen de keşfet."

            if info.get("picture"):
                base = str(request.base_url).rstrip("/")
                image = f"{base}/api/users/{uid}/avatar"
    except Exception:
        pass

    redirect_url = f"{FRONTEND_BASE_URL}/u/{username}"
    return HTMLResponse(content=_render_og_page(title, description, image, redirect_url))
