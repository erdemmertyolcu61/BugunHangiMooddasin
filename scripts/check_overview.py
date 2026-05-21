import sqlite3

conn = sqlite3.connect(r'D:\film eleştirmen\movie_cache.db')
cur = conn.cursor()

for mood in ['kadraj-estetigi', 'geceyarisi-itirafi']:
    cur.execute("""
        SELECT tmdb_id, title, poster_url, vote_average, mood_score
        FROM movie_repository
        WHERE mood_id = ? AND (overview IS NULL OR overview = '')
        ORDER BY mood_score DESC
        LIMIT 10
    """, (mood,))
    rows = cur.fetchall()
    print(f'=== {mood} - missing overview (top 10) ===')
    for r in rows:
        poster = r[2][:40] if r[2] else 'NONE'
        print(f'  id={r[0]}, title={r[1]}, poster={poster}, vote={r[3]}, score={r[4]}')
    
    cur.execute("""
        SELECT COUNT(*)
        FROM movie_repository r
        LEFT JOIN movie_cache c ON r.tmdb_id = c.tmdb_id
        WHERE r.mood_id = ? AND (r.overview IS NULL OR r.overview = '')
        AND c.overview IS NOT NULL AND c.overview != ''
    """, (mood,))
    has_in_cache = cur.fetchone()[0]
    print(f'  Have overview in movie_cache: {has_in_cache}')
    
    cur.execute("""
        SELECT COUNT(*)
        FROM movie_repository r
        LEFT JOIN movie_fast_search f ON r.tmdb_id = f.tmdb_id
        WHERE r.mood_id = ? AND (r.overview IS NULL OR r.overview = '')
        AND f.overview IS NOT NULL AND f.overview != ''
    """, (mood,))
    has_in_fast = cur.fetchone()[0]
    print(f'  Have overview in movie_fast_search: {has_in_fast}')
    print()

conn.close()
