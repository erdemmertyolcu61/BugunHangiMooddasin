"""
SQLite/Turso caching layer — plain aiosqlite by default; set TURSO_DATABASE_URL +
TURSO_AUTH_TOKEN env vars to activate a libsql embedded-replica (local reads,
remote persistence).  No other code changes required to switch modes.
"""
import aiosqlite
import sqlite3
import json
import os
import asyncio
import contextlib
from typing import Optional
from backend.config import DATABASE_PATH

# ── Turso / libSQL embedded-replica ──────────────────────────────────────────
_TURSO_URL   = os.getenv("TURSO_DATABASE_URL")
_TURSO_TOKEN = os.getenv("TURSO_AUTH_TOKEN")
_turso_conn  = None   # initialised inside MovieCache.init_db()

try:
    import libsql_experimental as _libsql
    _LIBSQL_OK = True
except ImportError:
    _LIBSQL_OK = False


class _TursoCursor:
    __slots__ = ("_cur", "_loop")

    def __init__(self, cur, loop):
        self._cur  = cur
        self._loop = loop

    async def fetchone(self):
        return await self._loop.run_in_executor(None, self._cur.fetchone)

    async def fetchall(self):
        return await self._loop.run_in_executor(None, self._cur.fetchall)


class _TursoConn:
    """Wraps a libsql Connection to expose the same async interface as aiosqlite."""

    def __init__(self, conn):
        self._conn = conn

    async def execute(self, sql, params=()):
        loop = asyncio.get_running_loop()
        cur  = await loop.run_in_executor(None, self._conn.execute, sql, params)
        return _TursoCursor(cur, loop)

    async def executemany(self, sql, params_list):
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, self._conn.executemany, sql, params_list)

    async def commit(self):
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, self._conn.commit)


@contextlib.asynccontextmanager
async def _get_connection(db_path: str):
    """Yield an aiosqlite-compatible handle: Turso embedded replica OR plain SQLite."""
    if _turso_conn is not None:
        yield _TursoConn(_turso_conn)
    else:
        async with aiosqlite.connect(db_path) as db:
            await db.execute("PRAGMA journal_mode=WAL")
            await db.execute("PRAGMA synchronous=NORMAL")
            yield db

# ─────────────────────────────────────────────────────────────────────────────


class MovieCache:
    def __init__(self, db_path: str = None):
        self.db_path = db_path or DATABASE_PATH

    async def init_db(self):
        """Create the cache, watchlist and notes tables."""
        global _turso_conn
        if _LIBSQL_OK and _TURSO_URL and _TURSO_TOKEN and _turso_conn is None:
            import logging as _log
            _logger = _log.getLogger(__name__)
            _logger.info("[DB] Turso embedded-replica bağlanıyor: %s", _TURSO_URL)
            loop = asyncio.get_running_loop()
            conn = await loop.run_in_executor(
                None,
                lambda: _libsql.connect(
                    self.db_path, sync_url=_TURSO_URL, auth_token=_TURSO_TOKEN
                ),
            )
            await loop.run_in_executor(None, conn.sync)
            _turso_conn = conn
            _logger.info("[DB] Turso sync tamamlandı, kalıcı depolama aktif.")

        async with _get_connection(self.db_path) as db:
            try:
                await db.execute("PRAGMA cache_size=-8000")
            except Exception:
                pass
            # Movie analysis cache
            await db.execute("""
                CREATE TABLE IF NOT EXISTS movie_cache (
                    tmdb_id INTEGER PRIMARY KEY,
                    title TEXT NOT NULL,
                    data TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            # Watchlist (Defterim)
            await db.execute("""
                CREATE TABLE IF NOT EXISTS watchlist (
                    tmdb_id INTEGER PRIMARY KEY,
                    title TEXT NOT NULL,
                    poster_url TEXT,
                    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            # Personal Notes
            await db.execute("""
                CREATE TABLE IF NOT EXISTS movie_notes (
                    tmdb_id INTEGER PRIMARY KEY,
                    note_content TEXT NOT NULL,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            # Future Plans (Gelecek Planları)
            await db.execute("""
                CREATE TABLE IF NOT EXISTS future_plans (
                    tmdb_id INTEGER PRIMARY KEY,
                    title TEXT NOT NULL,
                    poster_url TEXT,
                    priority INTEGER DEFAULT 0,
                    watch_date TEXT,
                    notes TEXT,
                    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            # Users (Google OAuth)
            await db.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    google_id TEXT UNIQUE NOT NULL,
                    email TEXT,
                    name TEXT,
                    picture TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            # Migrate existing tables to support user_id (safe — no-op if column exists)
            for tbl in ("watchlist", "movie_notes", "future_plans"):
                try:
                    await db.execute(f"ALTER TABLE {tbl} ADD COLUMN user_id INTEGER DEFAULT 0")
                except Exception:
                    pass  # column already exists
            # watchlist.watched kolonu da garanti olsun (eski şemada lazy ekleniyordu)
            try:
                await db.execute("ALTER TABLE watchlist ADD COLUMN watched INTEGER DEFAULT 0")
            except Exception:
                pass

            # ── Çok-kullanıcılı izolasyon: PRIMARY KEY'i (tmdb_id, user_id)'ye taşı ──
            # Eski şemada tmdb_id tek PK olduğu için aynı filmi iki kullanıcı
            # bağımsız kaydedemiyordu. Tabloları kompozit PK ile yeniden kurar.
            # Idempotent: schema_migrations sentinel ile bir kez çalışır.
            await db.execute("""
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    key TEXT PRIMARY KEY,
                    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            cur = await db.execute("SELECT 1 FROM schema_migrations WHERE key = 'multiuser_v1'")
            already = await cur.fetchone()
            if not already:
                # watchlist
                await db.execute("""
                    CREATE TABLE watchlist_mu (
                        tmdb_id INTEGER NOT NULL,
                        title TEXT NOT NULL,
                        poster_url TEXT,
                        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        watched INTEGER DEFAULT 0,
                        user_id INTEGER NOT NULL DEFAULT 0,
                        PRIMARY KEY (tmdb_id, user_id)
                    )
                """)
                await db.execute("""
                    INSERT OR IGNORE INTO watchlist_mu (tmdb_id, title, poster_url, added_at, watched, user_id)
                    SELECT tmdb_id, title, poster_url, added_at, COALESCE(watched, 0), COALESCE(user_id, 0)
                    FROM watchlist
                """)
                await db.execute("DROP TABLE watchlist")
                await db.execute("ALTER TABLE watchlist_mu RENAME TO watchlist")

                # movie_notes
                await db.execute("""
                    CREATE TABLE movie_notes_mu (
                        tmdb_id INTEGER NOT NULL,
                        note_content TEXT NOT NULL,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        user_id INTEGER NOT NULL DEFAULT 0,
                        PRIMARY KEY (tmdb_id, user_id)
                    )
                """)
                await db.execute("""
                    INSERT OR IGNORE INTO movie_notes_mu (tmdb_id, note_content, updated_at, user_id)
                    SELECT tmdb_id, note_content, updated_at, COALESCE(user_id, 0)
                    FROM movie_notes
                """)
                await db.execute("DROP TABLE movie_notes")
                await db.execute("ALTER TABLE movie_notes_mu RENAME TO movie_notes")

                # future_plans
                await db.execute("""
                    CREATE TABLE future_plans_mu (
                        tmdb_id INTEGER NOT NULL,
                        title TEXT NOT NULL,
                        poster_url TEXT,
                        priority INTEGER DEFAULT 0,
                        watch_date TEXT,
                        notes TEXT,
                        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        user_id INTEGER NOT NULL DEFAULT 0,
                        PRIMARY KEY (tmdb_id, user_id)
                    )
                """)
                await db.execute("""
                    INSERT OR IGNORE INTO future_plans_mu (tmdb_id, title, poster_url, priority, watch_date, notes, added_at, user_id)
                    SELECT tmdb_id, title, poster_url, priority, watch_date, notes, added_at, COALESCE(user_id, 0)
                    FROM future_plans
                """)
                await db.execute("DROP TABLE future_plans")
                await db.execute("ALTER TABLE future_plans_mu RENAME TO future_plans")

                await db.execute("INSERT INTO schema_migrations (key) VALUES ('multiuser_v1')")
            # OMDb Ratings Cache
            await db.execute("""
                CREATE TABLE IF NOT EXISTS omdb_cache (
                    tmdb_id INTEGER PRIMARY KEY,
                    imdb_rating REAL,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            # Movie Repository - (tmdb_id, mood_id) composite PK
            await db.execute("""
                CREATE TABLE IF NOT EXISTS movie_repository (
                    tmdb_id INTEGER NOT NULL,
                    mood_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    poster_url TEXT,
                    overview TEXT,
                    release_date TEXT,
                    vote_average REAL DEFAULT 0,
                    genre_ids TEXT DEFAULT '[]',
                    backdrop_url TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (tmdb_id, mood_id)
                )
            """)
            # Indexes for fast lookups
            await db.execute("""
                CREATE INDEX IF NOT EXISTS idx_repo_mood ON movie_repository(mood_id)
            """)
            try:
                await db.execute("""
                    CREATE INDEX IF NOT EXISTS idx_repo_mood_vote ON movie_repository(mood_id, vote_average)
                """)
            except Exception:
                pass
            # Mood classifications from Claude (AI-classified mood per movie)
            await db.execute("""
                CREATE TABLE IF NOT EXISTS mood_classifications (
                    tmdb_id INTEGER PRIMARY KEY,
                    classified_mood TEXT NOT NULL,
                    confidence REAL DEFAULT 1.0,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            # Extended movie attributes for better mood matching
            await db.execute("""
                CREATE TABLE IF NOT EXISTS movie_attributes (
                    tmdb_id INTEGER PRIMARY KEY,
                    keywords TEXT DEFAULT '[]',
                    mood_scores TEXT DEFAULT '{}',
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            # vote_count column migration (safe — IF NOT EXISTS style via try)
            try:
                await db.execute("ALTER TABLE movie_repository ADD COLUMN vote_count INTEGER DEFAULT 0")
            except Exception:
                pass
            try:
                await db.execute("ALTER TABLE movie_cache ADD COLUMN vote_count INTEGER DEFAULT 0")
            except Exception:
                pass
            # original_language column for Turkish film detection
            try:
                await db.execute("ALTER TABLE movie_repository ADD COLUMN original_language TEXT DEFAULT ''")
            except Exception:
                pass
            # popularity column for better sorting
            try:
                await db.execute("ALTER TABLE movie_repository ADD COLUMN popularity REAL DEFAULT 0")
            except Exception:
                pass
            # Pre-computed mood_score for fast SQL-level filtering/sorting
            try:
                await db.execute("ALTER TABLE movie_repository ADD COLUMN mood_score REAL DEFAULT 0")
            except Exception:
                pass
            try:
                await db.execute("""
                    CREATE INDEX IF NOT EXISTS idx_repo_mood_score
                    ON movie_repository(mood_id, mood_score DESC)
                """)
            except Exception:
                pass
            # omdb_cache migration (imdb_votes, imdb_id)
            try:
                await db.execute("ALTER TABLE omdb_cache ADD COLUMN imdb_votes INTEGER DEFAULT 0")
            except Exception:
                pass
            try:
                await db.execute("ALTER TABLE omdb_cache ADD COLUMN imdb_id TEXT")
            except Exception:
                pass
            # Watch provider cache
            await db.execute("""
                CREATE TABLE IF NOT EXISTS watch_provider_cache (
                    tmdb_id INTEGER NOT NULL,
                    region TEXT NOT NULL DEFAULT 'TR',
                    data TEXT NOT NULL,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (tmdb_id, region)
                )
            """)
            # Topluluk önerileri — bir kullanıcı bir filmi topluluğa önerdiğinde
            await db.execute("""
                CREATE TABLE IF NOT EXISTS community_recommendations (
                    tmdb_id INTEGER NOT NULL,
                    user_id INTEGER NOT NULL,
                    username TEXT,
                    avatar TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (tmdb_id, user_id)
                )
            """)
            await db.execute("""
                CREATE INDEX IF NOT EXISTS idx_community_movie ON community_recommendations(tmdb_id)
            """)
            await db.commit()

    async def get_movie(self, tmdb_id: int) -> Optional[dict]:
        """Retrieve cached movie analysis by TMDB ID."""
        async with _get_connection(self.db_path) as db:
            cursor = await db.execute(
                "SELECT data FROM movie_cache WHERE tmdb_id = ?",
                (tmdb_id,)
            )
            row = await cursor.fetchone()
            if row:
                return json.loads(row[0])
            return None

    async def save_movie(self, tmdb_id: int, title: str, data: dict):
        """Save or update movie analysis in cache."""
        async with _get_connection(self.db_path) as db:
            await db.execute(
                """INSERT OR REPLACE INTO movie_cache
                   (tmdb_id, title, data, updated_at)
                   VALUES (?, ?, ?, CURRENT_TIMESTAMP)""",
                (tmdb_id, title, json.dumps(data, ensure_ascii=False))
            )
            await db.commit()

    async def get_all_cached(self) -> list:
        """Return all cached movie analyses."""
        async with _get_connection(self.db_path) as db:
            cursor = await db.execute("SELECT data FROM movie_cache")
            rows = await cursor.fetchall()
            return [json.loads(row[0]) for row in rows]

    # --- Watchlist (Defterim) Methods ---
    async def add_to_watchlist(self, tmdb_id: int, title: str, poster_url: str, user_id: int = 0):
        """Add a movie to the watchlist (kullanıcıya özel)."""
        async with _get_connection(self.db_path) as db:
            await db.execute(
                "INSERT OR IGNORE INTO watchlist (tmdb_id, title, poster_url, user_id) VALUES (?, ?, ?, ?)",
                (tmdb_id, title, poster_url, user_id)
            )
            await db.commit()

    async def remove_from_watchlist(self, tmdb_id: int, user_id: int = 0):
        """Remove a movie from the watchlist."""
        async with _get_connection(self.db_path) as db:
            await db.execute("DELETE FROM watchlist WHERE tmdb_id = ? AND user_id = ?", (tmdb_id, user_id))
            await db.commit()

    async def get_watchlist(self, user_id: int = 0) -> list:
        """Get all movies in the watchlist for a user."""
        async with _get_connection(self.db_path) as db:
            cursor = await db.execute(
                "SELECT tmdb_id, title, poster_url, added_at, watched FROM watchlist WHERE user_id = ? ORDER BY added_at DESC",
                (user_id,)
            )
            rows = await cursor.fetchall()
            return [
                {"tmdb_id": r[0], "title": r[1], "poster_url": r[2], "added_at": r[3], "watched": bool(r[4])}
                for r in rows
            ]

    async def toggle_watched(self, tmdb_id: int, user_id: int = 0) -> bool:
        """Toggle watched status for a movie. Returns new watched state."""
        async with _get_connection(self.db_path) as db:
            cursor = await db.execute(
                "SELECT watched FROM watchlist WHERE tmdb_id = ? AND user_id = ?", (tmdb_id, user_id)
            )
            row = await cursor.fetchone()
            if not row:
                return False
            new_val = 0 if (row[0] or 0) else 1
            await db.execute(
                "UPDATE watchlist SET watched = ? WHERE tmdb_id = ? AND user_id = ?",
                (new_val, tmdb_id, user_id)
            )
            await db.commit()
            return bool(new_val)

    async def is_in_watchlist(self, tmdb_id: int, user_id: int = 0) -> bool:
        """Check if a movie is in the watchlist."""
        async with _get_connection(self.db_path) as db:
            cursor = await db.execute(
                "SELECT 1 FROM watchlist WHERE tmdb_id = ? AND user_id = ?", (tmdb_id, user_id)
            )
            return await cursor.fetchone() is not None

    # --- Personal Notes Methods ---
    async def save_note(self, tmdb_id: int, note_content: str, user_id: int = 0):
        """Save or update a personal note for a movie."""
        async with _get_connection(self.db_path) as db:
            await db.execute(
                "INSERT OR REPLACE INTO movie_notes (tmdb_id, note_content, updated_at, user_id) VALUES (?, ?, CURRENT_TIMESTAMP, ?)",
                (tmdb_id, note_content, user_id)
            )
            await db.commit()

    async def get_note(self, tmdb_id: int, user_id: int = 0) -> Optional[str]:
        """Get the personal note for a movie."""
        async with _get_connection(self.db_path) as db:
            cursor = await db.execute(
                "SELECT note_content FROM movie_notes WHERE tmdb_id = ? AND user_id = ?", (tmdb_id, user_id)
            )
            row = await cursor.fetchone()
            return row[0] if row else None

    # --- Future Plans Methods ---
    async def add_to_future(self, tmdb_id: int, title: str, poster_url: str, priority: int = 0, watch_date: str = None, notes: str = None, user_id: int = 0):
        """Add a movie to future plans."""
        async with _get_connection(self.db_path) as db:
            await db.execute(
                "INSERT OR REPLACE INTO future_plans (tmdb_id, title, poster_url, priority, watch_date, notes, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (tmdb_id, title, poster_url, priority, watch_date, notes, user_id)
            )
            await db.commit()

    async def remove_from_future(self, tmdb_id: int, user_id: int = 0):
        """Remove a movie from future plans."""
        async with _get_connection(self.db_path) as db:
            await db.execute("DELETE FROM future_plans WHERE tmdb_id = ? AND user_id = ?", (tmdb_id, user_id))
            await db.commit()

    async def get_future_plans(self, user_id: int = 0) -> list:
        """Get all movies in future plans, ordered by priority."""
        async with _get_connection(self.db_path) as db:
            cursor = await db.execute(
                "SELECT tmdb_id, title, poster_url, priority, watch_date, notes, added_at FROM future_plans WHERE user_id = ? ORDER BY priority DESC, added_at DESC",
                (user_id,)
            )
            rows = await cursor.fetchall()
            return [
                {"tmdb_id": r[0], "title": r[1], "poster_url": r[2], "priority": r[3], "watch_date": r[4], "notes": r[5], "added_at": r[6]}
                for r in rows
            ]

    async def update_future_priority(self, tmdb_id: int, priority: int, user_id: int = 0):
        """Update priority of a future plan."""
        async with _get_connection(self.db_path) as db:
            await db.execute("UPDATE future_plans SET priority = ? WHERE tmdb_id = ? AND user_id = ?", (priority, tmdb_id, user_id))
            await db.commit()

    async def update_future_date(self, tmdb_id: int, watch_date: str, user_id: int = 0):
        """Update watch date of a future plan."""
        async with _get_connection(self.db_path) as db:
            await db.execute("UPDATE future_plans SET watch_date = ? WHERE tmdb_id = ? AND user_id = ?", (watch_date, tmdb_id, user_id))
            await db.commit()

    # --- OMDb Ratings Cache ---
    # --- Movie Repository Methods ---
    async def save_repository_movie(self, tmdb_id: int, title: str, poster_url: str,
                                     overview: str, release_date: str, vote_average: float,
                                     genre_ids: list, mood_id: str, backdrop_url: str = None,
                                     vote_count: int = 0, original_language: str = "",
                                     popularity: float = 0):
        """Save a movie to the repository (upsert)."""
        async with _get_connection(self.db_path) as db:
            await db.execute("""
                INSERT OR REPLACE INTO movie_repository
                (tmdb_id, title, poster_url, overview, release_date,
                 vote_average, genre_ids, mood_id, backdrop_url, vote_count, original_language, popularity)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (tmdb_id, title, poster_url, overview, release_date,
                  vote_average, json.dumps(genre_ids, ensure_ascii=False),
                  mood_id, backdrop_url, vote_count, original_language, popularity))
            await db.commit()

    async def get_repository_movies_by_mood(self, mood_id: str, page: int = 1,
                                            per_page: int = 20, min_vote: float = 5.0) -> dict:
        """Get movies from repository filtered by mood, sorted by vote_average desc."""
        offset = (page - 1) * per_page
        async with _get_connection(self.db_path) as db:
            # Count
            cursor = await db.execute(
                "SELECT COUNT(*) FROM movie_repository WHERE mood_id = ? AND vote_average >= ?",
                (mood_id, min_vote)
            )
            total = (await cursor.fetchone())[0]

            # Fetch page
            cursor = await db.execute(
                """SELECT tmdb_id, title, poster_url, overview, release_date,
                          vote_average, genre_ids, backdrop_url, vote_count, original_language, popularity
                   FROM movie_repository
                   WHERE mood_id = ? AND vote_average >= ?
                   ORDER BY vote_average DESC
                   LIMIT ? OFFSET ?""",
                (mood_id, min_vote, per_page, offset)
            )
            rows = await cursor.fetchall()
            movies = []
            for r in rows:
                movies.append({
                    "id": r[0],
                    "title": r[1],
                    "poster_url": r[2],
                    "overview": r[3],
                    "release_date": r[4],
                    "vote_average": r[5],
                    "genre_ids": json.loads(r[6]) if r[6] else [],
                    "backdrop_url": r[7],
                    "vote_count": r[8] if len(r) > 8 else 0,
                    "original_language": r[9] if len(r) > 9 else "",
                    "popularity": r[10] if len(r) > 10 else 0,
                })

            return {
                "movies": movies,
                "page": page,
                "total_pages": max(1, (total + per_page - 1) // per_page),
                "total": total,
            }

    async def get_all_repository_movies_by_mood(self, mood_id: str, min_vote: float = 5.0) -> list:
        """Fetch ALL movies for a mood (no LIMIT) for client-side filtering."""
        async with _get_connection(self.db_path) as db:
            cursor = await db.execute(
                """SELECT tmdb_id, title, poster_url, overview, release_date,
                          vote_average, genre_ids, backdrop_url, vote_count, original_language, popularity
                   FROM movie_repository
                   WHERE mood_id = ? AND vote_average >= ?
                   ORDER BY vote_average DESC""",
                (mood_id, min_vote)
            )
            rows = await cursor.fetchall()
            movies = []
            for r in rows:
                movies.append({
                    "id": r[0],
                    "title": r[1],
                    "poster_url": r[2],
                    "overview": r[3],
                    "release_date": r[4],
                    "vote_average": r[5],
                    "genre_ids": json.loads(r[6]) if r[6] else [],
                    "backdrop_url": r[7],
                    "vote_count": r[8] if len(r) > 8 else 0,
                    "original_language": r[9] if len(r) > 9 else "",
                    "popularity": r[10] if len(r) > 10 else 0,
                })
            return movies

    async def search_repository_by_title(self, query: str, limit: int = 20) -> list:
        """Fuzzy search movies in repository by title. Uses LIKE with normalized queries."""
        if not query or len(query.strip()) < 2:
            return []

        q = query.strip().lower()
        async with _get_connection(self.db_path) as db:
            # Try exact-ish match first, then progressively fuzzier
            results = []
            seen_ids = set()

            # 1. Exact title match (case-insensitive)
            cursor = await db.execute(
                """SELECT DISTINCT tmdb_id, title, poster_url, overview, release_date,
                          vote_average, genre_ids, backdrop_url, vote_count, original_language, popularity, mood_id
                   FROM movie_repository
                   WHERE LOWER(title) = ?
                   ORDER BY vote_average DESC LIMIT ?""",
                (q, limit)
            )
            for r in await cursor.fetchall():
                if r[0] not in seen_ids:
                    seen_ids.add(r[0])
                    results.append(self._row_to_movie(r))

            # 2. Title starts with query
            if len(results) < limit:
                cursor = await db.execute(
                    """SELECT DISTINCT tmdb_id, title, poster_url, overview, release_date,
                              vote_average, genre_ids, backdrop_url, vote_count, original_language, popularity, mood_id
                       FROM movie_repository
                       WHERE LOWER(title) LIKE ? AND tmdb_id NOT IN ({})
                       ORDER BY vote_average DESC LIMIT ?""".format(
                           ','.join(str(i) for i in seen_ids) if seen_ids else '0'
                       ),
                    (f"{q}%", limit - len(results))
                )
                for r in await cursor.fetchall():
                    if r[0] not in seen_ids:
                        seen_ids.add(r[0])
                        results.append(self._row_to_movie(r))

            # 3. Title contains query
            if len(results) < limit:
                cursor = await db.execute(
                    """SELECT DISTINCT tmdb_id, title, poster_url, overview, release_date,
                              vote_average, genre_ids, backdrop_url, vote_count, original_language, popularity, mood_id
                       FROM movie_repository
                       WHERE LOWER(title) LIKE ? AND tmdb_id NOT IN ({})
                       ORDER BY vote_average DESC LIMIT ?""".format(
                           ','.join(str(i) for i in seen_ids) if seen_ids else '0'
                       ),
                    (f"%{q}%", limit - len(results))
                )
                for r in await cursor.fetchall():
                    if r[0] not in seen_ids:
                        seen_ids.add(r[0])
                        results.append(self._row_to_movie(r))

            # 4. Try each word separately for multi-word queries
            if len(results) < limit and ' ' in q:
                words = [w for w in q.split() if len(w) >= 3]
                for word in words[:3]:
                    cursor = await db.execute(
                        """SELECT DISTINCT tmdb_id, title, poster_url, overview, release_date,
                                  vote_average, genre_ids, backdrop_url, vote_count, original_language, popularity, mood_id
                           FROM movie_repository
                           WHERE LOWER(title) LIKE ? AND tmdb_id NOT IN ({})
                           ORDER BY vote_average DESC LIMIT ?""".format(
                               ','.join(str(i) for i in seen_ids) if seen_ids else '0'
                           ),
                        (f"%{word}%", limit - len(results))
                    )
                    for r in await cursor.fetchall():
                        if r[0] not in seen_ids:
                            seen_ids.add(r[0])
                            results.append(self._row_to_movie(r))
                    if len(results) >= limit:
                        break

            return results[:limit]

    def _row_to_movie(self, r) -> dict:
        """Convert a DB row tuple to movie dict. Expects 12 columns including mood_id."""
        return {
            "id": r[0],
            "title": r[1],
            "poster_url": r[2],
            "overview": r[3],
            "release_date": r[4],
            "vote_average": r[5],
            "genre_ids": json.loads(r[6]) if r[6] else [],
            "backdrop_url": r[7],
            "vote_count": r[8] if len(r) > 8 else 0,
            "original_language": r[9] if len(r) > 9 else "",
            "popularity": r[10] if len(r) > 10 else 0,
            "mood_id": r[11] if len(r) > 11 else None,
        }

    async def get_random_repository_movie(self) -> dict:
        """Tum repository'den rastgele bir film dondurur (puan/mood filtresi YOK)."""
        async with _get_connection(self.db_path) as db:
            cursor = await db.execute(
                """SELECT tmdb_id, title, poster_url, overview, release_date,
                          vote_average, genre_ids, backdrop_url, vote_count, original_language, popularity
                   FROM movie_repository
                   WHERE tmdb_id IS NOT NULL
                   ORDER BY RANDOM() LIMIT 1"""
            )
            row = await cursor.fetchone()
            if not row:
                return None
            return {
                "id": row[0],
                "title": row[1],
                "poster_url": row[2],
                "overview": row[3],
                "release_date": row[4],
                "vote_average": row[5],
                "genre_ids": json.loads(row[6]) if row[6] else [],
                "backdrop_url": row[7],
                "vote_count": row[8] if len(row) > 8 else 0,
                "original_language": row[9] if len(row) > 9 else "",
                "popularity": row[10] if len(row) > 10 else 0,
            }

    async def get_repository_stats(self) -> dict:
        """Get movie counts per mood for debugging."""
        stats = {}
        all_mood_ids = [
            "battaniye","yolculuk","gece","kahkaha","gozyasi","adrenalin",
            "askbahcesi","zamanyolcusu","sessiz","zihin","kalp","karmakar",
            "Retro","deep-chills"
        ]
        total_all = 0
        async with _get_connection(self.db_path) as db:
            for mid in all_mood_ids:
                cursor = await db.execute(
                    "SELECT COUNT(*) FROM movie_repository WHERE mood_id = ?", (mid,))
                total = (await cursor.fetchone())[0]
                cursor = await db.execute(
                    "SELECT COUNT(*) FROM movie_repository WHERE mood_id = ? AND vote_average >= 5.0", (mid,))
                vote5 = (await cursor.fetchone())[0]
                cursor = await db.execute(
                    "SELECT COUNT(*) FROM movie_repository WHERE mood_id = ? AND original_language = 'tr'", (mid,))
                tr_count = (await cursor.fetchone())[0]
                stats[mid] = {"total": total, "vote_5_plus": vote5, "turkish_count": tr_count}
                total_all += total
            # Global stats
            cursor = await db.execute("SELECT COUNT(DISTINCT tmdb_id) FROM movie_repository")
            unique_movies = (await cursor.fetchone())[0]
            cursor = await db.execute("SELECT COUNT(*) FROM movie_repository WHERE poster_url IS NOT NULL AND poster_url != ''")
            with_poster = (await cursor.fetchone())[0]
            cursor = await db.execute("SELECT COUNT(*) FROM movie_repository WHERE overview IS NOT NULL AND overview != ''")
            with_overview = (await cursor.fetchone())[0]
        return {
            "totalMovies": total_all,
            "uniqueMovies": unique_movies,
            "moodCounts": stats,
            "moviesWithPoster": with_poster,
            "moviesWithOverview": with_overview,
        }

    async def count_repository_movies(self, mood_id: str, min_vote: float = 5.0) -> int:
        """Count movies in repository for a mood (sync for speed)."""
        conn = self._sync_conn()
        try:
            return conn.execute(
                "SELECT COUNT(*) FROM movie_repository WHERE mood_id = ? AND vote_average >= ?",
                (mood_id, min_vote)
            ).fetchone()[0]
        finally:
            conn.close()

    async def bulk_save_repository_movies(self, movies: list, mood_id: str):
        """Save multiple movies to repository for a mood (fast executemany)."""
        if not movies:
            return
        rows = [
            (
                m["id"], m["title"], m.get("poster_url"),
                m.get("overview", ""), m.get("release_date"),
                m.get("vote_average", 0),
                json.dumps(m.get("genre_ids", []), ensure_ascii=False),
                mood_id, m.get("backdrop_url"),
                m.get("vote_count", 0),
                m.get("original_language", ""),
                m.get("popularity", 0)
            )
            for m in movies
        ]
        async with _get_connection(self.db_path) as db:
            await db.executemany("""
                INSERT OR REPLACE INTO movie_repository
                (tmdb_id, title, poster_url, overview, release_date,
                 vote_average, genre_ids, mood_id, backdrop_url, vote_count, original_language, popularity)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, rows)
            await db.commit()

    async def seed_mood_repository(self, mood_id: str, genre_ids: list,
                                    tmdb_service_obj, pages: int = 10,
                                    min_vote: float = 5.0,
                                    with_keywords: str = None,
                                    max_vote_count: int = None,
                                    without_genres: str = None,
                                    seed_turkish: bool = True,
                                    primary_release_date_lte: str = None,
                                    primary_release_date_gte: str = None,
                                    tr_pages: int = None,
                                    tr_min_vote_override: float = None) -> int:
        """
        Pre-fetch movies for a mood from TMDB and store locally.
        v2: PARALLEL fetching — all pages + strategies run concurrently.
        """
        import asyncio
        from backend.services.tmdb_service import tmdb_service
        from backend.mood_profiles import get_seed_strategies

        all_movies = []  # Collect all, then single bulk write

        # --- Phase A: Main discover pages (parallel) ---
        main_pages = await tmdb_service.discover_pages_parallel(
            genre_ids, list(range(1, pages + 1)),
            sort_by="vote_average.desc",
            min_vote_average=min_vote,
            min_vote_count=30,
            with_keywords=with_keywords,
            max_vote_count=max_vote_count,
            without_genres=without_genres,
            primary_release_date_lte=primary_release_date_lte,
            primary_release_date_gte=primary_release_date_gte,
        )
        all_movies.extend(main_pages)

        # --- Phase B: Strategy variants (parallel) ---
        strategies = get_seed_strategies(mood_id)
        strat_pages = max(1, pages // 5)

        async def _run_strategy(strat):
            sg = strat.get("genres", genre_ids)
            page_list = list(range(1, strat_pages + 1))
            movies = await tmdb_service.discover_pages_parallel(
                sg, page_list,
                sort_by="vote_average.desc",
                min_vote_average=min_vote,
                min_vote_count=20,
                with_keywords=strat.get("with_keywords"),
                max_vote_count=strat.get("max_vote_count"),
                without_genres=without_genres,
                with_origin_country=strat.get("with_origin_country"),
                with_original_language=strat.get("with_original_language"),
                region="TR" if strat.get("with_origin_country") else None,
                primary_release_date_lte=strat.get("primary_release_date_lte", primary_release_date_lte),
                primary_release_date_gte=strat.get("primary_release_date_gte", primary_release_date_gte),
            )
            return movies

        strat_results = await asyncio.gather(
            *[_run_strategy(s) for s in strategies],
            return_exceptions=True
        )
        for r in strat_results:
            if isinstance(r, list):
                all_movies.extend(r)

        # --- Phase C: Turkish films (parallel) ---
        if seed_turkish:
            tr_p = tr_pages if tr_pages is not None else max(1, pages // 2)
            tr_min_vote = max(5.0, tr_min_vote_override) if tr_min_vote_override is not None else max(5.0, min_vote - 1.0)
            tr_movies = await tmdb_service.discover_pages_parallel(
                genre_ids, list(range(1, tr_p + 1)),
                sort_by="vote_average.desc",
                min_vote_average=tr_min_vote,
                min_vote_count=5,
                with_keywords=with_keywords,
                without_genres=without_genres,
                with_origin_country="TR",
                with_original_language="tr",
                region="TR",
                primary_release_date_lte=primary_release_date_lte,
                primary_release_date_gte=primary_release_date_gte,
            )
            all_movies.extend(tr_movies)

        # --- Single bulk write ---
        if all_movies:
            # Deduplicate by movie ID
            seen = set()
            unique = []
            for m in all_movies:
                mid = m["id"]
                if mid not in seen:
                    seen.add(mid)
                    unique.append(m)
            await self.bulk_save_repository_movies(unique, mood_id)
            return len(unique)
        return 0

    # --- Mood Classification Methods ---
    async def save_mood_classification(self, tmdb_id: int, mood_id: str):
        """Save a Claude-classified mood for a movie."""
        async with _get_connection(self.db_path) as db:
            await db.execute(
                """INSERT OR REPLACE INTO mood_classifications
                   (tmdb_id, classified_mood, updated_at)
                   VALUES (?, ?, CURRENT_TIMESTAMP)""",
                (tmdb_id, mood_id)
            )
            await db.commit()

    async def get_mood_classification(self, tmdb_id: int) -> Optional[str]:
        """Get the classified mood for a movie."""
        async with _get_connection(self.db_path) as db:
            cursor = await db.execute(
                "SELECT classified_mood FROM mood_classifications WHERE tmdb_id = ?",
                (tmdb_id,)
            )
            row = await cursor.fetchone()
            return row[0] if row else None

    async def get_classified_movies_by_mood(self, mood_id: str, limit: int = 50) -> list:
        """Get tmdb_ids that are classified for a specific mood."""
        async with _get_connection(self.db_path) as db:
            cursor = await db.execute(
                "SELECT tmdb_id FROM mood_classifications WHERE classified_mood = ? LIMIT ?",
                (mood_id, limit)
            )
            rows = await cursor.fetchall()
            return [r[0] for r in rows]

    async def get_unclassified_movies(self, limit: int = 100) -> list:
        """Get movie IDs that haven't been classified yet."""
        async with _get_connection(self.db_path) as db:
            cursor = await db.execute("""
                SELECT r.tmdb_id, r.title, r.overview, r.genre_ids, r.vote_average, r.vote_count, r.release_date
                FROM movie_repository r
                LEFT JOIN mood_classifications c ON r.tmdb_id = c.tmdb_id
                WHERE c.tmdb_id IS NULL
                GROUP BY r.tmdb_id
                LIMIT ?
            """, (limit,))
            rows = await cursor.fetchall()
            import json as j
            return [
                {"id": r[0], "title": r[1], "overview": r[2],
                 "genre_ids": j.loads(r[3]) if r[3] else [],
                 "vote_average": r[4], "vote_count": r[5] if len(r) > 5 else 0,
                 "release_date": r[6] if len(r) > 6 else ""}
                for r in rows
            ]

    async def save_mood_scores(self, tmdb_id: int, mood_scores: dict, keywords: list = None):
        """Save AI-calculated mood scores for a movie."""
        async with _get_connection(self.db_path) as db:
            await db.execute(
                """INSERT OR REPLACE INTO movie_attributes
                   (tmdb_id, keywords, mood_scores, updated_at)
                   VALUES (?, ?, ?, CURRENT_TIMESTAMP)""",
                (tmdb_id, json.dumps(keywords or []),
                 json.dumps(mood_scores, ensure_ascii=False))
            )
            await db.commit()

    async def get_mood_scores(self, tmdb_id: int) -> Optional[dict]:
        """Get stored mood scores for a movie."""
        async with _get_connection(self.db_path) as db:
            cursor = await db.execute(
                "SELECT mood_scores FROM movie_attributes WHERE tmdb_id = ?",
                (tmdb_id,)
            )
            row = await cursor.fetchone()
            return json.loads(row[0]) if row else None

    # --- OMDb Ratings Cache ---
    async def save_omdb_rating(self, tmdb_id: int, imdb_rating: float):
        """Save or update OMDb IMDb rating for a movie."""
        async with _get_connection(self.db_path) as db:
            await db.execute(
                "INSERT OR REPLACE INTO omdb_cache (tmdb_id, imdb_rating, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)",
                (tmdb_id, imdb_rating)
            )
            await db.commit()

    async def get_omdb_rating(self, tmdb_id: int) -> Optional[float]:
        """Get the cached OMDb IMDb rating for a movie."""
        async with _get_connection(self.db_path) as db:
            cursor = await db.execute("SELECT imdb_rating FROM omdb_cache WHERE tmdb_id = ?", (tmdb_id,))
            row = await cursor.fetchone()
            return row[0] if row else None

    # --- Watch Provider Cache ---

    async def get_watch_providers(self, tmdb_id: int, region: str = "TR") -> Optional[dict]:
        """Get cached watch providers for a movie in a region."""
        async with _get_connection(self.db_path) as db:
            cursor = await db.execute(
                "SELECT data FROM watch_provider_cache WHERE tmdb_id = ? AND region = ?",
                (tmdb_id, region)
            )
            row = await cursor.fetchone()
            return json.loads(row[0]) if row else None

    async def save_watch_providers(self, tmdb_id: int, region: str, data: dict):
        """Save watch providers to cache."""
        async with _get_connection(self.db_path) as db:
            await db.execute(
                """INSERT OR REPLACE INTO watch_provider_cache
                   (tmdb_id, region, data, updated_at)
                   VALUES (?, ?, ?, CURRENT_TIMESTAMP)""",
                (tmdb_id, region, json.dumps(data, ensure_ascii=False))
            )
            await db.commit()

    # --- Taste Map Signals ---

    async def get_user_movie_signals(self, user_id: int = 0) -> dict:
        """Collect a user's movie interaction signals for taste analysis."""
        signals = {}
        async with _get_connection(self.db_path) as db:
            # Watchlist (signal +1)
            cursor = await db.execute("SELECT tmdb_id FROM watchlist WHERE user_id = ?", (user_id,))
            for row in await cursor.fetchall():
                tid = row[0]
                if tid not in signals:
                    signals[tid] = {"score": 0, "sources": []}
                signals[tid]["score"] += 1
                signals[tid]["sources"].append("watchlist")

            # Future plans (signal +2, +priority bonus)
            cursor = await db.execute("SELECT tmdb_id, priority FROM future_plans WHERE user_id = ?", (user_id,))
            for row in await cursor.fetchall():
                tid, priority = row
                score = 2 + (priority or 0)
                if tid not in signals:
                    signals[tid] = {"score": 0, "sources": []}
                signals[tid]["score"] += score
                signals[tid]["sources"].append("future")

            # Movie notes (signal +3)
            cursor = await db.execute("SELECT tmdb_id FROM movie_notes WHERE user_id = ?", (user_id,))
            for row in await cursor.fetchall():
                tid = row[0]
                if tid not in signals:
                    signals[tid] = {"score": 0, "sources": []}
                signals[tid]["score"] += 3
                signals[tid]["sources"].append("note")

            # Movie cache (signal +1 — analiz havuzu kullanıcı-bağımsız, ortak)
            cursor = await db.execute("SELECT tmdb_id, data FROM movie_cache")
            for row in await cursor.fetchall():
                tid = row[0]
                if tid not in signals:
                    signals[tid] = {"score": 0, "sources": []}
                signals[tid]["score"] += 1
                signals[tid]["sources"].append("analyzed")

        return signals

    async def get_mood_for_movie(self, tmdb_id: int) -> str:
        """Get classified mood for a movie."""
        async with _get_connection(self.db_path) as db:
            cursor = await db.execute(
                "SELECT classified_mood FROM mood_classifications WHERE tmdb_id = ?",
                (tmdb_id,)
            )
            row = await cursor.fetchone()
            return row[0] if row else None

    async def save_movie_keywords(self, tmdb_id: int, keywords: list):
        """Save TMDB keywords for a movie into movie_attributes."""
        async with _get_connection(self.db_path) as db:
            # Try update existing row first
            cursor = await db.execute(
                "SELECT tmdb_id FROM movie_attributes WHERE tmdb_id = ?", (tmdb_id,)
            )
            row = await cursor.fetchone()
            if row:
                await db.execute(
                    "UPDATE movie_attributes SET keywords = ?, updated_at = CURRENT_TIMESTAMP WHERE tmdb_id = ?",
                    (json.dumps(keywords, ensure_ascii=False), tmdb_id)
                )
            else:
                await db.execute(
                    """INSERT INTO movie_attributes (tmdb_id, keywords, mood_scores, updated_at)
                       VALUES (?, ?, '{}', CURRENT_TIMESTAMP)""",
                    (tmdb_id, json.dumps(keywords, ensure_ascii=False))
                )
            await db.commit()

    async def get_movie_keywords(self, tmdb_id: int) -> list:
        """Get stored TMDB keywords for a movie."""
        async with _get_connection(self.db_path) as db:
            cursor = await db.execute(
                "SELECT keywords FROM movie_attributes WHERE tmdb_id = ?", (tmdb_id,)
            )
            row = await cursor.fetchone()
            if row and row[0]:
                return json.loads(row[0])
            return []

    # ──────────── SYNC read helpers (bypass aiosqlite thread bottleneck) ────────────

    def _sync_conn(self):
        """Open a synchronous read-only connection (WAL = no blocking from writers)."""
        conn = sqlite3.connect(self.db_path, timeout=5)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA query_only=ON")
        return conn

    # ──────────── BATCH lookups (eliminates N+1) ────────────

    async def get_mood_classifications_batch(self, tmdb_ids: list) -> dict:
        """Get classified mood for multiple movies. Returns {tmdb_id: mood_str}."""
        if not tmdb_ids:
            return {}
        conn = self._sync_conn()
        try:
            placeholders = ",".join("?" for _ in tmdb_ids)
            cursor = conn.execute(
                f"SELECT tmdb_id, classified_mood FROM mood_classifications WHERE tmdb_id IN ({placeholders})",
                tmdb_ids
            )
            return {r[0]: r[1] for r in cursor.fetchall()}
        finally:
            conn.close()

    async def get_movie_keywords_batch(self, tmdb_ids: list) -> dict:
        """Get TMDB keywords for multiple movies. Returns {tmdb_id: [keywords]}."""
        if not tmdb_ids:
            return {}
        conn = self._sync_conn()
        try:
            placeholders = ",".join("?" for _ in tmdb_ids)
            cursor = conn.execute(
                f"SELECT tmdb_id, keywords FROM movie_attributes WHERE tmdb_id IN ({placeholders})",
                tmdb_ids
            )
            result = {}
            for r in cursor.fetchall():
                result[r[0]] = json.loads(r[1]) if r[1] else []
            return result
        finally:
            conn.close()

    async def get_movies_batch(self, tmdb_ids: list) -> dict:
        """Get cached movie analysis for multiple movies. Returns {tmdb_id: data_dict}."""
        if not tmdb_ids:
            return {}
        conn = self._sync_conn()
        try:
            placeholders = ",".join("?" for _ in tmdb_ids)
            cursor = conn.execute(
                f"SELECT tmdb_id, data FROM movie_cache WHERE tmdb_id IN ({placeholders})",
                tmdb_ids
            )
            result = {}
            for r in cursor.fetchall():
                try:
                    result[r[0]] = json.loads(r[1])
                except Exception:
                    pass
            return result
        finally:
            conn.close()

    # ──────────── Pre-computed mood scores ────────────

    async def update_mood_scores_for_mood(self, mood_id: str):
        """Pre-compute mood_score for all movies in a mood. Runs once at startup/seed."""
        from backend.mood_scoring import classify_movie
        async with _get_connection(self.db_path) as db:
            # Fetch all movies + their keywords in one go
            cursor = await db.execute(
                """SELECT r.tmdb_id, r.genre_ids, r.vote_average, r.vote_count,
                          r.overview, r.release_date, r.popularity, r.original_language,
                          COALESCE(a.keywords, '[]') as keywords
                   FROM movie_repository r
                   LEFT JOIN movie_attributes a ON r.tmdb_id = a.tmdb_id
                   WHERE r.mood_id = ?""",
                (mood_id,)
            )
            rows = await cursor.fetchall()

            updates = []
            for row in rows:
                tmdb_id = row[0]
                genre_ids = json.loads(row[1]) if row[1] else []
                vote_avg = row[2]
                vote_count = row[3]
                overview = row[4]
                release_date = row[5]
                popularity = row[6]
                original_language = row[7]
                tmdb_keywords = json.loads(row[8]) if row[8] else []

                classification = classify_movie(
                    genre_ids, vote_avg,
                    tmdb_id=tmdb_id,
                    vote_count=vote_count,
                    overview=overview,
                    release_date=release_date,
                    tmdb_keywords=tmdb_keywords,
                    popularity=popularity,
                    original_language=original_language,
                )
                score = classification["moodScores"].get(mood_id, 0)
                if mood_id in classification["blockedMoods"]:
                    score = 0
                # Türkçe filmler: +3 bonus (yerli sinema önceliği — scoring engine'deki 1.08x'e ek)
                if original_language == "tr" and score >= 25:
                    score += 3
                # NOT: Japon/Hint/Kore/Çin dil cezaları artık mood_scoring.py'de uygulanıyor
                # calculate_mood_scores() içinde original_language parametresi ile
                updates.append((round(score, 1), tmdb_id, mood_id))

            if updates:
                await db.executemany(
                    "UPDATE movie_repository SET mood_score = ? WHERE tmdb_id = ? AND mood_id = ?",
                    updates
                )
                await db.commit()
            return len(updates)

    async def get_repository_movies_paginated(self, mood_id: str, page: int = 1,
                                                per_page: int = 20,
                                                min_vote: float = 5.0,
                                                min_mood_score: float = 0.0,
                                                sort_by: str = "recommended") -> dict:
        """SQL-level paginated fetch — uses sync sqlite3 to avoid aiosqlite thread blocking."""
        # Build ORDER BY clause
        order_clauses = {
            "recommended": "mood_score DESC, vote_average DESC",
            "rating_desc": "vote_average DESC, mood_score DESC",
            "rating_asc": "vote_average ASC, mood_score DESC",
            "mood_desc": "mood_score DESC, vote_average DESC",
            "mood_asc": "mood_score ASC, vote_average DESC",
            "newest": "CAST(SUBSTR(release_date, 1, 4) AS INTEGER) DESC, mood_score DESC",
            "oldest": "CAST(SUBSTR(release_date, 1, 4) AS INTEGER) ASC, mood_score DESC",
        }
        order_by = order_clauses.get(sort_by, order_clauses["recommended"])
        offset = (page - 1) * per_page

        conn = self._sync_conn()
        try:
            # Count total matching
            total = conn.execute(
                """SELECT COUNT(*) FROM movie_repository
                   WHERE mood_id = ? AND vote_average >= ? AND mood_score >= ?""",
                (mood_id, min_vote, min_mood_score)
            ).fetchone()[0]

            # Fetch page
            rows = conn.execute(
                f"""SELECT tmdb_id, title, poster_url, overview, release_date,
                           vote_average, genre_ids, backdrop_url, vote_count,
                           original_language, popularity, mood_score
                    FROM movie_repository
                    WHERE mood_id = ? AND vote_average >= ? AND mood_score >= ?
                    ORDER BY {order_by}
                    LIMIT ? OFFSET ?""",
                (mood_id, min_vote, min_mood_score, per_page, offset)
            ).fetchall()
        finally:
            conn.close()

        movies = []
        for r in rows:
            movies.append({
                "id": r[0],
                "title": r[1],
                "poster_url": r[2],
                "overview": r[3],
                "release_date": r[4],
                "vote_average": r[5],
                "genre_ids": json.loads(r[6]) if r[6] else [],
                "backdrop_url": r[7],
                "vote_count": r[8] if r[8] else 0,
                "original_language": r[9] if r[9] else "",
                "popularity": r[10] if r[10] else 0,
                "mood_score": r[11] if r[11] else 0,
            })

        total_pages = max(1, (total + per_page - 1) // per_page)
        return {
            "movies": movies,
            "total": total,
            "total_pages": total_pages,
        }

    async def get_movies_without_keywords(self, mood_id: str = None, limit: int = 100) -> list:
        """Get movie IDs from repository that don't have keywords yet."""
        async with _get_connection(self.db_path) as db:
            if mood_id:
                cursor = await db.execute("""
                    SELECT DISTINCT r.tmdb_id, r.title
                    FROM movie_repository r
                    LEFT JOIN movie_attributes a ON r.tmdb_id = a.tmdb_id
                    WHERE r.mood_id = ? AND (a.tmdb_id IS NULL OR a.keywords = '[]')
                    LIMIT ?
                """, (mood_id, limit))
            else:
                cursor = await db.execute("""
                    SELECT DISTINCT r.tmdb_id, r.title
                    FROM movie_repository r
                    LEFT JOIN movie_attributes a ON r.tmdb_id = a.tmdb_id
                    WHERE a.tmdb_id IS NULL OR a.keywords = '[]'
                    LIMIT ?
                """, (limit,))
            rows = await cursor.fetchall()
            return [{"id": r[0], "title": r[1]} for r in rows]

    async def get_mood_scores_for_movie(self, tmdb_id: int) -> dict:
        """Get stored mood scores for a movie."""
        async with _get_connection(self.db_path) as db:
            cursor = await db.execute(
                "SELECT mood_scores FROM movie_attributes WHERE tmdb_id = ?",
                (tmdb_id,)
            )
            row = await cursor.fetchone()
            return json.loads(row[0]) if row else None


cache = MovieCache()
