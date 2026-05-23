"""
Exact Match Router — Hızlı Öneri Butonları için sıfır-embedding pipeline.

Her buton etiketi, Gemini/embedding tamamen bypass edilerek doğrudan
SQL + Python post-processing "recipe" çalıştırır. 512MB RAM limitine
tam uyumludur: NumPy matris işlemi yok, vektör üretimi yok.

Mimari:
  1. Frontend buton labelı aynen backend'e gelir.
  2. match_recipe() bu label'ı BUTTON_RECIPES sözlüğünde arar.
  3. Eşleşme varsa execute_recipe() çalışır:
       a. İlgili mood bucket(lar)ından SQL ile film çeker.
       b. Python ile yıl/popülerlik/tür filtrelemesi yapar.
       c. Sıralama stratejisi uygular (mood_score / popularity / anti_popularity / vote_count).
       d. Sonuçlara recipe'e özel reason metni enjekte eder.
"""
import logging
import random
from typing import Optional

logger = logging.getLogger("exact_match_router")

# ─── TMDB Genre ID Sabitleri ──────────────────────────────────────────────────
_G_THRILLER   = [53]
_G_CRIME      = [80]
_G_MYSTERY    = [9648]
_G_ACTION     = [28]
_G_SCI_FI     = [878]
_G_ROMANCE    = [10749]

# ─── Üstad Gerekçe Şablonları ────────────────────────────────────────────────
_RECIPE_REASONS: dict[str, str] = {
    "battaniye_relaxing": (
        "Bu başyapıtı senin için seçtim; çünkü sıcak ve sarıp sarmalayan tonuyla "
        "günün tüm yorgunluğunu omuzlarından alacak cinsten."
    ),
    "kahkaha_joy": (
        "Bu filmi seçtim; çünkü her sahnesi gerçek bir sırıtışa, "
        "modu anında yukarı çeken bir neşeye dönüşüyor."
    ),
    "gece_dark": (
        "Bu başyapıtı senin için seçtim; çünkü gerilimini ve karanlık atmosferini "
        "hiç gözünü kırpmadan izleyeceğini garantileyebilirim."
    ),
    "askbahcesi_indie": (
        "Bu filmi seçtim; çünkü kalabalığın gözünden kaçmış, "
        "klişesiz ve gerçek bir duygusal yankı bırakan türden."
    ),
    "zihin_gems": (
        "Bu başyapıtı senin için seçtim; çünkü bittiğinde saatlerce "
        "kafanda yankılanacak — popülerliğin gölgesinde kalmış nadir bir kültü."
    ),
    "adrenalin_tension": (
        "Bu filmi seçtim; çünkü koltuktan dikilmek zorunda kalacaksın — "
        "tansiyonun tescilli, temposu hiç düşmüyor."
    ),
    "zamanyolcusu_vintage": (
        "Bu başyapıtı senin için seçtim; çünkü 2000 öncesi o sıcancık "
        "sinema kokusunu en saf haliyle taşıyanlardan."
    ),
    "sipsak_short": (
        "Bu filmi seçtim; çünkü vakit nakittir — kısa ama her dakikası dolu, "
        "büyük iz bırakan kompakt bir başyapıt."
    ),
}

# ─── Buton Label → Recipe Mapping ────────────────────────────────────────────
BUTTON_RECIPES: dict[str, dict] = {

    "Günün yorgunluğunu silecek yumuşacık filmler": {
        "moods":               ["battaniye"],
        "min_vote":            7.0,           # Kalite eşiği: battaniye + popüler
        "sort_by":             "mood_score",
        "mood_id":             "battaniye",
        "reason_key":          "battaniye_relaxing",
        "ustad_line":          "Günün yorgunluğu mı çöktü? İşte o sıcaklığı sunan seçimlerim.",
        "query_understanding": "Rahatlatıcı, sıcak atmosferli filmler — puan ≥ 7.0",
    },

    "Modu anında yükselten neşeli reçeteler": {
        "moods":               ["kahkaha"],
        "min_vote":            6.0,
        "sort_by":             "popularity",  # En popüler komedi filmleri öne
        "mood_id":             "kahkaha",
        "reason_key":          "kahkaha_joy",
        "ustad_line":          "Neşe dolu, anında modum yükselten seçimler — hazır mısın?",
        "query_understanding": "Popülerlik sıralı komedi ve eğlence filmleri",
    },

    "Gözünü kırpmadan izleyeceğin karanlık işler": {
        "moods":               ["gece", "adrenalin"],  # OR birleşimi
        "min_vote":            6.8,
        "sort_by":             "mood_score",
        "genre_ids_boost":     _G_THRILLER + _G_CRIME + _G_MYSTERY,  # Gerilim/Suç/Gizem öne
        "mood_id":             "gece",
        "reason_key":          "gece_dark",
        "ustad_line":          "Karanlık sular... İşte gözünü ayıramayacağın seçimlerim.",
        "query_understanding": "Gerilim, suç ve gizem — puan ≥ 6.8",
    },

    "İçini kıpır kıpır edecek ama klişesiz": {
        "moods":               ["askbahcesi"],
        "min_vote":            6.5,
        "sort_by":             "anti_popularity",  # En az popüler = kült/bağımsız
        "max_popularity_pct":  90,                 # En popüler %10 elenir
        "mood_id":             "askbahcesi",
        "reason_key":          "askbahcesi_indie",
        "ustad_line":          "Klişelerin ötesinde, gerçek bir duygusal yolculuk için seçtiklerim.",
        "query_understanding": "Kült/bağımsız romantizm — mainstream dışı seçimler",
    },

    "Bittiğinde bile saatlerce kafanda yaşayacaklar": {
        "moods":               ["zihin"],
        "min_vote":            7.0,
        "sort_by":             "anti_popularity",  # Saklı kalmış kült başyapıtlar
        "mood_id":             "zihin",
        "reason_key":          "zihin_gems",
        "ustad_line":          "Saklı başyapıtlar... Popülerliğin gözden kaçırdığı derin işler.",
        "query_understanding": "Zihin büken gizli kültler — düşük popülerlik, yüksek kalite",
    },

    "Koltukta dikilerek izletecek yüksek tansiyon": {
        "moods":               ["adrenalin"],
        "min_vote":            6.5,
        "sort_by":             "vote_count",       # Yüksek oy sayısı = tescilli tempo
        "genre_ids_boost":     _G_ACTION,          # Aksiyon türünü öne al
        "mood_id":             "adrenalin",
        "reason_key":          "adrenalin_tension",
        "ustad_line":          "Koltuktan dikileceğin sahne garanti — işte tescilli yüksek tansiyon.",
        "query_understanding": "Yüksek oy sayılı aksiyon/gerilim filmleri",
    },

    "Eski güzel günlerin o sıcancık sinema kokusu": {
        "moods":               ["zamanyolcusu"],
        "min_vote":            6.5,
        "sort_by":             "mood_score",
        "max_year":            1999,               # release_year < 2000 (kesin)
        "mood_id":             "zamanyolcusu",
        "reason_key":          "zamanyolcusu_vintage",
        "ustad_line":          "2000 öncesi... O sinema kokusunu taşıyan seçimlerim.",
        "query_understanding": "2000 yılı öncesi nostaljik klasikler",
    },

    "Üstad'ın Şipşak Önerileri": {
        "moods":               ["sipsak"],
        "min_vote":            6.0,
        "sort_by":             "mood_score",
        "mood_id":             "sipsak",
        "reason_key":          "sipsak_short",
        "ustad_line":          "Vakit nakittir... Kısa ama büyük iz bırakan seçimlerim.",
        "query_understanding": "Kısa süreli kompakt filmler — Şipşak odası",
    },
}


def match_recipe(text: str) -> Optional[dict]:
    """Tam eşleşme araması — buton label'ı BUTTON_RECIPES'te var mı?"""
    return BUTTON_RECIPES.get(text.strip())


async def execute_recipe(
    recipe: dict,
    limit: int,
    exclude_ids: list,
    db_instance,
) -> list[dict]:
    """
    Recipe'yi çalıştır: SQL çek → filtrele → sırala → reason enjekte et.
    Embedding yok, Gemini çağrısı yok — saf veri pipeline'ı.
    """
    moods: list[str] = recipe["moods"]
    min_vote: float  = recipe.get("min_vote", 6.0)
    sort_by: str     = recipe.get("sort_by", "mood_score")
    max_year: Optional[int]   = recipe.get("max_year")
    max_pop_pct: Optional[int]= recipe.get("max_popularity_pct")
    genre_boost: list[int]    = recipe.get("genre_ids_boost", [])
    reason_key: str  = recipe.get("reason_key", "")
    reason_text: str = _RECIPE_REASONS.get(reason_key, "Bu ruh haline özel seçildi.")
    mood_id: str     = recipe.get("mood_id", moods[0] if moods else "battaniye")

    fetch_limit = limit * 8
    exclude_set = set(int(x) for x in exclude_ids if x)

    # ── Adım 1: Her mood bucket'tan SQL ile film çek ──────────────────────────
    raw: list[dict] = []
    for mid in moods:
        try:
            rows = await db_instance.get_top_scored_movies_by_mood(
                mid, min_vote=min_vote, limit=fetch_limit
            )
            raw.extend(rows)
        except Exception as e:
            logger.warning("[ExactRouter] get_top_scored_movies_by_mood('%s') failed: %s", mid, e)
            try:
                rows = await db_instance.get_top_repository_movies_by_mood(
                    mid, min_vote=min_vote, limit=fetch_limit
                )
                raw.extend(rows)
            except Exception as fallback_e:
                logger.warning("[ExactRouter] Fallback fetch also failed: %s", fallback_e)

    if not raw:
        logger.warning("[ExactRouter] Recipe '%s' yielded no results.", recipe.get("query_understanding", ""))
        return []

    # ── Adım 2: Deduplikasyon ──────────────────────────────────────────────────
    seen: dict[int, dict] = {}
    for m in raw:
        mid = m.get("id") or m.get("tmdb_id")
        if mid is not None and mid not in seen:
            seen[mid] = m
    movies = list(seen.values())

    # ── Adım 3: Oturum exclude filtresi ──────────────────────────────────────
    movies = [m for m in movies if (m.get("id") or m.get("tmdb_id")) not in exclude_set]

    # ── Adım 4: Yıl filtresi (zamanyolcusu: max_year=2000) ───────────────────
    if max_year is not None:
        filtered_by_year = []
        for m in movies:
            rd = m.get("release_date", "") or ""
            try:
                if int(rd[:4]) <= max_year:
                    filtered_by_year.append(m)
            except (ValueError, TypeError):
                pass  # Release date yoksa bu vintage modda atla
        movies = filtered_by_year

    # ── Adım 5: Tür boost'u (genre önceliği — OR mantığı) ────────────────────
    if genre_boost:
        boost_set = set(genre_boost)

        def _has_boost(m: dict) -> bool:
            return bool(set(m.get("genre_ids", [])) & boost_set)

        boosted   = [m for m in movies if _has_boost(m)]
        unboosted = [m for m in movies if not _has_boost(m)]
        movies = boosted + unboosted

    # ── Adım 6: Sıralama stratejisi ───────────────────────────────────────────
    if sort_by == "popularity":
        # Kahkaha: en popüler eğlence filmlerini öne al
        movies.sort(key=lambda m: m.get("popularity", 0.0), reverse=True)

    elif sort_by == "anti_popularity":
        # Saklı kalmış kültler: en popüler %N'i NumPy yerine Python maskesiyle ele
        if max_pop_pct is not None and len(movies) > 10:
            popularities = sorted(
                (m.get("popularity", 0.0) for m in movies), reverse=True
            )
            cutoff_idx = max(0, int(len(popularities) * max_pop_pct / 100) - 1)
            threshold  = popularities[cutoff_idx]
            movies = [m for m in movies if m.get("popularity", 0.0) <= threshold]

        # Düşük popülerlik = saklı kalmış kült
        movies.sort(key=lambda m: m.get("popularity", 0.0))

        # İlk 20'yi karıştır — her seferinde aynı hidden gems gelmesin
        if len(movies) > 20:
            top_pool = movies[:20]
            random.shuffle(top_pool)
            movies = top_pool + movies[20:]

    elif sort_by == "vote_count":
        # Yüksek tansiyon: oy sayısı yüksek = tescilli yapımlar
        movies.sort(key=lambda m: m.get("vote_count", 0), reverse=True)

    else:
        # "mood_score" — varsayılan
        movies.sort(key=lambda m: m.get("mood_score", 0.0), reverse=True)

    # ── Adım 7: Sonuçlara reason + meta enjekte et ───────────────────────────
    result: list[dict] = []
    for m in movies[:limit]:
        movie = dict(m)
        # id alanını normalize et
        if "tmdb_id" in movie and "id" not in movie:
            movie["id"] = movie["tmdb_id"]
        movie["reason"]        = reason_text
        movie["matched_moods"] = [mood_id]
        result.append(movie)

    return result
