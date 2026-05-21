import sqlite3

conn = sqlite3.connect(r'D:\film eleştirmen\movie_cache.db')
cur = conn.cursor()

for mood in ['kadraj-estetigi', 'geceyarisi-itirafi']:
    total = cur.execute('SELECT COUNT(*) FROM movie_repository WHERE mood_id = ?', (mood,)).fetchone()[0]
    
    no_poster = cur.execute(
        "SELECT COUNT(*) FROM movie_repository WHERE mood_id = ? AND (poster_url IS NULL OR poster_url = '')",
        (mood,)
    ).fetchone()[0]
    
    no_overview = cur.execute(
        "SELECT COUNT(*) FROM movie_repository WHERE mood_id = ? AND (overview IS NULL OR overview = '')",
        (mood,)
    ).fetchone()[0]
    
    no_vote = cur.execute(
        "SELECT COUNT(*) FROM movie_repository WHERE mood_id = ? AND (vote_average IS NULL OR vote_average = 0)",
        (mood,)
    ).fetchone()[0]
    
    no_genre = cur.execute(
        "SELECT COUNT(*) FROM movie_repository WHERE mood_id = ? AND (genre_ids IS NULL OR genre_ids = '[]')",
        (mood,)
    ).fetchone()[0]
    
    print(f'=== {mood} (total: {total}) ===')
    print(f'  No poster: {no_poster}')
    print(f'  No overview: {no_overview}')
    print(f'  No vote: {no_vote}')
    print(f'  No genre: {no_genre}')
    
    # Score distribution summary
    cur.execute(
        "SELECT mood_score, COUNT(*) FROM movie_repository WHERE mood_id = ? GROUP BY mood_score ORDER BY mood_score",
        (mood,)
    )
    scores = cur.fetchall()
    print(f'  Unique score values: {len(scores)}')
    
    # Bucket: <30, 30-39, 40-49, 50-59, 60+
    buckets = {"<30": 0, "30-39": 0, "40-49": 0, "50-59": 0, "60+": 0}
    for s, c in scores:
        if s < 30:
            buckets["<30"] += c
        elif s < 40:
            buckets["30-39"] += c
        elif s < 50:
            buckets["40-49"] += c
        elif s < 60:
            buckets["50-59"] += c
        else:
            buckets["60+"] += c
    
    for label, count in buckets.items():
        if count > 0:
            print(f'  Score {label}: {count}')
    
    # Vote count stats
    cur.execute(
        "SELECT MIN(vote_count), MAX(vote_count), AVG(vote_count) FROM movie_repository WHERE mood_id = ?",
        (mood,)
    )
    min_vc, max_vc, avg_vc = cur.fetchone()
    print(f'  Vote count: min={min_vc}, max={max_vc}, avg={avg_vc:.0f}')
    
    # Sample some bad entries
    bad = cur.execute(
        "SELECT title, vote_average, vote_count, mood_score, poster_url IS NULL or poster_url = '' as bad_poster FROM movie_repository WHERE mood_id = ? AND (poster_url IS NULL OR poster_url = '') LIMIT 5",
        (mood,)
    ).fetchall()
    if bad:
        print(f'  Sample bad entries (no poster):')
        for r in bad:
            print(f'    {r[0]}')
    print()

conn.close()
