"""
Semantic cache for the "Kafan mı Karışık?" Claude intent-extraction call.

The expensive part of a mood request is confusion.extract_user_intent():
a 2-15s Claude call that is essentially deterministic for semantically
equivalent prompts ("sevgilimle yazlık film" ≈ "partnerimle izlenecek
romantik yaz filmi"). We cache its JSON result keyed by a normalized,
stop-word-stripped token set and match new queries with Jaccard
similarity — no embeddings, no external service, fast on 0.1 CPU.

Only the intent JSON is cached. The downstream candidate pool + rerank
still run live, so anti-repetition (exclude_ids) and fresh movie
selection are unaffected. Storage goes through the existing MovieCache
(local aiosqlite) — reproducible, auto-rewarms after a restart.
"""
import re
import json
import logging

logger = logging.getLogger("semantic_cache")

# Jaccard threshold for "semantically equivalent". 0.58 keeps near-duplicates
# and paraphrases together while rejecting genuinely different requests.
_SIM_THRESHOLD = 0.58
# Queries with fewer meaningful tokens are too ambiguous to match safely.
_MIN_TOKENS = 2
# How many recent rows to scan per lookup (bounded work on 0.1 CPU).
_SCAN_LIMIT = 400

# Turkish + filler stop words. Removing these makes the token set carry the
# actual semantic load (mood/genre/companion) rather than grammar glue.
_STOPWORDS = {
    "bir", "bana", "ben", "biz", "şu", "bu", "o", "ve", "ile", "için",
    "gibi", "çok", "az", "ama", "fakat", "de", "da", "ki", "mi", "mı",
    "mu", "mü", "ne", "ya", "veya", "hem", "her", "en", "daha", "kadar",
    "olan", "olsun", "olmasın", "var", "yok", "istiyorum", "ister",
    "isterim", "lütfen", "film", "filmi", "filmler", "filmleri", "izle",
    "izlemek", "izleyeyim", "izlesem", "öner", "önersene", "tavsiye",
    "şey", "bişey", "birşey", "biraz", "falan", "filan", "şöyle", "böyle",
}


def _normalize(text: str) -> str:
    """Lowercase, fold Turkish chars, strip punctuation, collapse spaces."""
    if not text:
        return ""
    t = text.strip().lower()
    for a, b in (("ı", "i"), ("ğ", "g"), ("ü", "u"), ("ş", "s"),
                 ("ö", "o"), ("ç", "c"), ("â", "a"), ("î", "i"), ("û", "u")):
        t = t.replace(a, b)
    t = re.sub(r"[^\w\s]", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def _tokenize(norm: str) -> set:
    """Meaningful token set: drop stop words and very short tokens."""
    return {
        w for w in norm.split()
        if len(w) >= 3 and w not in _STOPWORDS
    }


def _jaccard(a: set, b: set) -> float:
    if not a or not b:
        return 0.0
    inter = len(a & b)
    if not inter:
        return 0.0
    return inter / len(a | b)


async def lookup(cache, query: str):
    """Return cached intent dict for a semantically-equivalent past query, else None.

    `cache` is the shared MovieCache instance (injected to avoid an import cycle).
    """
    try:
        norm = _normalize(query)
        tokens = _tokenize(norm)
        if len(tokens) < _MIN_TOKENS:
            return None

        rows = await cache.get_recent_intent_cache(_SCAN_LIMIT)
        best_row_id = None
        best_intent = None
        best_score = 0.0

        for row in rows:
            row_id, _q, tok_json, intent_json = row[0], row[1], row[2], row[3]
            try:
                cached_tokens = set(json.loads(tok_json))
            except Exception:
                continue
            score = _jaccard(tokens, cached_tokens)
            if score > best_score:
                best_score = score
                best_row_id = row_id
                best_intent = intent_json

        if best_score >= _SIM_THRESHOLD and best_intent:
            try:
                intent = json.loads(best_intent)
            except Exception:
                return None
            # Fire-and-forget recency bump (don't block the response on it)
            try:
                await cache.bump_intent_cache_hit(best_row_id)
            except Exception:
                pass
            logger.info(
                "[SemCache] HIT score=%.2f tokens=%s", best_score, sorted(tokens)
            )
            return intent

        return None
    except Exception as e:
        # A cache failure must never break the request path
        logger.warning("[SemCache] lookup failed: %s", e)
        return None


async def store(cache, query: str, intent: dict):
    """Persist a freshly-extracted intent for future semantic hits."""
    try:
        if not intent or not isinstance(intent, dict):
            return
        norm = _normalize(query)
        tokens = _tokenize(norm)
        if len(tokens) < _MIN_TOKENS:
            return
        await cache.save_intent_cache(
            norm,
            json.dumps(sorted(tokens), ensure_ascii=False),
            json.dumps(intent, ensure_ascii=False),
        )
        logger.info("[SemCache] STORE tokens=%s", sorted(tokens))
    except Exception as e:
        logger.warning("[SemCache] store failed: %s", e)
