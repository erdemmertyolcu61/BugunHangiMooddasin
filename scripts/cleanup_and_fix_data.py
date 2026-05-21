"""
Clean up and fix data for kadraj-estetigi and geceyarisi-itirafi moods.

1. Copy missing poster_url, overview, backdrop_url from other mood rows
2. Remove movies with low mood_score (quality over quantity)
"""

import sqlite3

DB_PATH = r'D:\film eleştirmen\movie_cache.db'
TARGET_MOODS = ['kadraj-estetigi', 'geceyarisi-itirafi']
SCORE_THRESHOLD = 40  # Remove movies below this score

def copy_missing_data(conn, mood_id):
    """Copy poster_url, overview, backdrop_url from other moods for the same movie."""
    cur = conn.cursor()
    
    # Find movies missing poster_url or overview in target mood
    cur.execute("""
        SELECT r.tmdb_id, r.title
        FROM movie_repository r
        WHERE r.mood_id = ?
        AND (r.poster_url IS NULL OR r.poster_url = '' OR r.overview IS NULL OR r.overview = '')
    """, (mood_id,))
    
    needs_fix = cur.fetchall()
    if not needs_fix:
        print(f"  {mood_id}: All movies have poster and overview data.")
        return

    fixed_poster = 0
    fixed_overview = 0
    fixed_backdrop = 0
    
    for tmdb_id, title in needs_fix:
        # Find a source row from another mood that has the data
        cur.execute("""
            SELECT poster_url, overview, backdrop_url FROM movie_repository
            WHERE tmdb_id = ? AND mood_id != ?
            AND poster_url IS NOT NULL AND poster_url != ''
            AND overview IS NOT NULL AND overview != ''
            LIMIT 1
        """, (tmdb_id, mood_id))
        
        source = cur.fetchone()
        if not source:
            continue
        
        s_poster, s_overview, s_backdrop = source
        updates = []
        params = []
        
        cur.execute(
            "SELECT poster_url, overview, backdrop_url FROM movie_repository WHERE tmdb_id = ? AND mood_id = ?",
            (tmdb_id, mood_id)
        )
        current = cur.fetchone()
        
        if current:
            c_poster, c_overview, c_backdrop = current
            if not c_poster:
                updates.append("poster_url = ?")
                params.append(s_poster)
                fixed_poster += 1
            if not c_overview:
                updates.append("overview = ?")
                params.append(s_overview)
                fixed_overview += 1
            if not c_backdrop and s_backdrop:
                updates.append("backdrop_url = ?")
                params.append(s_backdrop)
                fixed_backdrop += 1
        
        if updates:
            params.extend([tmdb_id, mood_id])
            cur.execute(
                f"UPDATE movie_repository SET {', '.join(updates)} WHERE tmdb_id = ? AND mood_id = ?",
                params
            )
    
    conn.commit()
    print(f"  {mood_id}: Fixed posters={fixed_poster}, overviews={fixed_overview}, backdrops={fixed_backdrop}")

def remove_low_score_movies(conn, mood_id, threshold):
    """Remove movies with mood_score below threshold."""
    cur = conn.cursor()
    cur.execute(
        "DELETE FROM movie_repository WHERE mood_id = ? AND mood_score < ?",
        (mood_id, threshold)
    )
    removed = cur.rowcount
    conn.commit()
    print(f"  {mood_id}: Removed {removed} movies with mood_score < {threshold}")

def main():
    conn = sqlite3.connect(DB_PATH)
    
    print("=== Phase 1: Remove low-score movies ===")
    for mood in TARGET_MOODS:
        before = conn.execute(
            "SELECT COUNT(*) FROM movie_repository WHERE mood_id = ?", (mood,)
        ).fetchone()[0]
        remove_low_score_movies(conn, mood, SCORE_THRESHOLD)
        after = conn.execute(
            "SELECT COUNT(*) FROM movie_repository WHERE mood_id = ?", (mood,)
        ).fetchone()[0]
        print(f"    Before: {before}, After: {after}\n")
    
    print("=== Phase 2: Copy missing poster/overview data ===")
    for mood in TARGET_MOODS:
        copy_missing_data(conn, mood)
    print()
    
    # Final summary
    print("=== Final Summary ===")
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
        print(f"  {mood}:")
        print(f"    Total: {total}")
        print(f"    Missing poster: {no_poster}")
        print(f"    Missing overview: {no_overview}")
        print(f"    No vote: {no_vote}")
        print(f"    Avg mood_score: {avg_score:.1f}")
        
        if total > 0:
            pages = (total + 19) // 20
            print(f"    Pages (at 20/page): {pages}")
        print()
    
    conn.close()

if __name__ == '__main__':
    main()
