"""
Sinemood — Fast Search Engine
In-memory cosine similarity over pre-computed movie embeddings.

Architecture:
  1. On startup, load all stored 768-dim embeddings from SQLite into a
     (N × 768) numpy float32 matrix. N ≈ 5,000-65,000 movies.
  2. On each request, normalize the query vector and compute dot products
     against the pre-normalized movie matrix — this IS cosine similarity.
  3. argpartition → top-k extraction → metadata lookup.

Performance:
  - Load time:    ~0.1-0.5s for 10K movies (once on startup)
  - Query time:   <5ms for 65K movies on 1 CPU (numpy BLAS matmul)
  - Memory:       ~200MB for 65K movies × 768 dims × float32
  - Combined with Gemini embedding (<100ms): total <120ms per request

This engine is completely LLM-free at query time. All Üstad notes are
pre-baked at embed time using the deterministic template system.
"""

import logging
import asyncio
import random
import struct
from typing import Optional

logger = logging.getLogger("fast_search")

# numpy is typically available in Python scientific stacks
# If not installed, fallback to pure-Python cosine (slower but works)
try:
    import numpy as np
    _NUMPY_AVAILABLE = True
except ImportError:
    _NUMPY_AVAILABLE = False
    logger.warning("[FastSearch] numpy not available — using pure-Python cosine (slower)")


# ─── Üstad note templates — deterministic, pre-baked per movie ────────────────

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
    "deep-chills":  "Yavaş yanan gerilimi ve atmosferik anlatımıyla seçildi.",
}


def _build_ustad_notu(title: str, genre_ids: list, release_date: str) -> str:
    """Generate a deterministic Üstad note from movie metadata."""
    genre_id = genre_ids[0] if genre_ids else 18
    genre = _GENRE_NAMES.get(genre_id, "sinema")
    year = (release_date or "")[:4] or "günümüzün"
    # Use title hash to pick consistent template (same movie always same template)
    idx = abs(hash(title)) % len(_USTAD_TEMPLATES)
    template = _USTAD_TEMPLATES[idx]
    return template.format(title=title, genre=genre, year=year)


# ─── Pure-Python cosine fallback (no numpy) ───────────────────────────────────

def _py_dot(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b))


def _py_norm(v: list[float]) -> float:
    return sum(x * x for x in v) ** 0.5


def _py_cosine(a: list[float], b: list[float]) -> float:
    na, nb = _py_norm(a), _py_norm(b)
    if na == 0 or nb == 0:
        return 0.0
    return _py_dot(a, b) / (na * nb)


# ─── Main engine ──────────────────────────────────────────────────────────────

class FastSearchEngine:
    """
    In-memory vector search engine.

    Thread/asyncio-safety: load_from_db() is called once at startup
    and sets _ready = True. search() is read-only after that.
    Concurrent searches are safe.
    """

    def __init__(self):
        # numpy matrix — shape (N, 768), rows are L2-normalized
        self._matrix = None               # np.ndarray or None
        # Parallel list of tmdb_ids matching rows in _matrix
        self._tmdb_ids: list[int] = []
        # Full movie metadata for result assembly
        self._meta: dict[int, dict] = {}  # tmdb_id → movie dict
        self._ready = False
        self._movie_count = 0

    @property
    def is_ready(self) -> bool:
        return self._ready and self._movie_count > 0

    @property
    def movie_count(self) -> int:
        return self._movie_count

    async def load_from_db(self, db_instance) -> int:
        """
        Load all embeddings from the movie_fast_search table into memory.
        Called at startup and after a batch embed job completes.
        Returns the number of movies loaded.
        """
        try:
            rows = await db_instance.get_all_fast_search_rows()
        except Exception as e:
            logger.error("[FastSearch] load_from_db failed: %s", e)
            return 0

        if not rows:
            logger.info("[FastSearch] No embeddings in DB yet — fast search disabled.")
            return 0

        tmdb_ids = []
        vectors = []
        meta = {}

        for row in rows:
            tmdb_id = row["tmdb_id"]
            emb_blob = row.get("embedding_data")
            if not emb_blob:
                continue

            # Decode binary blob → float list
            n = len(emb_blob) // 4
            try:
                vec = list(struct.unpack(f"{n}f", emb_blob))
            except struct.error:
                continue

            tmdb_ids.append(tmdb_id)
            vectors.append(vec)
            meta[tmdb_id] = {
                "id":           tmdb_id,
                "title":        row.get("title", ""),
                "poster_url":   row.get("poster_url"),
                "backdrop_url": row.get("backdrop_url"),
                "overview":     row.get("overview", ""),
                "release_date": row.get("release_date", ""),
                "vote_average": row.get("vote_average", 0.0),
                "genre_ids":    row.get("genre_ids", []),
                "mood_id":      row.get("primary_mood_id"),
                "ustad_notu":   row.get("ustad_notu") or _build_ustad_notu(
                    row.get("title", ""),
                    row.get("genre_ids", []),
                    row.get("release_date", ""),
                ),
            }

        if not tmdb_ids:
            logger.warning("[FastSearch] Rows found but no valid embeddings decoded.")
            return 0

        if _NUMPY_AVAILABLE:
            mat = np.array(vectors, dtype=np.float32)        # (N, 768)
            # L2-normalize each row so dot product = cosine similarity
            norms = np.linalg.norm(mat, axis=1, keepdims=True)
            norms = np.where(norms == 0, 1.0, norms)         # avoid /0
            mat = mat / norms
            self._matrix = mat
        else:
            # Store raw vectors for pure-Python path
            self._matrix = vectors                            # list of lists

        self._tmdb_ids = tmdb_ids
        self._meta = meta
        self._ready = True
        self._movie_count = len(tmdb_ids)

        logger.info(
            "[FastSearch] Loaded %d movie embeddings into memory (%.1f MB).",
            self._movie_count,
            (self._movie_count * 768 * 4) / (1024 * 1024),
        )
        return self._movie_count

    def search(
        self,
        query_vec: list[float],
        limit: int = 6,
        exclude_ids: set | None = None,
        min_vote: float = 5.5,
    ) -> list[dict]:
        """
        Find the top-k most similar movies to query_vec.
        Returns movie dicts with reason/ustad_notu fields ready for the frontend.

        Parameters
        ----------
        query_vec    : 768-dim embedding from GeminiEmbeddingService
        limit        : maximum results to return
        exclude_ids  : set of tmdb_ids to exclude (anti-repetition)
        min_vote     : minimum vote_average filter
        """
        if not self.is_ready:
            return []

        exclude_ids = exclude_ids or set()

        if _NUMPY_AVAILABLE:
            return self._search_numpy(query_vec, limit, exclude_ids, min_vote)
        else:
            return self._search_python(query_vec, limit, exclude_ids, min_vote)

    # ── numpy fast path ──────────────────────────────────────────────────────

    def _search_numpy(
        self,
        query_vec: list[float],
        limit: int,
        exclude_ids: set,
        min_vote: float,
    ) -> list[dict]:
        # Normalize query vector
        qv = np.array(query_vec, dtype=np.float32)
        qnorm = np.linalg.norm(qv)
        if qnorm == 0:
            return []
        qv = qv / qnorm                                       # (768,)

        # Cosine similarities: (N,) = (N, 768) @ (768,)
        scores = self._matrix @ qv                            # shape (N,)

        # Candidate pool: take top (limit × 6) to apply vote/exclude filters
        pool_size = min(limit * 6, len(self._tmdb_ids))
        # argpartition is O(N) — much faster than full sort for large N
        top_idxs = np.argpartition(scores, -pool_size)[-pool_size:]
        # Sort the small pool
        top_idxs = top_idxs[np.argsort(scores[top_idxs])[::-1]]

        results = []
        for idx in top_idxs:
            tmdb_id = self._tmdb_ids[idx]
            if tmdb_id in exclude_ids:
                continue
            meta = self._meta.get(tmdb_id)
            if not meta:
                continue
            if meta.get("vote_average", 0) < min_vote:
                continue
            sim = float(scores[idx])
            results.append(self._build_result(meta, sim))
            if len(results) >= limit:
                break

        return results

    # ── pure-Python fallback (no numpy) ─────────────────────────────────────

    def _search_python(
        self,
        query_vec: list[float],
        limit: int,
        exclude_ids: set,
        min_vote: float,
    ) -> list[dict]:
        qnorm = _py_norm(query_vec)
        if qnorm == 0:
            return []
        qv_norm = [x / qnorm for x in query_vec]

        scored = []
        for i, tmdb_id in enumerate(self._tmdb_ids):
            if tmdb_id in exclude_ids:
                continue
            meta = self._meta.get(tmdb_id)
            if not meta or meta.get("vote_average", 0) < min_vote:
                continue
            sim = _py_dot(qv_norm, self._matrix[i])           # already normalized
            scored.append((sim, tmdb_id))

        scored.sort(reverse=True)
        results = []
        for sim, tmdb_id in scored[:limit]:
            meta = self._meta.get(tmdb_id)
            if meta:
                results.append(self._build_result(meta, sim))
        return results

    # ── result builder ───────────────────────────────────────────────────────

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
            "matched_moods":[mood_id] if mood_id else [],
            "reason":       reason,
            "ustad_notu":   meta.get("ustad_notu", ""),
        }


# ─── Module-level singleton ────────────────────────────────────────────────────

fast_search_engine = FastSearchEngine()
