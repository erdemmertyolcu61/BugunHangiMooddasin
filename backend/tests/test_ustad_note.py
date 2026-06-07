"""Sıfır-maliyet, puana-duyarlı (ama puanı GÖSTERMEYEN) Üstad notu testleri."""
import re
from backend.services.ustad_note import generate_note


_HIGH = {
    "id": 27205, "title": "Inception", "genre_ids": [878, 28, 12],
    "release_date": "2010-07-16", "vote_average": 8.4,
}
_HIGH_RATINGS = {"imdb_rating": "8.8", "director": "Christopher Nolan"}

_RATING_PAT = re.compile(r"\d[.,]\d")  # ondalık puan deseni (yıl gibi tam sayılar serbest)


def test_deterministic_same_movie_same_note():
    assert generate_note(_HIGH, _HIGH_RATINGS, "zihin") == generate_note(_HIGH, _HIGH_RATINGS, "zihin")


def test_no_legacy_prefix():
    assert not generate_note(_HIGH, _HIGH_RATINGS, "zihin").lower().startswith("üstadın notu")


def test_never_mentions_numeric_rating():
    # Hiçbir kademede ondalık puan (6.1, 8.8 vb.) geçmemeli.
    for movie, r in [
        (_HIGH, _HIGH_RATINGS),
        ({"id": 1, "title": "Orta", "genre_ids": [18], "release_date": "2018-01-01", "vote_average": 6.6}, {"imdb_rating": "6.6"}),
        ({"id": 2, "title": "Zayıf", "genre_ids": [27], "release_date": "2015-01-01", "vote_average": 4.2}, {"imdb_rating": "4.2"}),
        ({"id": 3, "title": "Esrar", "genre_ids": [9648], "release_date": ""}, {}),
    ]:
        note = generate_note(movie, r, "gece")
        assert not _RATING_PAT.search(note), f"puan sızdı: {note}"


def test_high_rated_appends_mood_reason():
    note = generate_note(_HIGH, _HIGH_RATINGS, "gece")
    assert "gecenin ruhuna" in note  # gece mood kapanış cümlesi (yalnız yüksek/orta'da)


def test_low_rated_is_not_overpraised():
    low = {"id": 777, "title": "Zayıf Film", "genre_ids": [27], "release_date": "2015-01-01", "vote_average": 4.3}
    note = generate_note(low, {"imdb_rating": "4.3"}, "gece")
    for praise in ("başyapıt", "kaçırma", "ustalık", "ezber bozuyor", "şaheser"):
        assert praise not in note.lower()
    assert "gecenin ruhuna" not in note  # düşük puanlıda coşkulu mood cümlesi yok
    assert any(w in note.lower() for w in ("düşük", "zayıf", "ortalama", "vasat", "aksıyor", "tutmuyor", "beklenti", "sönük"))


def test_unknown_rating_no_mood_reason():
    bare = {"id": 5, "title": "Adsız", "genre_ids": [], "release_date": ""}
    note = generate_note(bare, {}, "battaniye")
    assert "Adsız" in note
    assert "içine çekiyor" not in note  # battaniye mood cümlesi eklenmemeli


def test_high_variety_across_films():
    # 12 farklı film → notların neredeyse tamamı benzersiz olmalı (md5 slot seed).
    notes = set()
    for i in range(12):
        m = {"id": 1000 + i, "title": f"Film{i}", "genre_ids": [18], "release_date": "2012-01-01", "vote_average": 8.0}
        notes.add(generate_note(m, {"imdb_rating": "8.0"}, "zihin"))
    assert len(notes) >= 11  # en fazla bir çakışmaya izin ver


def test_missing_fields_do_not_crash():
    note = generate_note({}, None, None)
    assert isinstance(note, str) and len(note) > 0
