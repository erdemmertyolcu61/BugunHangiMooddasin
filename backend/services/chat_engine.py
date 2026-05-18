"""
Chat Engine — Smart intent detection and routing for "Kafan mı Karışık?"

Handles:
- Movie title search (exact + fuzzy)
- Similar movie recommendations ("X gibi")
- Actor/director based recommendations
- Mood-based recommendations (existing behavior, enhanced)
- Feedback handling ("daha farklı", "daha hafif")
- Anti-repetition logic
- Turkish title aliases
"""
import re
import random
import asyncio
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

# Mood-indicative keywords — if text contains these, it's likely mood, not a title
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

# Words that negate or exclude
NEGATIVE_WORDS = [
    "olmasın", "istemiyorum", "değil", "hariç", "dışında", "yok",
    "olmadan", "kaçının", "uzak", "ama", "fakat",
]


def _normalize(text: str) -> str:
    """Normalize text for comparison: lowercase, strip, collapse spaces."""
    if not text:
        return ""
    t = text.strip().lower()
    t = re.sub(r'[^\w\s]', ' ', t)  # remove punctuation
    t = re.sub(r'\s+', ' ', t).strip()
    return t


# ═══════════════════════════════════════════════════════════════
# SIMILAR-MOVIE RELEVANCE FILTER
# Bir referans filmin "benzerlerini" üretirken alakasız, obscure veya
# düşük kaliteli filmleri elemek için ortak filtre.
# ═══════════════════════════════════════════════════════════════
def _filter_relevant_similar(
    candidates: list,
    primary_genres: list,
    exclude_ids: set,
    primary_id: int,
    min_vote_count: int = 80,
    min_vote_average: float = 6.0,
    require_genre_overlap: bool = True,
) -> list:
    """
    Referans filme tematik/türsel olarak yakın, yeterince bilinen ve kaliteli
    filmleri süzer ve alaka skoruna göre sıralar.

    Eleme kriterleri:
      - Aynı film / zaten önerilmiş (exclude_ids) → çıkar
      - Başlık yok veya placeholder ("—") → çıkar
      - vote_count < min_vote_count → çıkar (obscure sahte 10.0 filmleri öldürür)
      - vote_average < min_vote_average → çıkar (kalite tabanı)
      - Yetişkin içerik (adult) → çıkar
      - require_genre_overlap True ve referansla ortak tür yoksa → çıkar

    Skor = ortak_tür_sayısı*12 + min(vote_count/400, 15) + vote_average
           + küçük rastgelelik (her seferinde aynı liste gelmesin diye)
    """
    primary_genre_set = set(primary_genres or [])
    scored = []
    seen = set(exclude_ids) | ({primary_id} if primary_id else set())

    for m in candidates:
        mid = m.get("id") or m.get("tmdb_id")
        if not mid or mid in seen:
            continue

        title = (m.get("title") or "").strip()
        if not title or title in ("—", "-", "N/A"):
            continue

        if m.get("adult") is True:
            continue

        vote_count = m.get("vote_count", 0) or 0
        vote_avg = m.get("vote_average", 0) or 0

        # Obscure / kalitesiz eleme
        if vote_count < min_vote_count:
            continue
        if vote_avg < min_vote_average:
            continue

        cand_genres = set(m.get("genre_ids", []) or [])
        overlap = len(primary_genre_set & cand_genres)

        if require_genre_overlap and primary_genre_set and overlap == 0:
            # Ana filmle hiç ortak tür yoksa tematik olarak alakasız → ele
            continue

        seen.add(mid)
        score = (
            overlap * 12.0
            + min(vote_count / 400.0, 15.0)
            + vote_avg
            + random.uniform(0, 2.5)
        )
        scored.append((score, m))

    scored.sort(key=lambda x: -x[0])
    return [m for _, m in scored]


def _turkish_normalize(text: str) -> str:
    """Extra normalization for Turkish character variations."""
    t = _normalize(text)
    replacements = {
        'ı': 'i', 'ğ': 'g', 'ü': 'u', 'ş': 's', 'ö': 'o', 'ç': 'c',
    }
    for tr_char, en_char in replacements.items():
        t = t.replace(tr_char, en_char)
    return t


def _fuzzy_match(s1: str, s2: str) -> float:
    """Simple fuzzy match ratio between two strings."""
    return SequenceMatcher(None, _normalize(s1), _normalize(s2)).ratio()


def _has_mood_words(text: str) -> bool:
    """Check if text contains mood-indicative words."""
    t = _normalize(text)
    count = sum(1 for kw in MOOD_KEYWORDS if kw in t)
    return count >= 1


def _is_short_title_like(text: str) -> bool:
    """Heuristic: short text (1-5 words) without mood words = likely a movie title."""
    words = text.strip().split()
    return 1 <= len(words) <= 5 and not _has_mood_words(text)


# ═══════════════════════════════════════════════════════════════
# INTENT RESULT
# ═══════════════════════════════════════════════════════════════
class Intent:
    def __init__(self, intent_type: str, **kwargs):
        self.type = intent_type
        self.reference_title = kwargs.get("reference_title", None)
        self.reference_movie = kwargs.get("reference_movie", None)
        self.person_name = kwargs.get("person_name", None)
        self.person_type = kwargs.get("person_type", None)  # actor / director
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
# CHAT ENGINE
# ═══════════════════════════════════════════════════════════════
class ChatEngine:
    def __init__(self, db, tmdb_service, confusion_service):
        self.db = db
        self.tmdb = tmdb_service
        self.confusion = confusion_service

    # ─────────── MAIN ENTRY POINT ───────────
    async def process(self, text: str, limit: int = 6, min_vote: float = 5.0,
                      exclude_ids: list = None, session_context: dict = None) -> dict:
        """
        Main entry point. Detects intent, routes to appropriate handler,
        returns unified response.
        """
        exclude_ids = set(exclude_ids or [])
        text = text.strip()

        if not text or len(text) < 2:
            return self._empty_response("Lütfen ne tür bir film aradığını yaz.")

        # Step 1: Detect intent
        intent = self._detect_intent(text)
        logger.info(f"[ChatEngine] Intent: {intent.type} | ref: {intent.reference_title} | person: {intent.person_name}")

        # Step 2: Route to handler
        try:
            if intent.type == "exact_movie_search":
                return await self._handle_movie_search(intent, text, limit, min_vote, exclude_ids)
            elif intent.type == "similar_to_movie":
                return await self._handle_similar(intent, text, limit, min_vote, exclude_ids)
            elif intent.type in ("actor_recommendation", "director_recommendation"):
                return await self._handle_person(intent, text, limit, min_vote, exclude_ids)
            elif intent.type == "feedback":
                return await self._handle_feedback(intent, text, limit, min_vote, exclude_ids, session_context)
            else:
                # mood_recommendation, genre_recommendation, mixed_request, unknown
                return await self._handle_mood(intent, text, limit, min_vote, exclude_ids)
        except Exception as e:
            logger.error(f"[ChatEngine] Handler error: {e}")
            # Fallback to mood handler
            return await self._handle_mood(intent, text, limit, min_vote, exclude_ids)

    # ─────────── INTENT DETECTION ───────────
    def _detect_intent(self, text: str) -> Intent:
        """Rule-based intent classification."""
        text_lower = text.lower().strip()
        text_norm = _normalize(text)

        # 1. Check feedback patterns
        for pattern, fb_type in FEEDBACK_PATTERNS.items():
            if pattern in text_lower:
                return Intent("feedback", feedback_type=fb_type, original_text=text)

        # 2. Check "similar to" patterns — "X gibi film"
        for pat in SIMILAR_PATTERNS:
            m = re.search(pat, text_lower)
            if m:
                ref_title = m.group(1).strip().strip('"\'')
                if len(ref_title) >= 2:
                    # Check if reference is a Turkish alias
                    alias_check = _normalize(ref_title)
                    if alias_check in TURKISH_TITLE_ALIASES:
                        ref_title = TURKISH_TITLE_ALIASES[alias_check]
                    return Intent("similar_to_movie", reference_title=ref_title, original_text=text)

        # 3. Check for person keywords ("Tom Hanks filmi", "Nolan tarzı")
        for kw in DIRECTOR_KEYWORDS:
            if kw in text_lower:
                # Extract person name — everything before the keyword
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

        # 4. Check Turkish title aliases
        if text_norm in TURKISH_TITLE_ALIASES:
            return Intent("exact_movie_search",
                          reference_title=TURKISH_TITLE_ALIASES[text_norm],
                          original_text=text)

        # Also check partial alias matches
        for alias, eng_title in TURKISH_TITLE_ALIASES.items():
            if alias in text_norm and len(alias) >= 4:
                # Check if the alias is the main content, not just a substring of a sentence
                remaining = text_norm.replace(alias, "").strip()
                if len(remaining) < 10 or not _has_mood_words(remaining):
                    return Intent("exact_movie_search",
                                  reference_title=eng_title,
                                  original_text=text)

        # 5. Extract genre preferences and exclusions
        genres_wanted = []
        genres_excluded = []
        for genre_name, genre_ids in GENRE_KEYWORDS.items():
            if genre_name in text_lower:
                # Check if preceded by a negative word
                pos = text_lower.index(genre_name)
                before = text_lower[max(0, pos - 20):pos]
                is_negative = any(nw in before for nw in NEGATIVE_WORDS)
                if is_negative:
                    genres_excluded.extend(genre_ids)
                else:
                    genres_wanted.extend(genre_ids)

        # 6. Decide: movie search vs mood recommendation
        # If short (1-5 words), no mood words → likely a movie title
        if _is_short_title_like(text):
            return Intent("exact_movie_search", reference_title=text.strip(),
                          original_text=text)

        # 7. Genre-only request (no mood words, just genre)
        if genres_wanted and not _has_mood_words(text):
            return Intent("genre_recommendation", genres=genres_wanted,
                          exclude_genres=genres_excluded, original_text=text)

        # 8. Mixed or mood
        if genres_wanted or genres_excluded:
            return Intent("mixed_request", genres=genres_wanted,
                          exclude_genres=genres_excluded, original_text=text)

        return Intent("mood_recommendation", original_text=text)

    # ─────────── MOVIE SEARCH HANDLER ───────────
    async def _handle_movie_search(self, intent: Intent, text: str,
                                    limit: int, min_vote: float, exclude_ids: set) -> dict:
        """User is searching for a specific movie. Find it + return similar."""
        query = intent.reference_title or text.strip()
        logger.info(f"[ChatEngine] Movie search: '{query}'")

        primary_movie = None
        similar_movies = []

        # 1. Search local DB first (fuzzy)
        local_results = await self.db.search_repository_by_title(query, limit=10)
        if local_results:
            # Find best match
            best = None
            best_score = 0
            for m in local_results:
                score = _fuzzy_match(query, m["title"])
                if score > best_score:
                    best_score = score
                    best = m
            if best and best_score > 0.4:
                primary_movie = best
                logger.info(f"[ChatEngine] Local match: '{best['title']}' (score={best_score:.2f})")

        # 2. TMDb search fallback
        if not primary_movie:
            try:
                tmdb_results = await asyncio.wait_for(
                    self.tmdb.search_movies(query), timeout=5.0
                )
                if tmdb_results:
                    # Find best fuzzy match from TMDb results
                    best = None
                    best_score = 0
                    for m in tmdb_results[:5]:
                        for field in [m.get("title", ""), m.get("original_title", "")]:
                            score = _fuzzy_match(query, field)
                            if score > best_score:
                                best_score = score
                                best = m
                    if best and best_score > 0.3:
                        primary_movie = best
                        logger.info(f"[ChatEngine] TMDb match: '{best.get('title')}' (score={best_score:.2f})")
                    elif tmdb_results:
                        primary_movie = tmdb_results[0]
                        logger.info(f"[ChatEngine] TMDb first result: '{tmdb_results[0].get('title')}'")
            except Exception as e:
                logger.warning(f"[ChatEngine] TMDb search failed: {e}")

        if not primary_movie:
            # Nothing found — fall back to mood
            return await self._handle_mood(intent, text, limit, min_vote, exclude_ids)

        # 3. Get similar movies — TMDB recommendations/similar are thematically
        #    curated, so they are the primary source.
        movie_id = primary_movie.get("id") or primary_movie.get("tmdb_id")
        primary_genres = primary_movie.get("genre_ids", []) or []
        try:
            rec_data, similar_data = await asyncio.gather(
                asyncio.wait_for(self.tmdb.get_recommendations(movie_id), timeout=5.0),
                asyncio.wait_for(self.tmdb.get_similar_movies(movie_id), timeout=5.0),
                return_exceptions=True,
            )
            # Recommendations önce (TMDB'nin en isabetli sinyali), sonra similar
            if isinstance(rec_data, dict):
                similar_movies.extend(rec_data.get("movies", []))
            if isinstance(similar_data, dict):
                similar_movies.extend(similar_data.get("movies", []))
        except Exception:
            pass

        # Tematik/kaliteli süzme — obscure 10.0 ve alakasız tür dışı filmleri ele
        final_similar = _filter_relevant_similar(
            similar_movies, primary_genres, exclude_ids, movie_id,
            min_vote_count=80, min_vote_average=6.0, require_genre_overlap=True,
        )

        # TMDB yeterli alakalı sonuç vermezse, yerel havuzdan AYNI türden
        # filmlerle tamamla (yine tür-örtüşmesi + kalite filtresinden geçer).
        if len(final_similar) < (limit - 1) and primary_genres:
            try:
                from backend.mood_scoring import calculate_mood_scores
                genre_scores = calculate_mood_scores(
                    primary_genres, primary_movie.get("vote_average", 7),
                    overview=primary_movie.get("overview"),
                    release_date=primary_movie.get("release_date"),
                )
                if genre_scores:
                    top_mood = max(genre_scores, key=genre_scores.get)
                    local_mood_movies = await self.db.get_all_repository_movies_by_mood(top_mood, min_vote=min_vote)
                    already = {(x.get("id") or x.get("tmdb_id")) for x in final_similar}
                    padded = _filter_relevant_similar(
                        local_mood_movies, primary_genres,
                        exclude_ids | already, movie_id,
                        min_vote_count=50, min_vote_average=6.0,
                        require_genre_overlap=True,
                    )
                    final_similar.extend(padded)
            except Exception:
                pass

        final_similar = final_similar[:limit - 1]

        # Build response
        all_movies = []

        # Primary movie first
        all_movies.append({
            "id": movie_id,
            "title": primary_movie.get("title"),
            "poster_url": primary_movie.get("poster_url"),
            "vote_average": primary_movie.get("vote_average"),
            "mood_score": 100,
            "reason": f"Aradığın film bu — {primary_movie.get('title')}.",
            "matched_moods": [],
            "genre_ids": primary_movie.get("genre_ids", []),
            "overview": primary_movie.get("overview"),
            "release_date": primary_movie.get("release_date"),
            "is_primary_match": True,
        })

        # Similar movies
        for m in final_similar:
            all_movies.append({
                "id": m.get("id") or m.get("tmdb_id"),
                "title": m.get("title"),
                "poster_url": m.get("poster_url"),
                "vote_average": m.get("vote_average"),
                "mood_score": round(random.uniform(70, 95), 1),
                "reason": f"'{primary_movie.get('title')}' beğendiysen bunu da seveceksin.",
                "matched_moods": [],
                "genre_ids": m.get("genre_ids", []),
                "overview": m.get("overview"),
                "release_date": m.get("release_date"),
            })

        return {
            "mode": "smart_search",
            "intent": "exact_movie_search",
            "query_understanding": f"'{primary_movie.get('title')}' filmini arıyorsun. İşte o ve benzerleri.",
            "ustad_line": f"Demek {primary_movie.get('title')}... Zevkini beğendim. Birkaç benzerini de bırakayım.",
            "message": f"'{primary_movie.get('title')}' ve benzeri filmler",
            "mood_mix": [],
            "primary_match": {
                "id": movie_id,
                "title": primary_movie.get("title"),
                "match_type": "exact_or_fuzzy",
            },
            "movies": all_movies[:limit],
        }

    # ─────────── SIMILAR MOVIES HANDLER ───────────
    async def _handle_similar(self, intent: Intent, text: str,
                               limit: int, min_vote: float, exclude_ids: set) -> dict:
        """'X gibi film öner' — find X, then recommend similar."""
        ref_title = intent.reference_title
        if not ref_title:
            return await self._handle_mood(intent, text, limit, min_vote, exclude_ids)

        logger.info(f"[ChatEngine] Similar search: ref='{ref_title}'")

        # Find the reference movie
        ref_movie = None

        # Local search
        local_results = await self.db.search_repository_by_title(ref_title, limit=5)
        if local_results:
            best = max(local_results, key=lambda m: _fuzzy_match(ref_title, m["title"]))
            if _fuzzy_match(ref_title, best["title"]) > 0.35:
                ref_movie = best

        # TMDb fallback
        if not ref_movie:
            try:
                tmdb_results = await asyncio.wait_for(
                    self.tmdb.search_movies(ref_title), timeout=5.0
                )
                if tmdb_results:
                    ref_movie = tmdb_results[0]
            except Exception:
                pass

        if not ref_movie:
            return await self._handle_mood(intent, text, limit, min_vote, exclude_ids)

        # Get similar movies from TMDb — recommendations önce (en isabetli)
        movie_id = ref_movie.get("id") or ref_movie.get("tmdb_id")
        ref_genres = ref_movie.get("genre_ids", []) or []
        similar_movies = []
        try:
            rec_data, similar_data = await asyncio.gather(
                asyncio.wait_for(self.tmdb.get_recommendations(movie_id), timeout=5.0),
                asyncio.wait_for(self.tmdb.get_similar_movies(movie_id), timeout=5.0),
                return_exceptions=True,
            )
            if isinstance(rec_data, dict):
                similar_movies.extend(rec_data.get("movies", []))
            if isinstance(similar_data, dict):
                similar_movies.extend(similar_data.get("movies", []))
        except Exception:
            pass

        # Tematik/kaliteli süzme — alakasız ve obscure filmleri ele
        final = _filter_relevant_similar(
            similar_movies, ref_genres, exclude_ids, movie_id,
            min_vote_count=80, min_vote_average=6.0, require_genre_overlap=True,
        )

        # Yetersizse yerel havuzdan AYNI türden filmlerle tamamla
        if len(final) < limit and ref_genres:
            try:
                from backend.mood_scoring import calculate_mood_scores
                genre_scores = calculate_mood_scores(
                    ref_genres, ref_movie.get("vote_average", 7),
                    overview=ref_movie.get("overview"),
                    release_date=ref_movie.get("release_date"),
                )
                if genre_scores:
                    top_mood = max(genre_scores, key=genre_scores.get)
                    local_mood_movies = await self.db.get_all_repository_movies_by_mood(top_mood, min_vote=min_vote)
                    already = {(x.get("id") or x.get("tmdb_id")) for x in final}
                    padded = _filter_relevant_similar(
                        local_mood_movies, ref_genres,
                        exclude_ids | already, movie_id,
                        min_vote_count=50, min_vote_average=6.0,
                        require_genre_overlap=True,
                    )
                    final.extend(padded)
            except Exception:
                pass

        final = final[:limit]

        # Build movies list
        movies = []
        ref_title_display = ref_movie.get("title", ref_title)
        for m in final:
            movies.append({
                "id": m.get("id") or m.get("tmdb_id"),
                "title": m.get("title"),
                "poster_url": m.get("poster_url"),
                "vote_average": m.get("vote_average"),
                "mood_score": round(random.uniform(65, 95), 1),
                "reason": f"'{ref_title_display}' sevdiysen bu da tam senlik.",
                "matched_moods": [],
                "genre_ids": m.get("genre_ids", []),
                "overview": m.get("overview"),
                "release_date": m.get("release_date"),
            })

        return {
            "mode": "smart_search",
            "intent": "similar_to_movie",
            "query_understanding": f"'{ref_title_display}' benzeri filmler arıyorsun.",
            "ustad_line": f"'{ref_title_display}' derken hangi damarına dokunduysa, aynısını vaat eden birkaç film daha var.",
            "message": f"'{ref_title_display}' benzeri filmler",
            "mood_mix": [],
            "primary_match": {
                "id": movie_id,
                "title": ref_title_display,
                "match_type": "reference",
            },
            "movies": movies,
        }

    # ─────────── PERSON SEARCH HANDLER ───────────
    async def _handle_person(self, intent: Intent, text: str,
                              limit: int, min_vote: float, exclude_ids: set) -> dict:
        """Actor or director based recommendation."""
        person_name = intent.person_name
        if not person_name:
            return await self._handle_mood(intent, text, limit, min_vote, exclude_ids)

        logger.info(f"[ChatEngine] Person search: '{person_name}' (type={intent.person_type})")

        # Search for person on TMDb
        try:
            persons = await asyncio.wait_for(
                self.tmdb.search_person(person_name), timeout=5.0
            )
        except Exception:
            persons = []

        if not persons:
            # Maybe it's a movie title instead
            return await self._handle_movie_search(
                Intent("exact_movie_search", reference_title=person_name, original_text=text),
                text, limit, min_vote, exclude_ids
            )

        # Take the most popular person
        person = persons[0]
        person_id = person["id"]
        person_display = person["name"]
        department = person.get("known_for_department", "")

        # Get their movies
        try:
            person_movies = await asyncio.wait_for(
                self.tmdb.get_person_movie_credits(person_id), timeout=5.0
            )
        except Exception:
            person_movies = []

        if not person_movies:
            return await self._handle_mood(intent, text, limit, min_vote, exclude_ids)

        # Filter and deduplicate
        seen = set(exclude_ids)
        movies = []
        for m in person_movies:
            mid = m.get("id")
            if mid and mid not in seen and (m.get("vote_average", 0) >= min_vote or m.get("popularity", 0) > 10):
                seen.add(mid)
                role_type = "yönetmenliğindeki" if department == "Directing" else "oynadığı"
                movies.append({
                    "id": mid,
                    "title": m.get("title"),
                    "poster_url": m.get("poster_url"),
                    "vote_average": m.get("vote_average"),
                    "mood_score": round(random.uniform(70, 95), 1),
                    "reason": f"{person_display}'ın {role_type} en iyi işlerinden biri.",
                    "matched_moods": [],
                    "genre_ids": m.get("genre_ids", []),
                    "overview": m.get("overview"),
                    "release_date": m.get("release_date"),
                })
            if len(movies) >= limit:
                break

        role_label = "yönetmenliğindeki" if department == "Directing" else "filmlerinden"

        return {
            "mode": "smart_search",
            "intent": intent.type,
            "query_understanding": f"{person_display}'ın {role_label} seçme filmler.",
            "ustad_line": f"{person_display}... İyi bir isim seçtin. İşte en parlak işleri.",
            "message": f"{person_display} filmleri",
            "mood_mix": [],
            "primary_match": {
                "id": person_id,
                "title": person_display,
                "match_type": "person",
            },
            "movies": movies[:limit],
        }

    # ─────────── FEEDBACK HANDLER ───────────
    async def _handle_feedback(self, intent: Intent, text: str,
                                limit: int, min_vote: float, exclude_ids: set,
                                session_context: dict = None) -> dict:
        """Handle user feedback like 'daha farklı', 'daha hafif'."""
        fb_type = intent.feedback_type

        # Modify the original mood query based on feedback
        modifiers = {}
        if fb_type == "lighter":
            modifiers["energy_level"] = "low"
            modifiers["emotional_weight"] = "light"
        elif fb_type == "heavier":
            modifiers["energy_level"] = "high"
            modifiers["emotional_weight"] = "heavy"
        elif fb_type == "darker":
            modifiers["darkness_level"] = "dark"
        elif fb_type == "funnier":
            modifiers["prefer_moods"] = ["kahkaha", "battaniye"]
        elif fb_type == "newer":
            modifiers["year_min"] = 2015
        elif fb_type == "older":
            modifiers["year_max"] = 2005
        elif fb_type == "more_popular":
            modifiers["min_popularity"] = 50
        elif fb_type == "less_known":
            modifiers["max_popularity"] = 30

        # Use session context or default mood
        fallback_text = text
        if session_context and session_context.get("last_query"):
            fallback_text = session_context["last_query"]

        intent.modifiers = modifiers
        return await self._handle_mood(intent, fallback_text, limit, min_vote, exclude_ids)

    # ─────────── MOOD RECOMMENDATION HANDLER ───────────
    async def _handle_mood(self, intent: Intent, text: str,
                            limit: int, min_vote: float, exclude_ids: set) -> dict:
        """
        Enhanced version of the existing mood-based recommendation.
        Uses Claude intent extraction → candidate pool → Claude reranking.
        Adds anti-repetition and diversity logic.
        """
        from backend.mood_scoring import calculate_mood_scores
        # Avoid circular import — import at call-time
        import backend.main as _main
        _rule_based_confused_analysis = _main._rule_based_confused_analysis
        REASON_MAP = _main.REASON_MAP
        MOOD_NAMES = _main.MOOD_NAMES

        # Phase 1: Intent extraction via Claude
        claude_intent = {}
        mood_mix = []
        message = ""
        ustad_line = ""

        from backend.config import ANTHROPIC_API_KEY
        claude_available = bool(ANTHROPIC_API_KEY)

        if claude_available:
            try:
                claude_intent = await asyncio.wait_for(
                    self.confusion.extract_user_intent(text),
                    timeout=20.0
                )
                if claude_intent:
                    # Re-classification: if Claude detected film/person entities, reroute
                    entities = claude_intent.get("detected_entities", {})
                    film_titles = entities.get("film_titles", [])
                    person_names = entities.get("person_names", [])
                    intent_hint = entities.get("intent_hint", "none")

                    if film_titles and intent_hint in ("similar", "lookup"):
                        ref_title = film_titles[0]
                        alias_check = _normalize(ref_title)
                        if alias_check in TURKISH_TITLE_ALIASES:
                            ref_title = TURKISH_TITLE_ALIASES[alias_check]
                        if intent_hint == "similar":
                            new_intent = Intent("similar_to_movie", reference_title=ref_title, original_text=text)
                            logger.info(f"[ChatEngine] Re-classified to similar_to_movie via Claude entity: '{ref_title}'")
                            return await self._handle_similar(new_intent, text, limit, min_vote, exclude_ids)
                        else:
                            new_intent = Intent("exact_movie_search", reference_title=ref_title, original_text=text)
                            logger.info(f"[ChatEngine] Re-classified to exact_movie_search via Claude entity: '{ref_title}'")
                            return await self._handle_movie_search(new_intent, text, limit, min_vote, exclude_ids)

                    elif person_names and intent_hint in ("similar", "lookup"):
                        person = person_names[0]
                        p_type = person.get("type", "actor")
                        intent_type = "director_recommendation" if p_type == "director" else "actor_recommendation"
                        new_intent = Intent(intent_type, person_name=person["name"],
                                            person_type=p_type, original_text=text)
                        logger.info(f"[ChatEngine] Re-classified to {intent_type} via Claude entity: '{person['name']}'")
                        return await self._handle_person(new_intent, text, limit, min_vote, exclude_ids)

                    if claude_intent.get("mood_mix"):
                        mood_mix = claude_intent["mood_mix"]
                        message = claude_intent.get("user_intent_summary", "")
                        ustad_line = claude_intent.get("ustad_line", "")
                        # Typo correction — prepend to ustad_line if detected
                        if claude_intent.get("correction_detected") and claude_intent.get("corrected_text"):
                            ustad_line = claude_intent["corrected_text"]
            except Exception as e:
                logger.warning(f"[ChatEngine] Claude intent extraction failed: {e}")

        # Rule-based fallback
        if not mood_mix:
            fallback = _rule_based_confused_analysis(text)
            mood_mix = fallback["mood_mix"]
            message = fallback["message"]
            claude_intent = {}

        # Phase 2: Candidate pool gathering (60 candidates)
        seen_ids = set(exclude_ids)
        candidates = []
        CANDIDATE_TARGET = 60

        for mix_item in mood_mix:
            mood_id = mix_item.get("mood_id")
            pct = mix_item.get("percentage", 50)
            if not mood_id:
                continue
            count = max(4, round(CANDIDATE_TARGET * pct / 100))
            try:
                result = await self.db.get_all_repository_movies_by_mood(mood_id, min_vote=min_vote)
                scored = []
                for m in result:
                    if m["id"] in seen_ids:
                        continue
                    genre_ids = m.get("genre_ids", [])
                    scores = calculate_mood_scores(
                        genre_ids, m.get("vote_average"),
                        overview=m.get("overview"),
                        release_date=m.get("release_date"),
                    )
                    ms = scores.get(mood_id, 0)
                    m_copy = dict(m)
                    m_copy["mood_score"] = round(ms, 1)
                    m_copy["matched_mood"] = mood_id
                    m_copy["mood_scores"] = {k: round(v, 1) for k, v in scores.items()}
                    scored.append(m_copy)
                scored.sort(key=lambda x: (-x["mood_score"], -x.get("vote_average", 0)))

                # Apply intent modifiers (feedback adjustments)
                modifiers = intent.modifiers if intent else {}
                if modifiers.get("year_min"):
                    scored = [s for s in scored if (s.get("release_date") or "0000")[:4] >= str(modifiers["year_min"])]
                if modifiers.get("year_max"):
                    scored = [s for s in scored if (s.get("release_date") or "9999")[:4] <= str(modifiers["year_max"])]
                if modifiers.get("min_popularity"):
                    scored = [s for s in scored if s.get("popularity", 0) >= modifiers["min_popularity"]]
                if modifiers.get("max_popularity"):
                    scored = [s for s in scored if s.get("popularity", 0) <= modifiers["max_popularity"]]

                # Apply genre exclusions from intent
                if intent and intent.exclude_genres:
                    scored = [s for s in scored if not any(g in intent.exclude_genres for g in s.get("genre_ids", []))]

                for m in scored[:count]:
                    if m["id"] not in seen_ids:
                        seen_ids.add(m["id"])
                        candidates.append(m)
            except Exception:
                continue

        # Anti-repetition: add randomization to top candidates
        # Instead of always taking top-scored, add weighted random
        if len(candidates) > 15:
            # Split into tiers: top 15 (strong), rest (good)
            top_tier = candidates[:15]
            rest_tier = candidates[15:80]
            random.shuffle(top_tier)
            random.shuffle(rest_tier)
            candidates = top_tier + rest_tier

        # Pre-filter scoring
        if claude_intent and candidates:
            energy = claude_intent.get("energy_level", "medium")
            darkness = claude_intent.get("darkness_level", "neutral")
            avoid_tags = claude_intent.get("avoid", [])

            HIGH_ENERGY_MOODS = {"adrenalin", "kahkaha"}
            LOW_ENERGY_MOODS = {"sessiz", "kalp", "battaniye", "gozyasi"}
            DARK_MOODS = {"gece", "deep-chills", "zihin", "karmakar"}
            LIGHT_MOODS = {"battaniye", "kahkaha", "askbahcesi", "yolculuk"}

            def _prefilter_score(m):
                base = m.get("mood_score", 0)
                matched = m.get("matched_mood", "")
                bonus = 0.0
                if energy == "low" and matched in LOW_ENERGY_MOODS: bonus += 5
                if energy == "high" and matched in HIGH_ENERGY_MOODS: bonus += 5
                if darkness in ("light",) and matched in LIGHT_MOODS: bonus += 3
                if darkness in ("dark", "very_dark") and matched in DARK_MOODS: bonus += 3
                for tag in avoid_tags:
                    if tag == "empty_comedy" and matched == "kahkaha": bonus -= 10
                    if tag == "heavy_tragedy" and matched == "gozyasi": bonus -= 10
                # Random factor for diversity
                bonus += random.uniform(-2, 2)
                return base + bonus

            candidates.sort(key=lambda x: -_prefilter_score(x))

        candidates = candidates[:80]

        # Phase 2: Claude reranking (top 18 candidates — daha az aday = daha hızlı)
        top_candidates = candidates[:18]
        rerank_result = {}
        mode = "rule_based"

        if claude_available and claude_intent and top_candidates:
            try:
                rerank_result = await asyncio.wait_for(
                    self.confusion.rerank_movies(text, claude_intent, top_candidates),
                    timeout=15.0
                )
                if rerank_result and rerank_result.get("recommendations"):
                    mode = "claude_reranked"
                    if rerank_result.get("ustad_line"):
                        ustad_line = rerank_result["ustad_line"]
            except Exception as e:
                logger.warning(f"[ChatEngine] Claude rerank failed: {e}")

        # Build final movie list
        movies = []

        if mode == "claude_reranked":
            recs = rerank_result.get("recommendations", [])
            recs.sort(key=lambda x: x.get("rank", 99))
            id_to_candidate = {m["id"]: m for m in candidates}

            for rec in recs[:limit]:
                tid = rec.get("tmdb_id")
                m = id_to_candidate.get(tid)
                if not m:
                    for cand in candidates:
                        if cand.get("id") == tid:
                            m = cand
                            break
                if not m:
                    continue
                movies.append({
                    "id": m["id"],
                    "title": m.get("title"),
                    "poster_url": m.get("poster_url"),
                    "vote_average": m.get("vote_average"),
                    "mood_score": round(rec.get("fit_score", m.get("mood_score", 0)), 1),
                    "reason": rec.get("reason_turkish", REASON_MAP.get(m.get("matched_mood"), "Bu ruh haline uygun.")),
                    "matched_moods": rec.get("mood_match", [m.get("matched_mood", "")]),
                    "genre_ids": m.get("genre_ids"),
                    "overview": m.get("overview"),
                    "release_date": m.get("release_date"),
                })
        else:
            seen_in_final = set()
            for mix_item in mood_mix:
                mood_id = mix_item.get("mood_id")
                pct = mix_item.get("percentage", 50)
                count = max(1, round(limit * pct / 100))
                mood_cands = [c for c in candidates if c.get("matched_mood") == mood_id and c["id"] not in seen_in_final]
                mood_cands.sort(key=lambda x: (-x.get("mood_score", 0), -x.get("vote_average", 0)))
                for m in mood_cands[:count]:
                    if m["id"] not in seen_in_final:
                        seen_in_final.add(m["id"])
                        movies.append({
                            "id": m["id"],
                            "title": m.get("title"),
                            "poster_url": m.get("poster_url"),
                            "vote_average": m.get("vote_average"),
                            "mood_score": m.get("mood_score", 0),
                            "reason": REASON_MAP.get(mood_id, "Bu atmosfere uygun olduğu için seçildi."),
                            "matched_moods": [mood_id],
                            "genre_ids": m.get("genre_ids"),
                            "overview": m.get("overview"),
                            "release_date": m.get("release_date"),
                        })
            movies = movies[:limit]

        # Determine intent label for response
        intent_label = intent.type if intent else "mood_recommendation"
        if intent_label == "feedback":
            intent_label = "mood_recommendation"

        query_understanding = message or "Ruh haline uygun filmler arıyorum."

        # Context dimensions for frontend (optional display)
        context_dims = claude_intent.get("context_dimensions", {}) if claude_intent else {}

        return {
            "mode": mode,
            "intent": intent_label,
            "query_understanding": query_understanding,
            "ustad_line": ustad_line,
            "message": message,
            "mood_mix": mood_mix,
            "movies": movies,
            "correction_detected": claude_intent.get("correction_detected", False) if claude_intent else False,
            "corrected_text": claude_intent.get("corrected_text") if claude_intent else None,
            "context_dimensions": context_dims,
        }

    # ─────────── HELPERS ───────────
    def _empty_response(self, msg: str) -> dict:
        return {
            "mode": "error",
            "intent": "unknown",
            "query_understanding": msg,
            "ustad_line": "",
            "message": msg,
            "mood_mix": [],
            "movies": [],
        }
