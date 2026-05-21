"""
Populate kadraj-estetigi and geceyarisi-itirafi moods with ALL fitting films.

This script:
1. Gets ALL unique movies from the repository
2. Scores each movie for the two target moods using the scoring engine
3. Adds high-scoring movies (score >= 30) to the target moods
"""

import sys
import os
import json
import sqlite3
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.mood_scoring import calculate_mood_scores, classify_movie

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "movie_cache.db")
TARGET_MOODS = ["kadraj-estetigi", "geceyarisi-itirafi"]
SCORE_THRESHOLD = 30

def get_db():
    return sqlite3.connect(DB_PATH)

def get_all_unique_movies(conn):
    """Get one row per unique tmdb_id with all metadata + keywords."""
    cursor = conn.execute("""
        SELECT DISTINCT r.tmdb_id, r.title, r.genre_ids, r.vote_average,
               r.vote_count, r.overview, r.release_date, r.popularity,
               r.original_language,
               COALESCE(a.keywords, '[]') as keywords
        FROM movie_repository r
        LEFT JOIN movie_attributes a ON r.tmdb_id = a.tmdb_id
        ORDER BY r.vote_count DESC
    """)
    return cursor.fetchall()

def get_existing_mood_membership(conn):
    """Get set of (tmdb_id, mood_id) pairs already in the repository."""
    cursor = conn.execute(
        "SELECT tmdb_id, mood_id FROM movie_repository WHERE mood_id IN (?, ?)",
        TARGET_MOODS
    )
    return set(cursor.fetchall())

def main():
    conn = get_db()
    existing = get_existing_mood_membership(conn)
    print(f"Existing in kadraj-estetigi: {sum(1 for _, m in existing if m == 'kadraj-estetigi')}")
    print(f"Existing in geceyarisi-itirafi: {sum(1 for _, m in existing if m == 'geceyarisi-itirafi')}")
    print()

    movies = get_all_unique_movies(conn)
    print(f"Total unique movies to process: {len(movies)}")
    print()

    to_insert = {m: [] for m in TARGET_MOODS}
    total_scored = 0

    for row in movies:
        tmdb_id, title, genre_ids_json, vote_avg, vote_count, overview, release_date, popularity, original_language, keywords_json = row

        genre_ids = json.loads(genre_ids_json) if genre_ids_json else []
        tmdb_keywords = json.loads(keywords_json) if keywords_json else []

        # Skip if already in both target moods
        in_kadraj = (tmdb_id, "kadraj-estetigi") in existing
        in_gece = (tmdb_id, "geceyarisi-itirafi") in existing
        if in_kadraj and in_gece:
            continue

        try:
            classification = classify_movie(
                genre_ids, vote_avg,
                tmdb_id=tmdb_id,
                vote_count=vote_count,
                overview=overview,
                release_date=release_date,
                tmdb_keywords=tmdb_keywords,
                popularity=popularity,
                original_language=original_language,
            )
            total_scored += 1

            for mood_id in TARGET_MOODS:
                if mood_id == "kadraj-estetigi" and in_kadraj:
                    continue
                if mood_id == "geceyarisi-itirafi" and in_gece:
                    continue

                score = classification["moodScores"].get(mood_id, 0)
                if mood_id in classification.get("blockedMoods", []):
                    score = 0

                if score >= SCORE_THRESHOLD:
                    to_insert[mood_id].append((tmdb_id, title, score))
        except Exception as e:
            print(f"  Error processing {title} (id={tmdb_id}): {e}")
            continue

        if total_scored % 1000 == 0:
            print(f"  Scored {total_scored}/{len(movies)} movies...")

    print()
    print(f"Total movies scored: {total_scored}")
    for mood_id in TARGET_MOODS:
        print(f"  {mood_id}: {len(to_insert[mood_id])} new movies to add")

    # batch insert - first get full movie data for new movies
    conn2 = get_db()
    insert_cursor = conn2.cursor()

    total_added = {m: 0 for m in TARGET_MOODS}
    for mood_id in TARGET_MOODS:
        mood_movies = to_insert[mood_id]
        if not mood_movies:
            continue

        # Get ALL movie data in one query
        all_tmdb_ids = [m[0] for m in mood_movies]
        placeholders = ",".join("?" for _ in all_tmdb_ids)
        source_rows = conn2.execute(
            f"""SELECT tmdb_id, title, poster_url, overview, release_date,
                       vote_average, genre_ids, backdrop_url, vote_count,
                       original_language, popularity
                FROM movie_repository
                WHERE tmdb_id IN ({placeholders})""",
            all_tmdb_ids
        ).fetchall()

        movie_data = {}
        for r in source_rows:
            if r[0] not in movie_data:
                movie_data[r[0]] = r

        # Pre-check which pairs already exist
        existing_pairs = set()
        for mood2 in TARGET_MOODS:
            cur = conn2.execute(
                "SELECT tmdb_id FROM movie_repository WHERE mood_id = ?",
                (mood2,)
            )
            for row in cur.fetchall():
                existing_pairs.add((row[0], mood2))

        batch_size = 500
        for i in range(0, len(mood_movies), batch_size):
            batch = mood_movies[i:i+batch_size]

            inserted = 0
            for tmdb_id, title, score in batch:
                if (tmdb_id, mood_id) in existing_pairs:
                    continue
                data = movie_data.get(tmdb_id)
                if data is None:
                    continue
                try:
                    insert_cursor.execute(
                        """INSERT OR IGNORE INTO movie_repository
                           (tmdb_id, mood_id, title, poster_url, overview, release_date,
                            vote_average, genre_ids, backdrop_url, vote_count,
                            original_language, popularity, mood_score)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                        (tmdb_id, mood_id, data[1], data[2], data[3], data[4],
                         data[5], data[6], data[7], data[8],
                         data[9], data[10], round(score, 1))
                    )
                    if insert_cursor.rowcount > 0:
                        inserted += 1
                        existing_pairs.add((tmdb_id, mood_id))
                except Exception as e:
                    print(f"    Error inserting {title} into {mood_id}: {e}")

            conn2.commit()
            total_added[mood_id] += inserted
            print(f"  {mood_id}: inserted {inserted} movies (batch {i//batch_size + 1})")

    conn2.close()
    conn.close()

    print()
    print("=" * 60)
    print("SUMMARY")
    print("=" * 60)
    for mood_id in TARGET_MOODS:
        print(f"  {mood_id}: +{total_added[mood_id]} new movies added")

    # Final count
    final_conn = get_db()
    for mood_id in TARGET_MOODS:
        count = final_conn.execute(
            "SELECT COUNT(*) FROM movie_repository WHERE mood_id = ?", (mood_id,)
        ).fetchone()[0]
        print(f"  {mood_id} total: {count}")
    final_conn.close()

if __name__ == "__main__":
    main()
