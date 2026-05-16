import sqlite3

dbs = [
    r"d:\film eleştirmen\movie_cache.db",
    r"d:\film eleştirmen\backend\film_elestirmen.db",
]

for db_path in dbs:
    try:
        conn = sqlite3.connect(db_path)
        c = conn.cursor()
        tables = [r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
        print(f"{db_path}: tables = {tables}")
        if "movie_repository" in tables:
            c.execute("DELETE FROM movie_repository WHERE mood_id = 'kalp'")
            c.execute("DELETE FROM movie_repository WHERE mood_id = 'deep-chills'")
            conn.commit()
            print(f"  -> Cleared kalp and deep-chills")
        conn.close()
    except Exception as e:
        print(f"  ERROR: {e}")
