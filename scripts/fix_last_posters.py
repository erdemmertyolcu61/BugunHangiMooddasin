import sqlite3

DB_PATH = r'D:\film eleştirmen\movie_cache.db'
TARGET_MOODS = ['kadraj-estetigi', 'geceyarisi-itirafi']

def main():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    
    for mood in TARGET_MOODS:
        cur.execute(
            "SELECT tmdb_id FROM movie_repository WHERE mood_id = ? AND (poster_url IS NULL OR poster_url = '')",
            (mood,)
        )
        ids = [r[0] for r in cur.fetchall()]
        if not ids:
            continue
        
        print(f'{mood}: Trying to fix {len(ids)} missing posters')
        
        for tmdb_id in ids:
            # Try movie_cache (Claude analysis table)
            cur.execute(
                "SELECT poster_url FROM movie_cache WHERE tmdb_id = ? AND poster_url IS NOT NULL AND poster_url != '' LIMIT 1",
                (tmdb_id,)
            )
            row = cur.fetchone()
            if row:
                cur.execute(
                    "UPDATE movie_repository SET poster_url = ? WHERE tmdb_id = ? AND mood_id = ?",
                    (row[0], tmdb_id, mood)
                )
                print(f'  Fixed poster for tmdb_id={tmdb_id} from movie_cache')
                continue
            
            # Try movie_fast_search
            cur.execute(
                "SELECT poster_url FROM movie_fast_search WHERE tmdb_id = ? AND poster_url IS NOT NULL AND poster_url != '' LIMIT 1",
                (tmdb_id,)
            )
            row = cur.fetchone()
            if row:
                cur.execute(
                    "UPDATE movie_repository SET poster_url = ? WHERE tmdb_id = ? AND mood_id = ?",
                    (row[0], tmdb_id, mood)
                )
                print(f'  Fixed poster for tmdb_id={tmdb_id} from fast_search')
                continue
        
        conn.commit()
    
    # Final check
    print()
    for mood in TARGET_MOODS:
        total = conn.execute('SELECT COUNT(*) FROM movie_repository WHERE mood_id = ?', (mood,)).fetchone()[0]
        no_poster = conn.execute(
            "SELECT COUNT(*) FROM movie_repository WHERE mood_id = ? AND (poster_url IS NULL OR poster_url = '')",
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
        pages = (total + 19) // 20
        
        print(f'{mood}: {total} films, {no_poster} no poster, avg_score={avg_score:.1f}, avg_vote={avg_vote:.2f}, ~{pages} pages')
    
    conn.close()

if __name__ == '__main__':
    main()
