"""
Search Engine — Unified Search Orchestrator with Intelligent Fallback

Architecture:
  Tier 1: Semantic search (sentence-transformers, local, 0 API)
  Tier 2: Fast vector search (Gemini embeddings + numpy matmul)
  Tier 3: Local regex/keyword search (zero API, always available)
  Tier 4: Curated fallback (mood-matched random, last resort)

When Tier 3 or 4 activates, `is_fallback: true` is returned so the frontend
can display "Üstad şu anda derin düşüncelerde..." messaging.
"""
import re
import time
import random
import logging
from typing import Optional

logger = logging.getLogger(__name__)


class SearchEngine:
    """
    4-tier fallback orchestrator for movie search.
    """

    # ── Mood keyword map (query word → mood_id) ────────────────────────
    MOOD_KEYWORDS: dict[str, list[str]] = {
        "battaniye":        ["battaniye", "rahat", "sıcak", "huzur", "konfor", "aile", "sevgi",
                              "cozy", "comfort", "warm", "peaceful", "snuggle", "soft",
                              "dinlen", "uyu", "pijama", "çay", "yağmur"],
        "yolculuk":         ["yolcu", "yolculuk", "macera", "keşif", "gez", "seya",
                              "travel", "adventure", "journey", "trip", "explor", "road trip",
                              "yol", "dağ", "orman", "doğa", "deniz", "okyanus"],
        "gece":             ["gece", "karanlık", "gizem", "suç", "dedektif",
                              "night", "dark", "crime", "mystery", "thriller", "noir", "detective",
                              "polis", "mafya", "soygun", "cinayet"],
        "kahkaha":          ["kahkaha", "komedi", "komik", "gül", "eğlence",
                              "laugh", "comedy", "funny", "humor", "hilarious",
                              "gülmek", "mizah", "şaka", "parti"],
        "gozyasi":          ["gözyaşı", "ağla", "hüzün", "duygu", "dram",
                              "cry", "sad", "tear", "emotional", "heartbreaking", "touching",
                              "acı", "kayıp", "özlem", "veda"],
        "adrenalin":        ["adrenalin", "aksiyon", "hız", "patlama", "savaş",
                              "action", "explosive", "fast", "chase", "battle",
                              "savaş", "silah", "dövüş", "yarış", "kovalamaca"],
        "askbahcesi":       ["aşk", "romantik", "aşk bahçesi", "romantizm",
                              "love", "romance", "romantic", "passion", "relationship",
                              "kalp", "öpücük", "düğün", "sevgili", "tutku"],
        "zamanyolcusu":     ["zaman", "nostalji", "klasik", "vintage", "eski",
                              "time", "nostalgia", "classic", "old", "retro",
                              "tarih", "dönem", "geçmiş", "antik", "kral"],
        "sessiz":           ["sessiz", "sakin", "meditasyon", "huzur",
                              "quiet", "silent", "meditative", "calm", "peaceful", "ambient",
                              "dingin", "sakin", "minimum", "minimalist"],
        "zihin":            ["zihin", "zeka", "bulmaca", "psikolojik", "gizem",
                              "mind", "puzzle", "psychological", "twist", "mystery",
                              "beyin", "akıl", "manipülasyon", "şifre"],
        "kalp":             ["bağımsız", "sanat", "indie", "festival", "art house",
                              "independent", "arthouse", "cult", "auteur", "sundance",
                              "bağımsız", "deneysel", "yaratıcı"],
        "karmakar":         ["karmaşık", "sürreal", "deneysel", "garip", "rüya",
                              "surreal", "experimental", "weird", "dream", "psychedelic",
                              "absürt", "tuhaf", "gerçeküstü", "fantezi"],
        "sipsak":           ["sipsak", "kısa", "hızlı", "çabuk", "az",
                              "short", "quick", "fast", "brief", "mini",
                              "sürat", "kompakt", "acele"],
        "deep-chills":      ["korku", "dehşet", "ürperti", "gerilim", "karanlık",
                              "horror", "scary", "creepy", "disturbing", "psycho",
                              "korkunç", "lanet", "hayalet", "kan", "şeytan"],
        "kadraj-estetigi":  ["kadraj", "estetik", "sinematografi", "görsel", "şölen",
                              "cinematography", "visual", "beautiful", "stunning", "frame",
                              "kompozisyon", "renk", "ışık", "simetri"],
        "geceyarisi-itirafi": ["itiraf", "gece yarısı", "diyalog", "sohbet", "konuşma",
                                "confession", "dialogue", "conversation", "talk", "midnight",
                                "derin", "sohbet", "felsefe", "varoluş"],
    }

    # ── Genre keyword → TMDB genre_id map ─────────────────────────────
    GENRE_KEYWORDS: dict[str, int] = {
        "aksiyon": 28, "action": 28,
        "macera": 12, "adventure": 12,
        "animasyon": 16, "animation": 16,
        "komedi": 35, "comedy": 35,
        "suç": 80, "crime": 80,
        "belgesel": 99, "documentary": 99,
        "dram": 18, "drama": 18,
        "aile": 10751, "family": 10751,
        "fantastik": 14, "fantasy": 14,
        "tarih": 36, "history": 36,
        "korku": 27, "horror": 27,
        "müzik": 10402, "music": 10402,
        "gizem": 9648, "mystery": 9648,
        "romantik": 10749, "romance": 10749,
        "bilim kurgu": 878, "sci-fi": 878,
        "gerilim": 53, "thriller": 53,
        "savaş": 10752, "war": 10752,
        "western": 37, "western": 37,
    }

    # ── REASON_MAP (copied from main.py to avoid circular imports) ─────
    REASON_MAP: dict[str, str] = {
        "sessiz":            "Sakin ritmi ama duygusal derinliği bu geceye iyi uyuyor.",
        "kalp":              "Küçük bir hikaye ama içinde büyük bir dünya barındırıyor.",
        "battaniye":         "Sıcak ve rahatlatıcı tonu, yormadan içine çekiyor.",
        "zihin":             "Düşündüren yapısı ve merak uyandıran kurgusuyla bu akşama yakışıyor.",
        "deep-chills":       "Yavaş yanan gerilimi ve atmosferik anlatımıyla seçildi.",
        "gece":              "Karanlık ve gizemli atmosferi bu geceki ruh haline çok uygun.",
        "kahkaha":           "Hafif ve eğlenceli yapısıyla kafanı dağıtmak için birebir.",
        "gozyasi":           "Duygusal derinliği ve samimi anlatımıyla içine işleyecek.",
        "adrenalin":         "Yüksek enerjisi ve tempolu yapısıyla seni koltuğa çivileyecek.",
        "askbahcesi":        "Romantik ve sıcak atmosferiyle kalbinde kelebekler uçuşturacak.",
        "yolculuk":          "Keşif hissi ve geniş ufkuyla seni bambaşka diyarlara götürecek.",
        "zamanyolcusu":      "Nostaljik dokusu ve zamansız atmosferiyle geçmişe bir yolculuk vaat ediyor.",
        "karmakar":          "Sıradışı yapısı ve deneysel anlatımıyla alışılmışın dışına çıkarıyor.",
        "sipsak":            "Kısa sürede büyük iz bırakan, kompakt sinematik vuruşlar — perde hemen açılıyor.",
        "kadraj-estetigi":   "Her kare bir tablo gibi; görsel şölen ve sinematografi başyapıtı.",
        "geceyarisi-itirafi":"Gece yarısı derin sohbetlerin ve samimi diyalogların filmi.",
    }

    _FALLBACK_NOTICE = (
        "Üstad şu anda derin düşüncelere dalmış durumda, "
        "ancak yine de sana en uygun filmleri bulmaya çalıştı."
    )

    _FALLBACK_NOTICE_LAST = (
        "Üstad derin düşüncelerde... Ama ruh haline en yakın filmleri buldum."
    )

    # ── Log deduplication ──────────────────────────────────────────────
    _last_log_time: dict[str, float] = {}

    @classmethod
    def _log_once(cls, key: str, msg: str, level: str = "warning", throttle: float = 30.0) -> None:
        now = time.monotonic()
        last = cls._last_log_time.get(key, 0.0)
        if now - last > throttle:
            getattr(logger, level, logger.warning)(msg)
            cls._last_log_time[key] = now

    # ── Stop words (TR + EN) ───────────────────────────────────────────
    _STOP_WORDS: set[str] = {
        "bir", "ve", "veya", "ile", "için", "mi", "mu", "mü",
        "the", "a", "an", "in", "on", "at", "to", "for", "of",
        "is", "it", "this", "that", "with", "from", "by",
        "ama", "ancak", "fakat", "çünkü", "ile", "gibi",
        "ben", "sen", "o", "biz", "siz", "onlar",
        "istediğim", "istiyorum", "bana", "sana", "ona",
        "film", "filmi", "filmler", "filmin", "filme",
        "movie", "movies", "sinema",
    }

    # ── Movie field names expected in results ─────────────────────────
    _REQUIRED_EXTRA_KEYS = {"mood_score", "matched_moods", "reason", "ustad_notu"}

    def __init__(self, semantic_engine=None, embedding_service=None,
                 fast_search_engine=None, cache=None):
        self.semantic = semantic_engine
        self.embedding = embedding_service
        self.fast_search = fast_search_engine
        self.cache = cache

    # ── Text helpers ────────────────────────────────────────────────────

    @staticmethod
    def _normalize(text: str) -> str:
        text = text.lower()
        text = re.sub(r'[^\w\s]', ' ', text)
        return re.sub(r'\s+', ' ', text).strip()

    def _tokenize(self, text: str) -> list[str]:
        normalized = self._normalize(text)
        words = normalized.split()
        return [w for w in words if len(w) > 2 and w not in self._STOP_WORDS]

    # ── Mood / genre matching helpers ──────────────────────────────────

    def _match_mood(self, tokens: list[str]) -> Optional[str]:
        scored: list[tuple[int, str]] = []
        for mood_id, keywords in self.MOOD_KEYWORDS.items():
            match_count = 0
            for token in tokens:
                for kw in keywords:
                    if token == kw:
                        match_count += 3
                    elif len(kw) >= 3 and kw in token:
                        match_count += 2
            if match_count:
                scored.append((match_count, mood_id))
        if scored:
            scored.sort(key=lambda x: -x[0])
            return scored[0][1]
        return None

    def _match_genres(self, tokens: list[str]) -> list[int]:
        matched: set[int] = set()
        for token in tokens:
            for keyword, gid in self.GENRE_KEYWORDS.items():
                if token == keyword:
                    matched.add(gid)
        return list(matched)

    def _keyword_score(self, movie: dict, tokens: list[str]) -> float:
        score = 0.0
        title = (movie.get("title") or "").lower()
        overview = (movie.get("overview") or "").lower()
        for token in tokens:
            if len(token) < 3:
                continue
            if token in title:
                score += 3.0 if title.startswith(token) else 1.5
            if token in overview:
                score += min(overview.count(token) * 0.3, 1.5)
        vote = float(movie.get("vote_average") or 0)
        score += min(vote / 20.0, 0.5)
        return score

    @staticmethod
    def _ensure_extra_keys(movies: list[dict], mood_id: str, notice: str) -> list[dict]:
        result = []
        for m in movies:
            if "mood_score" not in m:
                m["mood_score"] = 70.0
            if "matched_moods" not in m:
                m["matched_moods"] = [mood_id]
            if "reason" not in m:
                m["reason"] = "Bu ruh haline uygun seçildi."
            if "ustad_notu" not in m:
                m["ustad_notu"] = notice
            result.append(m)
        return result

    @staticmethod
    def _extract_movies(repo_result) -> list[dict]:
        if isinstance(repo_result, dict):
            return repo_result.get("movies", [])
        if isinstance(repo_result, list):
            return repo_result
        return []

    # ── Public search endpoint ──────────────────────────────────────────

    async def search(self, query_text: str, limit: int = 6,
                     min_vote: float = 5.5,
                     exclude_ids: Optional[set[int]] = None) -> dict:
        """
        4-tier search with increasing fallback aggressiveness.

        Returns dict with keys: movies, source, is_fallback, ustad_notu
        """
        if exclude_ids is None:
            exclude_ids = set()
        elif isinstance(exclude_ids, (list, tuple)):
            exclude_ids = set(exclude_ids)

        result: dict = {
            "movies": [],
            "source": "none",
            "is_fallback": False,
            "ustad_notu": "",
        }
        tokens = self._tokenize(query_text)

        # ── Tier 1: Semantic search (sentence-transformers) ──────────────
        if self.semantic and getattr(self.semantic, "is_ready", False):
            try:
                import asyncio
                sem_result = await asyncio.wait_for(
                    self.semantic.search(
                        query_text=query_text, limit=limit,
                        exclude_ids=exclude_ids, min_vote=min_vote,
                    ),
                    timeout=5.0,
                )
                movies = sem_result.get("movies", [])
                if movies:
                    result["movies"] = movies
                    result["source"] = "semantic"
                    return result
            except Exception as e:
                self._log_once("tier1", f"[Search] Tier 1 (semantic) başarısız: {e}")

        # ── Tier 2: Gemini embedding + fast vector search ────────────────
        emb_ok = self.embedding and getattr(self.embedding, "is_available", False)
        fast_ok = self.fast_search and getattr(self.fast_search, "is_ready", False)
        if emb_ok and fast_ok:
            try:
                import asyncio
                query_vec = await asyncio.wait_for(
                    self.embedding.get_embedding(query_text), timeout=8.0
                )
                if query_vec:
                    movies = self.fast_search.search(
                        query_vec=query_vec, limit=limit,
                        exclude_ids=exclude_ids, min_vote=min_vote,
                    )
                    if movies:
                        result["movies"] = movies
                        result["source"] = "vector"
                        return result
            except Exception as e:
                self._log_once("tier2", f"[Search] Tier 2 (vector) başarısız: {e}")

        # ── Tier 3: Local regex / keyword search (zero API) ──────────────
        if self.cache:
            try:
                movies = await self._regex_search(query_text, tokens, limit, min_vote, exclude_ids)
                if movies:
                    result["movies"] = movies
                    result["source"] = "regex_fallback"
                    result["is_fallback"] = True
                    result["ustad_notu"] = self._FALLBACK_NOTICE
                    return result
            except Exception as e:
                logger.error("[Search] Tier 3 (regex) hatası: %s", e)

        # ── Tier 4: Curated fallback (last resort) ───────────────────────
        try:
            movies = await self._curated_fallback(tokens, limit, min_vote, exclude_ids)
            if movies:
                result["movies"] = movies
                result["source"] = "curated_fallback"
                result["is_fallback"] = True
                result["ustad_notu"] = self._FALLBACK_NOTICE_LAST
        except Exception as e:
            logger.error("[Search] Tier 4 (curated) hatası: %s", e)

        return result

    # ── Tier 3 implementation ───────────────────────────────────────────

    # Tek kelimelik ünlü kişi adları — "Tarantino", "Nolan" vb. için
    _KNOWN_PERSONS = {
        "tarantino", "nolan", "kubrick", "scorsese", "ceylan", "spielberg",
        "hitchcock", "fellini", "bergman", "kurosawa", "lynch", "fincher",
        "villeneuve", "tarkovsky", "herzog", "haneke", "kieslowski",
        "kusturica", "polanski", "coppola", "godard", "truffaut",
        "cameron", "pitt", "dicaprio", "deniro", "pacino", "hopkins", "streep",
        "hanks", "cronenberg", "ersoy", "sorrentino",
    }

    def _looks_like_person_name(self, text: str) -> bool:
        """Kişi adı mı kontrolü — 2-3 kelime veya KNOWN_PERSONS'ta var mı."""
        norm = self._normalize(text)
        if norm in self._KNOWN_PERSONS:
            return True
        words = norm.split()
        if not (2 <= len(words) <= 3):
            return False
        return all(w.isalpha() and 2 <= len(w) <= 15 for w in words)

    async def _regex_search(self, query_text: str, tokens: list[str],
                            limit: int, min_vote: float,
                            exclude_ids: set[int]) -> list[dict]:
        """
        3-strategy local search:
          A) Exact / fuzzy title match via SQL LIKE
          A2) Person name → overview search
          B) Mood-mapped repository fetch + keyword scoring on overview
          C) Genre-matched filtering
        """
        # ── A) Title search ──────────────────────────────────────────────
        stripped = query_text.strip()
        if len(stripped) >= 3:
            title_matches = await self.cache.search_repository_by_title(stripped, limit=limit * 2)
            if title_matches:
                filtered = [
                    m for m in title_matches
                    if float(m.get("vote_average") or 0) >= min_vote
                    and m.get("id") not in exclude_ids
                ]
                if filtered:
                    return self._ensure_extra_keys(
                        filtered[:limit], "battaniye", self._FALLBACK_NOTICE
                    )

        # ── A2) Person name → overview search ────────────────────────────
        if self._looks_like_person_name(stripped) and self.cache:
            try:
                from backend.database import _get_connection
                async with _get_connection(self.cache.db_path) as db:
                    cursor = await db.execute(
                        """SELECT tmdb_id, title, poster_url, overview, release_date,
                                  vote_average, genre_ids, backdrop_url, vote_count,
                                  original_language, popularity, mood_id
                           FROM movie_repository
                           WHERE overview LIKE ? AND vote_average >= ?
                             AND poster_url IS NOT NULL
                           ORDER BY vote_count DESC LIMIT ?""",
                        (f"%{stripped}%", min_vote, limit * 2)
                    )
                    rows = await cursor.fetchall()
                    if rows:
                        overview_matches = [self.cache._row_to_movie(r) for r in rows]
                        overview_matches = [
                            m for m in overview_matches
                            if m.get("id") not in exclude_ids
                        ]
                        if overview_matches:
                            return self._ensure_extra_keys(
                                overview_matches[:limit], "battaniye", self._FALLBACK_NOTICE
                            )
            except Exception:
                pass

        # ── B) Mood-matched + keyword scoring ───────────────────────────
        mood_id = self._match_mood(tokens) or "battaniye"

        movies = self._extract_movies(
            await self.cache.get_repository_movies_paginated(
                mood_id, page=1, per_page=limit * 5, min_vote=min_vote,
            )
        )

        # If mood has no movies, try fallback moods
        if not movies:
            fallback_moods = [m for m in self.MOOD_KEYWORDS if m != mood_id]
            for mid in fallback_moods:
                movies = self._extract_movies(
                    await self.cache.get_repository_movies_paginated(
                        mid, page=1, per_page=limit * 5, min_vote=min_vote,
                    )
                )
                if movies:
                    mood_id = mid
                    break

        if not movies:
            return []

        movies = [m for m in movies if m.get("id") not in exclude_ids]
        scored = [(self._keyword_score(m, tokens), m) for m in movies]
        scored.sort(key=lambda x: -x[0])

        matched = [m for s, m in scored if s > 0.5][:limit]

        # ── C) Genre-based fallback ──────────────────────────────────────
        if not matched:
            genre_ids = self._match_genres(tokens)
            if genre_ids:
                gs = set(genre_ids)
                for m in movies:
                    m_gids = set(m.get("genre_ids", []))
                    if m_gids & gs:
                        matched.append(m)
                        if len(matched) >= limit:
                            break

        # Absolute last resort: return top scored regardless
        if not matched and scored:
            matched = [m for _, m in scored[:limit]]

        if matched:
            return self._ensure_extra_keys(matched, mood_id, self._FALLBACK_NOTICE)

        return []

    # ── Tier 4 implementation ───────────────────────────────────────────

    async def _curated_fallback(self, tokens: list[str], limit: int,
                                min_vote: float,
                                exclude_ids: set[int]) -> list[dict]:
        """Pick a mood from keywords, get quality movies, shuffle."""
        mood_id = self._match_mood(tokens) or "battaniye"

        movies = self._extract_movies(
            await self.cache.get_repository_movies_paginated(
                mood_id, page=1, per_page=limit * 4, min_vote=min_vote,
            )
        )

        if not movies:
            movies = self._extract_movies(
                await self.cache.get_repository_movies_paginated(
                    "battaniye", page=1, per_page=limit * 4, min_vote=max(4.0, min_vote - 1.0),
                )
            )

        if not movies:
            return []

        movies = [m for m in movies if m.get("id") not in exclude_ids]
        random.shuffle(movies)

        result = []
        for m in movies[:limit]:
            entry = {
                "id": m.get("id"),
                "title": m.get("title", ""),
                "poster_url": m.get("poster_url"),
                "backdrop_url": m.get("backdrop_url"),
                "vote_average": m.get("vote_average", 0.0),
                "genre_ids": m.get("genre_ids", []),
                "overview": m.get("overview", ""),
                "release_date": m.get("release_date", ""),
                "mood_score": m.get("mood_score", 50.0),
                "matched_moods": [mood_id],
                "reason": self.REASON_MAP.get(mood_id, "Bu ruh haline uygun seçildi."),
                "ustad_notu": self._FALLBACK_NOTICE_LAST,
            }
            result.append(entry)

        return result
