"""
Mood Scoring Engine v3 — Her filmin her mood'a ne kadar uyduğunu hesaplar.
Mood profillerinden beslenir: genre ağırlıkları + keyword + ton + popülerite cezası.
v3: TMDB keyword desteği, primaryMoods/secondaryMoods/blockedMoods, gelişmiş sınıflandırma.
"""
import re
from backend.mood_profiles import (
    MOOD_PROFILES, is_blockbuster, BOUTIQUE_MOODS,
    get_popularity_policy, get_positive_genres, get_negative_genres
)

# TMDB keyword ID -> mood affinity mapping
# Her keyword ID'si hangi mood'lara ne kadar katkı sağlıyor
TMDB_KEYWORD_MOOD_MAP = {
    # Cozy / Battaniye
    "family": {"battaniye": 0.3, "gozyasi": 0.1},
    "christmas": {"battaniye": 0.4},
    "holiday": {"battaniye": 0.3},
    "heartwarming": {"battaniye": 0.4, "gozyasi": 0.2},
    "feel-good": {"battaniye": 0.4, "kahkaha": 0.2},
    "friendship": {"battaniye": 0.3, "kalp": 0.2},
    "cooking": {"battaniye": 0.3},
    "dog": {"battaniye": 0.2},
    "cat": {"battaniye": 0.2},

    # Adventure / Yolculuk
    "road trip": {"yolculuk": 0.5},
    "adventure": {"yolculuk": 0.4, "adrenalin": 0.2},
    "expedition": {"yolculuk": 0.4},
    "survival": {"yolculuk": 0.3, "adrenalin": 0.3},
    "wilderness": {"yolculuk": 0.4, "sessiz": 0.1},
    "exploration": {"yolculuk": 0.4},
    "quest": {"yolculuk": 0.3, "karmakar": 0.1},

    # Dark / Gece
    "noir": {"gece": 0.5, "Retro": 0.2},
    "neo-noir": {"gece": 0.5, "Retro": 0.2},
    "detective": {"gece": 0.4, "zihin": 0.2},
    "murder mystery": {"gece": 0.4, "zihin": 0.3},
    "crime": {"gece": 0.4, "adrenalin": 0.1},
    "mafia": {"gece": 0.4},
    "heist": {"gece": 0.3, "adrenalin": 0.2},
    "gangster": {"gece": 0.4},
    "hitman": {"gece": 0.3, "adrenalin": 0.2},
    "conspiracy": {"gece": 0.3, "zihin": 0.3},

    # Comedy / Kahkaha
    "comedy": {"kahkaha": 0.3},
    "satire": {"kahkaha": 0.3, "zihin": 0.1},
    "parody": {"kahkaha": 0.4},
    "dark comedy": {"kahkaha": 0.3, "gece": 0.1},
    "slapstick": {"kahkaha": 0.4},
    "buddy comedy": {"kahkaha": 0.4},

    # Drama / Gozyasi
    "tearjerker": {"gozyasi": 0.5},
    "grief": {"gozyasi": 0.4, "sessiz": 0.1},
    "loss": {"gozyasi": 0.4},
    "cancer": {"gozyasi": 0.4},
    "dying": {"gozyasi": 0.4},
    "sacrifice": {"gozyasi": 0.3, "adrenalin": 0.1},
    "farewell": {"gozyasi": 0.4},
    "orphan": {"gozyasi": 0.3, "battaniye": 0.1},

    # Action / Adrenalin
    "action": {"adrenalin": 0.3},
    "chase": {"adrenalin": 0.4},
    "martial arts": {"adrenalin": 0.4},
    "combat": {"adrenalin": 0.4},
    "explosion": {"adrenalin": 0.3},
    "gun": {"adrenalin": 0.3, "gece": 0.1},
    "war": {"adrenalin": 0.3, "gozyasi": 0.2},
    "military": {"adrenalin": 0.3},
    "mercenary": {"adrenalin": 0.3},

    # Romance / Askbahcesi
    "romance": {"askbahcesi": 0.4, "gozyasi": 0.1},
    "love": {"askbahcesi": 0.3, "gozyasi": 0.1},
    "wedding": {"askbahcesi": 0.3, "battaniye": 0.1},
    "romantic comedy": {"askbahcesi": 0.3, "kahkaha": 0.2},
    "love triangle": {"askbahcesi": 0.3},
    "first love": {"askbahcesi": 0.3, "kalp": 0.2},
    "passion": {"askbahcesi": 0.3},

    # History / Zamanyolcusu
    "historical": {"zamanyolcusu": 0.4},
    "period drama": {"zamanyolcusu": 0.4, "gozyasi": 0.1},
    "biography": {"zamanyolcusu": 0.3},
    "medieval": {"zamanyolcusu": 0.3},
    "ancient": {"zamanyolcusu": 0.3},
    "world war ii": {"zamanyolcusu": 0.3, "gozyasi": 0.2},
    "revolution": {"zamanyolcusu": 0.3},
    "kingdom": {"zamanyolcusu": 0.3},
    "empire": {"zamanyolcusu": 0.3},

    # Quiet / Sessiz
    "meditative": {"sessiz": 0.5},
    "slow burn": {"sessiz": 0.3, "deep-chills": 0.3},
    "atmospheric": {"sessiz": 0.3, "deep-chills": 0.3},
    "contemplative": {"sessiz": 0.4},
    "minimalist": {"sessiz": 0.4},
    "poetic": {"sessiz": 0.4, "kalp": 0.2},
    "slow cinema": {"sessiz": 0.5},
    "introspective": {"sessiz": 0.3, "kalp": 0.2},

    # Mind / Zihin
    "mind-bending": {"zihin": 0.5, "karmakar": 0.2},
    "twist": {"zihin": 0.4},
    "psychological thriller": {"zihin": 0.4, "gece": 0.2},
    "time loop": {"zihin": 0.4, "karmakar": 0.2},
    "time travel": {"zihin": 0.3, "karmakar": 0.2},
    "puzzle": {"zihin": 0.4},
    "memory": {"zihin": 0.3, "gozyasi": 0.1},
    "dream": {"zihin": 0.3, "karmakar": 0.3},
    "unreliable narrator": {"zihin": 0.4},
    "paranoia": {"zihin": 0.3, "deep-chills": 0.2},

    # Indie / Kalp
    "independent film": {"kalp": 0.5},
    "art house": {"kalp": 0.4, "sessiz": 0.2},
    "coming of age": {"kalp": 0.4, "battaniye": 0.1},
    "slice of life": {"kalp": 0.4, "sessiz": 0.2},
    "character study": {"kalp": 0.3, "sessiz": 0.2},
    "indie": {"kalp": 0.4},
    "festival": {"kalp": 0.3, "karmakar": 0.1},

    # Surreal / Karmakar
    "surrealism": {"karmakar": 0.5},
    "experimental": {"karmakar": 0.5, "sessiz": 0.1},
    "dreamlike": {"karmakar": 0.4, "sessiz": 0.1},
    "psychedelic": {"karmakar": 0.4},
    "cult film": {"karmakar": 0.3, "Retro": 0.2},
    "abstract": {"karmakar": 0.4},
    "parallel universe": {"karmakar": 0.4, "zihin": 0.2},
    "alternate reality": {"karmakar": 0.4, "zihin": 0.2},

    # Retro
    "1980s": {"Retro": 0.5},
    "retro": {"Retro": 0.4},
    "cyberpunk": {"Retro": 0.4, "karmakar": 0.1},
    "neon": {"Retro": 0.3, "gece": 0.1},
    "synthwave": {"Retro": 0.4},
    "arcade": {"Retro": 0.3},
    "vhs": {"Retro": 0.3},

    # Horror / Deep-chills
    "psychological horror": {"deep-chills": 0.5},
    "supernatural horror": {"deep-chills": 0.4},
    "folk horror": {"deep-chills": 0.5},
    "haunted": {"deep-chills": 0.4},
    "possession": {"deep-chills": 0.4},
    "occult": {"deep-chills": 0.4, "karmakar": 0.1},
    "witch": {"deep-chills": 0.3},
    "demon": {"deep-chills": 0.3},
    "ghost": {"deep-chills": 0.3},
    "curse": {"deep-chills": 0.3},
    "isolation": {"deep-chills": 0.3, "sessiz": 0.2},
}

# Blocked mood rules: specific TMDB keyword names that BLOCK a mood
KEYWORD_MOOD_BLOCKS = {
    "battaniye": {"horror", "slasher", "gore", "serial killer", "torture", "war",
                  "mafia", "gangster", "drug", "cartel", "heist", "assassination",
                  "kidnapping", "terrorism", "dystopia", "apocalypse"},
    "kahkaha": {"horror", "torture", "genocide", "war crime", "serial killer"},
    "askbahcesi": {"horror", "slasher", "gore", "serial killer", "war", "zombie"},
    "sessiz": {"action", "explosion", "superhero", "blockbuster"},
    "kalp": {"superhero", "blockbuster", "franchise", "sequel"},
    "gozyasi": {"comedy", "slapstick", "parody", "superhero"},
}

# Her mood için genre ağırlıkları (0-1, mood profillerinden türetildi)
MOOD_GENRE_WEIGHTS = {
    "battaniye":  {10751: 1.0, 35: 1.0, 16: 0.5, 10749: 0.8, 10402: 0.5, 18: 0.6, 14: 0.3, 12: 0.1, 36: 0.1, 99: 0.1, 53: 0.0, 28: 0.0, 80: 0.0, 27: 0.0, 9648: 0.0, 878: 0.0, 10752: 0.0, 37: 0.0},
    "yolculuk":   {12: 1.0, 14: 0.9, 878: 0.8, 28: 0.8, 10752: 0.7, 37: 0.6, 18: 0.4, 53: 0.3, 36: 0.3, 99: 0.2, 10749: 0.1, 35: 0.1, 16: 0.0, 10751: 0.0, 80: 0.0, 27: 0.0, 9648: 0.0, 10402: 0.0},
    "gece":       {53: 1.0, 9648: 1.0, 27: 1.0, 80: 0.9, 28: 0.2, 18: 0.3, 878: 0.2, 14: 0.0, 36: 0.0, 10752: 0.0, 35: 0.0, 10749: 0.0, 16: 0.0, 10751: 0.0, 10402: 0.0, 12: 0.0, 99: 0.0, 37: 0.0},
    "kahkaha":    {35: 1.0, 10402: 0.9, 10751: 0.6, 80: 0.3, 18: 0.2, 10749: 0.2, 16: 0.0, 14: 0.0, 12: 0.0, 28: 0.0, 53: 0.0, 27: 0.0, 9648: 0.0, 878: 0.0, 10752: 0.0, 36: 0.0, 99: 0.0, 37: 0.0},
    "gozyasi":    {18: 1.0, 10749: 0.9, 10752: 0.7, 36: 0.6, 99: 0.3, 10751: 0.1, 16: 0.1, 35: 0.0, 14: 0.0, 53: 0.0, 80: 0.0, 27: 0.0, 9648: 0.0, 28: 0.0, 878: 0.0, 10402: 0.0, 12: 0.0, 37: 0.0},
    "adrenalin":  {28: 1.0, 53: 0.9, 878: 0.8, 80: 0.5, 12: 0.4, 10752: 0.4, 27: 0.2, 9648: 0.1, 18: 0.0, 35: 0.0, 10749: 0.0, 14: 0.0, 16: 0.0, 10751: 0.0, 10402: 0.0, 36: 0.0, 99: 0.0, 37: 0.0},
    "askbahcesi": {10749: 1.0, 18: 0.8, 35: 0.6, 10402: 0.4, 10751: 0.2, 16: 0.1, 14: 0.0, 36: 0.0, 53: 0.0, 28: 0.0, 80: 0.0, 27: 0.0, 9648: 0.0, 878: 0.0, 10752: 0.0, 99: 0.0, 12: 0.0, 37: 0.0},
    "zamanyolcusu": {36: 1.0, 99: 0.9, 18: 0.5, 10752: 0.4, 37: 0.4, 80: 0.2, 35: 0.1, 10749: 0.1, 12: 0.0, 14: 0.0, 878: 0.0, 28: 0.0, 53: 0.0, 27: 0.0, 9648: 0.0, 16: 0.0, 10751: 0.0, 10402: 0.0},
    "sessiz":     {18: 0.9, 14: 0.7, 9648: 0.3, 36: 0.2, 99: 0.2, 10749: 0.2, 878: 0.1, 53: 0.1, 35: 0.0, 16: 0.0, 28: 0.0, 80: 0.0, 27: 0.0, 10751: 0.0, 10402: 0.0, 12: 0.0, 10752: 0.0, 37: 0.0},
    "zihin":      {9648: 1.0, 878: 0.8, 53: 0.8, 80: 0.6, 28: 0.2, 18: 0.2, 14: 0.1, 36: 0.0, 35: 0.0, 27: 0.0, 10749: 0.0, 16: 0.0, 10751: 0.0, 10402: 0.0, 12: 0.0, 10752: 0.0, 99: 0.0, 37: 0.0},
    "kalp":       {18: 1.0, 10749: 0.8, 35: 0.2, 10402: 0.2, 36: 0.1, 16: 0.0, 10751: 0.0, 14: 0.0, 12: 0.0, 53: 0.0, 28: 0.0, 80: 0.0, 27: 0.0, 9648: 0.0, 878: 0.0, 10752: 0.0, 99: 0.0, 37: 0.0},
    "karmakar":   {14: 1.0, 878: 0.9, 53: 0.6, 9648: 0.4, 28: 0.2, 18: 0.2, 27: 0.2, 80: 0.1, 12: 0.0, 35: 0.0, 10749: 0.0, 16: 0.0, 10751: 0.0, 10402: 0.0, 36: 0.0, 10752: 0.0, 99: 0.0, 37: 0.0},
    "Retro":      {878: 1.0, 28: 1.0, 53: 0.9, 80: 0.8, 12: 0.6, 27: 0.5, 35: 0.3, 18: 0.1, 14: 0.1, 9648: 0.1, 36: 0.0, 99: 0.0, 10749: 0.0, 16: 0.0, 10751: 0.0, 10402: 0.0, 10752: 0.0, 37: 0.0},
    "deep-chills": {27: 1.0, 53: 0.9, 9648: 0.8, 14: 0.3, 18: 0.2, 878: 0.1, 80: 0.0, 28: 0.0, 35: 0.0, 10749: 0.0, 16: 0.0, 10751: 0.0, 10402: 0.0, 36: 0.0, 10752: 0.0, 99: 0.0, 37: 0.0, 12: 0.0},
}


def _tmdb_keyword_score(tmdb_keywords: list, mood_id: str) -> float:
    """
    TMDB keyword tag'lerinden mood skoru hesaplar.
    tmdb_keywords: [{"id": 123, "name": "adventure"}, ...]
    Returns 0.0 - 1.0
    """
    if not tmdb_keywords:
        return 0.0

    total_affinity = 0.0
    match_count = 0

    for kw_obj in tmdb_keywords:
        kw_name = kw_obj.get("name", "").lower() if isinstance(kw_obj, dict) else str(kw_obj).lower()
        # Direct match
        if kw_name in TMDB_KEYWORD_MOOD_MAP:
            affinity = TMDB_KEYWORD_MOOD_MAP[kw_name].get(mood_id, 0)
            if affinity > 0:
                total_affinity += affinity
                match_count += 1
        # Partial match (keyword contains a mapped term)
        else:
            for mapped_term, mood_affinities in TMDB_KEYWORD_MOOD_MAP.items():
                if mapped_term in kw_name or kw_name in mapped_term:
                    affinity = mood_affinities.get(mood_id, 0)
                    if affinity > 0:
                        total_affinity += affinity * 0.5  # Partial match = half weight
                        match_count += 1
                        break

    # Normalize: cap at 1.0, multi-match bonus
    score = min(1.0, total_affinity)
    if match_count >= 3:
        score = min(1.0, score + 0.1)  # Multi-keyword synergy bonus

    return score


def _tmdb_keyword_block_check(tmdb_keywords: list, mood_id: str) -> bool:
    """
    Check if any TMDB keywords block this mood.
    Returns True if movie should be BLOCKED from this mood.
    """
    if not tmdb_keywords or mood_id not in KEYWORD_MOOD_BLOCKS:
        return False

    blocked_terms = KEYWORD_MOOD_BLOCKS[mood_id]
    for kw_obj in tmdb_keywords:
        kw_name = kw_obj.get("name", "").lower() if isinstance(kw_obj, dict) else str(kw_obj).lower()
        if kw_name in blocked_terms:
            return True
        # Partial match
        for blocked in blocked_terms:
            if blocked in kw_name:
                return True
    return False


def _overview_keyword_score(overview: str, mood_id: str) -> float:
    """
    Overview metni içinde mood'un positive/negative keyword'lerini arar.
    0.0 - 1.0 arası skor döndürür.
    Güçlendirilmiş: Negatif keyword cezası artırıldı, çoklu eşleşme bonusu eklendi.
    """
    if not overview:
        return 0.0
    profile = MOOD_PROFILES.get(mood_id, {})
    pos_kw = profile.get("positive_keywords", [])
    neg_kw = profile.get("negative_keywords", [])
    text_lower = overview.lower()

    pos_matches = sum(1 for kw in pos_kw if kw.lower() in text_lower)
    neg_matches = sum(1 for kw in neg_kw if kw.lower() in text_lower)

    if not pos_kw:
        return 0.0

    # Temel pozitif skor (çoklu eşleşme bonusu: 3+ match → ek bonus)
    raw = (pos_matches / max(len(pos_kw), 1)) * 3.5
    if pos_matches >= 3:
        raw += 0.15  # Güçlü multi-keyword eşleşme bonusu

    # Negatif ceza güçlendirildi (her negatif keyword daha ağır)
    penalty = (neg_matches / max(len(neg_kw), 1)) * 3.0 if neg_kw else 0

    return max(0.0, min(1.0, raw - penalty))


def _popularity_adjustment(popularity_policy: str, vote_count: int = None, vote_average: float = None) -> float:
    """
    Popülerite politikasına göre adjustment faktörü (0.0 - 1.0+).
    strict_boutique: blockbuster cezası çok sert (kalp)
    boutique: orta ceza (karmakar)
    boutique_indie: indie/boutique ceza (sessiz)
    boutique_horror: korku butik ceza (deep-chills)
    no_restriction: ceza yok (mainstream mood'lar)

    NOT: Hidden gem etkisi artık _popularity_adjustment'ta değil,
    calculate_mood_scores() içindeki "Hidden Gem Boost" adımında
    additif bonus olarak uygulanıyor. Bu sayede mainstream filmler
    cezalanmıyor, sadece kaliteli keşfedilmemiş filmler öne çıkıyor.
    """
    if not vote_count:
        return 1.0

    if popularity_policy == "strict_boutique":
        # Kalp: çok sert - 2000 oy üstü ceza başlar, 20000+ %90 ceza
        if vote_count >= 20000:
            return 0.1
        elif vote_count >= 10000:
            return 0.3
        elif vote_count >= 5000:
            return 0.5
        elif vote_count >= 2000:
            return 0.7
        return 1.0

    elif popularity_policy == "boutique":
        # Karmakar: orta sert - 10000+ ceza
        if vote_count >= 20000:
            return 0.2
        elif vote_count >= 10000:
            return 0.5
        return 1.0

    elif popularity_policy == "boutique_indie":
        # Sessiz: indie ceza
        if vote_count >= 15000:
            return 0.2
        elif vote_count >= 8000:
            return 0.5
        return 1.0

    elif popularity_policy == "boutique_horror":
        # Deep-chills: jumpscare mainstream ceza
        if vote_count >= 15000:
            return 0.2
        elif vote_count >= 8000:
            return 0.4
        return 1.0

    return 1.0


def _negative_genre_penalty(genre_ids: list, mood_id: str) -> float:
    """
    Mood'un negative_genre listesindeki türler filmde varsa ceza.
    Hiçbiri yoksa 1.0 (ceza yok).
    Güçlendirilmiş: Mood'a göre farklı ceza ağırlıkları.
    """
    negative_genres = get_negative_genres(mood_id)
    if not negative_genres:
        return 1.0

    genre_set = set(genre_ids)
    matches = sum(1 for g in negative_genres if g in genre_set)

    if matches == 0:
        return 1.0

    # Hassas mood'lar için daha sert negatif ceza
    STRICT_PENALTY_MOODS = {"battaniye", "sessiz", "kalp", "askbahcesi"}
    MEDIUM_PENALTY_MOODS = {"gozyasi", "kahkaha", "zamanyolcusu"}

    if mood_id in STRICT_PENALTY_MOODS:
        penalty_per = 0.28  # Daha sert: battaniye'ye korku gelmesin
    elif mood_id in MEDIUM_PENALTY_MOODS:
        penalty_per = 0.22
    else:
        penalty_per = 0.18  # Esnek mood'lar (adrenalin, gece vb.)

    penalty = matches * penalty_per
    return max(0.05, 1.0 - penalty)


def _mood_specific_bonus(genre_ids: list, mood_id: str, vote_count: int = None) -> float:
    """
    Mood'a özel bonuslar:
    - kalp: indie keyword varsa +0.2, independent genre varsa +0.1
    - deep-chills: horror genre + atmospheric keyword sinerjisi
    - kahkaha: live-action comedy (no animation) bonus
    - sessiz: drama + fantasy sinerjisi bonus
    - zihin: mystery + sci-fi sinerjisi bonus
    """
    genre_set = set(genre_ids)
    bonus = 0.0

    if mood_id == "kalp":
        if 18 in genre_set and 10749 not in genre_set:
            bonus += 0.05
        if vote_count and vote_count < 2000:
            bonus += 0.15  # Güçlendirildi: düşük oy sayılı indie filmler
        if vote_count and vote_count < 500:
            bonus += 0.10  # Ekstra: çok az bilinen filmler
        # Anti-mismatch: blockbuster genre combo → ceza
        if 28 in genre_set and 878 in genre_set:
            bonus -= 0.25

    elif mood_id == "deep-chills":
        if 27 in genre_set and 9648 in genre_set:
            bonus += 0.20  # Korku + Gizem sinerjisi güçlendirildi
        if 27 in genre_set and 18 in genre_set:
            bonus += 0.12
        if 27 in genre_set and 53 in genre_set:
            bonus += 0.10  # Yeni: Korku + Gerilim sinerjisi
        # Anti-mismatch: saf aksiyon korku → ceza
        if 28 in genre_set and 27 in genre_set and 53 not in genre_set:
            bonus -= 0.15

    elif mood_id == "kahkaha":
        if 35 in genre_set and 16 not in genre_set:
            bonus += 0.15
        if 35 in genre_set and 80 in genre_set:
            bonus += 0.08  # Yeni: Kara mizah sinerjisi
        # Anti-mismatch: animasyon → ceza
        if 16 in genre_set:
            bonus -= 0.25

    elif mood_id == "sessiz":
        if 18 in genre_set and 14 in genre_set:
            bonus += 0.15
        if 18 in genre_set and 99 in genre_set:
            bonus += 0.10  # Yeni: Drama + Belgesel sinerjisi
        if vote_count and vote_count < 5000:
            bonus += 0.08  # Yeni: Az bilinen sessiz filmler
        # Anti-mismatch: yüksek aksiyon
        if 28 in genre_set:
            bonus -= 0.30

    elif mood_id == "zihin":
        if 9648 in genre_set and 878 in genre_set:
            bonus += 0.20  # Güçlendirildi
        if 9648 in genre_set and 53 in genre_set:
            bonus += 0.12
        if 878 in genre_set and 53 in genre_set:
            bonus += 0.08  # Yeni: Bilim Kurgu + Gerilim
        # Anti-mismatch: romantik komedi
        if 10749 in genre_set and 35 in genre_set:
            bonus -= 0.25

    elif mood_id == "adrenalin":
        if 28 in genre_set and 53 in genre_set:
            bonus += 0.12
        if 28 in genre_set and 878 in genre_set:
            bonus += 0.08
        if 28 in genre_set and 80 in genre_set:
            bonus += 0.06  # Yeni: Aksiyon + Suç
        if 28 in genre_set and 10752 in genre_set:
            bonus += 0.10  # Yeni: Aksiyon + Savaş
        # Anti-mismatch: yavaş drama
        if 18 in genre_set and 28 not in genre_set and 53 not in genre_set:
            bonus -= 0.20

    elif mood_id == "askbahcesi":
        if 10749 in genre_set and 35 in genre_set:
            bonus += 0.12  # Güçlendirildi: rom-com sinerjisi
        if 10749 in genre_set and 18 in genre_set:
            bonus += 0.08  # Yeni: Romantik drama sinerjisi
        if 10749 in genre_set and 10402 in genre_set:
            bonus += 0.10  # Yeni: Romantik + Müzik
        # Anti-mismatch: korku/aksiyon
        if 27 in genre_set or (28 in genre_set and 10749 not in genre_set):
            bonus -= 0.25

    elif mood_id == "battaniye":
        # Live-action family bonus (no animation)
        if 10751 in genre_set and 16 not in genre_set:
            bonus += 0.15
        # Feel-good drama-comedy
        if 35 in genre_set and 18 in genre_set:
            bonus += 0.08
        # Family + Animation together: mild bonus
        if 10751 in genre_set and 16 in genre_set:
            bonus += 0.05
        # Animation-ONLY penalty (no Family, Comedy, Drama, or Romance alongside)
        if 16 in genre_set and not (genre_set & {10751, 35, 18, 10749}):
            bonus -= 0.10
        # Rom-com is cozy
        if 10749 in genre_set and 35 in genre_set:
            bonus += 0.08
        # Anti-mismatch: karanlık türler → güçlü ceza
        if 27 in genre_set:
            bonus -= 0.35
        if 53 in genre_set:
            bonus -= 0.25
        if 80 in genre_set:
            bonus -= 0.25

    elif mood_id == "gozyasi":
        if 18 in genre_set and 10749 in genre_set:
            bonus += 0.12  # Yeni: Drama + Romantik sinerjisi
        if 18 in genre_set and 10752 in genre_set:
            bonus += 0.15  # Yeni: Savaş dramı sinerjisi
        if 18 in genre_set and 36 in genre_set:
            bonus += 0.10  # Yeni: Tarih dramı sinerjisi
        # Anti-mismatch: komedi/aksiyon
        if 35 in genre_set and 18 not in genre_set:
            bonus -= 0.20
        if 28 in genre_set:
            bonus -= 0.15

    elif mood_id == "yolculuk":
        if 12 in genre_set and 14 in genre_set:
            bonus += 0.12  # Yeni: Macera + Fantastik sinerjisi
        if 12 in genre_set and 18 in genre_set:
            bonus += 0.08  # Yeni: Macera + Drama (road movie)
        if 12 in genre_set and 878 in genre_set:
            bonus += 0.10  # Yeni: Macera + Bilim Kurgu
        # Anti-mismatch: kapalı mekan türleri
        if 9648 in genre_set and 12 not in genre_set:
            bonus -= 0.15

    elif mood_id == "karmakar":
        if 14 in genre_set and 878 in genre_set:
            bonus += 0.18  # Güçlendirildi
        if 27 in genre_set:
            bonus += 0.08
        if 14 in genre_set and 9648 in genre_set:
            bonus += 0.10  # Yeni: Fantastik + Gizem
        if vote_count and vote_count < 10000:
            bonus += 0.05  # Yeni: Daha az bilinen → daha surreal
        # Anti-mismatch: mainstream komedi
        if 35 in genre_set and 14 not in genre_set:
            bonus -= 0.20

    elif mood_id == "zamanyolcusu":
        if 36 in genre_set:
            bonus += 0.12  # Güçlendirildi
        if 99 in genre_set:
            bonus += 0.08
        if 36 in genre_set and 18 in genre_set:
            bonus += 0.10  # Yeni: Tarih + Drama sinerjisi
        if 36 in genre_set and 10752 in genre_set:
            bonus += 0.12  # Yeni: Tarih + Savaş
        # Anti-mismatch: modern bilim kurgu
        if 878 in genre_set and 36 not in genre_set:
            bonus -= 0.20

    elif mood_id == "Retro":
        if 878 in genre_set and 28 in genre_set:
            bonus += 0.12  # Güçlendirildi
        if 53 in genre_set and 80 in genre_set:
            bonus += 0.12
        if 27 in genre_set and 53 in genre_set:
            bonus += 0.08
        if 878 in genre_set and 80 in genre_set:
            bonus += 0.08  # Yeni: Bilim Kurgu + Suç
        # Anti-mismatch: dönem draması
        if 36 in genre_set and 878 not in genre_set:
            bonus -= 0.20

    return max(-0.5, min(0.5, bonus))


def _year_to_int(release_date: str) -> int:
    """Release date string'den yıl çıkarır."""
    if not release_date:
        return 0
    try:
        return int(release_date[:4])
    except (ValueError, IndexError):
        return 0


def calculate_mood_scores(genre_ids: list, vote_average: float = None,
                          tmdb_id: int = None, vote_count: int = None,
                          overview: str = None, release_date: str = None,
                          tmdb_keywords: list = None, popularity: float = None,
                          original_language: str = None) -> dict:
    """
    Bir filmin her mood'a uygunluk skorunu hesaplar (0-100).
    Çok bileşenli: genre + keyword + tmdb_keyword + tone + popülerite + quality + dil
    v4: Dil bazlı ağırlıklandırma, Türkçe keyword desteği, gelişmiş genre sinerjisi.
    """
    if not genre_ids:
        genre_ids = []
    if not tmdb_keywords:
        tmdb_keywords = []

    year = _year_to_int(release_date)

    scores = {}
    genre_set = set(genre_ids)
    has_tmdb_kw = len(tmdb_keywords) > 0

    for mood_id, weights in MOOD_GENRE_WEIGHTS.items():
        profile = MOOD_PROFILES.get(mood_id, {})
        popularity_policy = profile.get("popularity_policy", "no_restriction")

        # 0. TMDB Keyword Block Check — hard block
        if has_tmdb_kw and _tmdb_keyword_block_check(tmdb_keywords, mood_id):
            scores[mood_id] = 0.0
            continue

        # 1. Genre Score (%40)
        total_weight = 0.0
        matched_count = 0
        for gid, w in weights.items():
            if gid in genre_set:
                total_weight += w
                matched_count += 1

        if matched_count > 0:
            avg_fit = total_weight / matched_count
        else:
            avg_fit = 0.0

        coverage = total_weight / max(sum(weights.values()), 0.01)
        genre_score = (avg_fit * 0.6 + coverage * 0.4) * 100

        # 2. Overview Keyword Score (%10 if tmdb_kw exists, %20 if not)
        overview_kw_score = _overview_keyword_score(overview, mood_id) * 100

        # 3. TMDB Keyword Score (%15 if available)
        tmdb_kw_score = _tmdb_keyword_score(tmdb_keywords, mood_id) * 100 if has_tmdb_kw else 0

        # 4. Negative Genre Penalty
        neg_penalty = _negative_genre_penalty(genre_ids, mood_id)

        # 5. Popularity Adjustment
        pop_adj = _popularity_adjustment(popularity_policy, vote_count, vote_average)

        # 6. Quality (vote_average) adjustment (%10)
        if vote_average and vote_average >= 7.5:
            quality_score = 100
        elif vote_average and vote_average >= 7.0:
            quality_score = 85
        elif vote_average and vote_average >= 6.5:
            quality_score = 70
        elif vote_average and vote_average >= 6.0:
            quality_score = 55
        else:
            quality_score = 40

        # 7. Blockbuster penalty (profile bazlı)
        blockbuster_penalty = 1.0
        if mood_id in BOUTIQUE_MOODS and is_blockbuster(tmdb_id, vote_count):
            blockbuster_penalty = 0.1

        # 8. Mood-specific bonus
        mood_bonus = _mood_specific_bonus(genre_ids, mood_id, vote_count)

        # 9. Year bonus/penalty (genişletilmiş — tüm mood'lar için)
        year_bonus = 0.0
        if mood_id == "zamanyolcusu" and year > 0:
            if year <= 1960:
                year_bonus = 0.20
            elif year <= 1979:
                year_bonus = 0.15
            elif year <= 1990:
                year_bonus = 0.10
            elif year <= 1999:
                year_bonus = 0.02
            else:
                year_bonus = -0.20
        elif mood_id == "Retro" and year > 0:
            if 1980 <= year <= 1989:
                year_bonus = 0.25
            elif 1977 <= year <= 1979:
                year_bonus = 0.15
            elif 1990 <= year <= 1995:
                year_bonus = 0.12
            elif year >= 2010:
                year_bonus = -0.15
                # Overview'da retro/80s/neon keyword varsa cezayı kaldır
                if overview and any(kw in overview.lower() for kw in ["retro", "80s", "neon", "synth", "vhs", "arcade", "cyberpunk"]):
                    year_bonus = 0.05
        elif mood_id == "kalp" and year > 0:
            # Bağımsız sinema: 2010+ modern indie altın çağ
            if year >= 2015:
                year_bonus = 0.08
            elif year >= 2010:
                year_bonus = 0.05
            elif year <= 1990:
                year_bonus = -0.05  # Çok eski indie'ler biraz düşük
        elif mood_id == "deep-chills" and year > 0:
            # Modern slow-burn korku: 2015+ altın çağ (A24 dalgası)
            if year >= 2015:
                year_bonus = 0.10
            elif year >= 2010:
                year_bonus = 0.05
            elif year <= 1980:
                year_bonus = -0.05
        elif mood_id == "adrenalin" and year > 0:
            # Modern aksiyon teknolojisi avantajı
            if year >= 2010:
                year_bonus = 0.05
            elif year >= 2000:
                year_bonus = 0.03
        elif mood_id == "gozyasi" and year > 0:
            # Klasik dramalar da güçlü; modern dramalar da
            if year >= 2000:
                year_bonus = 0.03
            elif year <= 1970:
                year_bonus = 0.05  # Eski klasik dramalar
        elif mood_id == "sessiz" and year > 0:
            # Slow cinema: 2000+ modern dalga
            if year >= 2010:
                year_bonus = 0.06
            elif year >= 2000:
                year_bonus = 0.04

        # Final = weighted combination (v4: dil bazlı ağırlıklandırma eklendi)
        if has_tmdb_kw:
            # With TMDB keywords: genre 40% + overview 10% + tmdb_kw 15% + quality 10% = 75% base
            final_score = (
                genre_score * 0.40
                + overview_kw_score * 0.10
                + tmdb_kw_score * 0.15
                + quality_score * 0.10
            ) * neg_penalty * pop_adj * blockbuster_penalty + (mood_bonus * 10) + (year_bonus * 30)
        else:
            # Without TMDB keywords: genre 45% + overview 20% + quality 10% = 75% base (backward compat)
            final_score = (
                genre_score * 0.45
                + overview_kw_score * 0.20
                + quality_score * 0.10
            ) * neg_penalty * pop_adj * blockbuster_penalty + (mood_bonus * 10) + (year_bonus * 30)

        # 10. Dil bazlı ağırlıklandırma (v4)
        # Türkçe: yerli sinema önceliği, Japon/Hint: aşırı temsili azalt
        if original_language:
            if original_language == "tr":
                final_score *= 1.08  # Türkçe: %8 bonus
            elif original_language == "ja":
                final_score *= 0.55  # Japonca: %45 ceza — en kalabalık 2. dil
            elif original_language == "hi":
                final_score *= 0.65  # Hintçe: %35 ceza
            elif original_language == "ko":
                final_score *= 0.90  # Korece: hafif ceza (kaliteli K-drama dengesi)
            elif original_language == "zh" or original_language == "cn":
                final_score *= 0.88  # Çince: hafif ceza

        # 11. Hidden Gem Boost (tüm mood'lar — sayfa başına 2-3 keşfedilmemiş film)
        # Mainstream'e ceza YOK, sadece az bilinen kaliteli filmlere bonus.
        # Bu sayede sıralama organik kalır: çoğu film tanınmış, araya 2-3 gem sızar.
        if vote_count and vote_average:
            if vote_count < 2000 and vote_average >= 7.5:
                final_score += 8.0   # Altın gem: çok az oy, çok yüksek kalite
            elif vote_count < 3000 and vote_average >= 7.0:
                final_score += 5.0   # Gümüş gem: az oy, yüksek kalite
            elif vote_count < 5000 and vote_average >= 7.5:
                final_score += 3.0   # Bronz gem: orta-düşük oy, mükemmel kalite

        # Genre çeşitliliği bonusu — 3+ uyumlu tür → daha zengin film deneyimi
        matched_positive_count = sum(1 for g in genre_ids if weights.get(g, 0) >= 0.5)
        if matched_positive_count >= 3:
            final_score += 3.0  # Çoklu güçlü tür eşleşmesi → bonus
        elif matched_positive_count == 0:
            final_score *= 0.7  # Hiç güçlü tür eşleşmesi yoksa → ciddi ceza

        # Cap
        scores[mood_id] = round(min(max(final_score, 0), 100), 1)

    return scores


def get_best_moods(genre_ids: list, vote_average: float = None,
                   tmdb_id: int = None, vote_count: int = None,
                   overview: str = None, release_date: str = None,
                   top_n: int = 3, tmdb_keywords: list = None) -> list:
    """Bir film için en uygun top_n mood'u döndürür."""
    scores = calculate_mood_scores(genre_ids, vote_average, tmdb_id, vote_count,
                                   overview, release_date, tmdb_keywords)
    sorted_moods = sorted(scores.items(), key=lambda x: -x[1])
    return [(mood, score) for mood, score in sorted_moods[:top_n]]


def get_mood_score_reasons(mood_id: str, genre_ids: list, vote_average: float = None,
                           tmdb_id: int = None, vote_count: int = None,
                           overview: str = None, release_date: str = None) -> dict:
    """
    Debug için: bir film ve mood için skor bileşenlerini döndürür.
    """
    if not genre_ids:
        genre_ids = []

    year = _year_to_int(release_date)

    profile = MOOD_PROFILES.get(mood_id, {})
    popularity_policy = profile.get("popularity_policy", "no_restriction")
    weights = MOOD_GENRE_WEIGHTS.get(mood_id, {})
    genre_set = set(genre_ids)

    reasons = []

    if mood_id == "zamanyolcusu" and year > 0:
        if year <= 1990:
            reasons.append(f"Classic year bonus: {year}")
        else:
            reasons.append(f"Modern year penalty: {year}")

    # Genre match
    matched_genres = [gid for gid in genre_ids if gid in weights]
    if matched_genres:
        reasons.append(f"Genre match: {matched_genres}")
    else:
        reasons.append("No matching genres")

    # Genre score
    total_weight = sum(w for gid, w in weights.items() if gid in genre_set)
    coverage = total_weight / max(sum(weights.values()), 0.01)
    reasons.append(f"Genre coverage: {coverage:.2f}")

    # Keyword match
    pos_kw = profile.get("positive_keywords", [])
    if overview:
        text_lower = overview.lower()
        matched_kw = [kw for kw in pos_kw if kw.lower() in text_lower]
        if matched_kw:
            reasons.append(f"Keyword match: {matched_kw}")

    # Negative genre
    neg_genres = get_negative_genres(mood_id)
    neg_matches = [gid for gid in genre_ids if gid in neg_genres]
    if neg_matches:
        reasons.append(f"Negative genre penalty: {neg_matches}")

    # Blockbuster
    blockbuster = is_blockbuster(tmdb_id, vote_count)
    if blockbuster and mood_id in BOUTIQUE_MOODS:
        reasons.append("Blockbuster penalty applied")

    # Popularity
    if popularity_policy != "no_restriction" and vote_count:
        reasons.append(f"Popularity policy: {popularity_policy} (vote_count={vote_count})")

    # Mood bonus
    bonus = _mood_specific_bonus(genre_ids, mood_id, vote_count)
    if bonus > 0:
        reasons.append(f"Mood bonus: +{bonus:.2f}")
    elif bonus < 0:
        reasons.append(f"Mood penalty: {bonus:.2f}")

    return reasons


def classify_movie(genre_ids: list, vote_average: float = None,
                   tmdb_id: int = None, vote_count: int = None,
                   overview: str = None, release_date: str = None,
                   tmdb_keywords: list = None, popularity: float = None,
                   original_language: str = None) -> dict:
    """
    Tam film sınıflandırması — primaryMoods, secondaryMoods, blockedMoods, moodScores ve moodReason.

    Returns:
        {
            "moodScores": {mood_id: score, ...},
            "primaryMoods": [mood_id, ...],    # score >= 55
            "secondaryMoods": [mood_id, ...],   # 30 <= score < 55
            "blockedMoods": [mood_id, ...],     # score == 0 (keyword blocked) or negative genre heavy
            "bestMood": mood_id,
            "moodReason": "Genre: Action+Thriller, Keywords: chase, survival"
        }
    """
    scores = calculate_mood_scores(
        genre_ids, vote_average, tmdb_id, vote_count,
        overview, release_date, tmdb_keywords, popularity,
        original_language
    )

    sorted_moods = sorted(scores.items(), key=lambda x: -x[1])

    primary = []
    secondary = []
    blocked = []

    for mood_id, score in sorted_moods:
        if score == 0:
            blocked.append(mood_id)
        elif score >= 55:
            primary.append(mood_id)
        elif score >= 30:
            secondary.append(mood_id)

    # Also add moods blocked by keywords explicitly
    if tmdb_keywords:
        for mood_id in KEYWORD_MOOD_BLOCKS:
            if _tmdb_keyword_block_check(tmdb_keywords, mood_id) and mood_id not in blocked:
                blocked.append(mood_id)

    # Generate reason string
    reason_parts = []
    genre_names_map = {
        28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy",
        80: "Crime", 99: "Documentary", 18: "Drama", 10751: "Family",
        14: "Fantasy", 36: "History", 27: "Horror", 10402: "Music",
        9648: "Mystery", 10749: "Romance", 878: "Sci-Fi",
        10752: "War", 53: "Thriller", 37: "Western",
    }
    genre_str = "+".join(genre_names_map.get(g, str(g)) for g in genre_ids[:4])
    if genre_str:
        reason_parts.append(f"Genre: {genre_str}")

    if tmdb_keywords:
        kw_names = [kw.get("name", str(kw)) if isinstance(kw, dict) else str(kw)
                     for kw in tmdb_keywords[:5]]
        reason_parts.append(f"Keywords: {', '.join(kw_names)}")

    best_mood = sorted_moods[0][0] if sorted_moods else "battaniye"

    return {
        "moodScores": scores,
        "primaryMoods": primary,
        "secondaryMoods": secondary,
        "blockedMoods": blocked,
        "bestMood": best_mood,
        "moodReason": "; ".join(reason_parts) if reason_parts else "Genre-based classification",
    }
