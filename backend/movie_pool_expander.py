"""
Movie Pool Expander v3 — Professional movie pool expansion system.
Target: 15,000+ movies, 500-2000+ usable per mood.

Sources:
  - /movie/popular (up to 500 pages)
  - /movie/top_rated (up to 500 pages)
  - /discover/movie year by year (1900 to current)
  - /discover/movie genre by genre
  - /discover/movie language by language
  - /movie/{id}/similar (from seed movies)
  - /movie/{id}/recommendations (from seed movies)

No artificial 3-page limit. Max pages per query is configurable up to 500.
"""
import asyncio, logging, random, httpx, time, json
from datetime import datetime
from backend.mood_scoring import calculate_mood_scores
from backend.database import cache
from backend.services.tmdb_service import tmdb_service

logger = logging.getLogger("film_elestirimeni")

# === CONFIG ===
CURRENT_YEAR = datetime.now().year
ALL_MOOD_IDS = [
    "battaniye", "yolculuk", "gece", "kahkaha", "gozyasi", "adrenalin",
    "askbahcesi", "zamanyolcusu", "sessiz", "zihin", "kalp", "karmakar",
    "sipsak", "deep-chills", "kadraj-estetigi", "geceyarisi-itirafi",
]
VALID_MOODS_SET = set(ALL_MOOD_IDS)
TMDB_GENRES = [28, 12, 16, 35, 80, 99, 18, 10751, 14, 36, 27, 10402, 9648, 10749, 878, 10770, 53, 10752, 37]
LANGUAGES = ["tr", "en", "fr", "de", "es", "it", "ja", "ko", "zh", "hi", "pt", "ru"]
YEARS = list(range(1900, CURRENT_YEAR + 1))
MIN_MOOD_SCORE = 25

# === STATE ===
_seen_ids = set()
_total_fetched = 0
_unique_added = 0
_duplicates_skipped = 0
_errors = []
_mood_counts = {m: 0 for m in ALL_MOOD_IDS}
_cache = {}  # Simple in-memory cache


def _reset_state():
    global _seen_ids, _total_fetched, _unique_added, _duplicates_skipped, _errors, _mood_counts, _cache
    _seen_ids = set()
    _total_fetched = 0
    _unique_added = 0
    _duplicates_skipped = 0
    _errors = []
    _mood_counts = {m: 0 for m in ALL_MOOD_IDS}


def _build_response(mood_id=None):
    return {
        "success": True,
        "mode": "single_mood" if mood_id else "all_moods",
        "mood_id": mood_id,
        "totalFetched": _total_fetched,
        "uniqueMoviesAdded": _unique_added,
        "duplicatesSkipped": _duplicates_skipped,
        "moviesClassified": sum(_mood_counts.values()),
        "moodCounts": dict(_mood_counts),
        "errors": _errors[:20],
        "message": "Expansion completed",
    }


async def _process_and_save(movie_data: dict, mood_id: str) -> int:
    """Calculate mood score, save if above threshold. Returns 0/1."""
    global _total_fetched, _unique_added, _duplicates_skipped
    tid = movie_data.get("id")
    if not tid:
        return 0

    _total_fetched += 1
    if tid in _seen_ids:
        _duplicates_skipped += 1
        return 0
    _seen_ids.add(tid)

    gids = movie_data.get("genre_ids", [])
    if not gids:
        return 0

    # Cache key for mood scores
    cache_key = f"mood_{tid}"
    if cache_key in _cache:
        scores = _cache[cache_key]
    else:
        scores = calculate_mood_scores(
            gids, movie_data.get("vote_average", 0),
            tmdb_id=tid, vote_count=movie_data.get("vote_count", 0),
            overview=movie_data.get("overview", ""),
            release_date=movie_data.get("release_date", ""),
        )
        _cache[cache_key] = scores

    ms = scores.get(mood_id, 0)
    if ms < MIN_MOOD_SCORE:
        return 0

    movie_data["mood_score"] = round(ms, 1)
    try:
        await cache.bulk_save_repository_movies([movie_data], mood_id)
        _unique_added += 1
        _mood_counts[mood_id] = _mood_counts.get(mood_id, 0) + 1
        return 1
    except Exception as e:
        _errors.append(f"Save error for {tid}: {e}")
        return 0


async def _fetch_page(kwargs: dict, mood_id: str, label: str, page: int) -> int:
    """Fetch one discover page, process all movies."""
    global _errors
    try:
        result = await tmdb_service.discover_movies(**kwargs)
        movies = result.get("movies", [])
        saved = 0
        for m in movies:
            saved += await _process_and_save(m, mood_id)
        if page == 1:
            logger.info(f"[{label}] page 1: {len(movies)} movies")
        return saved
    except Exception as e:
        _errors.append(f"[{label}] page {page}: {str(e)[:100]}")
        return 0


# === POPULAR ===
async def _expand_popular(mood_id: str) -> int:
    saved = 0
    for page in range(1, 501):
        try:
            result = await tmdb_service.get_popular_movies(page=page)
            movies = result.get("movies", [])
            if not movies:
                break
            for m in movies:
                saved += await _process_and_save(m, mood_id)
            if page % 50 == 0:
                logger.info(f"[Popular/{mood_id}] page {page}: {saved} saved so far")
        except Exception as e:
            _errors.append(f"[Popular] page {page}: {str(e)[:80]}")
            await asyncio.sleep(1)
    logger.info(f"[Popular/{mood_id}] DONE: {saved} movies")
    return saved


# === TOP RATED ===
async def _expand_top_rated(mood_id: str) -> int:
    saved = 0
    runtime_filter = {"with_runtime_lte": 90} if mood_id == "sipsak" else {}
    for page in range(1, 501):
        try:
            result = await tmdb_service.discover_movies(
                genre_ids=[18, 28, 35, 53, 878, 12, 80, 10749, 9648, 27, 14],
                page=page, sort_by="vote_average.desc",
                min_vote_average=6.0, min_vote_count=100,
                **runtime_filter,
            )
            movies = result.get("movies", [])
            if not movies:
                break
            for m in movies:
                saved += await _process_and_save(m, mood_id)
            if page % 50 == 0:
                logger.info(f"[TopRated/{mood_id}] page {page}: {saved} saved")
        except Exception as e:
            _errors.append(f"[TopRated] page {page}: {str(e)[:80]}")
            await asyncio.sleep(1)
    logger.info(f"[TopRated/{mood_id}] DONE: {saved} movies")
    return saved


# === YEAR BY YEAR ===
async def _expand_by_year(mood_id: str) -> int:
    saved = 0
    for year in YEARS:
        try:
            kwargs = {
                "genre_ids": [18, 28, 35, 53, 878, 12, 80, 10749, 9648, 27, 14, 10751, 36, 37, 99],
                "page": 1, "sort_by": "popularity.desc",
                "min_vote_average": 4.0, "min_vote_count": 5,
                "primary_release_date_gte": f"{year}-01-01",
                "primary_release_date_lte": f"{year}-12-31",
            }
            for page in range(1, 4):
                kwargs["page"] = page
                saved += await _fetch_page(kwargs, mood_id, f"Y{year}", page)
            if year % 25 == 0:
                logger.info(f"[Year/{mood_id}] up to {year}: {saved} saved")
            await asyncio.sleep(0.05)
        except Exception as e:
            _errors.append(f"[Year] {year}: {str(e)[:60]}")
    logger.info(f"[Year/{mood_id}] DONE: {saved} movies")
    return saved


# === BY GENRE ===
async def _expand_by_genre(mood_id: str) -> int:
    saved = 0
    for gid in TMDB_GENRES:
        try:
            runtime_filter = {"with_runtime_lte": 90} if mood_id == "sipsak" and gid != 99 else {}
            kwargs = {
                "genre_ids": [gid], "page": 1, "sort_by": "popularity.desc",
                "min_vote_average": 4.0, "min_vote_count": 5,
                **runtime_filter,
            }
            for page in range(1, 6):
                kwargs["page"] = page
                saved += await _fetch_page(kwargs, mood_id, f"G{gid}", page)
            await asyncio.sleep(0.05)
        except Exception as e:
            _errors.append(f"[Genre] {gid}: {str(e)[:60]}")
    logger.info(f"[Genre/{mood_id}] DONE: {saved} movies")
    return saved


# === BY LANGUAGE ===
async def _expand_by_language(mood_id: str) -> int:
    saved = 0
    runtime_filter = {"with_runtime_lte": 90} if mood_id == "sipsak" else {}
    for lang in LANGUAGES:
        try:
            kwargs = {
                "genre_ids": [18, 28, 35, 53, 878, 12, 80, 10749, 9648, 27, 14],
                "page": 1, "sort_by": "popularity.desc",
                "min_vote_average": 4.0, "min_vote_count": 5,
                "with_original_language": lang,
                **runtime_filter,
            }
            if lang == "tr":
                kwargs["with_origin_country"] = "TR"
                kwargs["region"] = "TR"
                kwargs["min_vote_count"] = 2
            for page in range(1, 4):
                kwargs["page"] = page
                saved += await _fetch_page(kwargs, mood_id, f"L{lang}", page)
            await asyncio.sleep(0.05)
        except Exception as e:
            _errors.append(f"[Lang] {lang}: {str(e)[:60]}")
    logger.info(f"[Lang/{mood_id}] DONE: {saved} movies")
    return saved


# === SIMILAR / RECOMMENDATIONS ===
async def _expand_similar_and_recs(mood_id: str) -> int:
    saved = 0
    try:
        all_m = await cache.get_all_repository_movies_by_mood(mood_id, min_vote=0)
        random.shuffle(all_m)
        seeds = all_m[:80]

        for seed in seeds:
            tid = seed.get("id")
            if not tid:
                continue
            for endpoint in ["similar", "recommendations"]:
                try:
                    url = f"{tmdb_service.base_url}/movie/{tid}/{endpoint}"
                    async with httpx.AsyncClient(timeout=10) as client:
                        resp = await client.get(url, params={"api_key": tmdb_service.api_key, "language": "tr-TR"})
                        if resp.status_code == 200:
                            for m in resp.json().get("results", [])[:8]:
                                mo = tmdb_service._format_movie(m)
                                saved += await _process_and_save(mo, mood_id)
                except Exception:
                    pass
            await asyncio.sleep(0.03)
    except Exception as e:
        _errors.append(f"[Similar] {str(e)[:80]}")
    logger.info(f"[Similar/{mood_id}] DONE: {saved} movies")
    return saved


# === MAIN ENTRY ===
async def expand_mood_pool(mood_id: str) -> dict:
    """Expand a single mood using all sources."""
    if mood_id not in VALID_MOODS_SET:
        return {"success": False, "error": "INVALID_MOOD_ID", "message": f"Unknown mood_id: {mood_id}", "availableMoodIds": ALL_MOOD_IDS}

    _reset_state()
    logger.info(f"=== EXPAND START: {mood_id} ===")

    await _expand_popular(mood_id)
    await _expand_top_rated(mood_id)
    await _expand_by_year(mood_id)
    await _expand_by_genre(mood_id)
    await _expand_by_language(mood_id)
    await _expand_similar_and_recs(mood_id)

    logger.info(f"=== EXPAND DONE: {mood_id} — +{_unique_added} unique, {_duplicates_skipped} dupes ===")
    return _build_response(mood_id)


async def expand_all_moods(mood_filter: str = None) -> dict:
    """Expand all moods (or one if mood_filter is set)."""
    if mood_filter:
        return await expand_mood_pool(mood_filter)

    combined = {
        "success": True, "mode": "all_moods", "mood_id": None,
        "totalFetched": 0, "uniqueMoviesAdded": 0, "duplicatesSkipped": 0,
        "moviesClassified": 0, "moodCounts": {}, "errors": [],
        "message": "Expansion completed",
    }

    for mid in ALL_MOOD_IDS:
        try:
            result = await expand_mood_pool(mid)
            combined["totalFetched"] += result["totalFetched"]
            combined["uniqueMoviesAdded"] += result["uniqueMoviesAdded"]
            combined["duplicatesSkipped"] += result["duplicatesSkipped"]
            combined["moviesClassified"] += result["moviesClassified"]
            for k, v in result.get("moodCounts", {}).items():
                combined["moodCounts"][k] = combined["moodCounts"].get(k, 0) + v
            combined["errors"].extend(result.get("errors", []))
        except Exception as e:
            combined["errors"].append(f"{mid}: {str(e)}")

    combined["errors"] = combined["errors"][:30]
    return combined
