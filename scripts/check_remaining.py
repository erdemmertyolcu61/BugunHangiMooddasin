import sqlite3, os, json

db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'movie_cache.db')
conn = sqlite3.connect(db_path)
cur = conn.cursor()

# Check remaining 251 un-scored movies
print("=== 251 un-scored movies: what data do they have? ===")
cur.execute("""
    SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN genre_ids IS NOT NULL AND genre_ids != '[]' AND genre_ids != '' THEN 1 ELSE 0 END) as has_genres,
        SUM(CASE WHEN overview IS NOT NULL AND overview != '' THEN 1 ELSE 0 END) as has_overview,
        SUM(CASE WHEN tmdb_id IN (SELECT tmdb_id FROM movie_attributes) THEN 1 ELSE 0 END) as has_keywords
    FROM movie_repository 
    WHERE mood_score IS NULL OR mood_score = 0
""")
row = cur.fetchone()
print(f"  Total: {row[0]}")
print(f"  Has genres: {row[1]}")
print(f"  Has overview: {row[2]}")
print(f"  Has keywords: {row[3]}")

print()
print("=== Detailed check for remaining un-scored ===")
cur.execute("""
    SELECT mood_id, COUNT(*) as cnt,
           SUM(CASE WHEN genre_ids IS NOT NULL AND genre_ids != '[]' AND genre_ids != '' THEN 1 ELSE 0 END) as has_genres,
           SUM(CASE WHEN overview IS NOT NULL AND overview != '' THEN 1 ELSE 0 END) as has_overview
    FROM movie_repository 
    WHERE mood_score IS NULL OR mood_score = 0
    GROUP BY mood_id ORDER BY cnt DESC
""")
for row in cur.fetchall():
    print(f"  {row[0]}: {row[1]} (genres={row[2]}, overview={row[3]})")

print()
print("=== Sample of remaining un-scored movies ===")
cur.execute("""
    SELECT tmdb_id, title, mood_id, genre_ids, vote_average, overview IS NOT NULL AND overview != '' as has_overview
    FROM movie_repository 
    WHERE mood_score IS NULL OR mood_score = 0
    LIMIT 10
""")
for row in cur.fetchall():
    has_genres = row[3] not in (None, '[]', '')
    t = row[1].encode('ascii', 'replace').decode('ascii') if row[1] else 'N/A'
    print(f"  ID={row[0]} title={t} mood={row[2]} genres={has_genres} vote_avg={row[4]} overview={bool(row[5])}")

print()
print("=== Check the 719 missing vote_average movies ===")
cur.execute("""
    SELECT COUNT(*) FROM movie_repository 
    WHERE (vote_average IS NULL OR vote_average = 0)
""")
cnt = cur.fetchone()[0]
cur.execute("""
    SELECT MIN(popularity), AVG(popularity), MAX(popularity) 
    FROM movie_repository 
    WHERE (vote_average IS NULL OR vote_average = 0)
""")
pop_stats = cur.fetchone()
print(f"  Total: {cnt}")
print(f"  Popularity stats: min={pop_stats[0]:.1f} avg={pop_stats[1]:.1f} max={pop_stats[2]:.1f}")

# How many of these would actually have a rating on TMDB if we re-fetched?
# Check movies that have vote_count=0 vs vote_count>0
cur.execute("""
    SELECT 
        SUM(CASE WHEN vote_count IS NULL OR vote_count = 0 THEN 1 ELSE 0 END) as zero_votes,
        SUM(CASE WHEN vote_count > 0 THEN 1 ELSE 0 END) as has_votes
    FROM movie_repository 
    WHERE (vote_average IS NULL OR vote_average = 0)
""")
row = cur.fetchone()
print(f"  With zero TMDB votes: {row[0]} (re-fetch won't help)")
print(f"  With >0 TMDB votes: {row[1]} (re-fetch might help)")

conn.close()
