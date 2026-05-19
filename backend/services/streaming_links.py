"""
streaming_availability builder.

TMDB'nin /watch/providers ucu filmin hangi platformda olduğunu + tek bir
ortak JustWatch linkini verir; platforma özel /title deep-link'i VERMEZ.
Bu modül, mevcut TMDB verisinden her platform için film adıyla bir
"platform-içi arama" deep-link'i üretir ($0, rate-limit yok).

Çıktı şeması (spec):
[
  {
    "platform_name": "Netflix",
    "platform_slug": "netflix",
    "logo_url": "...",          # TMDB logosu (zaten elde)
    "deep_link": "...",          # platform arama URL'i (film aranmış halde)
    "is_available": true,
    "offer_type": "flatrate"     # ekstra: flatrate|free|ads|rent|buy
  }
]
"""
import re
from urllib.parse import quote_plus, quote

# provider adı (lower) içinde geçen anahtar → arama-URL şablonu.
# {q} = quote_plus("film adı yıl"), {qp} = path için quote("film adı")
_TEMPLATES = [
    ("netflix",            "https://www.netflix.com/search?q={q}"),
    ("amazon prime",       "https://www.primevideo.com/search/?phrase={q}"),
    ("amazon video",       "https://www.primevideo.com/search/?phrase={q}"),
    ("prime video",        "https://www.primevideo.com/search/?phrase={q}"),
    ("disney",             "https://www.disneyplus.com/search?q={q}"),
    ("apple tv",           "https://tv.apple.com/search?term={q}"),
    ("apple itunes",       "https://tv.apple.com/search?term={q}"),
    ("itunes",             "https://tv.apple.com/search?term={q}"),
    ("google play",        "https://play.google.com/store/search?q={q}&c=movies"),
    ("youtube",            "https://www.youtube.com/results?search_query={q}"),
    ("mubi",               "https://mubi.com/en/search/films?query={q}"),
    ("blutv",              "https://www.blutv.com/arama/{qp}"),
    ("blu tv",             "https://www.blutv.com/arama/{qp}"),
    ("exxen",              "https://www.exxen.com/arama?q={q}"),
    ("gain",               "https://www.gain.tv/arama?q={q}"),
    ("tabii",              "https://www.tabii.com/tr/search?q={q}"),
    ("paramount",          "https://www.paramountplus.com/search/?query={q}"),
    ("hbo",                "https://play.max.com/search?q={q}"),
    ("max",                "https://play.max.com/search?q={q}"),
]

# Birden çok kategoride çıkan platformu tek tutmak için öncelik
_CATEGORY_PRIORITY = ("flatrate", "free", "ads", "rent", "buy")


def _slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (name or "").strip().lower())
    return s.strip("-") or "platform"


def _deep_link(provider_name: str, title: str, year: str, fallback: str):
    """Platform arama deep-link'i; eşleşme yoksa TMDB/JustWatch linkine düşer."""
    if not title:
        return fallback
    name_l = (provider_name or "").lower()
    q_text = f"{title} {year}".strip() if year else title
    for key, tmpl in _TEMPLATES:
        if key in name_l:
            return tmpl.format(
                q=quote_plus(q_text),
                qp=quote(title.strip()),
            )
    # Bilinmeyen platform → filme özel TMDB/JustWatch sayfası (yine doğru)
    return fallback or None


def build_streaming_availability(watch_providers: dict, title: str,
                                 release_date: str = None) -> list:
    """TMDB watch-providers dict + film adından streaming_availability dizisi.

    Hiçbir koşulda exception fırlatmaz — bozuk veri → boş liste.
    """
    try:
        if not watch_providers or not isinstance(watch_providers, dict):
            return []
        title = (title or "").strip()
        year = (release_date or "")[:4] if release_date else ""
        tmdb_link = watch_providers.get("link") or None

        out = []
        seen = set()
        for category in _CATEGORY_PRIORITY:
            for p in watch_providers.get(category, []) or []:
                name = p.get("provider_name")
                if not name:
                    continue
                slug = _slugify(name)
                if slug in seen:
                    continue
                seen.add(slug)
                out.append({
                    "platform_name": name,
                    "platform_slug": slug,
                    "logo_url": p.get("logo_url"),
                    "deep_link": _deep_link(name, title, year, tmdb_link),
                    "is_available": True,
                    "offer_type": category,
                })
        return out
    except Exception:
        return []
