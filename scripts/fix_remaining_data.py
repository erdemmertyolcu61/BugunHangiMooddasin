"""
Second pass: fix remaining data issues and trim low-quality entries.
"""

import sqlite3

DB_PATH = r'D:\film eleştirmen\movie_cache.db'
TARGET_MOODS = ['kadraj-estetigi', 'geceyarisi-itirafi']
SCORE_THRESHOLD = 45

def copy_missing_data_separately(conn, mood_id):
    """Copy poster and overview separately from other moods."""
    cur = conn.cursor()
    
    # Fix missing posters
    cur.execute("""
        SELECT r.tmdb_id
        FROM movie_repository r
        WHERE r.mood_id = ? AND (r.poster_url IS NULL OR r.poster_url = '')
    """, (mood_id,))
    missing_poster_ids = [r[0] for r in cur.fetchall()]
    
    fixed_poster = 0
    for tmdb_id in missing_poster_ids:
        cur.execute("""
            SELECT poster_url FROM movie_repository
            WHERE tmdb_id = ? AND mood_id != ?
            AND poster_url IS NOT NULL AND poster_url != ''
            LIMIT 1
        """, (tmdb_id, mood_id))
        row = cur.fetchone()
        if row:
            cur.execute(
                "UPDATE movie_repository SET poster_url = ? WHERE tmdb_id = ? AND mood_id = ?",
                (row[0], tmdb_id, mood_id)
            )
            fixed_poster += 1
    
    # Fix missing overviews
    cur.execute("""
        SELECT r.tmdb_id
        FROM movie_repository r
        WHERE r.mood_id = ? AND (r.overview IS NULL OR r.overview = '')
    """, (mood_id,))
    missing_overview_ids = [r[0] for r in cur.fetchall()]
    
    fixed_overview = 0
    for tmdb_id in missing_overview_ids:
        cur.execute("""
            SELECT overview FROM movie_repository
            WHERE tmdb_id = ? AND mood_id != ?
            AND overview IS NOT NULL AND overview != ''
            LIMIT 1
        """, (tmdb_id, mood_id))
        row = cur.fetchone()
        if row:
            cur.execute(
                "UPDATE movie_repository SET overview = ? WHERE tmdb_id = ? AND mood_id = ?",
                (row[0], tmdb_id, mood_id)
            )
            fixed_overview += 1
    
    # Fix missing backdrop_url
    cur.execute("""
        SELECT r.tmdb_id
        FROM movie_repository r
        WHERE r.mood_id = ? AND (r.backdrop_url IS NULL OR r.backdrop_url = '')
    """, (mood_id,))
    missing_backdrop_ids = [r[0] for r in cur.fetchall()]
    
    fixed_backdrop = 0
    for tmdb_id in missing_backdrop_ids:
        cur.execute("""
            SELECT backdrop_url FROM movie_repository
            WHERE tmdb_id = ? AND mood_id != ?
            AND backdrop_url IS NOT NULL AND backdrop_url != ''
            LIMIT 1
        """, (tmdb_id, mood_id))
        row = cur.fetchone()
        if row:
            cur.execute(
                "UPDATE movie_repository SET backdrop_url = ? WHERE tmdb_id = ? AND mood_id = ?",
                (row[0], tmdb_id, mood_id)
            )
            fixed_backdrop += 1
    
    conn.commit()
    print(f"  {mood_id}: Fixed poster={fixed_poster}, overview={fixed_overview}, backdrop={fixed_backdrop}")
    return fixed_poster + fixed_overview + fixed_backdrop

def remove_incomplete_movies(conn, mood_id):
    """Remove movies that still have no poster AND no overview."""
    cur = conn.cursor()
    cur.execute(
        "DELETE FROM movie_repository WHERE mood_id = ? AND (poster_url IS NULL OR poster_url = '') AND (overview IS NULL OR overview = '')",
        (mood_id,)
    )
    removed = cur.rowcount
    conn.commit()
    if removed > 0:
        print(f"  {mood_id}: Removed {removed} movies with no poster+overview")
    return removed

def increase_threshold(conn, mood_id, threshold):
    """Remove movies with mood_score below threshold."""
    cur = conn.cursor()
    cur.execute(
        "DELETE FROM movie_repository WHERE mood_id = ? AND mood_score < ?",
        (mood_id, threshold)
    )
    removed = cur.rowcount
    conn.commit()
    if removed > 0:
        print(f"  {mood_id}: Removed {removed} movies with score < {threshold}")
    return removed

def main():
    conn = sqlite3.connect(DB_PATH)
    
    for mood in TARGET_MOODS:
        print(f"=== {mood} ===")
        
        # Phase 1: Aggressively copy missing data from any other mood row
        copy_missing_data_separately(conn, mood)
        
        # Phase 2: Remove movies still missing both poster AND overview
        remove_incomplete_movies(conn, mood)
        
        # Phase 3: Raise threshold to reduce page count
        increase_threshold(conn, mood, SCORE_THRESHOLD)
    
    # Final summary
    print("\n=== Final Summary ===")
    for mood in TARGET_MOODS:
        total = conn.execute(
            "SELECT COUNT(*) FROM movie_repository WHERE mood_id = ?", (mood,)
        ).fetchone()[0]
        no_poster = conn.execute(
            "SELECT COUNT(*) FROM movie_repository WHERE mood_id = ? AND (poster_url IS NULL OR poster_url = '')",
            (mood,)
        ).fetchone()[0]
        no_overview = conn.execute(
            "SELECT COUNT(*) FROM movie_repository WHERE mood_id = ? AND (overview IS NULL OR overview = '')",
            (mood,)
        ).fetchone()[0]
        no_vote = conn.execute(
            "SELECT COUNT(*) FROM movie_repository WHERE mood_id = ? AND (vote_average IS NULL OR vote_average = 0)",
            (mood,)
        ).fetchone()[0]
        avg_score = conn.execute(
            "SELECT AVG(mood_score) FROM movie_repository WHERE mood_id = ? AND mood_score > 0",
            (mood,)
        ).fetchone()[0]
        avg_vote = conn.execute(
            "SELECT AVG(vote_average) FROM movie_repository WHERE mood_id = ? AND vote_average > 0",
            (mood,)
        ).fetchone()[0]
        
        print(f"  {mood}:")
        print(f"    Total: {total}")
        print(f"    Missing poster: {no_poster}")
        print(f"    Missing overview: {no_overview}")
        print(f"    No vote: {no_vote}")
        print(f"    Avg mood_score: {avg_score:.1f}")
        print(f"    Avg vote: {avg_vote:.2f}")
        
        if total > 0:
            pages = (total + 19) // 20
            print(f"    Pages (at 20/page): ~{pages}")
        print()
    
    conn.close()

if __name__ == '__main__':
    main()
