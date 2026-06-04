"""
Taste Map Engine — Embedding-independent local profile analysis.

Purely deterministic, NumPy-free. Never calls external APIs.
Uses only: user signals data + movie_repository table + mood profiles.
"""
import json
import logging
import asyncio
from collections import Counter, defaultdict
from typing import Optional

logger = logging.getLogger(__name__)

# ── Mood metadata (tempo, atmosphere) mirrored from main.py ─────────────
MOOD_TEMPO = {
    "kalp": "slow", "sessiz": "slow", "gozyasi": "slow", "zamanyolcusu": "slow",
    "kadraj-estetigi": "slow", "geceyarisi-itirafi": "slow",
    "adrenalin": "fast", "kahkaha": "fast", "sipsak": "fast",
}
MOOD_ATMOSPHERE = {
    "gece": "dark", "deep-chills": "dark", "zihin": "dark", "karmakar": "dark",
    "askbahcesi": "romantic",
}

# ── Genre → style classification ────────────────────────────────────────
_INDIE_GENRES = {18, 99, 36, 10402, 10749}       # Drama, Documentary, History, Music, Romance
_MAINSTREAM_GENRES = {28, 12, 878, 53, 80, 10752, 27, 35, 10751, 14, 37, 9648}

# ── Dynamic title templates ─────────────────────────────────────────────
_TITLE_TEMPLATES: dict[str, list[str]] = {
    "zihin":     ["Zihin Büken Sinema Kaşifi", "Labirent Ruhlu Kaşif", "Bulanık Mantık Ustası"],
    "gece":      ["Gece Kuşu Koleksiyoneri", "Karanlık Sokakların Sakini", "Gölgelerin Efendisi"],
    "battaniye": ["Sıcak Yuva Muhafızı", "Rahat Koltuğun Kâşifi", "Huzur Koleksiyoneri"],
    "deep-chills": ["Karanlık Odaların Misafiri", "Ürperti Ustası", "Tedirgin Ruhların Dostu"],
    "kahkaha":   ["Kahkaha Koleksiyoneri", "Eğlence Ustası", "Neşe Kaşifi"],
    "yolculuk":  ["Sınır Tanımayan Gezgin", "Yol Arkadaşı", "Ufukların Kâşifi"],
    "kalp":      ["Bağımsız Ruh", "Sanat Sinemasının Sakini", "Küçük Hikayelerin Büyük Hayranı"],
    "adrenalin": ["Adrenalin Avcısı", "Hız Tutkunu", "Patlama Ustası"],
    "sipsak":    ["Kısa ve Öz Ustası", "Zamanın Kıymetini Bilen", "Minimalist Sinema Hayranı"],
    "zamanyolcusu": ["Zaman Yolcusu", "Nostalji Kaşifi", "Klasiklerin Muhafızı"],
    "sessiz":    ["Sessizliğin Hakimi", "Meditasyon Ustası", "Sakin Ruh"],
    "gozyasi":   ["Duygu Avcısı", "Gözyaşı Koleksiyoneri", "Katarsis Kaşifi"],
    "askbahcesi": ["Aşk Bahçesinin Sakini", "Romantik Ruh", "Kalbimin Efendisi"],
    "karmakar":  ["Sürrealist Ruh", "Deneysel Zihin", "Sıradışının Peşindeki"],
    "kadraj-estetigi": ["Görsel Şölen Ustası", "Kadraj Avcısı", "Estetik Ruh"],
    "geceyarisi-itirafi": ["Geceyarısı Sohbetçisi", "Derin Diyalogların Peşindeki", "Gece Sessizliğinin Dostu"],
}

_INDIE_TITLES = [
    "Gurme Festival Gezgini", "Bağımsız Sinema Kâşifi",
    "Sanat Sinemasının Derinliklerinde",
]
_MAINSTREAM_TITLES = [
    "Popüler Sinema Koleksiyoneri", "Gişe Kaşifi",
    "Blockbuster Ruhlu",
]
_MIXED_TITLES = [
    "Sinema Kültürünün Çok Yönlü Kâşifi",
    "Her Türden Beslenen Sinema Ruhu",
]

# ── Üstad summary building blocks ───────────────────────────────────────
_MOOD_SLOW_DESC = "Yavaş tempolu, karakter odaklı ve duygusal filmler sende daha çok iz bırakıyor."
_MOOD_FAST_DESC = "Yüksek tempolu, enerjik ve heyecanlı filmlere güçlü bir ilgin var."
_MOOD_DARK_DESC = "Karanlık, gizemli ve düşündüren atmosferler sana daha yakın geliyor."

_MOOD_SPECIAL_DESC = {
    "deep-chills": "Korkuda ani sıçratmalardan çok atmosferik ve psikolojik gerilimlere yakınsın.",
    "zihin": "Beklenmedik dönüşler, karmaşık planlar ve zihin açan hikayeler seni daha çok çekiyor.",
    "zamanyolcusu": "Eski sinema hissi, klasikler ve geçmiş dönem atmosferi ilgini çekiyor.",
    "kahkaha": "Bazen sinemayı sadece rahatlamak ve gülmek için kullandığın çok belli.",
    "kalp": "Büyük hikayelerden çok, küçük ama derin dokunuşlar seni daha çok etkiliyor.",
    "sessiz": "Sessizliğin ve dinginliğin içinde kaybolmayı seven bir sinema ruhun var.",
    "geceyarisi-itirafi": "Derin diyaloglar, gece yürüyüşleri ve samimi hesaplaşmalar sana daha yakın.",
}

_STYLE_INDIE_DESC = "Bağımsız ve sanatsal yapımlara daha yakın duruyorsun."
_STYLE_MAINSTREAM_DESC = "Popüler ve ana akım yapımlara daha sıcak bakıyorsun."
_STYLE_MIXED_DESC = "Hem bağımsız hem popüler sinemaya açık bir zevk haritan var."

_ERA_OLD_DESC = "Klasik dönem sinemasına ve zamansız yapımlara ilgin artıyor."
_ERA_NEW_DESC = "Güncel ve modern tempolu filmlere yakın duruyorsun."
_ERA_BALANCED_DESC = "Geçmişten günümüze geniş bir zaman aralığında film keşfediyorsun."

# ── Not duygu sözlüğü (sıfır-maliyet, LLM'siz) ───────────────────────────
# Kullanıcının not metnindeki ton, o filmin zevk haritasına katkısını ölçekler:
# beğenilen film → daha güçlü sinyal; beğenilmeyen → zayıf sinyal.
_NOTE_POSITIVE = (
    "harika", "muhteşem", "müthiş", "mükemmel", "başyapıt", "efsane", "şahane",
    "bayıldım", "sevdim", "beğendim", "favori", "favorim", "çok iyi", "çok güzel",
    "güzeldi", "etkileyici", "unutulmaz", "tavsiye", "kesinlikle izleyin",
    "10/10", "destansı", "dokundu", "ağlattı", "harikaydı", "süper", "bayıldığım",
    "❤", "🔥", "⭐", "👍", "😍",
)
_NOTE_NEGATIVE = (
    "berbat", "rezalet", "kötüydü", "çok kötü", "sıkıcı", "vasat", "beğenmedim",
    "sevmedim", "zaman kaybı", "saçma", "boştu", "pişman", "fazla uzun",
    "uyudum", "yarıda bıraktım", "hayal kırıklığı", "0/10", "berbattı",
    "👎", "😴", "🤮",
)


def score_movie_for_profile(profile: dict, movie: dict, mood_id: str = None) -> float:
    """Bir filmin, kullanıcının zevk profiline KİŞİSEL uyum skoru (0..99).

    Frontend `utils/personalMatch.js` ile AYNI mantık (taban mood_score + tür
    örtüşmesi + mood yakınlığı) — "Sana Özel" şeridi ve Discover uyum% tutarlı
    olsun diye. Tamamen deterministik, sıfır-maliyet.
    """
    base = movie.get("mood_score")
    if not isinstance(base, (int, float)) or base <= 0:
        base = 72.0

    genre_weight = {}
    max_g = 1.0
    for g in profile.get("top_genres", []) or []:
        gid = g.get("genre_id")
        if gid is not None:
            s = g.get("score") or 0
            genre_weight[gid] = s
            if s > max_g:
                max_g = s
    mood_pct = profile.get("mood_pct", {}) or {}

    adj = 0.0
    weighted = False

    gids = movie.get("genre_ids") or []
    if genre_weight and gids:
        g = 0.0
        for gid in gids:
            if gid in genre_weight:
                g += genre_weight[gid] / max_g
        g = min(1.0, g / min(len(gids), 3))
        adj += (g - 0.4) * 30 * 0.6
        weighted = True

    mp = mood_pct.get(mood_id) if mood_id else None
    if mp is not None:
        adj += (min(1.0, mp / 35.0) - 0.5) * 20 * 0.4
        weighted = True

    if not weighted:
        return float(base)
    return max(60.0, min(99.0, base + adj))


class TasteMapEngine:
    """
    Local, deterministic, embedding-independent taste map analyzer.
    Never calls external APIs. Relies only on user signals and local DB.
    """

    def __init__(self, cache=None, tmdb_service=None):
        self.cache = cache
        self.tmdb_service = tmdb_service

    # ── Public API ────────────────────────────────────────────────────────

    async def analyze(self, user_id: int) -> dict:
        """
        Full taste analysis pipeline.
        Returns dict with: dynamic_title, top_moods, mood_pct, mood_full,
                          top_genres, era_preferences, pacing_profile,
                          style_profile, summary, signals, confidence.
        """
        signals = await self._get_signals(user_id)
        total = len(signals)
        if total == 0:
            return self._empty_result()

        # _counts'u _enrich_signals'tan önce kaydet (çünkü _enrich dict'ten siliyor)
        counts = signals.pop("_counts", {})
        total = len(signals)  # _counts çıktıktan sonra gerçek film sayısı
        if total == 0:
            return self._empty_result()

        enriched = await self._enrich_signals(signals)

        mood_scores = self._compute_mood_scores(enriched)
        genre_scores = self._compute_genre_scores(enriched)

        # Fallback: if total >= 5 but enrichment yielded nothing, distribute evenly
        if not mood_scores and total >= 5:
            from backend.mood_profiles import MOOD_PROFILES
            share = total / len(MOOD_PROFILES)
            for mid in MOOD_PROFILES:
                mood_scores[mid] = share

        if not genre_scores and total >= 5:
            # Fallback: enriched varsa filmlerin genre'lerinden çek, yoksa Drama ata
            if enriched:
                for item in enriched:
                    for gid in (item.get("genre_ids") or [18]):
                        genre_scores[gid] = genre_scores.get(gid, 0) + item["weight"]
            else:
                genre_scores[18] = float(total)

        era_stats = self._compute_era_stats(enriched)
        pacing = self._compute_pacing(enriched)
        style = self._compute_style(enriched)
        runtime_stats = self._compute_runtime_stats(enriched)

        top_moods = self._top_n(mood_scores, 5)
        top_moods_list = [
            {"mood_id": mid, "title": self._mood_title(mid), "score": s}
            for mid, s in top_moods
        ]
        mood_pct = self._to_percentages(mood_scores)
        mood_full = {mid: round(v, 1) for mid, v in mood_pct.items()}

        top_genres_list = [
            {"genre_id": gid, "name": self._genre_name(gid), "score": s}
            for gid, s in self._top_n(genre_scores, 5)
        ]

        # Not tonu istatistiği (özet için) — enrich sırasında hesaplanan
        # note_sentiment değerlerini yeniden kullan.
        note_items = [e for e in enriched if e.get("note_text")]
        note_stats = {
            "count": len(note_items),
            "positive": sum(1 for e in note_items if e.get("note_sentiment", 1.0) > 1.0),
            "negative": sum(1 for e in note_items if e.get("note_sentiment", 1.0) < 1.0),
        }

        mood_ids = [mid for mid, _ in top_moods]
        title = self._generate_title(mood_ids, style, era_stats)
        summary = self._generate_summary(mood_ids, top_genres_list, era_stats, total, runtime_stats, style, pacing, note_stats)

        confidence = "low" if total < 3 else ("medium" if total < 8 else "high")

        return {
            "dynamic_title": title,
            "top_moods": top_moods_list,
            "mood_pct": mood_pct,
            "mood_full": mood_full,
            "top_genres": top_genres_list,
            "era_preferences": {
                "pre_1990": era_stats["pre_1990"],
                "1991_2009": era_stats["mid"],
                "2010_plus": era_stats["post_2000"],
                "recent_5_years": era_stats["recent"],
                "mean_year": era_stats.get("mean_year"),
                "year_range_min": min([e.get("year") for e in enriched if e.get("year")]) if any(e.get("year") for e in enriched) else None,
                "year_range_max": max([e.get("year") for e in enriched if e.get("year")]) if any(e.get("year") for e in enriched) else None,
                "dynamic_era_label": era_stats.get("dynamic_era_label", "Zamansız"),
                "dynamic_era_desc": era_stats.get("dynamic_era_desc", ""),
            },
            "pacing_profile": pacing,
            "style_profile": style,
            "runtime_profile": runtime_stats,
            "summary": summary,
            "signals": {
                "total_movies": total,
                "watchlist_count": counts.get("watchlist", 0),
                "future_count": counts.get("future", 0),
                "notes_count": counts.get("note", 0),
                "analyzed_count": counts.get("analyzed", 0),
            },
            "confidence": confidence,
        }

    # ── Signal fetching ──────────────────────────────────────────────────

    async def _get_signals(self, user_id: int) -> dict:
        """Get user signals from cache layer."""
        if not self.cache:
            return {}

        signals = await self.cache.get_user_movie_signals(user_id=user_id)
        if not signals:
            return {}

        # Kaynak kırılımını hesapla ve sinyallere iliştir (analyze() bunu
        # _counts olarak okur). Önceden hesaplanıp atılıyordu → tüm sayımlar
        # (watchlist_count, notes_count, ...) yanlışlıkla 0 dönüyordu.
        counts = Counter()
        for tid, sig in signals.items():
            for src in sig.get("sources", []):
                counts[src] += 1
        signals["_counts"] = dict(counts)
        return signals

    async def _enrich_signals(self, signals: dict) -> list[dict]:
        """
        Enrich each signal movie with metadata from movie_repository.
        We batch-query both mood_classifications and movie_repository to
        avoid N+1 and to be independent of embedding services.
        Now also fetches runtime, popularity for richer profiling.
        """
        # _counts zaten analyze() içinde pop ile çıkarıldı, güvenlik kontrolü
        signals.pop("_counts", None)

        tmdb_ids = list(signals.keys())
        if not tmdb_ids:
            return []

        # 1) Batch mood from mood_classifications
        mood_map = {}
        if self.cache:
            try:
                mood_map = await self.cache.get_mood_classifications_batch(tmdb_ids)
            except Exception:
                pass

        # 2) Batch movie_repository data (mood_id, genre_ids, year, popularity)
        repo_data = {}
        if self.cache:
            try:
                repo_data = await self.cache.get_movies_from_repository_batch(tmdb_ids)
            except Exception:
                pass

        # 3) Batch movie_cache data for genre_ids fallback + year + runtime
        cache_data = {}
        if self.cache:
            try:
                for tid in tmdb_ids:
                    movie = await self.cache.get_movie(tid)
                    if movie:
                        cache_data[tid] = movie
            except Exception:
                pass

        enriched = []
        for tid in tmdb_ids:
            sig = signals[tid]
            weight = min(sig["score"], 5)

            # Not metni tonuna göre ağırlığı ölçekle (sıfır-maliyet duygu analizi):
            # beğenilen film haritaya daha güçlü, beğenilmeyen daha zayıf katkı verir.
            note_text = sig.get("note_text")
            note_sentiment = self._note_sentiment(note_text) if note_text else 1.0
            weight = weight * note_sentiment

            mood_id = mood_map.get(tid)
            genre_ids = []
            year = None
            runtime = None
            popularity = None

            # Try repo data first
            repo = repo_data.get(tid, {})
            if repo:
                if not mood_id:
                    mood_id = repo.get("mood_id")
                genre_ids = repo.get("genre_ids", []) or []
                rd = repo.get("release_date", "")
                if rd and len(rd) >= 4 and rd[:4].isdigit():
                    year = int(rd[:4])
                popularity = repo.get("popularity")

            # Fall back to cache data
            if not genre_ids:
                cached = cache_data.get(tid, {})
                genre_ids = cached.get("genre_ids", []) or []
                if year is None:
                    rd = cached.get("release_date", "")
                    if rd and len(rd) >= 4 and rd[:4].isdigit():
                        year = int(rd[:4])
                if runtime is None:
                    runtime = cached.get("runtime")
                if popularity is None:
                    popularity = cached.get("popularity")

            enriched.append({
                "tmdb_id": tid,
                "weight": weight,
                "mood_id": mood_id,
                "genre_ids": genre_ids,
                "year": year,
                "runtime": runtime,
                "popularity": popularity,
                "sources": sig["sources"],
                "note_text": note_text,
                "note_sentiment": note_sentiment,
            })

        # 4) TMDB fallback: movies still missing genre_ids
        if self.tmdb_service:
            missing = [e for e in enriched if not e["genre_ids"]]
            if missing:
                async def _fetch_one(tid: int) -> dict | None:
                    try:
                        return await self.tmdb_service.get_movie_details(tid)
                    except Exception:
                        return None
                tasks = [_fetch_one(e["tmdb_id"]) for e in missing]
                results = await asyncio.gather(*tasks, return_exceptions=True)
                for item, result in zip(missing, results):
                    if isinstance(result, dict) and result:
                        if not item["genre_ids"]:
                            item["genre_ids"] = result.get("genre_ids", []) or []
                        if item["year"] is None:
                            rd = result.get("release_date", "")
                            if rd and len(rd) >= 4 and rd[:4].isdigit():
                                item["year"] = int(rd[:4])
                        if item["runtime"] is None:
                            item["runtime"] = result.get("runtime")

        return enriched

    # ── Scoring helpers ──────────────────────────────────────────────────

    def _compute_mood_scores(self, enriched: list[dict]) -> dict[str, float]:
        """
        Mood scoring: use mood_id from repository first, fall back to
        genre-to-mood mapping from MOOD_PROFILES.
        """
        scores: dict[str, float] = defaultdict(float)

        for item in enriched:
            w = item["weight"]

            # Primary: mood_id from movie_repository
            if item["mood_id"]:
                scores[item["mood_id"]] += w * 1.0
                continue

            # Fallback: genre → mood mapping
            gids = item["genre_ids"]
            if gids:
                from backend.mood_profiles import MOOD_PROFILES

                matched = set()
                for mid, profile in MOOD_PROFILES.items():
                    pos = set(profile.get("positive_genres", []))
                    if pos & set(gids):
                        matched.add(mid)

                if matched:
                    # Distribute weight across matched moods
                    share = w / len(matched)
                    for mid in matched:
                        scores[mid] += share

        return dict(scores)

    def _compute_genre_scores(self, enriched: list[dict]) -> dict[int, float]:
        scores: dict[int, float] = defaultdict(float)
        for item in enriched:
            for gid in item.get("genre_ids", []):
                scores[gid] += item["weight"]
        return dict(scores)

    def _compute_era_stats(self, enriched: list[dict]) -> dict:
        stats = {"pre_1990": 0.0, "mid": 0.0, "post_2000": 0.0, "recent": 0.0}
        years = []
        for item in enriched:
            y = item.get("year")
            w = item["weight"]
            if not y:
                continue
            years.append(y)
            if y <= 1990:
                stats["pre_1990"] += w
            elif y <= 2009:
                stats["mid"] += w
            else:
                stats["post_2000"] += w
                if y >= 2021:
                    stats["recent"] += w

        # Mean year for dynamic era description
        mean_year = round(sum(years) / len(years)) if years else None
        stats["mean_year"] = mean_year

        # Dynamic era label
        if not years:
            stats["dynamic_era_label"] = "Zamansız"
            stats["dynamic_era_desc"] = "Filmlerin yıllarına dair yeterli veri yok."
        else:
            year_range = max(years) - min(years) if years else 0
            if year_range >= 40:
                stats["dynamic_era_label"] = "Zaman Yolcusu"
                stats["dynamic_era_desc"] = (
                    f"{min(years)}'den {max(years)}'e uzanan geniş bir zaman algısı — "
                    f"klasik dönemden moderne sinema yolculuğu."
                )
            elif year_range >= 20:
                stats["dynamic_era_label"] = "Kuşaklar Arası Gezgin"
                stats["dynamic_era_desc"] = (
                    f"{min(years)}'lerden {max(years)}'lere uzanan dengeli bir zaman dağılımı."
                )
            elif mean_year and mean_year >= 2020:
                stats["dynamic_era_label"] = "Modern Zamanların Sakini"
                stats["dynamic_era_desc"] = "Güncel ve yeni çıkan filmlere odaklanıyorsun."
            elif mean_year and mean_year < 2000:
                stats["dynamic_era_label"] = "Klasik Sinema Tutkunu"
                stats["dynamic_era_desc"] = "Eski dönem sinemasına ve köklü yapımlara ilgin ağır basıyor."
            else:
                stats["dynamic_era_label"] = "Güncel Sinema Takipçisi"
                stats["dynamic_era_desc"] = "2000 sonrası modern sinemaya yakın duruyorsun."

        return stats

    def _compute_pacing(self, enriched: list[dict]) -> dict:
        """
        Structural/pacing profile based on mood tempo of matched moods.
        """
        mood_ids = set()
        for item in enriched:
            if item.get("mood_id"):
                mood_ids.add(item["mood_id"])

        if not mood_ids:
            return {"label": "Dengeli Ritim", "description": "Farklı tempolarda filmlerden beslenen bir zevk haritan var."}

        slow_count = sum(1 for m in mood_ids if MOOD_TEMPO.get(m) == "slow")
        fast_count = sum(1 for m in mood_ids if MOOD_TEMPO.get(m) == "fast")
        total = slow_count + fast_count

        if total == 0:
            return {"label": "Dengeli Ritim", "description": "Farklı tempolarda filmlerden beslenen bir zevk haritan var."}

        slow_pct = slow_count / total
        fast_pct = 1.0 - slow_pct
        if slow_pct >= 0.75:
            return {
                "label": "Ağır ve Sindirerek İzlenen Sanatsal Yapılar",
                "description": "Karakter odaklı, yavaş akan ve derinlikli filmlere yöneliyorsun.",
            }
        elif slow_pct >= 0.5:
            return {
                "label": "Dengeli Ritim: Sanatsal ve Tempolu",
                "description": "Hem derinlikli dramalar hem de enerjik yapılar arasında dengeli bir zevkin var.",
            }
        elif fast_pct >= 0.75:
            return {
                "label": "Yüksek Konseptli Popüler Sinema",
                "description": "Hızlı tempolu, heyecanlı ve sürükleyici filmlere daha yakınsın.",
            }
        else:
            return {
                "label": "Dengeli Ritim",
                "description": "Farklı tempolarda filmlerden beslenen bir zevk haritan var.",
            }

    def _compute_runtime_stats(self, enriched: list[dict]) -> dict:
        """
        Runtime-based profiling: average runtime, shortest/longest, category.
        Categories: <90dk = kısa, 90-120 = normal, 120-150 = uzun, >150 = epik
        """
        runtimes = []
        for item in enriched:
            r = item.get("runtime")
            if r and isinstance(r, (int, float)) and r > 0:
                runtimes.append(r)

        if not runtimes:
            return {
                "label": "Bilinmiyor",
                "description": "Film sürelerine dair yeterli veri yok.",
                "avg_minutes": None,
                "category": "unknown",
            }

        avg = sum(runtimes) / len(runtimes)
        if avg < 90:
            label = "Kısa ve Öz"
            desc = "Kısa metrajlı ve kompakt yapımlara yöneliyorsun."
            cat = "short"
        elif avg < 120:
            label = "Standart Süreli"
            desc = "Standart sinema sürelerini tercih ediyorsun."
            cat = "standard"
        elif avg < 150:
            label = "Uzun Soluklu"
            desc = "Sindirerek izlenen, uzun soluklu yapımlara vaktin var."
            cat = "long"
        else:
            label = "Epik Süreli"
            desc = "Epik uzunlukta, kuşatıcı sinema deneyimlerine açıksın."
            cat = "epic"

        return {
            "label": label,
            "description": desc,
            "avg_minutes": round(avg, 0),
            "category": cat,
        }

    def _compute_style(self, enriched: list[dict]) -> dict:
        """
        Indie vs Mainstream style classification based on genre distribution.
        """
        genre_ids = set()
        counts = defaultdict(int)
        for item in enriched:
            for gid in item.get("genre_ids", []):
                genre_ids.add(gid)
                counts[gid] += item["weight"]

        total_weight = sum(counts.values())
        if total_weight == 0:
            return {"label": "Sınıflandırılamadı", "indie_pct": 0, "mainstream_pct": 0, "description": ""}

        indie_weight = sum(v for gid, v in counts.items() if gid in _INDIE_GENRES)
        main_weight = sum(v for gid, v in counts.items() if gid in _MAINSTREAM_GENRES)

        indie_pct = round(indie_weight / total_weight * 100)
        main_pct = round(main_weight / total_weight * 100)
        indie_pct = min(indie_pct, 100)
        main_pct = min(main_pct, 100)

        if indie_pct >= 60:
            label = "Bağımsız Sinema Ağırlıklı"
            desc = _STYLE_INDIE_DESC
        elif main_pct >= 60:
            label = "Popüler Sinema Ağırlıklı"
            desc = _STYLE_MAINSTREAM_DESC
        else:
            label = "Hibrit: Bağımsız ve Popüler"
            desc = _STYLE_MIXED_DESC

        return {
            "label": label,
            "indie_pct": indie_pct,
            "mainstream_pct": main_pct,
            "description": desc,
        }

    # ── Title generation ─────────────────────────────────────────────────

    def _generate_title(self, mood_ids: list[str], style: dict, era: dict) -> str:
        if not mood_ids:
            return "Sinema Ruhu"

        top = mood_ids[0]

        # Check for special combo titles
        indie_pct = style.get("indie_pct", 0)
        if indie_pct >= 60:
            candidates = _INDIE_TITLES
        elif style.get("mainstream_pct", 0) >= 60:
            candidates = _MAINSTREAM_TITLES
        else:
            candidates = _MIXED_TITLES

        # Mood-specific title has priority
        mood_candidates = _TITLE_TEMPLATES.get(top)
        if mood_candidates:
            # Use hash of mood_ids for deterministic selection
            idx = hash("|".join(mood_ids[:3])) % len(mood_candidates)
            return mood_candidates[idx]

        # Fall back to style-based
        idx = hash("|".join(mood_ids[:2])) % len(candidates)
        return candidates[idx]

    # ── Summary generation ──────────────────────────────────────────────

    def _generate_summary(self, mood_ids: list[str], top_genres: list,
                          era: dict, total_signals: int,
                          runtime_stats: Optional[dict] = None,
                          style: Optional[dict] = None,
                          pacing: Optional[dict] = None,
                          note_stats: Optional[dict] = None) -> list[str]:
        if total_signals < 3:
            return []

        summaries = []
        top_mid = mood_ids[0] if mood_ids else None

        # ── 0. Not tonuna dayalı kişisel içgörü (defterdeki yazılı notlar) ──
        # Yüksek öncelik: yazılı notlar zevk haritasının en güçlü sinyali.
        if note_stats and note_stats.get("count", 0) >= 2:
            pos = note_stats.get("positive", 0)
            neg = note_stats.get("negative", 0)
            if pos >= 2 and pos >= neg * 2:
                summaries.append(
                    "Notların çoğu övgü dolu — sevdiğin filmleri tek tek işaretleyip arşivliyorsun. "
                    "Bu, zevk haritanı en çok netleştiren şey."
                )
            elif neg > pos:
                summaries.append(
                    "Notlarında eleştirel bir ton var — neyi sevmediğini açıkça yazıyorsun. "
                    "Bu, haritanı daha da keskinleştiriyor; beğenmediklerin önerilerden eleniyor."
                )
            else:
                summaries.append(
                    "Film notları tutan az sayıda izleyiciden birisin — yazdığın her satır, "
                    "zevk haritanı zenginleştiren güçlü bir imza."
                )

        # ── 1. Stil profili — Blockbuster/Indie/Hibrit ──
        if style:
            indie_pct = style.get("indie_pct", 0)
            main_pct = style.get("mainstream_pct", 0)
            if main_pct >= 70:
                summaries.append(
                    "Blockbuster ruhlusun — büyük bütçeli, geniş kitlelere hitap eden yapımlar seni çekiyor. "
                    "Görsel efektler, yıldız kadrolar ve epik anlatılar senin alanın."
                )
            elif main_pct >= 50:
                summaries.append(
                    "Popüler sinemaya yakınsın ama zaman zaman bağımsız yapımların derinliğini de arıyorsun. "
                    "Ana akımın kaliteli örneklerini seçen seçici bir izleyicisin."
                )
            elif indie_pct >= 70:
                summaries.append(
                    "Bağımsız sinema ruhu taşıyorsun — festival filmleri, küçük yapımlar ve yönetmen odaklı "
                    "hikayeler seni daha çok etkiliyor. Kalabalıktan ayrışan seçimler yapıyorsun."
                )
            elif indie_pct >= 50:
                summaries.append(
                    "Sanatsal yapımlara eğilimin belirgin ama popüler sinemanın enerjisinden de kopuk değilsin. "
                    "İki dünya arasında dengeli bir tat var zevkinde."
                )
            else:
                summaries.append(
                    "Her türden beslenen bir sinema ruhu — bağımsız yapımlardan blockbuster'lara, "
                    "küçük hikayelerden büyük prodüksiyonlara kadar geniş bir yelpazedesin."
                )

        # ── 2. Tempo/ritim profili ──
        if pacing and pacing.get("label"):
            summaries.append(f"{pacing['label']}: {pacing['description']}")

        # ── 3. Top mood özel açıklama ──
        if top_mid and top_mid in _MOOD_SPECIAL_DESC:
            summaries.append(_MOOD_SPECIAL_DESC[top_mid])

        # ── 4. Mood kombinasyon açıklamaları ──
        slow_moods = [m for m in mood_ids if MOOD_TEMPO.get(m) == "slow"]
        fast_moods = [m for m in mood_ids if MOOD_TEMPO.get(m) == "fast"]
        dark_moods = [m for m in mood_ids if MOOD_ATMOSPHERE.get(m) == "dark"]

        if len(slow_moods) >= 2 and len(dark_moods) >= 1:
            summaries.append("Ağır tempolu, karanlık atmosferli ve düşündüren filmler — sinema senin meditasyon aracın.")
        elif len(slow_moods) >= 2:
            summaries.append(_MOOD_SLOW_DESC)
        elif len(fast_moods) >= 2:
            summaries.append(_MOOD_FAST_DESC)

        if len(dark_moods) >= 2:
            summaries.append(_MOOD_DARK_DESC)

        # Romantic
        romantic_moods = [m for m in mood_ids if MOOD_ATMOSPHERE.get(m) == "romantic"]
        if len(romantic_moods) >= 1:
            summaries.append("Romantikte sıcak, kırılgan ve gerçekçi hikayelere daha çok yaklaşıyorsun.")

        # ── 5. Dönem profili (detaylı) ──
        dyn_label = era.get("dynamic_era_label")
        dyn_desc = era.get("dynamic_era_desc")
        mean_year = era.get("mean_year")
        if dyn_label and dyn_desc:
            era_detail = f"{dyn_label}: {dyn_desc}"
            # Ekstra zenginleştirme
            if mean_year:
                if mean_year >= 2015:
                    era_detail += " Son 10 yılın ödüllü yapımları ve yeni nesil yönetmenler seni besliyor."
                elif mean_year >= 2000:
                    era_detail += " 2000'ler sinemasının olgun dönemi — Nolan, Villeneuve, Fincher kuşağı sana yakın."
                elif mean_year >= 1990:
                    era_detail += " 90'ların altın çağı — Tarantino, Coen Kardeşler, David Lynch atmosferi var zevkinde."
            summaries.append(era_detail)

        # ── 6. Runtime açıklaması ──
        if runtime_stats and runtime_stats.get("category") and runtime_stats["category"] != "unknown":
            summaries.append(runtime_stats["description"])

        # ── 7. Tür tercihleri ──
        genre_descs = {
            18: "Drama senin temel besin kaynağın — karakter gelişimi ve duygusal derinlik her zaman önceliğin.",
            27: "Korku türüne yakınsın — özellikle atmosferik ve psikolojik gerilimler seni daha çok çekiyor.",
            35: "Komedi senin rahatlama aracın — zekice yazılmış diyaloglar ve absürt durumlar seni güldürüyor.",
            10749: "Romantik filmlere sıcak bakıyorsun — büyük jestlerden çok samimi ve gerçekçi aşk hikayeleri.",
            878: "Bilim kurgu seni büyülüyor — gelecek vizyonları, teknoloji ve felsefe bir arada.",
            53: "Gerilim senin alanın — beklenmedik dönüşler ve süspans seni ekrana kilitleyen şey.",
            28: "Aksiyon filmleri seni besliyor — koreografi, hız ve fiziksel sinema sana hitap ediyor.",
            80: "Suç filmleri ilgini çekiyor — karmaşık planlar, ahlaki ikilemler ve sokak hikayeleri.",
            16: "Animasyona ilgin var — sadece çocuk filmi değil, sanatsal ve yetişkin animasyonlar da dahil.",
            99: "Belgeseller seni çekiyor — gerçek hikayelerin gücüne ve bilginin estetiğine inanan bir izleyicisin.",
        }
        for g in top_genres[:2]:
            gid = g.get("genre_id")
            if gid in genre_descs:
                summaries.append(genre_descs[gid])
                break

        return summaries[:7]

    # ── Pure helpers ─────────────────────────────────────────────────────

    @staticmethod
    def _top_n(d: dict, n: int) -> list:
        return sorted(d.items(), key=lambda x: -x[1])[:n]

    @staticmethod
    def _to_percentages(scores: dict[str, float]) -> dict[str, float]:
        total = sum(scores.values())
        if total == 0:
            return {}
        return {k: round(v / total * 100, 1) for k, v in scores.items()}

    @staticmethod
    def _note_sentiment(text: str) -> float:
        """Not metnindeki kaba ton (sıfır-maliyet, sözlük tabanlı).

        Döndürür: 1.4 (olumlu) · 1.0 (nötr) · 0.45 (olumsuz). Bu çarpan,
        filmin zevk haritasına katkı ağırlığını ölçekler — böylece beğenilen
        filmler haritayı daha çok, beğenilmeyenler daha az şekillendirir.
        """
        if not text:
            return 1.0
        t = text.lower()
        pos = sum(1 for w in _NOTE_POSITIVE if w in t)
        neg = sum(1 for w in _NOTE_NEGATIVE if w in t)
        if pos > neg:
            return 1.4
        if neg > pos:
            return 0.45
        return 1.0

    @staticmethod
    def _empty_result() -> dict:
        return {
            "dynamic_title": "Sinema Ruhu",
            "top_moods": [],
            "mood_pct": {},
            "mood_full": {},
            "top_genres": [],
            "era_preferences": {},
            "pacing_profile": {},
            "style_profile": {},
            "runtime_profile": {},
            "summary": [],
            "signals": {"total_movies": 0, "watchlist_count": 0, "future_count": 0, "notes_count": 0, "analyzed_count": 0},
            "confidence": "low",
        }

    @staticmethod
    def _mood_title(mood_id: str) -> str:
        return {
            "battaniye": "Battaniye Modu", "yolculuk": "Yolculuk Ruhu", "gece": "Gece Kuşu",
            "kahkaha": "Kahkaha Molası", "gozyasi": "Gözyaşı Gecesi", "adrenalin": "Adrenalin Patlaması",
            "askbahcesi": "Aşk Bahçesi", "zamanyolcusu": "Zaman Yolcusu", "sessiz": "Sessiz Yolculuk",
            "zihin": "Zihin Savaşı", "kalp": "Kalbimin Sesi", "karmakar": "Karmaşakar",
            "sipsak": "Şipşak", "deep-chills": "Derin Ürperti",
            "kadraj-estetigi": "Kadraj Estetiği", "geceyarisi-itirafi": "Geceyarısı İtirafı",
        }.get(mood_id, mood_id.replace("-", " ").title())

    @staticmethod
    def _genre_name(gid: int) -> str:
        return {
            28: "Aksiyon", 12: "Macera", 16: "Animasyon", 35: "Komedi",
            80: "Suç", 99: "Belgesel", 18: "Dram", 10751: "Aile",
            14: "Fantastik", 36: "Tarih", 27: "Korku", 10402: "Müzik",
            9648: "Gizem", 10749: "Romantik", 878: "Bilim Kurgu",
            10752: "Savaş", 53: "Gerilim", 37: "Western",
        }.get(gid, "?")
