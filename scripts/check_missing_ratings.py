import sqlite3, os, sys, json
sys.stdout.reconfigure(encoding='utf-8')

db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'movie_cache.db')
conn = sqlite3.connect(db_path)
cur = conn.cursor()

# === DETAYLI ANALİZ ===

print("=" * 70)
print("1. PUANI OLMAYAN FİLMLER (vote_average = 0 veya NULL)")
print("=" * 70)

cur.execute("SELECT COUNT(*) FROM movie_repository WHERE vote_average IS NULL OR vote_average = 0 OR vote_average = ''")
total_missing = cur.fetchone()[0]
cur.execute("SELECT COUNT(*) FROM movie_repository")
total_all = cur.fetchone()[0]
print(f"  Toplam film: {total_all}")
print(f"  Puanı eksik: {total_missing} (%{round(total_missing/total_all*100, 1)})")

print()
print("--- Bu filmlerin veri kalitesi ---")
cur.execute("""
    SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN poster_url IS NOT NULL AND poster_url != '' THEN 1 ELSE 0 END) as has_poster,
        SUM(CASE WHEN overview IS NOT NULL AND overview != '' THEN 1 ELSE 0 END) as has_overview,
        SUM(CASE WHEN backdrop_url IS NOT NULL AND backdrop_url != '' THEN 1 ELSE 0 END) as has_backdrop
    FROM movie_repository 
    WHERE vote_average IS NULL OR vote_average = 0
""")
row = cur.fetchone()
print(f"  Poster'ı olan: {row[1]}")
print(f"  Overview'ı olan: {row[2]}")
print(f"  Backdrop'u olan: {row[3]}")

print()
print("--- Poster'ı bile olmayan filmler (tamamen boş) ---")
cur.execute("""
    SELECT COUNT(*) FROM movie_repository 
    WHERE (vote_average IS NULL OR vote_average = 0)
    AND (poster_url IS NULL OR poster_url = '')
    AND (overview IS NULL OR overview = '')
""")
print(f"  Sayı: {cur.fetchone()[0]}")

print()
print("--- Mood'lara göre puansız filmler ---")
cur.execute("""
    SELECT mood_id, COUNT(*) as cnt,
           ROUND(AVG(popularity), 1) as avg_pop
    FROM movie_repository 
    WHERE vote_average IS NULL OR vote_average = 0
    GROUP BY mood_id ORDER BY cnt DESC
""")
for row in cur.fetchall():
    print(f"  {row[0]}: {row[1]} film (ortalama pop: {row[2]})")

print()
print("=" * 70)
print("2. MOOD_SCORE'U OLMAYAN FİLMLER")
print("=" * 70)
cur.execute("SELECT COUNT(*) FROM movie_repository WHERE mood_score IS NULL OR mood_score = 0")
total_missing = cur.fetchone()[0]
print(f"  Toplam: {total_missing}")
print()
print("--- Mood'lara göre ---")
cur.execute("""
    SELECT mood_id, COUNT(*) as cnt
    FROM movie_repository 
    WHERE mood_score IS NULL OR mood_score = 0
    GROUP BY mood_id ORDER BY cnt DESC
""")
for row in cur.fetchall():
    print(f"  {row[0]}: {row[1]} film")

print()
print("=" * 70)
print("3. VOTE_COUNT > 0 AMA VOTE_AVERAGE = 0 (TMDB hatası olabilir)")
print("=" * 70)
cur.execute("""
    SELECT tmdb_id, title, mood_id, popularity, poster_url
    FROM movie_repository 
    WHERE (vote_average IS NULL OR vote_average = 0) 
    AND vote_count IS NOT NULL AND vote_count > 0
""")
rows = cur.fetchall()
print(f"  Sayı: {len(rows)}")
for row in rows:
    title = row[1].encode('ascii', 'replace').decode('ascii')
    print(f"  ID={row[0]} title='{title}' mood={row[2]} pop={row[3]}")

conn.close()
