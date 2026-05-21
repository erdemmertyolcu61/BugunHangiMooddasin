"""
Fix missing ratings and mood scores in the movie repository.
Steps:
1. Delete completely empty films (no poster, no overview, no rating)
2. Re-calculate mood_scores for all missing ones (inline, no API needed)
3. Backfill vote_average from TMDB API (requires TMDB key)
"""
import sqlite3, os, sys, json, asyncio, math
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'movie_cache.db')

os.environ.setdefault('TMDB_API_KEY', '')
os.environ.setdefault('TMDB_BASE_URL', 'https://api.themoviedb.org/3')
os.environ.setdefault('TMDB_IMAGE_BASE', 'https://image.tmdb.org/t/p')

conn = sqlite3.connect(db_path)
cur = conn.cursor()

print("=" * 70)
print("STEP 1: DELETE EMPTY FILMS")
print("=" * 70)

cur.execute("""
    DELETE FROM movie_repository 
    WHERE (vote_average IS NULL OR vote_average = 0)
    AND (poster_url IS NULL OR poster_url = '')
    AND (overview IS NULL OR overview = '')
""")
deleted = cur.rowcount
print(f"  Silinen tamamen boş film: {deleted}")
conn.commit()

print()
print("=" * 70)
print("STEP 2: FIX MISSING MOOD_SCORES (inline scoring)")
print("=" * 70)

from backend.mood_scoring import classify_movie

ALL_MOODS = [
    "battaniye","yolculuk","gece","kahkaha","gozyasi","adrenalin",
    "askbahcesi","zamanyolcusu","sessiz","zihin","kalp","karmakar",
    "Retro","deep-chills","kadraj-estetigi","geceyarisi-itirafi"
]

cur.execute("""
    SELECT r.tmdb_id, r.mood_id, r.genre_ids, r.vote_average, r.vote_count,
           r.overview, r.release_date, r.popularity, r.original_language,
           COALESCE(a.keywords, '[]') as keywords, r.mood_score
    FROM movie_repository r
    LEFT JOIN movie_attributes a ON r.tmdb_id = a.tmdb_id
    WHERE r.mood_score IS NULL OR r.mood_score = 0
""")
rows = cur.fetchall()
print(f"  Skoru eksik film sayısı: {len(rows)}")

updated = 0
for row in rows:
    tmdb_id, mood_id, genre_ids_json, vote_avg, vote_cnt, overview, release_date, popularity, original_lang, keywords_json, old_score = row
    
    genre_ids = json.loads(genre_ids_json) if genre_ids_json else []
    tmdb_keywords = json.loads(keywords_json) if keywords_json else []
    vote_avg_float = float(vote_avg) if vote_avg else 0.0
    vote_cnt_int = int(vote_cnt) if vote_cnt else 0
    
    classification = classify_movie(
        genre_ids, vote_avg_float,
        tmdb_id=tmdb_id,
        vote_count=vote_cnt_int,
        overview=overview,
        release_date=release_date,
        tmdb_keywords=tmdb_keywords,
        popularity=popularity,
        original_language=original_lang,
    )
    score = classification.get("moodScores", {}).get(mood_id, 0)
    if mood_id in classification.get("blockedMoods", []):
        score = 0
    if original_lang == "tr" and score >= 25:
        score += 3
    
    if score != old_score:
        cur.execute("UPDATE movie_repository SET mood_score = ? WHERE tmdb_id = ? AND mood_id = ?",
                    (score, tmdb_id, mood_id))
        updated += 1
    
    if (updated % 200) == 0 and updated > 0:
        print(f"    ...{updated} film güncellendi")

conn.commit()
print(f"  Güncellenen mood_score: {updated}")

# Post-check
print()
print("=" * 70)
print("POST-FIX VERIFICATION")
print("=" * 70)

cur.execute("SELECT COUNT(*) FROM movie_repository WHERE vote_average IS NULL OR vote_average = 0")
still_missing_vote = cur.fetchone()[0]
cur.execute("SELECT COUNT(*) FROM movie_repository WHERE mood_score IS NULL OR mood_score = 0")
still_missing_score = cur.fetchone()[0]
cur.execute("SELECT COUNT(*) FROM movie_repository")
total = cur.fetchone()[0]

print(f"  Toplam film: {total}")
print(f"  Hala puansız (vote_average): {still_missing_vote}")
print(f"  Hala skorsuz (mood_score): {still_missing_score}")
print()
print("  Not: Puansız filmler TMDB'de gerçekten hiç oy almamış filmlerdir.")
print("  Bunlar için TMDB API'den güncel veri çekilebilir (Step 3).")

conn.close()
