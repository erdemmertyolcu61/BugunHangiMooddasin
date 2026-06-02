"""
intent_enhancer.py — 4 katmanlı semantic intent enhancement.
Mevcut sisteme sıfır değişiklikle eklenir (additive).
Her katman try/except ile çağrılır, hata durumunda sessizce yutulur.
"""
import re
import random
import logging
from typing import Optional

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════
# Katman 1 — ContextExtractor (Bağlamsal Filtre Ayrıştırma)
# ═══════════════════════════════════════════════════════════════

class ContextExtractor:
    """Kullanıcı cümlesinden zaman, yönetmen, süre, dönem kısıtlarını çıkarır.
    
    Integration: _confused_fallback() içinde mood_analysis sonrası
    era_c / runtime değişkenlerini zenginleştirir.
    """

    KNOWN_DIRECTORS = [
        "nuri bilge ceylan", "zeki demirkubuz", "ferzan özpetek",
        "semih kaplanoğlu", "reha erdem", "fatih akın",
        "derviş zaim", "tolga karaçelik", "emin alper",
        "mahmut fazıl coşkun", "can evrenol",
    ]

    _RUNTIME_RE = re.compile(
        r'(\d+)\s*(dk|dakika|min|minute|minutes)\b'
        r'|(kısa|kisa|şipşak|sipsak|çabuk|cabuk|kısa metraj)'
        r'|(uzun|destansı|destansi|epik|3 saat|üç saat)',
        re.IGNORECASE
    )

    _ERA_RE = re.compile(
        r'(90\'?lar|90lar|doksanlar)'
        r'|(80\'?ler|80ler|seksenler)'
        r'|(2000\'?ler|2000ler|iki binler)'
        r'|(197\'?ler|70\'?ler)'
        r'|(yeni|güncel|modern|son çıkan|son yıllar)'
        r'|(eski|klasik|vintage|retro|zamansız)'
        r'|(19[5-9]\d|20[0-2]\d)',
        re.IGNORECASE
    )

    _DIRECTOR_RE = re.compile(
        r'(nuri bilge ceylan|zeki demirkubuz|ferzan özpetek'
        r'|semih kaplanoğlu|semih kaplanoglu|reha erdem|fatih akın|fatih akin'
        r'|derviş zaim|dervis zaim|tolga karaçelik|tolga karacelik'
        r'|emin alper|mahmut fazıl coşkun|mahmut fazil coskun'
        r'|can evrenol)',
        re.IGNORECASE
    )

    @classmethod
    def extract_runtime(cls, text: str) -> dict:
        if not text:
            return {}
        m = cls._RUNTIME_RE.search(text)
        if not m:
            return {}
        if m.group(1):
            minutes = int(m.group(1))
            if minutes <= 60:
                return {"short": True, "max_minutes": minutes}
            return {"long": True, "min_minutes": minutes}
        if m.group(3):
            return {"short": True, "max_minutes": 50}
        if m.group(4):
            return {"long": True, "min_minutes": 150}
        return {}

    @classmethod
    def extract_era(cls, text: str) -> dict:
        if not text:
            return {}
        tl = text.lower()
        if re.search(r'(90\'?lar|90lar|doksanlar)', tl):
            return {"min_year": 1990, "max_year": 1999}
        if re.search(r'(80\'?ler|80ler|seksenler)', tl):
            return {"min_year": 1980, "max_year": 1989}
        if re.search(r'(2000\'?ler|2000ler|iki binler)', tl):
            return {"min_year": 2000, "max_year": 2009}
        if re.search(r'(70\'?ler|70ler|yetmişler|yetmisler)', tl):
            return {"min_year": 1970, "max_year": 1979}
        yr = re.search(r'(19[5-9]\d|20[0-2]\d)', text)
        if yr:
            y = int(yr.group(1))
            return {"min_year": y, "max_year": y + 9}
        if re.search(r'(yeni|güncel|modern|son çıkan|son yıllar)', tl):
            return {"min_year": 2020}
        if re.search(r'(eski|klasik|vintage|retro|zamansız)', tl):
            return {"max_year": 2005}
        return {}

    @classmethod
    def extract_director(cls, text: str) -> Optional[str]:
        if not text:
            return None
        m = cls._DIRECTOR_RE.search(text)
        if m:
            return m.group(0).strip().title()
        tl = text.lower()
        for name in cls.KNOWN_DIRECTORS:
            if name in tl:
                return name.title()
        return None

    @classmethod
    def extract_all(cls, text: str) -> dict:
        return {
            "runtime": cls.extract_runtime(text),
            "era": cls.extract_era(text),
            "director": cls.extract_director(text),
        }


# ═══════════════════════════════════════════════════════════════
# Katman 2 — MoodWeightEnhancer (Duygusal Meta-Mapping)
# ═══════════════════════════════════════════════════════════════

class MoodWeightEnhancer:
    """Float ağırlıklı keyword→mood tablosu. Mevcut integer tablolara
    tamamlayıcı boost sağlar. [0.0-1.0] normalize."""

    ENHANCED_WEIGHTS: dict[str, dict[str, float]] = {
        # ── Kullanıcının istediği yeni meta-mapping'ler ──
        "taşra":       {"zihin": 0.8, "kadraj-estetigi": 0.5, "sessiz": 0.3},
        "kasvet":      {"zihin": 0.7, "deep-chills": 0.5, "gece": 0.3},
        "sıkıntı":     {"zihin": 0.6, "sessiz": 0.5},
        "durgun":      {"zihin": 0.5, "sessiz": 0.6, "battaniye": 0.2},
        "neon":        {"gece": 0.9, "sipsak": 0.5, "deep-chills": 0.3},
        "cadde":       {"gece": 0.7, "yolculuk": 0.3},
        "gece yarısı": {"gece": 0.8, "geceyarisi-itirafi": 0.6, "deep-chills": 0.3},
        "tekinsiz":    {"gece": 0.6, "deep-chills": 0.7},
        "kafa yormasın":  {"adrenalin": 0.7, "sipsak": 0.6, "kahkaha": 0.5},
        "çıtır çerez":    {"adrenalin": 0.6, "sipsak": 0.7, "kahkaha": 0.6},
        "eğlenceli":      {"kahkaha": 0.8, "adrenalin": 0.4, "sipsak": 0.3},
        "ağlat":          {"gozyasi": 1.0, "kalp": 0.3},
        "içimi parçala":  {"gozyasi": 1.0, "kalp": 0.7},
        "ağlamak":        {"gozyasi": 0.9, "kalp": 0.4},
        "hüzün":          {"gozyasi": 0.7, "sessiz": 0.3, "kalp": 0.3},
        # ── Mevcut _CONFUSED_KEYWORDS (float normalize) ──
        "yorgun":       {"sessiz": 0.75, "battaniye": 0.5, "kalp": 0.25},
        "gülmek":       {"kahkaha": 1.0, "battaniye": 0.25},
        "düşünmek":     {"zihin": 1.0, "kalp": 0.25, "karmakar": 0.25},
        "gerilmek":     {"deep-chills": 1.0, "gece": 0.5},
        "karanlık":     {"gece": 0.75, "deep-chills": 0.5, "zihin": 0.25},
        "romantik":     {"askbahcesi": 1.0, "gozyasi": 0.25, "kalp": 0.25},
        "sakin":        {"sessiz": 1.0, "battaniye": 0.5},
        "eski":         {"zamanyolcusu": 1.0},
        "nostaljik":    {"zamanyolcusu": 1.0},
        "klasik":       {"zamanyolcusu": 1.0},
        "heyecan":      {"adrenalin": 1.0, "gece": 0.25},
        "macera":       {"yolculuk": 1.0, "adrenalin": 0.25},
        "yol":          {"yolculuk": 1.0},
        "keşif":        {"yolculuk": 1.0},
        "aşk":          {"askbahcesi": 1.0, "gozyasi": 0.25},
        "korku":        {"deep-chills": 1.0, "gece": 0.5},
        "gizem":        {"zihin": 0.75, "gece": 0.5, "karmakar": 0.25},
        "uzay":         {"yolculuk": 0.5, "karmakar": 0.25},
        "çocuk":        {"battaniye": 1.0, "kahkaha": 0.5},
        "aile":         {"battaniye": 1.0, "kahkaha": 0.25},
        "yavaş":        {"sessiz": 0.75, "battaniye": 0.5},
        "hızlı":        {"adrenalin": 0.75, "sipsak": 0.25},
        "kaliteli":     {"zihin": 0.5, "kalp": 0.5, "sessiz": 0.25},
        "derin":        {"kalp": 0.75, "sessiz": 0.5, "zihin": 0.25},
        "hafif":        {"kahkaha": 0.75, "battaniye": 0.75, "yolculuk": 0.25},
        "ağır":         {"gozyasi": 0.75, "deep-chills": 0.5, "zamanyolcusu": 0.25},
        "kafa dağıtmak": {"kahkaha": 1.0, "adrenalin": 0.5, "yolculuk": 0.25},
        "bilim kurgu":  {"zihin": 0.75, "yolculuk": 0.5, "karmakar": 0.25},
        "deneysel":     {"karmakar": 1.0, "sessiz": 0.25},
        "şaşırt":       {"karmakar": 0.75, "zihin": 0.75, "gece": 0.25},
        "duygusal":     {"gozyasi": 1.0, "kalp": 0.75, "askbahcesi": 0.5, "battaniye": 0.25},
        "huzur":        {"battaniye": 1.0, "sessiz": 0.75, "yolculuk": 0.25},
        # ── Mevsimler ──
        "kış":          {"battaniye": 0.75, "sessiz": 0.5, "gozyasi": 0.5, "zamanyolcusu": 0.25},
        "yaz":          {"askbahcesi": 0.75, "yolculuk": 0.5, "adrenalin": 0.25},
        "sonbahar":     {"sessiz": 0.75, "gozyasi": 0.5, "kalp": 0.5},
        "ilkbahar":     {"battaniye": 0.5, "askbahcesi": 0.5, "yolculuk": 0.25},
        # ── Hava ──
        "kar":          {"battaniye": 0.75, "sessiz": 0.5, "zamanyolcusu": 0.25},
        "yağmur":       {"sessiz": 0.75, "gozyasi": 0.5, "battaniye": 0.25},
        "güneş":        {"yolculuk": 0.5, "askbahcesi": 0.5},
        "fırtına":      {"deep-chills": 0.5, "gece": 0.5, "adrenalin": 0.25},
        "soğuk":        {"battaniye": 0.75, "sessiz": 0.5},
        "sıcak":        {"askbahcesi": 0.5, "battaniye": 0.5, "yolculuk": 0.25},
        # ── Temalar ──
        "doğa":         {"yolculuk": 0.75, "sessiz": 0.25},
        "deniz":        {"yolculuk": 0.75, "sessiz": 0.25},
        "dağ":          {"yolculuk": 0.75},
        "şehir":        {"gece": 0.75, "zihin": 0.25},
        "tutkulu":      {"askbahcesi": 1.0, "gozyasi": 0.25},
        "sinematografi": {"kadraj-estetigi": 1.0, "sessiz": 0.25},
        "görsel":       {"kadraj-estetigi": 1.0, "karmakar": 0.25},
        "estetik":      {"kadraj-estetigi": 1.0, "sessiz": 0.5},
        "sohbet":       {"geceyarisi-itirafi": 1.0, "kalp": 0.5},
        "diyalog":      {"geceyarisi-itirafi": 1.0, "kalp": 0.5},
        "samimi":       {"geceyarisi-itirafi": 0.75, "kalp": 0.5, "sessiz": 0.25},
        "itiraf":       {"geceyarisi-itirafi": 1.0},
        "varoluş":      {"geceyarisi-itirafi": 0.75, "zihin": 0.5},
        "felsefe":      {"geceyarisi-itirafi": 0.75, "zihin": 0.5},
        "savaş":        {"gozyasi": 0.75, "zamanyolcusu": 0.5, "adrenalin": 0.25},
        "yalnız":       {"sessiz": 0.5, "kalp": 0.5, "gozyasi": 0.25},
        "yönetmen":     {"kadraj-estetigi": 0.5, "kalp": 0.5},
    }

    _TR_SUFFIXES = (
        "temalı", "temali", "lık", "lik", "luk", "lük",
        "ları", "leri", "lar", "ler", "ında", "inde",
        "da", "de", "ta", "te", "ın", "in", "un", "ün",
        "lı", "li", "lu", "lü",
    )

    @classmethod
    def _tr_normalize(cls, text: str) -> str:
        return text.replace("İ", "i").replace("I", "ı").lower()

    @classmethod
    def _strip_suffix(cls, token: str) -> str:
        for suf in cls._TR_SUFFIXES:
            if len(token) > len(suf) + 1 and token.endswith(suf):
                return token[: -len(suf)]
        return token

    @classmethod
    def score(cls, text: str) -> dict[str, float]:
        if not text:
            return {}
        norm = cls._tr_normalize(text)
        tokens = set(t.strip(".,!?;:\"'()") for t in norm.split())
        stripped = {cls._strip_suffix(t) for t in tokens if t}

        scores: dict[str, float] = {}
        for keyword, mood_map in cls.ENHANCED_WEIGHTS.items():
            kw = cls._tr_normalize(keyword)
            if kw in norm or kw in tokens or kw in stripped:
                for mood_id, weight in mood_map.items():
                    scores[mood_id] = scores.get(mood_id, 0.0) + weight

        if not scores:
            return {}

        max_val = max(scores.values())
        if max_val > 0:
            scores = {k: round(v / max_val, 2) for k, v in scores.items()}

        return {k: v for k, v in scores.items() if v > 0}


# ═══════════════════════════════════════════════════════════════
# Katman 3 — SimilarMovieEnhancer ("X Gibi" + Anti-Klişe)
# ═══════════════════════════════════════════════════════════════

class SimilarMovieEnhancer:
    """'X gibi' benzerlik referansı + underrated/gourmet boost."""

    _SIMILAR_RE = re.compile(
        r'(.{3,40})\s*(gibi|tadında|tadinda|benzeri|havasında|havasinda'
        r'|modunda|havasında)',
        re.IGNORECASE
    )

    _GOURMET_RE = re.compile(
        r'(underrated|az bilinen|az bilinir|gizli kalmış|gizli kalmis'
        r'|popüler olmayan|populer olmayan|keşfedilmemiş|kesfedilmemis'
        r'|gurme|kült|cult|bağımsız|bagimsiz|indie|nadir|özgün|ozgun)',
        re.IGNORECASE
    )

    @classmethod
    def extract_reference(cls, text: str) -> Optional[str]:
        if not text:
            return None
        m = cls._SIMILAR_RE.search(text.lower())
        if not m:
            return None
        ref = m.group(1).strip().rstrip(".,!?;:")
        if len(ref.split()) > 4:
            return None
        return ref

    @classmethod
    def detect_gourmet_preference(cls, text: str) -> bool:
        if not text:
            return False
        return bool(cls._GOURMET_RE.search(text.lower()))

    @classmethod
    def compute_gourmet_boost(cls, vote_count, vote_average) -> float:
        try:
            vc = int(vote_count) if vote_count is not None else 0
            va = float(vote_average) if vote_average is not None else 0
            if vc < 200 and va > 7.5:
                return 0.5
            if vc < 500 and va > 7.0:
                return 0.5
        except (TypeError, ValueError):
            pass
        return 0.0


# ═══════════════════════════════════════════════════════════════
# Katman 4 — NonsenseHandler (Saçma Arama → Üstad Reaksiyonu)
# ═══════════════════════════════════════════════════════════════

class NonsenseHandler:
    """Hiçbir mood/keyword/kişi/film eşleşmeyen girdiler için
    Üstad mistik repliği ile devreye girer."""

    _STOP_WORDS = {
        "bir", "ve", "veya", "ile", "için", "mi", "mu", "mü",
        "the", "a", "an", "in", "on", "at", "to", "for", "of",
        "ama", "ancak", "fakat", "çünkü", "gibi",
        "ben", "sen", "o", "biz", "siz", "onlar",
        "istediğim", "istiyorum", "bana", "sana", "ona",
        "film", "filmi", "filmler", "sinema",
        "hiç", "hiçbir", "şey", "sey", "ne", "nasıl",
        "birşey", "bir şey", "bisey",
    }

    _USTAD_NONSENSE_LINES = {
        "zihin": (
            "Zihnindeki parazitleri hissediyorum Üstad... "
            "Kelimelerin sinemaya uzak düşse de ruhunun "
            "şu an gizli bir sığınağa ihtiyacı var. "
            "İşte senin için seçtiğim kareler:"
        ),
        "gece": (
            "Karanlıkta kaybolan kelimelerin yankısını duyuyorum... "
            "Belki de sözcüklerin değil, sessizliğin konuşması gerekiyor. "
            "Gece yarısına yakışan bir seçki hazırladım:"
        ),
        "battaniye": (
            "Bazen hiçbir şey düşünmeden, sadece sıcak bir hikayeye "
            "ihtiyaç duyar insan. Üstad senin için en rahat filmleri seçti:"
        ),
        "sessiz": (
            "Sözcüklerin ötesinde bir yerlerdesin... "
            "O sessizliğe en çok yakışacak filmler bunlar:"
        ),
        "gozyasi": (
            "İçinde bir şeylerin kıpırdadığını hissediyorum. "
            "Bazen en iyi terapi, güzel bir hikayenin "
            "kollarına bırakmaktır kendini. İşte seçtiklerim:"
        ),
        "kahkaha": (
            "Kafan dağınık, düşünceler karmaşık... Ama biliyor musun? "
            "Bazen en iyi ilaç kahkahadır. Üstad'ın reçetesi:"
        ),
    }

    _DEFAULT_USTAD_LINE = (
        "Zihnindeki parazitleri hissediyorum Üstad... "
        "Kelimelerin sinemaya uzak düşse de ruhunun "
        "şu an gizli bir sığınağa ihtiyacı var. "
        "İşte senin için seçtiğim kareler:"
    )

    _DEFAULT_MOODS = ["zihin", "gece", "battaniye", "sessiz", "kahkaha", "gozyasi"]

    @classmethod
    def is_nonsense(cls, text: str, mood_scores: dict = None,
                    genre_matches: list = None, person_match: bool = False,
                    film_match: bool = False) -> bool:
        if not text or len(text.strip()) < 3:
            return False

        conditions = 0

        if not mood_scores or max(mood_scores.values()) < 0.2:
            conditions += 1

        if not genre_matches:
            conditions += 1

        if not person_match:
            conditions += 1

        if not film_match:
            conditions += 1

        words = text.lower().split()
        if words:
            stop_count = sum(1 for w in words if w.strip(".,!?") in cls._STOP_WORDS)
            if stop_count / len(words) > 0.7:
                conditions += 1

        return conditions >= 3

    @classmethod
    def _pick_mood(cls, taste_map_data: dict = None) -> str:
        if taste_map_data:
            top_moods = taste_map_data.get("top_moods", [])
            if top_moods:
                return top_moods[0].get("mood_id", "zihin")
        return random.choice(cls._DEFAULT_MOODS)

    @classmethod
    def generate_response(cls, text: str, taste_map_data: dict = None) -> dict:
        mood_id = cls._pick_mood(taste_map_data)
        ustad_line = cls._USTAD_NONSENSE_LINES.get(mood_id, cls._DEFAULT_USTAD_LINE)
        return {
            "ustad_line": ustad_line,
            "mood_id": mood_id,
            "mode": "nonsense_ustad",
            "is_fallback": True,
        }
