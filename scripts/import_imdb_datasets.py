"""
IMDb Non-Commercial Datasets Import Script
===========================================
IMDb sitesini scraping YAPMAZ. Resmi non-commercial datasetleri lokal SQLite'a import eder.

Kullanim:
  python scripts/import_imdb_datasets.py --basics data/title.basics.tsv.gz --ratings data/title.ratings.tsv.gz

Dosyalari suradan indirebilirsin:
  https://datasets.imdbws.com/
  - title.basics.tsv.gz
  - title.ratings.tsv.gz

IMDb Non-Commercial Datasets lisansi:
  Bu veriler yalnizca kisisel/non-commercial kullanim icindir.
  Ticari kullanim icin IMDb'den ayri lisans alinmalidir.
  Detay: https://developer.imdb.com/non-commercial-datasets/
"""
import argparse, csv, gzip, os, sqlite3, time

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "movie_cache.db")
BATCH_SIZE = 5000


def _log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}")


def create_tables(conn):
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS imdb_titles (
            imdb_id TEXT PRIMARY KEY,
            title_type TEXT,
            primary_title TEXT,
            original_title TEXT,
            start_year INTEGER,
            runtime_minutes INTEGER,
            genres TEXT,
            is_adult INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS imdb_ratings (
            imdb_id TEXT PRIMARY KEY,
            average_rating REAL,
            num_votes INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_imdb_titles_year ON imdb_titles(start_year);
        CREATE INDEX IF NOT EXISTS idx_imdb_ratings_votes ON imdb_ratings(num_votes);
    """)
    conn.commit()


def import_basics(filepath, conn):
    _log(f"Importing basics from {filepath}...")
    count = 0
    cur = conn.cursor()
    batch = []
    with gzip.open(filepath, "rt", encoding="utf-8", errors="replace") as f:
        reader = csv.reader(f, delimiter="\t", quoting=csv.QUOTE_NONE)
        header = next(reader)
        for row in reader:
            try:
                imdb_id = row[0]
                title_type = row[1]
                if title_type != "movie":
                    continue
                is_adult = int(row[4]) if row[4] else 0
                if is_adult:
                    continue
                start_year = int(row[5]) if row[5] and row[5] != "\\N" else None
                runtime = int(row[7]) if row[7] and row[7] != "\\N" else None
                genres = row[8] if row[8] != "\\N" else ""
                batch.append((imdb_id, title_type, row[2], row[3] or row[2], start_year, runtime, genres, is_adult))
                count += 1
                if len(batch) >= BATCH_SIZE:
                    cur.executemany(
                        "INSERT OR IGNORE INTO imdb_titles VALUES (?,?,?,?,?,?,?,?)", batch)
                    conn.commit()
                    batch = []
                    if count % 100000 == 0:
                        _log(f"  {count} rows imported...")
            except (ValueError, IndexError):
                continue
    if batch:
        cur.executemany("INSERT OR IGNORE INTO imdb_titles VALUES (?,?,?,?,?,?,?,?)", batch)
        conn.commit()
    _log(f"Done. {count} movies imported into imdb_titles.")


def import_ratings(filepath, conn):
    _log(f"Importing ratings from {filepath}...")
    count = 0
    cur = conn.cursor()
    batch = []
    with gzip.open(filepath, "rt", encoding="utf-8", errors="replace") as f:
        reader = csv.reader(f, delimiter="\t", quoting=csv.QUOTE_NONE)
        next(reader)
        for row in reader:
            try:
                imdb_id = row[0]
                rating = float(row[1]) if row[1] else 0.0
                votes = int(row[2]) if row[2] else 0
                batch.append((imdb_id, rating, votes))
                count += 1
                if len(batch) >= BATCH_SIZE:
                    cur.executemany(
                        "INSERT OR REPLACE INTO imdb_ratings VALUES (?,?,?)", batch)
                    conn.commit()
                    batch = []
                    if count % 500000 == 0:
                        _log(f"  {count} ratings imported...")
            except (ValueError, IndexError):
                continue
    if batch:
        cur.executemany("INSERT OR REPLACE INTO imdb_ratings VALUES (?,?,?)", batch)
        conn.commit()
    _log(f"Done. {count} ratings imported.")


def show_stats(conn):
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM imdb_titles")
    titles = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM imdb_ratings")
    ratings = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM imdb_ratings WHERE num_votes >= 100 AND average_rating >= 5.0")
    candidates = cur.fetchone()[0]
    _log(f"Stats: {titles} titles, {ratings} ratings, {candidates} candidates (votes>=100, rating>=5.0)")


def main():
    parser = argparse.ArgumentParser(description="Import IMDb Non-Commercial Datasets")
    parser.add_argument("--basics", required=True, help="Path to title.basics.tsv.gz")
    parser.add_argument("--ratings", required=True, help="Path to title.ratings.tsv.gz")
    args = parser.parse_args()

    if not os.path.exists(args.basics):
        print(f"ERROR: {args.basics} not found!")
        sys.exit(1)
    if not os.path.exists(args.ratings):
        print(f"ERROR: {args.ratings} not found!")
        sys.exit(1)

    conn = sqlite3.connect(DB_PATH)
    _log(f"Database: {DB_PATH}")

    create_tables(conn)
    import_basics(args.basics, conn)
    import_ratings(args.ratings, conn)
    show_stats(conn)

    conn.close()
    _log("Import complete.")


if __name__ == "__main__":
    main()
