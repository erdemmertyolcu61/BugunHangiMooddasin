"""
Chat Engine — Local intent detection + semantic search routing.

Zero external API calls. All processing is local:
  - Rule-based intent classification
  - Turkish title alias resolution
  - Routes all queries to hybrid semantic search with entity boost multipliers
"""
import re
import logging
from difflib import SequenceMatcher
from typing import Optional

logger = logging.getLogger("chat_engine")

# ═══════════════════════════════════════════════════════════════
# TURKISH TITLE ALIASES — popular movies known by Turkish names
# ═══════════════════════════════════════════════════════════════
TURKISH_TITLE_ALIASES = {
    "esaretin bedeli": "The Shawshank Redemption",
    "baba": "The Godfather",
    "kara şövalye": "The Dark Knight",
    "başlangıç": "Inception",
    "yüzüklerin efendisi": "The Lord of the Rings",
    "zindan adası": "Shutter Island",
    "dövüş kulübü": "Fight Club",
    "yıldızlararası": "Interstellar",
    "ucuz roman": "Pulp Fiction",
    "yeşil yol": "The Green Mile",
    "forrest gump": "Forrest Gump",
    "matriks": "The Matrix",
    "matrix": "The Matrix",
    "terminatör": "The Terminator",
    "yüzük kardeşliği": "The Fellowship of the Ring",
    "iki kule": "The Two Towers",
    "kralın dönüşü": "The Return of the King",
    "gladyatör": "Gladiator",
    "prestij": "The Prestige",
    "schindlerin listesi": "Schindler's List",
    "schindler'in listesi": "Schindler's List",
    "cesur yürek": "Braveheart",
    "hayalet": "Ghost",
    "titanik": "Titanic",
    "avatar": "Avatar",
    "yıldız savaşları": "Star Wars",
    "jurassik park": "Jurassic Park",
    "jurassic park": "Jurassic Park",
    "harry potter": "Harry Potter",
    "hobbit": "The Hobbit",
    "parazit": "Parasite",
    "ruhların kaçışı": "Spirited Away",
    "sessiz kuzu": "The Silence of the Lambs",
    "amerikan güzeli": "American Beauty",
    "güzel zihinler": "A Beautiful Mind",
    "karayip korsanları": "Pirates of the Caribbean",
    "labirent": "The Maze Runner",
    "açlık oyunları": "The Hunger Games",
    "ölü ozanlar derneği": "Dead Poets Society",
    "kelebek etkisi": "The Butterfly Effect",
    "kayıp balık nemo": "Finding Nemo",
    "yukarı bak": "Up",
    "coco": "Coco",
    "ratatuy": "Ratatouille",
    "ratatouille": "Ratatouille",
    "ters yüz": "Inside Out",
    "oyuncak hikayesi": "Toy Story",
    "aslan kral": "The Lion King",
    "karlar ülkesi": "Frozen",
    "duvar-e": "WALL-E",
    "wall-e": "WALL-E",
    "inanılmaz aile": "The Incredibles",
    "canavar şirketi": "Monsters, Inc.",
    "arka sokaklar": "Rear Window",
    "sapık": "Psycho",
    "uzay yolu": "Star Trek",
    "geleceğe dönüş": "Back to the Future",
    "yağmur adam": "Rain Man",
    "guguk kuşu": "One Flew Over the Cuckoo's Nest",
    "taksici": "Taxi Driver",
    "kuzuların sessizliği": "The Silence of the Lambs",
    "talihsiz olaylar dizisi": "A Series of Unfortunate Events",
    "büyük lebowski": "The Big Lebowski",
    "dokunulmaz": "Intouchables",
    "dokunulmazlar": "Intouchables",
    "cennet cumhuriyeti": "La vita è bella",
    "hayat güzeldir": "La vita è bella",
    "amelie": "Amélie",
    "kaynak": "The Fountain",
    "savaş atı": "War Horse",
    "kör nokta": "The Blind Side",
    "yetenekli bay ripley": "The Talented Mr. Ripley",
    "kayıp kız": "Gone Girl",
    "kovboy": "No Country for Old Men",
    "ihtiyarlara yer yok": "No Country for Old Men",
    "kaptan phillips": "Captain Phillips",
    "marslı": "The Martian",
    "varış": "Arrival",
    "dune": "Dune",
    "düello": "The Prestige",
    "tenet": "Tenet",
    "oppenheimer": "Oppenheimer",
    "barbie": "Barbie",
    "joker": "Joker",
    "batman": "The Batman",
    "örümcek adam": "Spider-Man",
    "demir adam": "Iron Man",
    "kaptan amerika": "Captain America",
    "yenilmezler": "The Avengers",
    "kara panter": "Black Panther",
    "deadpool": "Deadpool",
}

# ═══════════════════════════════════════════════════════════════
# INTENT DETECTION PATTERNS
# ═══════════════════════════════════════════════════════════════
SIMILAR_PATTERNS = [
    r"(.+?)\s*gibi\b",
    r"(.+?)\s*tarzı\b",
    r"(.+?)\s*tadında\b",
    r"(.+?)\s*benzeri\b",
    r"(.+?)\s*havasında\b",
    r"(.+?)\s*ayarında\b",
    r"(.+?)\s*tarzında\b",
    r"(.+?)['']?[eaıiuü]\s+benzeyen\b",
    r"(.+?)['']?[eaıiuü]\s+benzer\b",
    r"(.+?)\s+gibi\s+(?:bir\s+)?film",
    r"(.+?)\s+(?:gibisini|gibileri)\b",
]

PERSON_KEYWORDS = [
    "filmi", "filmleri", "filmlerini", "filmini",
    "oynadığı", "rol aldığı", "çektiği",
    "filmografisi", "başrolde", "yönetmenliğini",
]

DIRECTOR_KEYWORDS = [
    "yönetmen", "yönetmenin", "yönetmeninin", "çektiği",
    "yönetmenliğini", "yönetmenliğinde",
]

FEEDBACK_PATTERNS = {
    "daha farklı": "diversity",
    "farklı bir şey": "diversity",
    "bunları istemiyorum": "reject_all",
    "istemiyorum": "reject_all",
    "daha hafif": "lighter",
    "daha ağır": "heavier",
    "daha karanlık": "darker",
    "daha aydınlık": "lighter",
    "daha komik": "funnier",
    "daha yeni": "newer",
    "daha eski": "older",
    "daha kısa": "shorter",
    "daha uzun": "longer",
    "daha popüler": "more_popular",
    "daha az bilinen": "less_known",
    "bunu izledim": "seen_it",
    "hepsini izledim": "seen_all",
    "başka": "diversity",
    "değiştir": "diversity",
}

MOOD_KEYWORDS = {
    "istiyorum", "istemiyorum", "olsun", "olmasın", "arıyorum",
    "yorgun", "mutlu", "üzgün", "heyecanlı", "sakin", "sıkıldım",
    "ağlamak", "gülmek", "düşünmek", "gerilmek", "korkmak",
    "rahatlamak", "kafamı", "kafam", "dağıl", "dağılsın", "dalgın",
    "boşver", "boş", "ruh", "duygu", "hissetmek", "hissediyorum",
    "bugün", "bu gece", "bu akşam", "şu an", "şimdi",
    "hafif", "ağır", "karanlık", "aydınlık", "romantik", "komik",
    "duygusal", "hüzünlü", "eğlenceli", "gerilimli", "korkutucu",
    "aksiyonlu", "macera", "fantastik", "bilim kurgu",
    "ailemle", "arkadaşlarla", "yalnız", "sevgilimle",
    "öner", "önersene", "önerir misin", "ne izlesem", "ne izleyeyim",
    "tavsiye", "bir şey", "film seç", "film bul",
}

# Tümce düzeyinde ruh hali/distraction ifadeleri — kelime bazlı mood kontrolünden ÖNCE kontrol edilir.
# Bunlar actor/director sanılmamalı.
MOOD_PHRASES = {
    "kafam dağılsın", "kafamı dağıt", "kafam dağınık", "dalgın",
    "canım sıkıldı", "canım sıkkın", "sıkıldım", "sıkıcı",
    "yorgunum", "uykum var", "uykusuz", "bitkin",
    "stresliyim", "stres", "gergin", "sinirli",
    "ne bileyim", "bilmiyorum", "kararsız",
    "zaman geçsin", "zaman geçirmek", "vakit geçsin", "vakit geçirmek",
    "bir şey", "herhangi bir şey", "rastgele",
    "keyfim yok", "keyifsiz", "moralim bozuk", "mutlu değilim",
}

# Tek kelimelik ünlü yönetmen/oyuncu adları — _looks_like_person_name tek kelime için de çalışsın.
KNOWN_PERSONS = {
    "tarantino", "nolan", "kubrick", "scorsese", "ceylan", "spielberg",
    "hitchcock", "fellini", "bergman", "kurosawa", "lynch", "fincher",
    "villeneuve", "tarkovsky", "herzog", "haneke", "kieslowski",
    "kusturica", "polanski", "coppola", "godard", "truffaut",
    "klein", "reiner", "ersoy", "sorrentino", "haggis", "cameron",
    "pitt", "dicaprio", "deniro", "pacino", "hopkins", "streep",
    "roberts", "hanks", "yeşilçam", "kemp", "cronenberg", "demir",
    "şener", "emre yükselen", "martin eden",
}

GENRE_KEYWORDS = {
    "komedi": [35], "dram": [18], "drama": [18], "aksiyon": [28],
    "korku": [27], "gerilim": [53], "thriller": [53],
    "romantik": [10749], "bilim kurgu": [878], "sci-fi": [878],
    "fantastik": [14], "fantezi": [14], "macera": [12],
    "animasyon": [16], "belgesel": [99], "savaş": [10752],
    "western": [37], "kovboy": [37], "müzikal": [10402],
    "suç": [80], "gizem": [9648], "tarih": [36],
    "aile": [10751],
}

NEGATIVE_WORDS = [
    "olmasın", "istemiyorum", "değil", "hariç", "dışında", "yok",
    "olmadan", "kaçının", "uzak", "ama", "fakat",
]


def _normalize(text: str) -> str:
    if not text:
        return ""
    t = text.strip().lower()
    t = re.sub(r'[^\w\s]', ' ', t)
    t = re.sub(r'\s+', ' ', t).strip()
    return t


def _fuzzy_match(s1: str, s2: str) -> float:
    return SequenceMatcher(None, _normalize(s1), _normalize(s2)).ratio()


def _has_mood_words(text: str) -> bool:
    """Kelime bazlı mood kontrolü — substring DEĞİL, tam kelime eşleşmesi yapar."""
    t = _normalize(text)
    words = set(t.split())
    for kw in MOOD_KEYWORDS:
        if kw in words:
            return True
    return False


def _is_short_title_like(text: str) -> bool:
    words = text.strip().split()
    return 1 <= len(words) <= 5 and not _has_mood_words(text)


def _looks_like_person_name(text: str) -> bool:
    """
    2-3 kelimeli kişi adı mı? Tek kelimelik KNOWN_PERSONS da kabul.
    Heuristic: her kelime 2-15 karakter, küçük harfle başlamıyor (büyük harf beklenir),
    rakam ve noktalama yok, mood/genre keyword değil.
    Örnekler: "Tom Hanks", "Brad Pitt", "Nuri Bilge Ceylan", "Christopher Nolan", "Tarantino"
    """
    text_normalized = _normalize(text)
    if text_normalized in KNOWN_PERSONS:
        return True
    words = text.strip().split()
    if not (2 <= len(words) <= 3):
        return False
    # Ruh hali veya tür kelimesi içermesin
    if _has_mood_words(text):
        return False
    text_lower = text.lower()
    for gw in GENRE_KEYWORDS:
        if gw in text_lower:
            return False
    # Her kelime: harf karakterlerinden oluşsun, 2-15 karakter arasında
    for w in words:
        if not w.isalpha():
            return False
        if not (2 <= len(w) <= 15):
            return False
    return True


# ═══════════════════════════════════════════════════════════════
# INTENT RESULT
# ═══════════════════════════════════════════════════════════════
class Intent:
    def __init__(self, intent_type: str, **kwargs):
        self.type = intent_type
        self.reference_title = kwargs.get("reference_title", None)
        self.person_name = kwargs.get("person_name", None)
        self.person_type = kwargs.get("person_type", None)
        self.feedback_type = kwargs.get("feedback_type", None)
        self.genres = kwargs.get("genres", [])
        self.exclude_genres = kwargs.get("exclude_genres", [])
        self.modifiers = kwargs.get("modifiers", {})
        self.original_text = kwargs.get("original_text", "")

    def to_dict(self):
        return {
            "type": self.type,
            "reference_title": self.reference_title,
            "person_name": self.person_name,
            "person_type": self.person_type,
            "feedback_type": self.feedback_type,
            "genres": self.genres,
            "exclude_genres": self.exclude_genres,
            "modifiers": self.modifiers,
        }


# ═══════════════════════════════════════════════════════════════
# RULE-BASED MOOD ANALYSIS (local, zero API calls)
# ═══════════════════════════════════════════════════════════════
_MOOD_WEIGHTS = {
    "battaniye":    0.20, "yolculuk": 0.10, "gece": 0.15, "kahkaha": 0.10,
    "gozyasi":      0.10, "adrenalin": 0.10, "askbahcesi": 0.10, "zamanyolcusu": 0.10,
    "sessiz":       0.10, "zihin": 0.10, "kalp": 0.10, "karmakar": 0.10,
    "sipsak":       0.10, "deep-chills": 0.10,
    "kadraj-estetigi": 0.10, "geceyarisi-itirafi": 0.10,
}

_RULE_MOOD_MAP = {
    ("yorgun", "sakin", "rahatlamak", "battaniye", "sarılmak"):        "battaniye",
    ("macera", "yol", "keşif", "seyahat"):                              "yolculuk",
    ("karanlık", "gece", "gizem", "korku", "gerilim"):                  "gece",
    ("gülmek", "komik", "eğlence", "kahkaha", "neşe"):                 "kahkaha",
    ("ağlamak", "üzgün", "hüzün", "gözyaşı", "duygusal"):              "gozyasi",
    ("heyecan", "adrenalin", "patlama", "savaş", "aksiyon"):            "adrenalin",
    ("romantik", "aşk", "kalp", "sevgi"):                                "askbahcesi",
    ("nostalji", "eski", "çocukluk", "geçmiş"):                          "zamanyolcusu",
    ("düşünmek", "felsefe", "zihin", "entelektüel", "soru"):            "zihin",
    ("küçük", "kalp", "samimi", "içten", "basit"):                      "kalp",
    ("deneysel", "sıradışı", "karmaşık", "garip"):                      "karmakar",
    ("kisa", "kısa", "kompakt", "sipsak", "çekim"):                     "sipsak",
    ("atmosfer", "gerilim", "yavaş", "ürperti"):                        "deep-chills",
    ("estetik", "görsel", "sinematografi", "kompozisyon"):              "kadraj-estetigi",
    ("itiraf", "konuşma", "diyalog", "sohbet", "samimi"):               "geceyarisi-itirafi",
}


def _rule_based_confused_analysis(text: str) -> dict:
    """Local rule-based mood analysis — zero API calls, <1ms."""
    text_lower = text.lower().strip()
    scored = {}
    for triggers, mood_id in _RULE_MOOD_MAP.items():
        score = sum(2 for t in triggers if t in text_lower)
        if score > 0:
            scored[mood_id] = score * _MOOD_WEIGHTS.get(mood_id, 0.10) * 100

    if not scored:
        return {
            "mood_mix": [{"mood_id": "zihin", "title": "Zihin", "percentage": 60},
                         {"mood_id": "gece", "title": "Gece", "percentage": 40}],
            "message": "Anlat bakalım, ne tür bir gece arzuluyorsun?",
            "ustad_line": "Kafan karışık gibi... Hadi bir bakalım arşive.",
        }

    total = sum(scored.values())
    mood_mix = [
        {"mood_id": mid, "title": mid.replace("-", " ").title(), "percentage": round(pct * 100 / total)}
        for mid, pct in sorted(scored.items(), key=lambda x: -x[1])[:4]
    ]
    top_mood = mood_mix[0]["mood_id"]
    return {
        "mood_mix": mood_mix,
        "message": f"Sana en uygun ruh hali: {top_mood.replace('-', ' ').title()}.",
        "ustad_line": f"Şu anki haline en çok '{top_mood.replace('-', ' ').title()}' yakışıyor gibi.",
    }


# ═══════════════════════════════════════════════════════════════
# CHAT ENGINE (local only — zero external API calls)
# ═══════════════════════════════════════════════════════════════
class ChatEngine:
    def __init__(self, db):
        self.db = db

    async def process(self, text: str, limit: int = 6, min_vote: float = 5.0,
                      exclude_ids: list = None) -> dict:
        """
        Main entry point. Detects intent locally, routes to semantic search.
        Zero external API calls — all processing is purely local.
        """
        exclude_ids = set(exclude_ids or [])
        text = text.strip()

        if not text or len(text) < 2:
            return self._empty_response("Lütfen ne tür bir film aradığını yaz.")

        intent = self.detect_intent(text)
        logger.info("[ChatEngine] Intent: %s | query: '%s'", intent.type, text)

        # Route to local semantic search (handles entity boost internally)
        from backend.services.semantic_search import semantic_engine

        result = await semantic_engine.search(
            query_text=text,
            limit=limit,
            exclude_ids=exclude_ids,
            min_vote=min_vote,
        )

        # Augment response with intent info + rule-based mood mix
        mood_analysis = _rule_based_confused_analysis(text)
        result["intent"] = intent.type

        # Intent'e göre anlaşılır query_understanding mesajı üret
        if intent.type == "actor_recommendation" and intent.person_name:
            result["query_understanding"] = f"'{intent.person_name}' filmlerini arıyorsun."
        elif intent.type == "director_recommendation" and intent.person_name:
            result["query_understanding"] = f"'{intent.person_name}' yönetmenliğindeki filmler."
        elif intent.type == "similar_to_movie" and intent.reference_title:
            result["query_understanding"] = f"'{intent.reference_title}' tadında filmler."
        elif intent.type == "genre_recommendation" and intent.genres:
            result["query_understanding"] = f"Tür bazlı arama: {text}"
        elif intent.type == "feedback":
            result["query_understanding"] = f"Yeni öneriler getiriyorum..."
        else:
            result["query_understanding"] = text
        result["mood_mix"] = mood_analysis.get("mood_mix", [])
        if not result.get("ustad_line") or result.get("mode") == "semantic_no_match":
            result["ustad_line"] = mood_analysis.get("ustad_line", result.get("ustad_line", ""))
        result["message"] = mood_analysis.get("message", "")
        result["mode"] = "semantic_local"
        return result

    # ─────────── INTENT DETECTION ───────────
    def detect_intent(self, text: str) -> Intent:
        """Rule-based intent classification (fully local)."""
        text_lower = text.lower().strip()
        text_norm = _normalize(text)

        for pattern, fb_type in FEEDBACK_PATTERNS.items():
            if pattern in text_lower:
                return Intent("feedback", feedback_type=fb_type, original_text=text)

        for pat in SIMILAR_PATTERNS:
            m = re.search(pat, text_lower)
            if m:
                ref_title = m.group(1).strip().strip('"\'')
                if len(ref_title) >= 2:
                    alias_check = _normalize(ref_title)
                    if alias_check in TURKISH_TITLE_ALIASES:
                        ref_title = TURKISH_TITLE_ALIASES[alias_check]
                    return Intent("similar_to_movie", reference_title=ref_title, original_text=text)

        for kw in DIRECTOR_KEYWORDS:
            if kw in text_lower:
                idx = text_lower.index(kw)
                person_name = text[:idx].strip().strip('"\'')
                if person_name and len(person_name) >= 2:
                    return Intent("director_recommendation", person_name=person_name,
                                  person_type="director", original_text=text)

        for kw in PERSON_KEYWORDS:
            if kw in text_lower:
                idx = text_lower.index(kw)
                person_name = text[:idx].strip().strip('"\'')
                if person_name and len(person_name) >= 2:
                    return Intent("actor_recommendation", person_name=person_name,
                                  person_type="actor", original_text=text)

        if text_norm in TURKISH_TITLE_ALIASES:
            return Intent("exact_movie_search",
                          reference_title=TURKISH_TITLE_ALIASES[text_norm],
                          original_text=text)

        for alias, eng_title in TURKISH_TITLE_ALIASES.items():
            if alias in text_norm and len(alias) >= 4:
                remaining = text_norm.replace(alias, "").strip()
                if len(remaining) < 10 or not _has_mood_words(remaining):
                    return Intent("exact_movie_search",
                                  reference_title=eng_title,
                                  original_text=text)

        genres_wanted = []
        genres_excluded = []
        for genre_name, genre_ids in GENRE_KEYWORDS.items():
            if genre_name in text_lower:
                pos = text_lower.index(genre_name)
                before = text_lower[max(0, pos - 20):pos]
                is_negative = any(nw in before for nw in NEGATIVE_WORDS)
                if is_negative:
                    genres_excluded.extend(genre_ids)
                else:
                    genres_wanted.extend(genre_ids)

        # Tümce düzeyinde ruh hali/distraction kontrolü — kişi adı tespitinden ÖNCE
        text_norm_lower = text_norm
        for phrase in MOOD_PHRASES:
            if phrase in text_lower:
                return Intent("mood_recommendation", original_text=text)

        # Kişi adı tespiti: "Tom Hanks", "Brad Pitt", "Nuri Bilge Ceylan" gibi
        # exact_movie_search'ten ÖNCE kontrol et — kısa metinleri yanlış yere atmasın.
        # TURKISH_TITLE_ALIASES'te yoksa ve kişi adı gibi görünüyorsa actor olarak işle.
        if _looks_like_person_name(text) and _normalize(text) not in TURKISH_TITLE_ALIASES:
            return Intent("actor_recommendation", person_name=text.strip(),
                          person_type="actor", original_text=text)

        if _is_short_title_like(text):
            return Intent("exact_movie_search", reference_title=text.strip(),
                          original_text=text)

        if genres_wanted and not _has_mood_words(text):
            return Intent("genre_recommendation", genres=genres_wanted,
                          exclude_genres=genres_excluded, original_text=text)

        if genres_wanted or genres_excluded:
            return Intent("mixed_request", genres=genres_wanted,
                          exclude_genres=genres_excluded, original_text=text)

        return Intent("mood_recommendation", original_text=text)

    @staticmethod
    def _empty_response(msg: str) -> dict:
        return {
            "mode": "error",
            "intent": "unknown",
            "query_understanding": msg,
            "ustad_line": "",
            "message": msg,
            "mood_mix": [],
            "movies": [],
        }


# ═══════════════════════════════════════════════════════════════
# CHAT HINT PARSER — embedding öncesi hafif string analizi
# Çalışma süresi: <1ms (regex, dict lookup)
# ═══════════════════════════════════════════════════════════════

# Bonus tavanı — sci-fi gibi güçlü sinyaller için +0.50'ye kadar
_MAX_BONUS = 0.50

_TIME_CONSTRAINT_KWS = [
    "kısa", "çabuk", "vaktim az", "zamanım yok", "sipsak", "hemen bitsin",
    "az vaktim", "hızlı", "kısa film", "kısacık", "hızlıca", "çabucak",
    "az zaman", "vakit az", "hızla", "çabuk biter", "kısaca", "zamanım az",
]

# ── Kategori/tema → mood + tür bonus haritası ──────────────────────────────────
# Mood ID'leri kod tabanındaki GERÇEK mood'lara karşılık gelir
# (örn. sci-fi → yolculuk+zihin; korku → deep-chills "Derin Ürperti").
_CATEGORY_HINT_MAP: dict[str, dict] = {
    # ── Sci-fi / uzay → yolculuk (keşif) + zihin (zihin-büken), +0.50 ──────────
    "uzay":        {"mood_boost": {"yolculuk": 0.50, "zihin": 0.30},    "genre_ids": [878]},
    "gelecek":     {"mood_boost": {"yolculuk": 0.40, "zihin": 0.40},    "genre_ids": [878]},
    "bilim kurgu": {"mood_boost": {"yolculuk": 0.40, "zihin": 0.40},    "genre_ids": [878]},
    "gezegen":     {"mood_boost": {"yolculuk": 0.50, "zihin": 0.30},    "genre_ids": [878]},
    "galaksi":     {"mood_boost": {"yolculuk": 0.50},                   "genre_ids": [878]},
    "yıldız":      {"mood_boost": {"yolculuk": 0.40},                   "genre_ids": [878]},
    "yapay zeka":  {"mood_boost": {"zihin": 0.50, "karmakar": 0.30},    "genre_ids": [878]},

    # ── Suç / gerilim → gece (noir) ağırlığı + suç/gerilim tür maskesi ─────────
    "katil":       {"mood_boost": {"gece": 0.45, "adrenalin": 0.25},    "genre_ids": [53, 80]},
    "cinayet":     {"mood_boost": {"gece": 0.45, "zihin": 0.20},        "genre_ids": [80, 53]},
    "ajan":        {"mood_boost": {"adrenalin": 0.40, "gece": 0.25},    "genre_ids": [28, 80]},
    "casusluk":    {"mood_boost": {"adrenalin": 0.35, "gece": 0.25},    "genre_ids": [28, 80]},
    "polis":       {"mood_boost": {"gece": 0.40, "adrenalin": 0.25},    "genre_ids": [80]},
    "dedektif":    {"mood_boost": {"gece": 0.40, "zihin": 0.30},        "genre_ids": [80, 9648]},
    "gerilim":     {"mood_boost": {"gece": 0.45, "adrenalin": 0.25},    "genre_ids": [53]},
    "suç":         {"mood_boost": {"gece": 0.40, "adrenalin": 0.25},    "genre_ids": [80]},
    "gizem":       {"mood_boost": {"gece": 0.30, "zihin": 0.30},        "genre_ids": [9648]},

    # ── Korku / ürperti → deep-chills (Derin Ürperti) + korku türü ────────────
    "korkutucu":   {"mood_boost": {"deep-chills": 0.50},               "genre_ids": [27]},
    "ürpertici":   {"mood_boost": {"deep-chills": 0.50},               "genre_ids": [27]},
    "korku":       {"mood_boost": {"deep-chills": 0.50, "gece": 0.20}, "genre_ids": [27]},
    "karanlık":    {"mood_boost": {"deep-chills": 0.40, "gece": 0.30}, "genre_ids": [27]},
    # "gece" kelimesi "bu gece" (zamansal) ile karışmasın diye korku türü vermez:
    "gece":        {"mood_boost": {"gece": 0.40},                      "genre_ids": []},

    # ── Diğer tür/tema bonusları ──────────────────────────────────────────────
    "savaş":       {"mood_boost": {"adrenalin": 0.40},                  "genre_ids": [10752, 28]},
    "romantik":    {"mood_boost": {"askbahcesi": 0.40},                 "genre_ids": [10749]},
    "aşk":         {"mood_boost": {"askbahcesi": 0.35, "gozyasi": 0.20},"genre_ids": [10749]},
    "komedi":      {"mood_boost": {"kahkaha": 0.40, "battaniye": 0.15}, "genre_ids": [35]},
    "nostalji":    {"mood_boost": {"zamanyolcusu": 0.40},               "genre_ids": []},
    "animasyon":   {"mood_boost": {"battaniye": 0.30, "kahkaha": 0.20}, "genre_ids": [16]},
    "aksiyon":     {"mood_boost": {"adrenalin": 0.40},                  "genre_ids": [28]},
    "felsefe":     {"mood_boost": {"zihin": 0.40, "sessiz": 0.20},      "genre_ids": [18]},
}


class ParsedHints:
    """
    Embedding öncesi chat metninden çıkarılan hafif sinyaller.
    Hybrid re-ranking'de cosine skoru ile harmanlanır.
    """
    __slots__ = ("sipsak_mode", "runtime_max", "mood_bonuses", "genre_ids")

    def __init__(self) -> None:
        self.sipsak_mode:   bool              = False
        self.runtime_max:   Optional[int]     = None
        self.mood_bonuses:  dict[str, float]  = {}   # mood_id → bonus (0.0-0.40)
        self.genre_ids:     list[int]         = []   # TMDB tür ID'leri

    def has_signals(self) -> bool:
        return self.sipsak_mode or bool(self.mood_bonuses) or bool(self.genre_ids)


def parse_chat_hints(text: str) -> ParsedHints:
    """
    Chat metnini embedding modeline göndermeden önce hafif string analizinden geçir.
    Süre kısıtları, tür ve tema anahtar kelimeleri yakalanarak bonus sinyaller üretilir.
    Hiçbir zaman exception fırlatmaz — her zaman geçerli ParsedHints döndürür.
    """
    hints = ParsedHints()
    tl = text.lower()

    # ── Süre kısıtı → sipsak modu (runtime <= 60 enjekte) ────────────────────
    for kw in _TIME_CONSTRAINT_KWS:
        if kw in tl:
            hints.sipsak_mode = True
            hints.runtime_max = 60
            hints.mood_bonuses["sipsak"] = _MAX_BONUS  # Güçlü zaman kısıtı sinyali
            break

    # ── Kategori/tema anahtar kelimeleri → mood/tür bonus ────────────────────
    for kw, data in _CATEGORY_HINT_MAP.items():
        if kw in tl:
            for mood_id, bonus in data["mood_boost"].items():
                current = hints.mood_bonuses.get(mood_id, 0.0)
                hints.mood_bonuses[mood_id] = min(_MAX_BONUS, current + bonus)
            hints.genre_ids.extend(data["genre_ids"])

    hints.genre_ids = list(set(hints.genre_ids))
    return hints
