"""
TMDB Service v2 - High-performance async TMDB client.
Features: persistent connection pool, auto-retry, rate-limit-safe concurrency.
"""
import asyncio
import httpx
from backend.config import TMDB_API_KEY, TMDB_BASE_URL, TMDB_IMAGE_BASE

# Concurrency limiter — TMDB allows ~40 req/10s, we stay safe at 8 parallel
_SEMAPHORE = asyncio.Semaphore(8)
_RETRY_DELAYS = [0.5, 1.5, 4.0]  # Exponential-ish retry


class TMDBService:
    def __init__(self):
        self.api_key = TMDB_API_KEY
        self.base_url = TMDB_BASE_URL
        self.image_base = TMDB_IMAGE_BASE
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Lazy-init persistent client with connection pooling."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=10.0,
                limits=httpx.Limits(
                    max_connections=15,
                    max_keepalive_connections=10,
                    keepalive_expiry=30,
                ),
                follow_redirects=True,
            )
        return self._client

    async def close(self):
        """Shutdown persistent client."""
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            self._client = None

    async def _get(self, url: str, params: dict) -> dict:
        """Rate-limited GET with auto-retry on 429 / 5xx."""
        async with _SEMAPHORE:
            client = await self._get_client()
            for attempt, delay in enumerate(_RETRY_DELAYS + [0]):
                try:
                    resp = await client.get(url, params=params)
                    if resp.status_code == 429:
                        retry_after = float(resp.headers.get("Retry-After", delay or 2))
                        await asyncio.sleep(retry_after)
                        continue
                    resp.raise_for_status()
                    return resp.json()
                except (httpx.HTTPStatusError, httpx.ConnectError, httpx.ReadTimeout) as e:
                    if attempt < len(_RETRY_DELAYS):
                        await asyncio.sleep(delay)
                        continue
                    raise
            return {}

    # ──────────────── format ────────────────

    def _format_movie(self, movie: dict) -> dict:
        """Standart film formati — tum endpoint'ler ayni yapiyi kullanir."""
        poster_url = (
            f"{self.image_base}/w500{movie['poster_path']}"
            if movie.get("poster_path") else None
        )
        backdrop_url = (
            f"{self.image_base}/w1280{movie['backdrop_path']}"
            if movie.get("backdrop_path") else None
        )
        return {
            "id": movie["id"],
            "title": movie.get("title", ""),
            "original_title": movie.get("original_title", ""),
            "original_language": movie.get("original_language", ""),
            "overview": movie.get("overview", ""),
            "poster_url": poster_url,
            "backdrop_url": backdrop_url,
            "release_date": movie.get("release_date"),
            "vote_average": movie.get("vote_average", 0),
            "vote_count": movie.get("vote_count", 0),
            "genre_ids": movie.get("genre_ids", []),
            "popularity": movie.get("popularity", 0),
        }

    # ──────────────── list endpoints ────────────────

    async def get_popular_movies(self, page: int = 1) -> dict:
        data = await self._get(f"{self.base_url}/movie/popular", {
            "api_key": self.api_key, "language": "tr-TR", "page": page,
        })
        return {
            "movies": [self._format_movie(m) for m in data.get("results", [])],
            "page": data.get("page", 1),
            "total_pages": data.get("total_pages", 1),
        }

    async def get_top_rated(self, page: int = 1) -> dict:
        data = await self._get(f"{self.base_url}/movie/top_rated", {
            "api_key": self.api_key, "language": "tr-TR", "page": page,
        })
        return {
            "movies": [self._format_movie(m) for m in data.get("results", [])],
            "page": data.get("page", 1),
            "total_pages": data.get("total_pages", 1),
        }

    async def get_upcoming_movies(self) -> dict:
        data = await self._get(f"{self.base_url}/movie/upcoming", {
            "api_key": self.api_key, "language": "tr-TR", "region": "TR",
        })
        return {
            "movies": [self._format_movie(m) for m in data.get("results", [])[:12]],
            "page": data.get("page", 1),
            "total_pages": data.get("total_pages", 1),
        }

    async def get_now_playing(self, region: str = "TR") -> dict:
        data = await self._get(f"{self.base_url}/movie/now_playing", {
            "api_key": self.api_key, "language": "tr-TR", "region": region, "page": 1,
        })
        return {
            "movies": [self._format_movie(m) for m in data.get("results", [])[:12]],
            "page": data.get("page", 1),
            "total_pages": data.get("total_pages", 1),
        }

    async def get_turkish_movies(self, page: int = 1, sort_by: str = "popularity.desc",
                                  min_vote_count: int = 0, min_vote_average: float = 0.0,
                                  year_from: int = None, year_to: int = None) -> dict:
        params = {
            "api_key": self.api_key, "language": "tr-TR", "region": "TR",
            "with_origin_country": "TR", "with_original_language": "tr",
            "sort_by": sort_by, "page": page,
        }
        if min_vote_count > 0:
            params["vote_count.gte"] = min_vote_count
        if min_vote_average > 0:
            params["vote_average.gte"] = min_vote_average
        if year_from:
            params["primary_release_date.gte"] = f"{year_from}-01-01"
        if year_to:
            params["primary_release_date.lte"] = f"{year_to}-12-31"

        data = await self._get(f"{self.base_url}/discover/movie", params)
        return {
            "movies": [self._format_movie(m) for m in data.get("results", [])],
            "page": data.get("page", page),
            "total_pages": data.get("total_pages", 1),
            "total_results": data.get("total_results", 0),
        }

    # ──────────────── discover ────────────────

    async def discover_movies(self, genre_ids: list, page: int = 1,
                                sort_by: str = "popularity.desc",
                                min_vote_average: float = None,
                                min_vote_count: int = 50,
                                with_keywords: str = None,
                                max_vote_count: int = None,
                                without_genres: str = None,
                                with_origin_country: str = None,
                                with_original_language: str = None,
                                region: str = None,
                                primary_release_date_lte: str = None,
                                primary_release_date_gte: str = None,
                                with_runtime_lte: int = None,
                                with_companies: str = None,
                                with_watch_providers: str = None,
                                watch_region: str = None) -> dict:
        params = {
            "api_key": self.api_key, "language": "tr-TR",
            "sort_by": sort_by,
            "with_genres": "|".join(str(g) for g in genre_ids),
            "page": page,
            "vote_count.gte": min_vote_count,
        }
        if with_keywords:
            params["with_keywords"] = with_keywords
        if max_vote_count:
            params["vote_count.lte"] = max_vote_count
        if without_genres:
            params["without_genres"] = without_genres
        if min_vote_average is not None:
            params["vote_average.gte"] = min_vote_average
        if with_origin_country:
            params["with_origin_country"] = with_origin_country
        if with_original_language:
            params["with_original_language"] = with_original_language
        if region:
            params["region"] = region
        if primary_release_date_lte:
            params["primary_release_date.lte"] = primary_release_date_lte
        if primary_release_date_gte:
            params["primary_release_date.gte"] = primary_release_date_gte
        if with_runtime_lte is not None:
            params["with_runtime.lte"] = with_runtime_lte
        if with_companies:
            params["with_companies"] = with_companies
        if with_watch_providers:
            params["with_watch_providers"] = with_watch_providers
        if watch_region:
            params["watch_region"] = watch_region

        data = await self._get(f"{self.base_url}/discover/movie", params)
        return {
            "movies": [self._format_movie(m) for m in data.get("results", [])],
            "page": data.get("page", 1),
            "total_pages": data.get("total_pages", 1),
        }

    # ──────────────── movie detail endpoints ────────────────

    async def get_movie_details(self, movie_id: int) -> dict:
        data = await self._get(f"{self.base_url}/movie/{movie_id}", {
            "api_key": self.api_key, "language": "tr-TR",
        })
        overview = data.get("overview", "")
        if not overview:
            try:
                en_data = await self._get(f"{self.base_url}/movie/{movie_id}", {
                    "api_key": self.api_key, "language": "en-US",
                })
                overview = en_data.get("overview", "")
            except Exception:
                pass
        # Extract genre_ids from the genres array (each has id + name)
        raw_genres = data.get("genres", [])
        genre_ids = [g["id"] for g in raw_genres if "id" in g]
        return {
            "id": data["id"],
            "title": data.get("title", ""),
            "overview": overview,
            "poster_url": (
                f"{self.image_base}/w500{data['poster_path']}"
                if data.get("poster_path") else None
            ),
            "backdrop_url": (
                f"{self.image_base}/w1280{data['backdrop_path']}"
                if data.get("backdrop_path") else None
            ),
            "release_date": data.get("release_date"),
            "vote_average": data.get("vote_average"),
            "runtime": data.get("runtime"),
            "genre_ids": genre_ids,
            "genres": [g["name"] for g in raw_genres],
            "tagline": data.get("tagline", ""),
        }

    async def get_movie_credits(self, movie_id: int, limit: int = 5) -> list:
        try:
            data = await self._get(f"{self.base_url}/movie/{movie_id}/credits", {
                "api_key": self.api_key,
            })
            return [
                {
                    "name": actor["name"],
                    "character": actor.get("character", ""),
                    "profile_path": (
                        f"{self.image_base}/w185{actor['profile_path']}"
                        if actor.get("profile_path") else None
                    ),
                }
                for actor in data.get("cast", [])[:limit]
            ]
        except Exception as e:
            print(f"Error fetching credits for movie {movie_id}: {e}")
            return []

    async def get_movie_keywords(self, movie_id: int) -> list:
        """Fetch keyword tags for a movie. Returns list of {id, name} dicts."""
        try:
            data = await self._get(f"{self.base_url}/movie/{movie_id}/keywords", {
                "api_key": self.api_key,
            })
            return data.get("keywords", [])
        except Exception:
            return []

    async def get_movie_watch_providers(self, movie_id: int, region: str = "TR") -> dict:
        data = await self._get(f"{self.base_url}/movie/{movie_id}/watch/providers", {
            "api_key": self.api_key,
        })
        region_data = data.get("results", {}).get(region, {})
        return self._format_watch_providers(region_data, region)

    # ──────────────── related movies ────────────────

    async def get_similar_movies(self, movie_id: int, page: int = 1) -> dict:
        try:
            data = await self._get(f"{self.base_url}/movie/{movie_id}/similar", {
                "api_key": self.api_key, "language": "tr-TR", "page": page,
            })
            return {
                "movies": [self._format_movie(m) for m in data.get("results", [])],
                "page": data.get("page", 1),
                "total_pages": data.get("total_pages", 1),
            }
        except Exception:
            return {"movies": [], "page": 1, "total_pages": 1}

    async def get_recommendations(self, movie_id: int, page: int = 1) -> dict:
        try:
            data = await self._get(f"{self.base_url}/movie/{movie_id}/recommendations", {
                "api_key": self.api_key, "language": "tr-TR", "page": page,
            })
            return {
                "movies": [self._format_movie(m) for m in data.get("results", [])],
                "page": data.get("page", 1),
                "total_pages": data.get("total_pages", 1),
            }
        except Exception:
            return {"movies": [], "page": 1, "total_pages": 1}

    async def get_movie_videos(self, movie_id: int) -> dict:
        """En iyi resmî YouTube fragmanını döndürür. tr-TR boşsa en-US'e düşer.
        Dönen: {"key", "name", "type", "official", "site"} ya da {}."""
        def _pick(results):
            # SADECE gerçek fragman/teaser kabul et — "filmle ilgili" rastgele
            # YouTube videoları (Clip, Featurette, Behind the Scenes vb.) ELENİR.
            type_rank = {"Trailer": 0, "Teaser": 1}
            yt = [
                v for v in results
                if v.get("site") == "YouTube" and v.get("key")
                and v.get("type") in type_rank
            ]
            if not yt:
                return None

            def sort_key(v):
                return (
                    0 if v.get("official") else 1,   # resmî öncelik
                    type_rank.get(v.get("type"), 2), # Trailer > Teaser
                )
            # Eşitlikte en yeni published_at (stable sort: önce tarihe göre sırala)
            yt.sort(key=lambda v: (v.get("published_at") or ""), reverse=True)
            yt.sort(key=sort_key)
            best = yt[0]
            return {
                "key": best.get("key"),
                "name": best.get("name"),
                "type": best.get("type"),
                "official": bool(best.get("official")),
                "site": "YouTube",
            }
        try:
            for lang in ("tr-TR", "en-US"):
                data = await self._get(f"{self.base_url}/movie/{movie_id}/videos", {
                    "api_key": self.api_key, "language": lang,
                })
                picked = _pick(data.get("results", []))
                if picked:
                    return picked
            return {}
        except Exception:
            return {}

    # ──────────────── bulk helpers (parallel) ────────────────

    async def get_keywords_batch(self, movie_ids: list) -> dict:
        """Fetch keywords for multiple movies in parallel. Returns {movie_id: [kw_list]}."""
        async def _fetch_one(mid):
            kw = await self.get_movie_keywords(mid)
            return mid, kw

        results = await asyncio.gather(*[_fetch_one(mid) for mid in movie_ids],
                                        return_exceptions=True)
        out = {}
        for r in results:
            if isinstance(r, tuple):
                out[r[0]] = r[1]
        return out

    async def discover_pages_parallel(self, genre_ids: list, pages: list,
                                       **kwargs) -> list:
        """Fetch multiple discover pages in parallel. Returns flat movie list."""
        async def _fetch_page(p):
            result = await self.discover_movies(genre_ids, page=p, **kwargs)
            return result.get("movies", [])

        page_results = await asyncio.gather(*[_fetch_page(p) for p in pages],
                                             return_exceptions=True)
        movies = []
        for r in page_results:
            if isinstance(r, list):
                movies.extend(r)
        return movies

    # ──────────────── person search ────────────────

    async def search_person(self, query: str) -> list:
        """Search for actors/directors by name."""
        try:
            data = await self._get(f"{self.base_url}/search/person", {
                "api_key": self.api_key, "query": query,
                "language": "tr-TR", "page": 1, "include_adult": False,
            })
            persons = []
            for p in data.get("results", [])[:5]:
                persons.append({
                    "id": p["id"],
                    "name": p.get("name", ""),
                    "known_for_department": p.get("known_for_department", ""),
                    "popularity": p.get("popularity", 0),
                    "profile_path": (
                        f"{self.image_base}/w185{p['profile_path']}"
                        if p.get("profile_path") else None
                    ),
                    "known_for": [
                        {
                            "id": kf.get("id"),
                            "title": kf.get("title") or kf.get("name", ""),
                            "media_type": kf.get("media_type", "movie"),
                        }
                        for kf in p.get("known_for", []) if kf.get("media_type") == "movie"
                    ],
                })
            return persons
        except Exception as e:
            print(f"Error searching person '{query}': {e}")
            return []

    async def get_person_movie_credits(self, person_id: int) -> list:
        """Get movie credits for a person (as cast or crew/director)."""
        try:
            data = await self._get(f"{self.base_url}/person/{person_id}/movie_credits", {
                "api_key": self.api_key, "language": "tr-TR",
            })
            movies = []
            seen_ids = set()
            # Cast roles
            for m in data.get("cast", []):
                if m.get("id") not in seen_ids and m.get("vote_count", 0) >= 20:
                    seen_ids.add(m["id"])
                    movies.append(self._format_movie(m))
            # Directed movies
            for m in data.get("crew", []):
                if m.get("job") == "Director" and m.get("id") not in seen_ids and m.get("vote_count", 0) >= 20:
                    seen_ids.add(m["id"])
                    movies.append(self._format_movie(m))
            # Sort by popularity
            movies.sort(key=lambda x: -(x.get("popularity", 0)))
            return movies[:30]
        except Exception as e:
            print(f"Error fetching person credits for {person_id}: {e}")
            return []

    async def get_director_filmography(self, person_id: int, limit: int = 12,
                                       min_vote_count: int = 100) -> list:
        """Bir yönetmenin SADECE yönettiği filmleri döndürür (oyunculuk hariç).

        Küratöryel listeler için kullanılır: elle ID girmek hatalıdır, bu yöntem
        TMDB'nin resmi crew verisinden çektiği için liste %100 doğru olur.
        vote_count'a göre sıralar (en bilinen başyapıtlar üstte).
        """
        try:
            data = await self._get(f"{self.base_url}/person/{person_id}/movie_credits", {
                "api_key": self.api_key, "language": "tr-TR",
            })
            seen = set()
            directed = []
            for m in data.get("crew", []):
                if m.get("job") != "Director":
                    continue
                mid = m.get("id")
                if not mid or mid in seen:
                    continue
                if (m.get("vote_count", 0) or 0) < min_vote_count:
                    continue
                if (m.get("vote_average", 0) or 0) < 5.5:
                    continue
                seen.add(mid)
                directed.append(self._format_movie(m))
            # En bilinen / en çok oylanan başyapıtlar önce
            directed.sort(key=lambda x: -(x.get("vote_count", 0) or 0))
            return directed[:limit]
        except Exception as e:
            print(f"Error fetching director filmography for {person_id}: {e}")
            return []

    # ──────────────── search ────────────────

    async def search_movies(self, query: str, page: int = 1) -> list:
        data = await self._get(f"{self.base_url}/search/movie", {
            "api_key": self.api_key, "query": query,
            "language": "tr", "page": page, "include_adult": False,
        })
        movies = []
        for movie in data.get("results", [])[:20]:
            movies.append({
                "id": movie["id"],
                "title": movie["title"],
                "overview": movie.get("overview", ""),
                "poster_url": (
                    f"{self.image_base}/w500{movie['poster_path']}"
                    if movie.get("poster_path") else None
                ),
                "poster_path": movie.get("poster_path"),
                "release_date": movie.get("release_date"),
                "vote_average": movie.get("vote_average"),
                "genre_ids": movie.get("genre_ids", []),
            })
        return movies

    async def search_keyword(self, query: str) -> list:
        """TMDB keyword araması — tema terimini (örn. 'summer') keyword ID'sine çevirir.
        Döner: [{"id": int, "name": str}] (popülerliğe göre TMDB sırasıyla)."""
        if not query:
            return []
        data = await self._get(f"{self.base_url}/search/keyword", {
            "api_key": self.api_key, "query": query, "page": 1,
        })
        return [{"id": k["id"], "name": k.get("name", "")} for k in data.get("results", [])[:5]]

    # ──────────────── internal ────────────────

    def _format_watch_providers(self, region_data: dict, region: str) -> dict:
        result = {
            "region": region,
            "link": region_data.get("link"),
            "flatrate": [], "rent": [], "buy": [], "free": [], "ads": [],
        }
        for category in ("flatrate", "rent", "buy", "free", "ads"):
            providers = region_data.get(category, [])
            result[category] = [
                {
                    "provider_id": p.get("provider_id"),
                    "provider_name": p.get("provider_name"),
                    "logo_url": (
                        f"{self.image_base}/w92{p['logo_path']}"
                        if p.get("logo_path") else None
                    ),
                    "display_priority": p.get("display_priority", 999),
                }
                for p in providers
            ]
            result[category].sort(key=lambda x: x.get("display_priority", 999))
        return result


tmdb_service = TMDBService()
