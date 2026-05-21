import sqlite3
conn = sqlite3.connect(r'D:\film eleştirmen\movie_cache.db')
c = conn.cursor()

for mood in ['kadraj-estetigi', 'geceyarisi-itirafi']:
    total = c.execute('SELECT COUNT(*) FROM movie_repository WHERE mood_id = ?', (mood,)).fetchone()[0]
    no_poster = c.execute("SELECT COUNT(*) FROM movie_repository WHERE mood_id = ? AND (poster_url IS NULL OR poster_url = '')", (mood,)).fetchone()[0]
    no_overview = c.execute("SELECT COUNT(*) FROM movie_repository WHERE mood_id = ? AND (overview IS NULL OR overview = '')", (mood,)).fetchone()[0]
    no_vote = c.execute("SELECT COUNT(*) FROM movie_repository WHERE mood_id = ? AND (vote_average = 0 OR vote_average IS NULL)", (mood,)).fetchone()[0]
    avg_score = c.execute('SELECT AVG(mood_score) FROM movie_repository WHERE mood_id = ? AND mood_score > 0', (mood,)).fetchone()[0]
    avg_vote = c.execute('SELECT AVG(vote_average) FROM movie_repository WHERE mood_id = ? AND vote_average > 0', (mood,)).fetchone()[0]
    
    print(f'{mood}:')
    print(f'  Total films: {total}')
    print(f'  Missing poster: {no_poster}')
    print(f'  Missing overview: {no_overview}')
    print(f'  No vote: {no_vote}')
    print(f'  Avg mood_score: {avg_score:.1f}')
    print(f'  Avg vote: {avg_vote:.2f}')
    pages = (total + 19) // 20
    print(f'  Pages (at 20/page): ~{pages}')
    print()
    
    # Top 5
    top = c.execute('SELECT title, vote_average, mood_score FROM movie_repository WHERE mood_id = ? ORDER BY mood_score DESC LIMIT 5', (mood,)).fetchall()
    print('  Top 5:')
    for r in top:
        print(f'    {r[0][:50]} | vote={r[1]:.2f} | score={r[2]}')
    print()

conn.close()
