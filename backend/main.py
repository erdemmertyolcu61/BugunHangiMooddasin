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
from typing import Optional

from backend.dns_resolver import setup_dns_bypass, refresh_dns
from backend.config import (
    ALLOWED_ORIGINS, BETA_PASSWORD, ADMIN_PASSWORD, JWT_SECRET,
    IS_PRODUCTION, ENVIRONMENT, RATE_LIMIT_GENERAL, RATE_LIMIT_AI,
    TMDB_API_KEY, ANTHROPIC_API_KEY, GOOGLE_CLIENT_ID,
)
from fastapi import FastAPI, HTTPException, Query, Path, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, HTMLResponse, RedirectResponse
from contextlib import asynccontextmanager
import jwt as pyjwt
from collections import defaultdict
from datetime import datetime, timedelta

import asyncio
import aiosqlite
from backend.database import cache, _get_connection as _db_conn
from backend.services.streaming_links import build_streaming_availability
from backend.services.tmdb_service import tmdb_service
from backend.services.omdb_service import omdb_service
from backend.services.claude_service import claude_service
from backend.mood_profiles import MOOD_PROFILES, get_tmdb_params, get_positive_genres, GENRE_NAMES

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
    "Retro": "Retro",
    "deep-chills": "deep-chills",
}

def _normalize_mood_id(mood_id: str) -> str:
    """Normalize mood ID to match MOOD_ID_LABELS keys."""
    if not mood_id:
        return "battaniye"
    m = mood_id.strip()
    if m.lower() == "retro":
        return "Retro"
    return m.lower()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("film_elestirimeni")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize the database cache, DNS bypass, seed movie repository, and download audio."""
    await setup_dns_bypass()
    await cache.init_db()
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
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    ms = (time.time() - start) * 1000
    logger.info(f"{request.method} {request.url.path} status={response.status_code} {ms:.0f}ms")
    return response


@app.middleware("http")
async def production_error_handler(request: Request, call_next):
    """In production, hide stack traces from users."""
    if not IS_PRODUCTION:
        return await call_next(request)
    try:
        return await call_next(request)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unhandled error on {request.method} {request.url.path}: {type(e).__name__}: {e}")
        return JSONResponse(status_code=500, content={"detail": "Internal server error"})


# ─── Rate Limiter (simple in-memory) ───
_rate_store = defaultdict(list)

def _check_rate_limit(request: Request, limit: int):
    """Check per-IP rate limit. limit = requests per minute."""
    ip = request.client.host if request.client else "unknown"
    now = time.time()
    window = 60  # 1 minute
    key = f"{ip}:{request.url.path}"
    # Clean old entries
    _rate_store[key] = [t for t in _rate_store[key] if now - t < window]
    if len(_rate_store[key]) >= limit:
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Please try again later.")
    _rate_store[key].append(now)

def rate_limit_general(request: Request):
    _check_rate_limit(request, RATE_LIMIT_GENERAL)

def rate_limit_ai(request: Request):
    _check_rate_limit(request, RATE_LIMIT_AI)


# ─── Beta Auth ───
def _create_token(payload: dict, expires_hours: int = 24) -> str:
    payload["exp"] = datetime.utcnow() + timedelta(hours=expires_hours)
    return pyjwt.encode(payload, JWT_SECRET, algorithm="HS256")

def _verify_token(token: str) -> dict:
    try:
        return pyjwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except pyjwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

def verify_beta(request: Request):
    """Verify beta access. In development mode, skip auth."""
    if not IS_PRODUCTION or not BETA_PASSWORD:
        return  # No beta gate in dev mode or if no password set
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Beta access required")
    token = auth.replace("Bearer ", "")
    payload = _verify_token(token)
    if payload.get("type") not in ("beta", "admin"):
        raise HTTPException(status_code=401, detail="Invalid access type")

def verify_admin(request: Request):
    """Verify admin access for sensitive endpoints."""
    if not IS_PRODUCTION and not ADMIN_PASSWORD:
        return  # No admin gate in dev without password
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth.replace("Bearer ", "")
        payload = _verify_token(token)
        if payload.get("type") == "admin":
            return
    # Also accept X-Admin-Password header
    admin_pw = request.headers.get("X-Admin-Password", "")
    if admin_pw and ADMIN_PASSWORD and admin_pw == ADMIN_PASSWORD:
        return
    raise HTTPException(status_code=403, detail="Admin access required")


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
        # No beta password configured — allow access
        return {"token": _create_token({"type": "beta"}, expires_hours=720), "expires_in": 2592000}
    if password == BETA_PASSWORD:
        return {"token": _create_token({"type": "beta"}, expires_hours=720), "expires_in": 2592000}
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
    if password == ADMIN_PASSWORD:
        return {"token": _create_token({"type": "admin"}, expires_hours=4), "expires_in": 14400}
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

    # Upsert user
    async with _db_conn(cache.db_path, user_data=True) as db:
        await db.execute("""
            INSERT INTO users (google_id, email, name, picture)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(google_id) DO UPDATE SET email=excluded.email, name=excluded.name, picture=excluded.picture
        """, (google_id, email, name, picture))
        await db.commit()
        cur = await db.execute("SELECT id, created_at FROM users WHERE google_id = ?", (google_id,))
        row = await cur.fetchone()
        user_id = row[0] if row else 0
        created_at = row[1] if row and len(row) > 1 else None

    token = _create_token({"type": "user", "user_id": user_id, "google_id": google_id, "email": email}, expires_hours=720)
    return {"token": token, "user": {"id": user_id, "email": email, "name": name, "picture": picture, "created_at": created_at}}


@app.get("/api/admin/users", dependencies=[Depends(verify_admin)])
async def admin_list_users():
    """Kayıtlı kullanıcı sayısı + listesi (sadece admin).

    Erişim: Authorization: Bearer <admin_token>  veya
            X-Admin-Password: <ADMIN_PASSWORD> header'ı.
    """
    async with _db_conn(cache.db_path, user_data=True) as db:
        cur = await db.execute(
            "SELECT id, email, name, created_at FROM users ORDER BY id DESC"
        )
        rows = await cur.fetchall()
    users = [
        {"id": r[0], "email": r[1], "name": r[2], "created_at": r[3]}
        for r in rows
    ]
    return {"total": len(users), "users": users}


@app.post("/api/admin/warm-ustad", dependencies=[Depends(verify_admin)])
async def admin_warm_ustad(limit: int = Query(10, ge=1, le=50)):
    """Cache'lenmemiş repository filmleri için Üstad Notu'nu ön-üretir.

    Maliyet kontrolü: çağrı başına max 50 film (her biri 1 Claude çağrısı).
    Admin tekrar tekrar çağırarak havuzu kademeli ısıtır. Başlangıçta
    otomatik çalışmaz — maliyet sürprizi olmaz.

    Erişim: Authorization: Bearer <admin_token> veya X-Admin-Password.
    """
    from backend.tasks.ustad_pipeline import warm_ustad_notes
    summary = await warm_ustad_notes(limit=limit)
    return summary


@app.get("/api/auth/verify")
async def verify_token_endpoint(request: Request):
    """Verify if a token is still valid."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No token provided")
    token = auth.replace("Bearer ", "")
    payload = _verify_token(token)
    return {"valid": True, "type": payload.get("type"), "exp": payload.get("exp")}


def verify_user(request: Request) -> dict:
    """Bearer token'dan giriş yapmış kullanıcıyı çözer (type='user')."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Giriş gerekli")
    payload = _verify_token(auth.replace("Bearer ", ""))
    if payload.get("type") != "user":
        raise HTTPException(status_code=403, detail="Bu işlem için hesabınla giriş yapmalısın")
    return payload


def optional_user_id(request: Request) -> int:
    """Geçerli bir 'user' token'ı varsa kullanıcı id'sini döndürür, yoksa 0.

    Hesapla giriş yapan kullanıcı kendi verisini (user_id) görür; sadece beta
    şifresiyle giren anonim kullanıcı paylaşımlı havuzu (user_id=0) kullanır.
    Asla hata fırlatmaz — anonim kullanım bozulmaz.
    """
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return 0
    try:
        payload = _verify_token(auth.replace("Bearer ", ""))
        if payload.get("type") == "user":
            return int(payload.get("user_id") or 0)
    except Exception:
        pass
    return 0


# ─── Topluluk Önerileri (Community Sharing) ───

@app.post("/api/community/recommend")
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
        cur = await db.execute("SELECT name, picture FROM users WHERE id = ?", (user_id,))
        row = await cur.fetchone()
        username = (row[0] if row and row[0] else user.get("email", "Sinemasever"))
        avatar = (row[1] if row and len(row) > 1 else "") or ""
        await db.execute("""
            INSERT INTO community_recommendations (tmdb_id, user_id, username, avatar)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(tmdb_id, user_id) DO UPDATE SET username=excluded.username,
                avatar=excluded.avatar, created_at=CURRENT_TIMESTAMP
        """, (int(tmdb_id), user_id, username, avatar))
        await db.commit()
    return {"success": True, "shared_by": {"uid": user_id, "username": username, "avatar": avatar}}


@app.get("/api/community/recommendations/{tmdb_id}")
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


@app.get("/api/movies/turkish")
async def get_turkish_movies(
    page: int = Query(1, ge=1, le=100),
    sort_by: str = Query("popularity.desc", regex="^(popularity.desc|vote_average.desc|primary_release_date.desc|revenue.desc)$"),
    min_vote_count: int = Query(0, ge=0),
    min_vote_average: float = Query(0.0, ge=0, le=10),
    year_from: Optional[int] = Query(None, ge=1900, le=2099),
    year_to: Optional[int] = Query(None, ge=1900, le=2099),
):
    """
    Türk filmlerini TMDB'den çeker.
    - with_origin_country=TR + with_original_language=tr ile gerçek Türk filmleri
    - Sayfalama, sıralama, kalite filtresi ve yıl aralığı destekler.
    """
    try:
        result = await tmdb_service.get_turkish_movies(
            page=page,
            sort_by=sort_by,
            min_vote_count=min_vote_count,
            min_vote_average=min_vote_average,
            year_from=year_from,
            year_to=year_to,
        )
        return {
            "movies": result["movies"],
            "page": result["page"],
            "total_pages": min(result["total_pages"], 100),
            "total_results": result["total_results"],
        }
    except Exception as e:
        logger.error(f"Turkish movies error: {e}")
        raise HTTPException(status_code=500, detail="Türk filmleri yüklenemedi.")


@app.get("/api/movies/upcoming")
async def get_upcoming_movies():
    """Fetch upcoming releases (region=TR ile Türkiye vizyonu dahil)."""
    try:
        result = await tmdb_service.get_upcoming_movies()
        return {"movies": result["movies"], "page": result.get("page", 1), "total_pages": result.get("total_pages", 1)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/movies/now-playing")
async def get_now_playing():
    """Fetch movies currently in theaters (region=TR ile Türkiye vizyonu dahil)."""
    try:
        result = await tmdb_service.get_now_playing()
        return {"movies": result["movies"], "page": result.get("page", 1), "total_pages": result.get("total_pages", 1)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/movies/search")
async def search_movies(q: str = Query(..., min_length=1, max_length=200)):
    """Search TMDB for movies by title."""
    q_clean = q.strip()
    if not q_clean:
        raise HTTPException(status_code=422, detail="Arama terimi boş olamaz.")
    try:
        results = await tmdb_service.search_movies(q_clean)
        return {"movies": results, "query": q_clean}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/movies/discover")
async def discover_movies(
    genres: str = Query(..., description="Comma-separated TMDB genre IDs"),
    page: int = Query(1, ge=1, le=3),
    sort_by: str = Query("popularity.desc"),
):
    """Discover movies by genre. Max 3 pages."""
    try:
        genre_ids = [int(g.strip()) for g in genres.split(",") if g.strip()]
        if not genre_ids:
            raise HTTPException(status_code=422, detail="En az bir tür ID'si gerekli.")

        result = await tmdb_service.discover_movies(genre_ids, page=page, sort_by=sort_by)
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
            "movies": enriched,
            "page": result["page"],
            "total_pages": min(result["total_pages"], 3),
        }
    except ValueError:
        raise HTTPException(status_code=422, detail="Geçersiz tür ID formatı.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/movies")
async def get_movies(page: int = Query(1, ge=1, le=500)):
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
            "movies": enriched,
            "page": result["page"],
            "total_pages": result["total_pages"],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- Movie Repository Endpoints (kaliteli film havuzu) ---

@app.get("/api/repository/seed")
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
        raise HTTPException(status_code=500, detail=str(e))


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
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/repository/movies/{mood_id}")
async def get_repository_movies(
    mood_id: str,
    page: int = Query(1, ge=1),
    min_vote: float = Query(5.0, ge=0, le=10),
    min_mood_score: float = Query(1.0, ge=0, le=100),
    sort_by: str = Query("recommended"),
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
            return {
                "movies": [],
                "page": page,
                "total_pages": 1,
                "total": 0,
                "seeding": True,
            }

        # ── FAST PATH: SQL-level pagination with pre-computed mood_score ──
        result = await cache.get_repository_movies_paginated(
            mood_id, page=page, per_page=20,
            min_vote=min_vote, min_mood_score=min_mood_score,
            sort_by=sort_by,
        )
        page_movies = result["movies"]

        if not page_movies:
            return {
                "movies": [],
                "page": page,
                "total_pages": result["total_pages"],
                "total": result["total"],
                "sort_by": sort_by,
                "min_mood_score": min_mood_score,
            }

        # Batch-enrich only the 20 movies on this page (not 8000+)
        ids = [m["id"] for m in page_movies]
        cache_map, classifications_map = await asyncio.gather(
            cache.get_movies_batch(ids),
            cache.get_mood_classifications_batch(ids),
        )

        for movie in page_movies:
            mid = movie["id"]
            movie["mood_match_label"] = "Mood'a Uyum"
            movie["ai_classified"] = classifications_map.get(mid) == mood_id
            # Lightweight metadata — no heavy classify_movie() call
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

        return {
            "movies": page_movies,
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
        raise HTTPException(status_code=500, detail=str(e))


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
        raise HTTPException(status_code=500, detail=str(e))


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
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/repository/classify-movie/{movie_id}")
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
        raise HTTPException(status_code=500, detail=str(e))


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

@app.get("/api/watchlist")
async def get_watchlist(request: Request):
    """Get all movies in the watchlist (kullanıcıya özel)."""
    try:
        uid = optional_user_id(request)
        movies = await cache.get_watchlist(user_id=uid)
        return {"movies": movies}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/watchlist")
async def add_to_watchlist(req: WatchlistRequest, request: Request):
    """Add a movie to the watchlist."""
    try:
        uid = optional_user_id(request)
        await cache.add_to_watchlist(req.tmdb_id, req.title, req.poster_url, user_id=uid)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/watchlist/{tmdb_id}")
async def remove_from_watchlist(tmdb_id: int, request: Request):
    """Remove a movie from the watchlist."""
    try:
        uid = optional_user_id(request)
        await cache.remove_from_watchlist(tmdb_id, user_id=uid)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/watchlist/{tmdb_id}/toggle-watched")
async def toggle_watched(request: Request, tmdb_id: int = Path(..., ge=1)):
    """Toggle the watched status of a movie in the watchlist."""
    try:
        uid = optional_user_id(request)
        new_state = await cache.toggle_watched(tmdb_id, user_id=uid)
        return {"tmdb_id": tmdb_id, "watched": new_state}
    except Exception as e:
        logger.error(f"Toggle watched error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# --- Personal Notes Endpoints ---

@app.get("/api/movies/{movie_id}/notes")
async def get_movie_note(movie_id: int, request: Request):
    """Get the personal note for a movie."""
    try:
        uid = optional_user_id(request)
        note = await cache.get_note(movie_id, user_id=uid)
        return {"note": note}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/movies/{movie_id}/notes")
async def save_movie_note(movie_id: int, req: NoteRequest, request: Request):
    """Save or update a personal note for a movie."""
    try:
        uid = optional_user_id(request)
        await cache.save_note(movie_id, req.content, user_id=uid)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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
        return cached_data

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

    # 5. Get Claude AI analysis
    analysis = await claude_service.analyze_movie(
        title=details["title"],
        overview=details["overview"],
        ratings=ratings,
        genres=details.get("genres", []),
        year=year,
        vote_average=details.get("vote_average"),
    )

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
        "analyzed": True,
        "in_watchlist": in_watchlist,
        "personal_note": personal_note
    }

    # 7. Save Claude's mood classification
    raw_mood = analysis.get("mood", "")
    mood_id_from_claude = None
    for mid, label in MOOD_ID_LABELS.items():
        if label.lower() in raw_mood.lower():
            mood_id_from_claude = mid
            break
    if mood_id_from_claude:
        await cache.save_mood_classification(movie_id, mood_id_from_claude)

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

    # 9. Cache result
    await cache.save_movie(movie_id, details["title"], enriched)

    return enriched


@app.get("/api/movies/{movie_id}/similar")
async def get_similar_movies_endpoint(movie_id: int = Path(..., ge=1)):
    """
    Bir filme gerçekten yakın filmler. TMDB /recommendations (daha kaliteli)
    önce, /similar ile tamamlanır; tür örtüşmesi + kalite skoruyla sıralanır.
    """
    try:
        # Kaynak filmin türlerini al (örtüşme skoru için)
        src_genres = set()
        try:
            details = await asyncio.wait_for(
                tmdb_service.get_movie_details(movie_id), timeout=4.0
            )
            for g in (details.get("genre_ids") or []):
                src_genres.add(g)
            for g in (details.get("genres") or []):
                if isinstance(g, dict) and g.get("id"):
                    src_genres.add(g["id"])
        except Exception:
            pass

        rec = await tmdb_service.get_recommendations(movie_id, page=1)
        sim = await tmdb_service.get_similar_movies(movie_id, page=1)

        # Recommendations öncelikli havuz
        pool = {}
        for m in rec.get("movies", []):
            pool[m["id"]] = m
        for m in sim.get("movies", []):
            pool.setdefault(m["id"], m)

        # Kalite filtresi: posteri olan, yeterince oylanmış, vasat üstü
        candidates = [
            m for m in pool.values()
            if m.get("poster_url") and m["id"] != movie_id
            and (m.get("vote_count") or 0) >= 60
            and (m.get("vote_average") or 0) >= 5.8
        ]

        def relevance(m):
            gids = set(m.get("genre_ids") or [])
            overlap = len(gids & src_genres) if src_genres else 0
            return (
                overlap * 3.0
                + min((m.get("vote_average") or 0), 9.0) * 0.5
                + min((m.get("vote_count") or 0) / 1000.0, 5.0) * 0.3
            )

        candidates.sort(key=relevance, reverse=True)
        return {"movies": candidates[:12]}
    except Exception as e:
        logger.warning(f"Similar movies unavailable for {movie_id}: {e}")
        return {"movies": []}


@app.get("/api/movies/{movie_id}/watch-providers")
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

# Shared httpx client for connection pooling (reuses TCP connections)
import httpx as _hx
_image_client = _hx.AsyncClient(
    timeout=10.0,
    limits=_hx.Limits(max_connections=20, max_keepalive_connections=10),
    follow_redirects=True,
)

@app.get("/api/image-proxy")
async def image_proxy(url: str = Query(...)):
    """
    TMDB görsel proxy — ISP DNS engelini aşmak için.
    Disk cache ile aynı poster tekrar TMDB'den çekilmez.
    Connection pooling ile paralel istekler hızlı.
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
            headers={"Cache-Control": "public, max-age=604800", "X-Cache": "HIT"},
        )

    # Disk cache miss — TMDB'den çek ve kaydet
    try:
        resp = await _image_client.get(url)
        resp.raise_for_status()
        content_type = resp.headers.get("content-type", "image/jpeg")

        # Arka planda diske yaz (bloklama yok)
        try:
            with open(cache_path, "wb") as f:
                f.write(resp.content)
        except Exception:
            pass  # Disk yazma hatası poster gösterimini engellemesin

        return Response(
            content=resp.content,
            media_type=content_type,
            headers={"Cache-Control": "public, max-age=604800", "X-Cache": "MISS"},
        )
    except Exception:
        raise HTTPException(status_code=502, detail="Görsel yüklenemedi.")


@app.get("/", response_class=RedirectResponse)
async def root_redirect():
    """Backend root → frontend'e yönlendir."""
    return RedirectResponse(url="https://film-elestirmeni.vercel.app", status_code=302)

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
    }


# --- Future Plans Endpoints (Gelecek Planları) ---

@app.get("/api/future")
async def get_future_plans(request: Request):
    """Get all movies in future plans (kullanıcıya özel)."""
    try:
        uid = optional_user_id(request)
        movies = await cache.get_future_plans(user_id=uid)
        return {"movies": movies}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/future")
async def add_to_future(req: FuturePlanRequest, request: Request):
    """Add a movie to future plans."""
    try:
        uid = optional_user_id(request)
        await cache.add_to_future(req.tmdb_id, req.title, req.poster_url, req.priority, req.watch_date, req.notes, user_id=uid)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/future/{tmdb_id}")
async def remove_from_future(tmdb_id: int, request: Request):
    """Remove a movie from future plans."""
    try:
        uid = optional_user_id(request)
        await cache.remove_from_future(tmdb_id, user_id=uid)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/future/{tmdb_id}/priority")
async def update_future_priority(tmdb_id: int, request: Request, priority: int = Query(0, ge=0, le=5)):
    """Update priority of a future plan."""
    try:
        uid = optional_user_id(request)
        await cache.update_future_priority(tmdb_id, priority, user_id=uid)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/future/{tmdb_id}/date")
async def update_future_date(tmdb_id: int, request: Request, watch_date: str = Query(None)):
    """Update watch date of a future plan."""
    try:
        uid = optional_user_id(request)
        await cache.update_future_date(tmdb_id, watch_date, user_id=uid)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- "Kafan mı Karışık?" AI Öneri Endpoint ---

@app.get("/api/repository/stats")
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
        raise HTTPException(status_code=500, detail=str(e))


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
    "80ler": {"Retro": 4},
    "neon": {"Retro": 4},
    "retro": {"Retro": 4},
    "synth": {"Retro": 4},
    "heyecan": {"adrenalin": 4, "gece": 1},
    "macera": {"yolculuk": 4, "adrenalin": 1},
    "yol": {"yolculuk": 4},
    "keşif": {"yolculuk": 4},
    "hüzün": {"gozyasi": 3, "kalp": 2, "sessiz": 1},
    "aşk": {"askbahcesi": 4, "gozyasi": 1},
    "korku": {"deep-chills": 4, "gece": 2},
    "gizem": {"zihin": 3, "gece": 2, "karmakar": 1},
    "uzay": {"yolculuk": 2, "Retro": 2, "karmakar": 1},
    "çocuk": {"battaniye": 4, "kahkaha": 2},
    "aile": {"battaniye": 4, "kahkaha": 1},
    "sürpriz": {"battaniye": 1, "yolculuk": 1, "gece": 1, "kahkaha": 1, "gozyasi": 1, "adrenalin": 1, "askbahcesi": 1, "zamanyolcusu": 1, "sessiz": 1, "zihin": 1, "kalp": 1, "karmakar": 1, "Retro": 1, "deep-chills": 1},
    "klişe": {"askbahcesi": -1, "gozyasi": -1, "battaniye": -1},
    "yavaş": {"sessiz": 3, "battaniye": 2},
    "hızlı": {"adrenalin": 3, "Retro": 2},
    "kaliteli": {"zihin": 2, "kalp": 2, "sessiz": 1},
    "derin": {"kalp": 3, "sessiz": 2, "zihin": 1},
    "hafif": {"kahkaha": 3, "battaniye": 3, "yolculuk": 1},
    "ağır": {"gozyasi": 3, "deep-chills": 2, "zamanyolcusu": 1},
    "kafa dağıtmak": {"kahkaha": 4, "adrenalin": 2, "yolculuk": 1},
    "bilim kurgu": {"zihin": 3, "Retro": 2, "yolculuk": 2, "karmakar": 1},
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
    "şehvetli": {"askbahcesi": 4, "gece": 1},
    "sevgilimle": {"askbahcesi": 3, "battaniye": 1},
    "ailemle": {"battaniye": 3, "kahkaha": 1},
    "arkadaşlarla": {"kahkaha": 3, "adrenalin": 1},
    "yalnız": {"sessiz": 2, "kalp": 2, "gozyasi": 1},
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
        "Retro","deep-chills"
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
        "Retro": "80'ler neon ve synthwave atmosferi",
    }

    if not matched_real:
        # Gerçek eşleşme yok → çelişkili iddia ETME (eski hata: kış istendi
        # ama "sıcak rahat ortam" deniyordu). Taahhütsüz, dürüst mesaj.
        message = "Tam olarak çözemedim ama ruh haline yakın birkaç film seçtim. Daha net yazarsan daha iyi öneririm."
    else:
        top_mood = top3[0][0] if top3 else "battaniye"
        msg = messages.get(top_mood, "film")
        message = f"Sana en çok {msg} aradığını söyleyebilirim. Bu gece için birkaç önerim var."

    return {"message": message, "mood_mix": mood_mix}


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
    "Retro": "80'ler estetiği ve neon atmosferiyle zamanda geriye götürecek.",
}


from pydantic import BaseModel

class ConfusedRequest(BaseModel):
    text: str = ""
    limit: int = 6
    min_vote: float = 5.0
    min_mood_score: float = 0.0
    exclude_ids: list = []  # Session-based anti-repetition

class RandomRecommendRequest(BaseModel):
    mood_id: str = None
    mood_mix: list = None
    limit: int = 3
    min_vote: float = 5.0


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


@app.post("/api/recommend/random")
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
                "Retro","deep-chills"
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


@app.post("/api/recommend/confused", dependencies=[Depends(rate_limit_ai)])
async def post_confused_recommendation(req: ConfusedRequest):
    """
    Kafan mı karışık? — Smart Chat Engine v2.
    Intent detection → movie/person/similar search → mood analysis → Claude reranking.
    """
    from backend.services.claude_service import confusion_service
    from backend.services.tmdb_service import tmdb_service
    from backend.services.chat_engine import ChatEngine

    text = req.text.strip()
    limit = max(3, min(req.limit, 12))
    min_vote = max(4.0, min(req.min_vote, 10.0))
    exclude_ids = [int(x) for x in req.exclude_ids if str(x).isdigit()] if req.exclude_ids else []

    engine = ChatEngine(db=cache, tmdb_service=tmdb_service, confusion_service=confusion_service)

    result = await engine.process(
        text=text,
        limit=limit,
        min_vote=min_vote,
        exclude_ids=exclude_ids,
    )

    return result


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
              "adrenalin": "fast", "kahkaha": "fast", "Retro": "fast", "yolculuk": "medium",
              "gece": "medium", "zihin": "medium", "battaniye": "slow", "karmakar": "medium",
              "deep-chills": "slow", "askbahcesi": "medium"}

MOOD_ATMOSPHERE = {"gece": "dark", "deep-chills": "dark", "zihin": "dark", "karmakar": "dark",
                   "askbahcesi": "romantic", "gozyasi": "romantic", "kalp": "romantic", "battaniye": "romantic"}

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
    "Retro": "Retro Bakış", "deep-chills": "Derin Ürperti",
}


def _generate_taste_summary(top_moods, top_genres, era, total_signals):
    """Kurallara dayali Turkce summary cumleleri uretir."""
    if total_signals < 3:
        return []

    summaries = []
    mood_ids = [m["mood_id"] for m in top_moods[:3]]
    top_mid = mood_ids[0] if mood_ids else None

    # Yavas tempo
    slow_moods = [m for m in mood_ids if MOOD_TEMPO.get(m) == "slow"]
    if len(slow_moods) >= 2:
        summaries.append("Yavaş tempolu, karakter odaklı ve duygusal filmler sende daha çok iz bırakıyor.")
    elif len(slow_moods) >= 1 and top_mid in slow_moods:
        summaries.append("Sakin ve derinlikli hikayelere daha çok yaklaşıyorsun.")

    # Hizli tempo
    fast_moods = [m for m in mood_ids if MOOD_TEMPO.get(m) == "fast"]
    if len(fast_moods) >= 2:
        summaries.append("Yüksek tempolu, enerjik ve heyecanlı filmlere güçlü bir ilgin var.")

    # Karanlik atmosfer
    dark_moods = [m for m in mood_ids if MOOD_ATMOSPHERE.get(m) == "dark"]
    if len(dark_moods) >= 2:
        summaries.append("Karanlık, gizemli ve düşündüren atmosferler sana daha yakın geliyor.")
    elif top_mid == "deep-chills":
        summaries.append("Korkuda ani sıçratmalardan çok atmosferik ve psikolojik gerilimlere yakınsın.")
    elif top_mid == "zihin":
        summaries.append("Beklenmedik dönüşler, karmaşık planlar ve zihin açan hikayeler seni daha çok çekiyor.")

    # Romantik
    romantic_moods = [m for m in mood_ids if MOOD_ATMOSPHERE.get(m) == "romantic"]
    if len(romantic_moods) >= 2:
        summaries.append("Romantikte sıcak, kırılgan ve gerçekçi hikayelere daha çok yaklaşıyorsun.")

    # Zamanyolcusu
    if top_mid == "zamanyolcusu":
        summaries.append("Eski sinema hissi, klasikler ve geçmiş dönem atmosferi ilgini çekiyor.")

    # Kahkaha
    if top_mid == "kahkaha":
        summaries.append("Bazen sinemayı sadece rahatlamak ve gülmek için kullandığın çok belli.")

    # Kalp
    if top_mid == "kalp":
        summaries.append("Büyük hikayelerden çok, küçük ama derin dokunuşlar seni daha çok etkiliyor.")

    # Donem
    if era.get("pre_1990", 0) > era.get("post_2000", 0) and era.get("pre_1990", 0) > 0:
        summaries.append("1990 öncesi klasiklere ve eski sinema hissine ilgin artıyor.")
    elif era.get("recent", 0) > era.get("pre_1990", 0):
        summaries.append("Daha güncel ve modern tempolu filmlere yakın duruyorsun.")

    # Genre bazli
    for g in top_genres[:2]:
        gid = g["genre_id"]
        if gid == 18:
            summaries.append("Drama türüne ilgin belirgin şekilde yüksek.")
            break
        elif gid == 27 and top_mid != "deep-chills":
            summaries.append("Korku türüne ilgin var, özellikle atmosferik yapımlara yöneliyorsun.")
            break
        elif gid == 35:
            summaries.append("Komedi türünden keyif aldığın belli oluyor.")
            break
        elif gid == 10749:
            summaries.append("Romantik filmlere sıcak bakıyorsun.")
            break

    return summaries[:5]


@app.get("/api/user/taste-map")
async def get_user_taste_map(request: Request):
    """
    Kullanicinin watchlist, future plans, notes ve analyze verilerinden
    kisisel zevk profilini cikarir.
    AI cagrisi yapmaz, deterministic kurallar kullanir.
    """
    try:
        uid = optional_user_id(request)
        signals = await cache.get_user_movie_signals(user_id=uid)
        total_signals = len(signals)

        mood_scores = {}
        genre_scores = {}
        era_counts = {"pre_1990": 0, "mid": 0, "post_2000": 0, "recent": 0}

        for tmdb_id, sig in signals.items():
            weight = min(sig["score"], 5)

            # Mood classification
            mood = await cache.get_mood_for_movie(tmdb_id)
            if mood:
                mood_scores[mood] = mood_scores.get(mood, 0) + weight
            else:
                # Try mood_scores from attributes
                stored = await cache.get_mood_scores_for_movie(tmdb_id)
                if stored:
                    for mid, sc in stored.items():
                        if sc >= 40:
                            mood_scores[mid] = mood_scores.get(mid, 0) + weight
                else:
                    # Try movie cache data for genre_ids + calculate
                    cached = await cache.get_movie(tmdb_id)
                    if cached:
                        gids = cached.get("genre_ids", [])
                        if gids:
                            from backend.mood_scoring import calculate_mood_scores
                            calc = calculate_mood_scores(gids, cached.get("vote_average"), tmdb_id=tmdb_id)
                            for mid, sc in calc.items():
                                if sc >= 40:
                                    mood_scores[mid] = mood_scores.get(mid, 0) + weight * 0.5

            # Genre from movie_cache data
            try:
                cached = await cache.get_movie(tmdb_id)
                if cached:
                    gids = cached.get("genre_ids", [])
                    for gid in gids:
                        genre_scores[gid] = genre_scores.get(gid, 0) + weight

                    # Era
                    rd = cached.get("release_date", "")
                    if rd and len(rd) >= 4:
                        year_str = rd[:4]
                        if year_str.isdigit():
                            year = int(year_str)
                            if year <= 1990:
                                era_counts["pre_1990"] += weight
                            elif year <= 2009:
                                era_counts["mid"] += weight
                            else:
                                era_counts["post_2000"] += weight
                            if year >= 2021:
                                era_counts["recent"] += weight
            except Exception:
                pass

        # Build response
        top_moods = sorted(mood_scores.items(), key=lambda x: -x[1])[:5]
        top_moods = [{"mood_id": m, "title": MOOD_NAMES.get(m, m), "score": s}
                     for m, s in top_moods]

        top_genres = sorted(genre_scores.items(), key=lambda x: -x[1])[:5]
        top_genres = [{"genre_id": g, "name": GENRE_NAMES_TR.get(g, "?"), "score": s}
                      for g, s in top_genres]

        era = {
            "pre_1990": era_counts["pre_1990"],
            "1991_2009": era_counts["mid"],
            "2010_plus": era_counts["post_2000"],
            "recent_5_years": era_counts["recent"],
        }

        summary = _generate_taste_summary(top_moods, top_genres, era_counts, total_signals)

        if total_signals < 3:
            confidence = "low"
        elif total_signals < 8:
            confidence = "medium"
        else:
            confidence = "high"

        return {
            "summary": summary,
            "top_moods": top_moods,
            "top_genres": top_genres,
            "era_preferences": era,
            "signals": {
                "total_movies": total_signals,
                "watchlist_count": sum(1 for s in signals.values() if "watchlist" in s["sources"]),
                "future_count": sum(1 for s in signals.values() if "future" in s["sources"]),
                "notes_count": sum(1 for s in signals.values() if "note" in s["sources"]),
                "analyzed_count": sum(1 for s in signals.values() if "analyzed" in s["sources"]),
            },
            "confidence": confidence,
        }
    except Exception as e:
        logger.error(f"Taste map error: {e}")
        return {
            "summary": [],
            "top_moods": [],
            "top_genres": [],
            "era_preferences": {},
            "signals": {"total_movies": 0, "watchlist_count": 0, "future_count": 0, "notes_count": 0, "analyzed_count": 0},
            "confidence": "low",
            "error": str(e),
        }


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

    # 80s Synthwave & Neon — retro, arcade, VHS, neon synth, nostaljik teknoloji
    "Retro":        ["peach-cobbler-static", "neon-on-the-diner-floor", "mirrorball-slow-roll",
                     "cassette-basement-bounce", "burnt-sunset-groove", "vhs-heartbeat"],

    # Slow-burn Atmospheric Tension — karanlık, ürperti, psikolojik gerilim, tedirginlik
    # Derin, rahatsız edici, yavaş yanan atmosferik parçalar — jumpscare DEĞİL
    "deep-chills":  ["antenna-after-midnight", "empty-street-static", "terminal-rain",
                     "moon-over-red-dunes", "velvet-cigarette-haze", "green-after-midnight"],
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
    "Retro": {
        "positive": ["neon", "diner", "cassette", "basement", "bounce", "mirrorball", "peach", "cobbler", "static", "sunset", "burnt", "groove", "vhs", "heartbeat"],
        "negative": ["candle", "gramophone", "classical", "saxophone", "medieval"]
    },
    "deep-chills": {
        "positive": ["antenna", "midnight", "empty-street", "static", "terminal", "rain", "moon", "dunes", "velvet", "cigarette", "haze", "green", "after-midnight"],
        "negative": ["love", "golden", "cozy", "party", "groove", "summer", "honey", "butter"]
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
    "Retro": "https://cdn.pixabay.com/audio/2022/11/22/audio_8ceabc8b8e.mp3",
    "deep-chills": "https://cdn.pixabay.com/audio/2023/07/07/audio_34cea2adf1.mp3",
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

@app.get("/api/audio/{mood_id}")
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


@app.get("/api/lists")
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


@app.get("/api/lists/{slug}")
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
                if year and ry and abs(int(ry) - int(year)) <= 1:
                    score += 40
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
                movies.append(item)
            elif fb_meta.get("tmdb_id") and fb_meta["tmdb_id"] not in seen_ids:
                # Arama da başarısız → ID ile dene, o da olmazsa meta ile bas
                got = await _fetch_one(fb_meta["tmdb_id"])
                if isinstance(got, dict) and got.get("id"):
                    seen_ids.add(got["id"])
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
# FİLM PAYLAŞIM SAYFASI — OG meta tag'lı HTML
# ─────────────────────────────────────────────────────────────

@app.get("/share/{movie_id}", response_class=HTMLResponse)
async def share_movie_page(movie_id: int):
    """Film paylaşım sayfası — OG meta tag'larıyla önizleme."""
    title = "Film Eleştirmeni"
    description = "Ruh haline göre yapay zeka destekli film keşif platformu."
    poster = "https://film-elestirmeni.com/favicon.svg"
    app_url = "https://film-elestirmeni.com"

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

    redirect_url = f"{app_url}/?film={movie_id}"

    html = f"""<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title}</title>
  <meta name="description" content="{description}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="{title}">
  <meta property="og:description" content="{description}">
  <meta property="og:image" content="{poster}">
  <meta property="og:url" content="{redirect_url}">
  <meta property="og:site_name" content="Film Eleştirmeni">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{title}">
  <meta name="twitter:description" content="{description}">
  <meta name="twitter:image" content="{poster}">
  <meta http-equiv="refresh" content="0;url={redirect_url}">
  <style>
    body {{ background: #120d0b; color: #f5f0e8; font-family: serif; display: flex;
            align-items: center; justify-content: center; min-height: 100vh; margin: 0; }}
    p {{ opacity: 0.5; font-style: italic; }}
  </style>
</head>
<body>
  <p>Yönlendiriliyorsunuz...</p>
  <script>window.location.replace("{redirect_url}")</script>
</body>
</html>"""
    return HTMLResponse(content=html)
