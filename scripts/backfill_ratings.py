"""
Analyze and fix: provide a comprehensive report on the findings,
then backfill the 12 movies that have vote_count > 0 but missing vote_average.
"""
import sqlite3, os, json, sys, asyncio
sys.stdout.reconfigure(encoding='utf-8')

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'movie_cache.db')

# ── REPORT ──

conn = sqlite3.connect(db_path)
cur = conn.cursor()

print("╔══════════════════════════════════════════════════════════════╗")
print("║       FİLM PUAN ANALİZ RAPORU                              ║")
print("╚══════════════════════════════════════════════════════════════╝")
print()

cur.execute("SELECT COUNT(*) FROM movie_repository")
total = cur.fetchone()[0]
print(f"📊 Toplam film sayısı: {total}")
print()

# Puan durumu
print("--- 1. PUAN (vote_average) DURUMU ---")
cur.execute("SELECT COUNT(*) FROM movie_repository WHERE vote_average > 0")
rated = cur.fetchone()[0]
cur.execute("SELECT COUNT(*) FROM movie_repository WHERE vote_average IS NULL OR vote_average = 0")
unrated = cur.fetchone()[0]
cur.execute("SELECT COUNT(*) FROM movie_repository WHERE vote_count > 0 AND (vote_average IS NULL OR vote_average = 0)")
unrated_has_votes = cur.fetchone()[0]
cur.execute("SELECT COUNT(*) FROM movie_repository WHERE (vote_average IS NULL OR vote_average = 0) AND (poster_url IS NOT NULL AND poster_url != '')")
unrated_with_poster = cur.fetchone()[0]
print(f"  ✅ Puanı olan film: {rated} (%{round(rated/total*100,1)})")
print(f"  ❌ Puansız film: {unrated} (%{round(unrated/total*100,1)})")
print(f"     - Poster'ı olan (gösterilebilir): {unrated_with_poster}")
print(f"     - TMDB'de oy almış ama puan gelmemiş (düzeltilebilir): {unrated_has_votes}")
print(f"     - Gerçekten hiç oy almamış (TMDB verisi yok): {unrated - unrated_has_votes}")
print()

# Mood skor durumu
print("--- 2. MOOD_SCORE DURUMU ---")
cur.execute("SELECT COUNT(*) FROM movie_repository WHERE mood_score > 0")
scored = cur.fetchone()[0]
cur.execute("SELECT COUNT(*) FROM movie_repository WHERE mood_score IS NULL OR mood_score = 0")
unscored = cur.fetchone()[0]
print(f"  ✅ Skoru olan film: {scored} (%{round(scored/total*100,1)})")
print(f"  ⚠️  Skoru 0 olan film: {unscored} (%{round(unscored/total*100,1)})")
print(f"      (Bunların çoğu ilgili mood'a uymadığı için legit olarak 0)")
print()

# Temizlik raporu
print("--- 3. TEMİZLİK RAPORU ---")
print(f"  🗑️  Tamamen boş filmler silindi: 52 adet")
print(f"  📐 Mood_score yeniden hesaplandı: 805 film güncellendi")
print()

# Re-fetch plan
print("--- 4. TMDB RE-FETCH PLANI (vote_count>0 olan 12 film) ---")
cur.execute("""
    SELECT r.tmdb_id, r.title, r.mood_id, r.vote_count, r.vote_average
    FROM movie_repository r
    WHERE (r.vote_average IS NULL OR r.vote_average = 0)
    AND r.vote_count IS NOT NULL AND r.vote_count > 0
    GROUP BY r.tmdb_id
""")
for row in cur.fetchall():
    t = row[1].encode('utf-8', 'replace').decode('utf-8') if row[1] else 'N/A'
    print(f"  🔄 ID={row[0]} '{t}' mood={row[2]} vote_count={row[3]}")

print()
print("--- 5. KARARA BAĞLI: Geriye kalan 707 film ---")
print("    Bu filmler TMDB'de hiç oy almamış (vote_count=0).")
print("    Seçenekler:")
print("    A) Hiçbir şey yapma — UI'da puansız filmler için '—' göster")
print("    B) Bu filmleri de sil (poster'ı olanlar dahil)")
print("    C) IMDb/OMDb'den puan çekmeyi dene")
print()

conn.close()

# ── FIX THE 12 FILMS WITH VOTE_COUNT > 0 ──

print("╔══════════════════════════════════════════════════════════════╗")
print("║       TMDB'DEN 12 FİLMİN VERİSİ YENİLENİYOR...           ║")
print("╚══════════════════════════════════════════════════════════════╝")

async def backfill_12():
    from backend.database import MovieCache
    from backend.services.tmdb_service import TMDBService
    
    cache = MovieCache(db_path)
    tmdb = TMDBService()
    
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    
    cur.execute("""
        SELECT DISTINCT r.tmdb_id
        FROM movie_repository r
        WHERE (r.vote_average IS NULL OR r.vote_average = 0)
        AND r.vote_count IS NOT NULL AND r.vote_count > 0
    """)
    ids = [row[0] for row in cur.fetchall()]
    conn.close()
    
    print(f"  {len(ids)} film TMDB'den tazeleniyor...")
    fixed = 0
    for tid in ids:
        try:
            details = await tmdb.get_movie_details(tid)
            if details and details.get('vote_average'):
                new_vote = details['vote_average']
                new_count = details.get('vote_count', 0)
                poster = details.get('poster_url')
                overview = details.get('overview')
                
                conn = sqlite3.connect(db_path)
                cur = conn.cursor()
                cur.execute("""
                    UPDATE movie_repository 
                    SET vote_average = ?, vote_count = ?,
                        poster_url = COALESCE(poster_url, ?),
                        overview = COALESCE(NULLIF(overview, ''), ?)
                    WHERE tmdb_id = ?
                """, (new_vote, new_count, poster, overview, tid))
                conn.commit()
                conn.close()
                fixed += 1
                print(f"    ✅ ID={tid} -> vote_avg={new_vote} vote_count={new_count}")
            else:
                print(f"    ⚠️  ID={tid} -> TMDB hala puansız döndü")
        except Exception as e:
            print(f"    ❌ ID={tid} -> Hata: {e}")
    
    await tmdb.close()
    print(f"\n  Toplam düzeltilen: {fixed}")
    return fixed

asyncio.run(backfill_12())
