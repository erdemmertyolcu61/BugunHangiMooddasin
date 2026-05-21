"""
Sinemood — Local Semantic Vector Search Engine
100% free, zero API keys, fully offline after first model download.

Architecture:
  [TODO 1] Model: paraphrase-multilingual-MiniLM-L12-v2 (384-dim)
           Loaded exactly ONCE at cold start via thread-safe singleton.
           Supports Turkish (TR) and English (EN) queries natively.

  [TODO 2] Corpus synthesis: _synthesize_movie_corpus() blends title,
           genres, overview, cast, directors, keywords into a clean
           searchable text block per movie.

  [TODO 3] Non-blocking async: all model.encode() calls are offloaded
           to a background thread via asyncio.to_thread() so the ASGI
           event loop is never blocked.

  [TODO 4] Pure numpy cosine similarity: pre-normalized matrix dot
           product against query vector. <5ms for 65K movies.

  [TODO 5] Gated relevance: hard threshold >= 0.38. Below that, return
           empty results with a clean Üstad message instead of random
           fallback noise.

Performance budget:
  - Model load:    ~2-4s (first import), cached in memory forever after
  - Embed query:   ~15-30ms on CPU (384-dim is fast)
  - Search 65K:    <5ms (numpy matmul)
  - Total e2e:     <50ms per request (vs 40s+ with LLM calls)
  - Memory:        ~100MB model + ~100MB for 65K × 384 matrix

Dependencies: sentence-transformers, numpy (added to requirements.txt)
"""

import logging
import asyncio
import struct
import threading
from typing import Optional

import numpy as np

logger = logging.getLogger("semantic_search")

# ─── Thread-safe model singleton ──────────────────────────────────────────────
# [TODO 1] The model is loaded exactly ONCE, guarded by a threading lock.
# All subsequent calls reuse the cached instance.

_MODEL_NAME = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
_EMBEDDING_DIM = 384  # This model outputs 384-dim vectors

_model_instance = None
_model_lock = threading.Lock()


def _get_model():
    """
    Thread-safe lazy singleton for the sentence-transformers model.
    First call downloads + loads the model (~100MB). All subsequent calls
    return the cached instance instantly.
    """
    global _model_instance
    if _model_instance is not None:
        return _model_instance

    with _model_lock:
        # Double-check after acquiring lock (another thread may have loaded it)
        if _model_instance is not None:
            return _model_instance

        logger.info("[SemanticSearch] Loading model: %s ...", _MODEL_NAME)
        try:
            from sentence_transformers import SentenceTransformer
            _model_instance = SentenceTransformer(_MODEL_NAME)
            logger.info(
                "[SemanticSearch] Model loaded. Dim=%d, size=~100MB",
                _EMBEDDING_DIM,
            )
        except ImportError:
            logger.error(
                "[SemanticSearch] sentence-transformers not installed! "
                "Run: pip install sentence-transformers"
            )
            raise
        except Exception as e:
            logger.error("[SemanticSearch] Model load failed: %s", e)
            raise

    return _model_instance


# ─── Mood query expansion — premium mood keşif anahtar kelimeleri ──────────
# Kullanıcının doğal dil sorgusu bu tetikleyicileri içeriyorsa sorgu
# otomatik genişletilir. Böylece sinematografi/sohbet odaklı aramalar
# premium mood'ların vektör uzayına daha iyi oturur.
_MOOD_QUERY_EXPANSIONS = {
    "sinematografi":   "cinematography visual masterpiece symmetry breathtaking color palette "
                       "neon-lighting slow-burn visual storytelling meticulous framing "
                       "poetic imagery composition",
    "görsel":          "visual masterpiece symmetry breathtaking color palette "
                       "neon-lighting slow-burn visual storytelling meticulous framing "
                       "poetic imagery",
    "estetik":         "aesthetic visual composition artistic beauty cinematography "
                       "symmetry color palette poetic imagery",
    "kompozisyon":     "composition symmetry framing visual storytelling artistic cinematography",
    "renk paleti":     "color palette visual masterpiece cinematography aesthetic composition",
    "diyalog":         "dialogue-driven heavy conversation deep talk philosophical debate "
                       "intimate atmosphere verbal tension wordplay intellectual soul",
    "sohbet":          "conversation dialogue intimate talk philosophical debate "
                       "human relationship verbal tension wordplay",
    "itiraf":          "confession intimate dialogue deep conversation late-night talk "
                       "philosophical human relationship soul",
    "konuşma":         "dialogue conversation intimate talk philosophical debate "
                       "human relationship verbal wordplay",
    "gece yarısı":     "late-night confession intimate dialogue deep conversation "
                       "philosophical debate human relationship soul searching",
}

# ─── Üstad note templates ─────────────────────────────────────────────────────

_USTAD_TEMPLATES = [
    "{title} sıradan bir {genre} filmi değil — {year} yılında çekilmiş olmasına rağmen her izleyişte taze kalan nadir yapımlardan.",
    "{genre} türünde {title} kadar içtenlikle konuşan film az bulunur. {year} yapımı bu eser, jenerik akarken bile sende bir iz bırakacak cinsten.",
    "{year} yılından gelen {title}, perdede görünen her şeyin altında sessiz bir fırtına taşıyor.",
    "{title} bittiğinde koltuğunda bir süre kıpırdamadan oturacaksın. {year} yapımı bu {genre} filmi, sinemanın en dürüst hallerinden biri.",
    "25 yıldır {genre} filmleri izlerim; {title} o rafın en üst sırasında duranlardan.",
    "{title} gibi filmler yılda bir gelir belki. {genre} kalıplarının dışına çıkmış, kendi kurallarını yazan bir {year} yapımı.",
    "{genre} sevenler {title} adını duyunca gözleri parlar — ve haklıdırlar.",
    "Bazı filmler sadece izlenmez, yaşanır. {title} tam öyle bir {genre} deneyimi.",
    "{title} için tek bir kelime yeterli: otantik. {year} yapımı bu {genre} filmi, sahte duygulara yer bırakmıyor.",
    "{title} sessiz bir devrim. Gösterişsiz ama derin; {year} yılının {genre} dünyasına bıraktığı en kalıcı iz olabilir.",
    "Eğer {genre} türüne şüpheyle yaklaşıyorsan, {title} fikrini değiştirecek film olabilir.",
    "Koltukta geriye yaslan ve {title} akışına bırak kendini. Bu {year} yapımı {genre} filmi, sinema neden var sorusunun en güzel cevaplarından.",
]

_GENRE_NAMES = {
    28: "aksiyon", 12: "macera", 16: "animasyon", 35: "komedi",
    80: "suç", 99: "belgesel", 18: "drama", 10751: "aile",
    14: "fantastik", 36: "tarih", 27: "korku", 10402: "müzik",
    9648: "gizem", 10749: "romantik", 878: "bilim kurgu",
    10752: "savaş", 53: "gerilim", 37: "western",
}

_MOOD_REASON_MAP = {
    "battaniye":    "Sıcak ve rahatlatıcı tonu, yormadan içine çekiyor.",
    "yolculuk":     "Keşif hissi ve geniş ufkuyla seni bambaşka diyarlara götürecek.",
    "gece":         "Karanlık ve gizemli atmosferi bu geceki ruh haline çok uygun.",
    "kahkaha":      "Hafif ve eğlenceli yapısıyla kafanı dağıtmak için birebir.",
    "gozyasi":      "Duygusal derinliği ve samimi anlatımıyla içine işleyecek.",
    "adrenalin":    "Yüksek enerjisi ve tempolu yapısıyla seni koltuğa çivileyecek.",
    "askbahcesi":   "Romantik ve sıcak atmosferiyle kalbinde kelebekler uçuşturacak.",
    "zamanyolcusu": "Nostaljik dokusu ve zamansız atmosferiyle geçmişe bir yolculuk vaat ediyor.",
    "sessiz":       "Sakin ritmi ama duygusal derinliği bu geceye iyi uyuyor.",
    "zihin":        "Düşündüren yapısı ve merak uyandıran kurgusuyla bu akşama yakışıyor.",
    "kalp":         "Küçük bir hikaye ama içinde büyük bir dünya barındırıyor.",
    "karmakar":     "Sıradışı yapısı ve deneysel anlatımıyla alışılmışın dışına çıkarıyor.",
    "Retro":        "80'ler estetiği ve neon atmosferiyle zamanda geriye götürecek.",
    "deep-chills":       "Yavaş yanan gerilimi ve atmosferik anlatımıyla seçildi.",
    "kadraj-estetigi":   "Görsel şiirselliği ve sinematografik dokusuyla bu ruh haline çok uygun.",
    "geceyarisi-itirafi":"Diyoglarının derinliği ve samimi atmosferiyle bu geceye eşlik edecek.",
}


def _build_ustad_notu(title: str, genre_ids: list, release_date: str) -> str:
    """Generate a deterministic Üstad note from movie metadata."""
    genre_id = genre_ids[0] if genre_ids else 18
    genre = _GENRE_NAMES.get(genre_id, "sinema")
    year = (release_date or "")[:4] or "günümüzün"
    idx = abs(hash(title)) % len(_USTAD_TEMPLATES)
    template = _USTAD_TEMPLATES[idx]
    return template.format(title=title, genre=genre, year=year)


# ─── [TODO 2] Hybrid Context Corpus Synthesis ────────────────────────────────

def _synthesize_movie_corpus(movie: dict) -> str:
    """
    Aggregate a movie's metadata into a clean, normalized, lowercase text block
    optimized for semantic embedding.

    Blends: title + genres + overview/plot + cast/actors + directors + keywords.
    This gives the embedding model maximum semantic signal for matching.

    Example output:
      "inception. bilim kurgu, aksiyon, gerilim. a thief who steals corporate
       secrets through dream-sharing technology... leonardo dicaprio, tom hardy,
       elliot page. christopher nolan. dreams, heist, subconscious, spinning top"
    """
    parts = []

    # Title (both original and any Turkish title if present)
    title = (movie.get("title") or "").strip()
    if title:
        parts.append(title)

    original_title = (movie.get("original_title") or "").strip()
    if original_title and original_title.lower() != title.lower():
        parts.append(original_title)

    # Genres — use Turkish genre names for cross-lingual matching
    genre_ids = movie.get("genre_ids") or []
    genre_names = [_GENRE_NAMES.get(g, "") for g in genre_ids if g in _GENRE_NAMES]
    if genre_names:
        parts.append(", ".join(genre_names))

    # Overview / plot description — primary semantic content
    overview = (movie.get("overview") or "").strip()
    if overview:
        # Truncate very long overviews to keep embedding focused
        parts.append(overview[:600])

    # Cast / actors
    cast = movie.get("cast") or movie.get("actors") or ""
    if isinstance(cast, list):
        cast = ", ".join(str(c) for c in cast[:8])
    cast = str(cast).strip()
    if cast:
        parts.append(cast)

    # Directors
    directors = movie.get("directors") or movie.get("director") or ""
    if isinstance(directors, list):
        directors = ", ".join(str(d) for d in directors[:3])
    directors = str(directors).strip()
    if directors:
        parts.append(directors)

    # Keywords / tags
    keywords = movie.get("keywords") or movie.get("tags") or ""
    if isinstance(keywords, list):
        keywords = ", ".join(str(k) for k in keywords[:15])
    keywords = str(keywords).strip()
    if keywords:
        parts.append(keywords)

    # Release year for temporal context
    release_date = (movie.get("release_date") or "")[:4]
    if release_date:
        parts.append(release_date)

    corpus = ". ".join(parts).lower().strip()
    return corpus if corpus else "unknown film"


# ─── Main Engine ──────────────────────────────────────────────────────────────

class SemanticSearchEngine:
    """
    Local semantic vector search engine using sentence-transformers.

    Lifecycle:
      1. build_index(movies) — pre-compute embeddings for all movies (startup)
      2. search(query_text)  — embed query + cosine similarity (per request)

    Thread-safety: build_index() is called once. search() is read-only after.
    """

    def __init__(self):
        self._matrix: Optional[np.ndarray] = None  # (N, 384) L2-normalized
        self._tmdb_ids: list[int] = []
        self._meta: dict[int, dict] = {}
        self._ready = False
        self._movie_count = 0

    @property
    def is_ready(self) -> bool:
        return self._ready and self._movie_count > 0

    @property
    def movie_count(self) -> int:
        return self._movie_count

    # ── [TODO 2+3] Build index — runs in background thread ───────────────────

    def _encode_texts_sync(self, texts: list[str]) -> np.ndarray:
        """
        Synchronous embedding of multiple texts. Called via asyncio.to_thread().
        [TODO 3] This runs in an isolated thread — never blocks the ASGI loop.
        """
        model = _get_model()
        # batch encode with progress bar disabled for server environments
        embeddings = model.encode(
            texts,
            batch_size=64,
            show_progress_bar=False,
            normalize_embeddings=True,  # L2-normalize so dot product = cosine
            convert_to_numpy=True,
        )
        return embeddings  # shape (N, 384), already L2-normalized

    def _encode_single_sync(self, text: str) -> np.ndarray:
        """
        Synchronous embedding of a single query text.
        [TODO 3] Called via asyncio.to_thread().
        """
        model = _get_model()
        embedding = model.encode(
            text,
            show_progress_bar=False,
            normalize_embeddings=True,
            convert_to_numpy=True,
        )
        return embedding  # shape (384,)

    async def build_index(self, movies: list[dict]) -> int:
        """
        Pre-compute embeddings for all movies and build the search matrix.
        [TODO 2] Synthesizes corpus for each movie, then batch-encodes.
        [TODO 3] Offloaded to background thread via asyncio.to_thread().

        Parameters
        ----------
        movies : list of movie dicts with at minimum: id, title, overview

        Returns
        -------
        int : number of movies successfully indexed
        """
        if not movies:
            logger.warning("[SemanticSearch] No movies to index.")
            return 0

        logger.info("[SemanticSearch] Building index for %d movies...", len(movies))

        # Step 1: synthesize corpus for each movie
        valid_movies = []
        texts = []
        for m in movies:
            tmdb_id = m.get("id") or m.get("tmdb_id")
            if not tmdb_id:
                continue
            corpus = _synthesize_movie_corpus(m)
            texts.append(corpus)
            valid_movies.append(m)

        if not texts:
            logger.warning("[SemanticSearch] No valid movies after corpus synthesis.")
            return 0

        # Step 2: batch encode in background thread (non-blocking)
        try:
            embeddings = await asyncio.to_thread(self._encode_texts_sync, texts)
        except Exception as e:
            logger.error("[SemanticSearch] Batch encoding failed: %s", e)
            return 0

        # Step 3: build in-memory structures
        tmdb_ids = []
        meta = {}
        for i, m in enumerate(valid_movies):
            tmdb_id = m.get("id") or m.get("tmdb_id")
            tmdb_ids.append(tmdb_id)

            genre_ids = m.get("genre_ids") or []
            meta[tmdb_id] = {
                "id":           tmdb_id,
                "title":        m.get("title", ""),
                "poster_url":   m.get("poster_url"),
                "backdrop_url": m.get("backdrop_url"),
                "overview":     m.get("overview", ""),
                "release_date": m.get("release_date", ""),
                "vote_average": m.get("vote_average", 0.0),
                "genre_ids":    genre_ids,
                "mood_id":      m.get("primary_mood_id") or m.get("mood_id"),
                "ustad_notu":   m.get("ustad_notu") or _build_ustad_notu(
                    m.get("title", ""),
                    genre_ids,
                    m.get("release_date", ""),
                ),
            }

        self._matrix = embeddings.astype(np.float32)  # (N, 384), L2-normalized
        self._tmdb_ids = tmdb_ids
        self._meta = meta
        self._ready = True
        self._movie_count = len(tmdb_ids)

        mem_mb = (self._movie_count * _EMBEDDING_DIM * 4) / (1024 * 1024)
        logger.info(
            "[SemanticSearch] Index built: %d movies, %.1f MB matrix, dim=%d",
            self._movie_count, mem_mb, _EMBEDDING_DIM,
        )
        return self._movie_count

    async def load_from_db(self, db_instance) -> int:
        """
        Load movies from the repository DB and build the index.
        Compatible with the existing startup flow in main.py.

        Fixes the false-positive empty state race condition:
        Previously, if the fast_search table was empty (no pre-computed
        embeddings yet), load_from_db would return 0 even when 64K+ movies
        existed in the repository — causing "Henüz film yok" log noise and
        disabling semantic search until a 60s retry.

        Now: if fast_search table is empty BUT the repository has movies,
        the method falls through to load directly from the repository table
        and build the index on-the-fly.
        """
        # Phase 1: fast_search table (pre-computed embeddings — fastest path)
        try:
            rows = await db_instance.get_all_fast_search_rows()
            if rows:
                movies = []
                for row in rows:
                    movies.append({
                        "id":             row.get("tmdb_id"),
                        "title":          row.get("title", ""),
                        "overview":       row.get("overview", ""),
                        "poster_url":     row.get("poster_url"),
                        "backdrop_url":   row.get("backdrop_url"),
                        "release_date":   row.get("release_date", ""),
                        "vote_average":   row.get("vote_average", 0.0),
                        "genre_ids":      row.get("genre_ids", []),
                        "primary_mood_id": row.get("primary_mood_id"),
                        "ustad_notu":     row.get("ustad_notu"),
                    })
                n = await self.build_index(movies)
                if n > 0:
                    return n
        except Exception as e:
            logger.warning("[SemanticSearch] load_from_db (fast_search) failed: %s", e)

        # Phase 2: Repository has movies but no pre-computed embeddings yet.
        # Check count first to avoid false-positive "empty" state.
        try:
            # Use a raw count over all movies in the repository (no mood_id filter)
            # because count_repository_movies() requires a non-null mood_id string.
            from backend.database import _get_connection
            total = 0
            async with _get_connection(db_instance.db_path) as db:
                cursor = await db.execute(
                    "SELECT COUNT(*) FROM movie_repository WHERE vote_average >= 5.0"
                )
                row = await cursor.fetchone()
                if row:
                    total = row[0]

            if total > 0:
                logger.info(
                    "[SemanticSearch] fast_search boş ama repository'de %d film var — "
                    "vektör indeksi doğrudan repository'den oluşturuluyor...",
                    total,
                )
                # Load all repository movies in large batches
                all_movies = []
                page = 1
                per_page = 2000
                while True:
                    rows = await db_instance.get_repository_movies_paginated(
                        mood_id=None, page=page, per_page=per_page, sort_by="recommended"
                    )
                    movies_data = rows.get("movies", []) if isinstance(rows, dict) else rows
                    if not movies_data:
                        break
                    all_movies.extend(movies_data)
                    if len(movies_data) < per_page:
                        break
                    page += 1
                if all_movies:
                    logger.info(
                        "[SemanticSearch] %d film repository'den yüklendi, indeks oluşturuluyor...",
                        len(all_movies),
                    )
                    return await self.build_index(all_movies)
            else:
                logger.info(
                    "[SemanticSearch] Repository'de henüz film yok — "
                    "seed tamamlanınca tekrar denenecek."
                )
        except Exception as e:
            logger.warning("[SemanticSearch] load_from_db (repository fallback) failed: %s", e)

        return 0

    # ── [TODO 3+4] Search — async query embedding + numpy cosine ─────────────

    async def search(
        self,
        query_text: str,
        limit: int = 6,
        exclude_ids: Optional[set] = None,
        min_vote: float = 5.0,
        threshold: float = 0.38,
    ) -> dict:
        """
        Semantic search: embed the query locally, compute cosine similarity
        against the pre-built movie matrix, return top matches.

        [TODO 3] Query embedding runs in background thread (non-blocking).
        [TODO 4] Cosine similarity via numpy dot product (matrix is pre-normalized).
        [TODO 5] Hard threshold gate — no random fallback below 0.38.

        Parameters
        ----------
        query_text  : natural language query (TR or EN)
        limit       : max results to return (default 6)
        exclude_ids : set of tmdb_ids to skip (anti-repetition)
        min_vote    : minimum vote_average filter
        threshold   : minimum cosine similarity to include (default 0.38)

        Returns
        -------
        dict with keys: movies, ustad_line, mode, query_understanding
        """
        if not self.is_ready:
            return {
                "movies": [],
                "ustad_line": "Arşiv henüz hazır değil evlat, biraz sabret.",
                "mode": "semantic_not_ready",
            }

        query_text = (query_text or "").strip()
        if not query_text:
            return {
                "movies": [],
                "ustad_line": "Bir şeyler yaz da sana film bulayım evlat.",
                "mode": "semantic_empty",
            }

        exclude_ids = exclude_ids or set()

        # Query expansion: premium mood tetikleyicilerine göre sorguyu genişlet
        query_lower = query_text.lower()
        expansions = []
        for trigger, keywords in _MOOD_QUERY_EXPANSIONS.items():
            if trigger in query_lower:
                expansions.append(keywords)
        if expansions:
            original = query_text
            query_text = f"{query_text} {' '.join(expansions)}"
            logger.debug("[SemanticSearch] Query expanded: '%s' → '%s'", original, query_text)

        # [TODO 3] Encode query in background thread — never block ASGI loop
        try:
            query_vec = await asyncio.to_thread(self._encode_single_sync, query_text)
        except Exception as e:
            logger.error("[SemanticSearch] Query encoding failed: %s", e)
            return {
                "movies": [],
                "ustad_line": "Arama motoru şu an yorgun evlat, birazdan tekrar dene.",
                "mode": "semantic_error",
            }

        # [TODO 4] Cosine similarity: (N,) = (N, 384) @ (384,)
        # Both matrix rows and query are L2-normalized, so dot product = cosine sim
        scores = self._matrix @ query_vec.astype(np.float32)  # shape (N,)

        # Candidate pool: take top (limit × 8) for filtering
        pool_size = min(limit * 8, len(self._tmdb_ids))
        top_idxs = np.argpartition(scores, -pool_size)[-pool_size:]
        top_idxs = top_idxs[np.argsort(scores[top_idxs])[::-1]]

        # [TODO 5] Gated relevance — hard threshold
        results = []
        for idx in top_idxs:
            sim = float(scores[idx])

            # Hard gate: reject anything below threshold
            if sim < threshold:
                break  # scores are sorted desc, so all remaining are lower

            tmdb_id = self._tmdb_ids[idx]
            if tmdb_id in exclude_ids:
                continue

            meta = self._meta.get(tmdb_id)
            if not meta:
                continue
            if meta.get("vote_average", 0) < min_vote:
                continue

            results.append(self._build_result(meta, sim))
            if len(results) >= limit:
                break

        # [TODO 5] If nothing passes threshold, return clean empty
        if not results:
            return {
                "movies": [],
                "ustad_line": "Aradığın sahneyi tam çıkaramadım evlat. "
                              "Biraz daha detay versen sana en yakın filmi bulurum.",
                "mode": "semantic_no_match",
                "query_understanding": query_text,
            }

        # Build response
        top_title = results[0]["title"] if results else ""
        top_score = results[0].get("mood_score", 0) if results else 0

        return {
            "movies": results,
            "ustad_line": (
                f"'{top_title}' tam senin anlattığın dünyadan. "
                f"%{top_score} benzerlikle buldum evlat."
            ),
            "mode": "semantic_local",
            "query_understanding": query_text,
        }

    # ── Embed single text for external use (e.g., /api/recommend/fast) ───────

    async def get_embedding(self, text: str) -> list[float]:
        """
        Embed a single text query. Returns 384-dim float list.
        Compatible with the existing embedding_service interface.
        [TODO 3] Non-blocking via asyncio.to_thread().
        """
        vec = await asyncio.to_thread(self._encode_single_sync, text)
        return vec.tolist()

    # ── Result builder ───────────────────────────────────────────────────────

    @staticmethod
    def _build_result(meta: dict, similarity: float) -> dict:
        mood_id = meta.get("mood_id")
        reason = _MOOD_REASON_MAP.get(mood_id, "Bu ruh haline uygun seçildi.")
        return {
            "id":           meta["id"],
            "title":        meta["title"],
            "poster_url":   meta.get("poster_url"),
            "backdrop_url": meta.get("backdrop_url"),
            "vote_average": meta.get("vote_average", 0.0),
            "genre_ids":    meta.get("genre_ids", []),
            "overview":     meta.get("overview", ""),
            "release_date": meta.get("release_date", ""),
            "mood_score":   round(similarity * 100, 1),
            "matched_moods": [mood_id] if mood_id else [],
            "reason":       reason,
            "ustad_notu":   meta.get("ustad_notu", ""),
        }


# ─── Module-level singleton ──────────────────────────────────────────────────

semantic_engine = SemanticSearchEngine()
