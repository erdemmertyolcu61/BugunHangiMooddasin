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
    "rahatlamak", "kafamı", "ruh", "duygu", "hissetmek", "hissediyorum",
    "bugün", "bu gece", "bu akşam", "şu an", "şimdi",
    "hafif", "ağır", "karanlık", "aydınlık", "romantik", "komik",
    "duygusal", "hüzünlü", "eğlenceli", "gerilimli", "korkutucu",
    "aksiyonlu", "macera", "fantastik", "bilim kurgu",
    "ailemle", "arkadaşlarla", "yalnız", "sevgilimle",
    "öner", "önersene", "önerir misin", "ne izlesem", "ne izleyeyim",
    "tavsiye", "bir şey", "film seç", "film bul",
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
    t = _normalize(text)
    return sum(1 for kw in MOOD_KEYWORDS if kw in t) >= 1


def _is_short_title_like(text: str) -> bool:
    words = text.strip().split()
    return 1 <= len(words) <= 5 and not _has_mood_words(text)


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
    "Retro":        0.10, "deep-chills": 0.10,
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
    ("retro", "80s", "80'ler", "neon", "vintage"):                      "Retro",
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

        intent = self._detect_intent(text)
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
        result["query_understanding"] = text
        result["mood_mix"] = mood_analysis.get("mood_mix", [])
        if not result.get("ustad_line") or result.get("mode") == "semantic_no_match":
            result["ustad_line"] = mood_analysis.get("ustad_line", result.get("ustad_line", ""))
        result["message"] = mood_analysis.get("message", "")
        result["mode"] = "semantic_local"
        return result

    # ─────────── INTENT DETECTION ───────────
    def _detect_intent(self, text: str) -> Intent:
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
