"""
Final cleanup: remove movies still missing overview after all copy attempts.
These movies have no summary data anywhere in the database.
"""

import sqlite3

DB_PATH = r'D:\film eleştirmen\movie_cache.db'
TARGET_MOODS = ['kadraj-estetigi', 'geceyarisi-itirafi']

def remove_without_overview(conn, mood_id):
    cur = conn.cursor()
    cur.execute(
        "DELETE FROM movie_repository WHERE mood_id = ? AND (overview IS NULL OR overview = '')",
        (mood_id,)
    )
    removed = cur.rowcount
    conn.commit()
    if removed > 0:
        print(f'  {mood_id}: Removed {removed} movies without overview')
    return removed

def main():
    conn = sqlite3.connect(DB_PATH)
    
    print('=== Removing movies without overview ===')
    for mood in TARGET_MOODS:
        remove_without_overview(conn, mood)
    
    print()
    print('=== Final Summary ===')
    for mood in TARGET_MOODS:
        total = conn.execute(
            'SELECT COUNT(*) FROM movie_repository WHERE mood_id = ?', (mood,)
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
            'SELECT COUNT(*) FROM movie_repository WHERE mood_id = ? AND (vote_average IS NULL OR vote_average = 0)',
            (mood,)
        ).fetchone()[0]
        avg_score = conn.execute(
            'SELECT AVG(mood_score) FROM movie_repository WHERE mood_id = ? AND mood_score > 0',
            (mood,)
        ).fetchone()[0]
        avg_vote = conn.execute(
            'SELECT AVG(vote_average) FROM movie_repository WHERE mood_id = ? AND vote_average > 0',
            (mood,)
        ).fetchone()[0]
        
        print(f'  {mood}:')
        print(f'    Total: {total}')
        print(f'    Missing poster: {no_poster}')
        print(f'    Missing overview: {no_overview}')
        print(f'    No vote: {no_vote}')
        print(f'    Avg mood_score: {avg_score:.1f}')
        print(f'    Avg vote: {avg_vote:.2f}')
        pages = (total + 19) // 20 if total > 0 else 0
        print(f'    Pages (at 20/page): ~{pages}')
        print()
    
    conn.close()

if __name__ == '__main__':
    main()
