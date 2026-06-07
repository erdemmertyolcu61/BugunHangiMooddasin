"""mood_scoring saf kalite-kapısı mantığı için birim testleri."""
from backend.mood_scoring import is_low_quality_asian


def test_non_asian_movie_always_passes():
    # Asya dışı filmler düşük puanlı bile olsa bu filtreye takılmaz.
    movie = {"original_language": "en", "vote_average": 3.0, "vote_count": 10}
    assert is_low_quality_asian(movie) is False


def test_obscure_asian_movie_is_filtered():
    movie = {"original_language": "ja", "vote_average": 6.0, "vote_count": 50}
    assert is_low_quality_asian(movie) is True


def test_acclaimed_asian_movie_passes():
    # Parasite benzeri: yüksek puan + yüksek oy → geçer.
    movie = {"original_language": "ko", "vote_average": 8.5, "vote_count": 15000}
    assert is_low_quality_asian(movie) is False


def test_missing_fields_default_to_filtered_for_asian():
    movie = {"original_language": "zh"}
    assert is_low_quality_asian(movie) is True
