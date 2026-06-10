"""
SQLite/Turso caching layer.

Movie data  → always local aiosqlite  (reproducible via TMDB re-seed, fast)
User data   → Turso HTTP API if configured (plain httpx, persistent)
             falls back to local aiosqlite when TURSO_* env vars are absent.

Set TURSO_DATABASE_URL + TURSO_AUTH_TOKEN to enable persistent user storage.
No code changes required for local/dev — fallback is automatic.

Turso access uses the official Hrana-over-HTTP v2 pipeline endpoint via httpx
(already a dependency). No libsql client lib, no Rust, no websockets.
"""
import aiosqlite
import sqlite3
import json
import os
import re
import base64
import asyncio
import contextlib
from collections import deque
import httpx
from typing import Optional
import logging
from backend.config import DATABASE_PATH

logger = logging.getLogger("film_elestirimeni")

# ── SQLite Connection Pool ───────────────────────────────────────────────────
# Prevents ~30ms open/close overhead on every database operation.
# Initialized once at startup via MovieCache.init_pool(), closed via close_pool().
_sqlite_pool: deque = deque()
_pool_init: bool = False
_POOL_SIZE: int = 8


async def init_pool(db_path: str, size: int = 8):
    """Create persistent SQLite connections (call once after init_db)."""
    global _sqlite_pool, _pool_init, _POOL_SIZE
    if _pool_init:
        return
    _POOL_SIZE = size
    for _ in range(size):
        conn = await aiosqlite.connect(db_path)
        await conn.execute("PRAGMA journal_mode=WAL")
        await conn.execute("PRAGMA synchronous=NORMAL")
        await conn.execute("PRAGMA busy_timeout=30000")
        _sqlite_pool.append(conn)
    _pool_init = True


async def close_pool():
    """Close all pooled connections (call at shutdown)."""
    global _sqlite_pool, _pool_init
    _pool_init = False
    while _sqlite_pool:
        conn = _sqlite_pool.popleft()
        await conn.close()


# ── Turso HTTP API (Hrana v2 pipeline, plain httpx) ──────────────────────────
_TURSO_URL   = os.getenv("TURSO_DATABASE_URL")
_TURSO_TOKEN = os.getenv("TURSO_AUTH_TOKEN")
_turso_client = None   # _TursoHTTP instance, set in MovieCache.init_db()
_LIBSQL_OK = True       # httpx is always available; gating is on the env vars


def _encode_arg(v):
    """Python value → Hrana typed-value JSON."""
    if v is None:
        return {"type": "null"}
    if isinstance(v, bool):
        return {"type": "integer", "value": str(int(v))}
    if isinstance(v, int):
        return {"type": "integer", "value": str(v)}
    if isinstance(v, float):
        return {"type": "float", "value": v}
    if isinstance(v, bytes):
        return {"type": "blob", "base64": base64.b64encode(v).decode()}
    return {"type": "text", "value": str(v)}


def _decode_cell(cell):
    """Hrana typed-value JSON → Python value."""
    t = cell.get("type")
    if t == "null":
        return None
    if t == "integer":
        return int(cell["value"])
    if t == "float":
        return float(cell["value"])
    if t == "blob":
        return base64.b64decode(cell.get("base64", ""))
    return cell.get("value")


class _TursoCursor:
    """aiosqlite-style async cursor over a decoded Hrana result."""
    __slots__ = ("_rows",)

    def __init__(self, rows):
        self._rows = rows  # list of tuples

    async def fetchone(self):
        return self._rows[0] if self._rows else None

    async def fetchall(self):
        return self._rows


class _TursoHTTP:
    """Minimal Turso client using the Hrana v2 /pipeline HTTP endpoint."""

    def __init__(self, url: str, auth_token: str):
        base = url.replace("libsql://", "https://").rstrip("/")
        self._endpoint = f"{base}/v2/pipeline"
        self._headers = {"Authorization": f"Bearer {auth_token}"}
        self._http: Optional[httpx.AsyncClient] = None

    def _client(self) -> httpx.AsyncClient:
        """Lazily create one pooled client (keep-alive, reused across calls)."""
        if self._http is None or self._http.is_closed:
            self._http = httpx.AsyncClient(
                timeout=30.0,
                limits=httpx.Limits(
                    max_keepalive_connections=10,
                    max_connections=20,
                    keepalive_expiry=60.0,
                ),
            )
        return self._http

    async def aclose(self):
        if self._http is not None and not self._http.is_closed:
            await self._http.aclose()

    async def _pipeline(self, stmts):
        requests = [{"type": "execute", "stmt": s} for s in stmts]
        requests.append({"type": "close"})
        payload = {"baton": None, "requests": requests}
        r = await self._client().post(
            self._endpoint, json=payload, headers=self._headers
        )
        r.raise_for_status()
        data = r.json()
        out = []
        for item in data.get("results", []):
            if item.get("type") == "error":
                raise RuntimeError(f"Turso error: {item.get('error')}")
            resp = item.get("response") or {}
            if resp.get("type") == "execute":
                res = resp.get("result", {})
                out.append([
                    tuple(_decode_cell(c) for c in row)
                    for row in res.get("rows", [])
                ])
        return out

    async def execute(self, sql, params=()):
        stmt = {"sql": sql, "args": [_encode_arg(v) for v in params]}
        results = await self._pipeline([stmt])
        return _TursoCursor(results[0] if results else [])

    async def executemany(self, sql, params_list):
        params_list = list(params_list)
        for i in range(0, len(params_list), 50):
            chunk = params_list[i:i + 50]
            await self._pipeline([
                {"sql": sql, "args": [_encode_arg(v) for v in p]}
                for p in chunk
            ])

    async def commit(self):
        pass  # each /pipeline call is its own auto-committed transaction


@contextlib.asynccontextmanager
async def _get_connection(db_path: str, user_data: bool = False):
    """Yield an aiosqlite-compatible DB handle.

    user_data=True  → Turso HTTP client (if configured) for persistent user tables.
    user_data=False → always local aiosqlite (movie caches, repository, etc.).
    Uses a persistent connection pool when available (init_pool called at startup).
    """
    if user_data and _turso_client is not None:
        yield _turso_client
    elif _pool_init and _sqlite_pool:
        conn = _sqlite_pool.popleft()
        try:
            yield conn
        finally:
            _sqlite_pool.append(conn)
    else:
        async with aiosqlite.connect(db_path) as db:
            await db.execute("PRAGMA journal_mode=WAL")
            await db.execute("PRAGMA synchronous=NORMAL")
            await db.execute("PRAGMA busy_timeout=30000")
            yield db

# ─────────────────────────────────────────────────────────────────────────────


class MovieCache:
    def __init__(self, db_path: str = None):
        self.db_path = db_path or DATABASE_PATH

    async def init_db(self):
        """Create the cache, watchlist and notes tables."""
        global _turso_client
        if _LIBSQL_OK and _TURSO_URL and _TURSO_TOKEN and _turso_client is None:
            import logging as _log
            _logger = _log.getLogger(__name__)
            _logger.info("[DB] Turso HTTP API bağlanıyor: %s", _TURSO_URL)
            try:
                client = _TursoHTTP(_TURSO_URL, _TURSO_TOKEN)
                # Connectivity smoke test before committing the client globally
                await client.execute("SELECT 1")
                _turso_client = client
                await self._init_turso_user_tables()
                _logger.info("[DB] Turso kullanıcı tabloları hazır, kalıcı depolama aktif.")
            except Exception as e:
                _turso_client = None
                _logger.error(
                    "[DB] Turso bağlantısı başarısız (%s) — local SQLite'a düşülüyor.", e
                )

        # Local SQLite schema — movie data + local fallback for user data
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("PRAGMA journal_mode=WAL")
            await db.execute("PRAGMA synchronous=NORMAL")
            await db.execute("PRAGMA cache_size=-8000")
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
                    logger.warning("[DB] ALTER TABLE %s ADD user_id failed (likely exists)", tbl)
            # watchlist.watched kolonu da garanti olsun (eski şemada lazy ekleniyordu)
            try:
                await db.execute("ALTER TABLE watchlist ADD COLUMN watched INTEGER DEFAULT 0")
            except Exception:
                logger.warning("[DB] ALTER TABLE watchlist ADD watched failed (likely exists)")

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
            # watched_at: filmin "izlendi" işaretlendiği an (son-izlenen sıralaması +
            # zamansal zevk içgörüsü için). Idempotent ALTER — her açılışta garanti.
            try:
                await db.execute("ALTER TABLE watchlist ADD COLUMN watched_at TIMESTAMP")
            except Exception:
                logger.warning("[DB] ALTER TABLE watchlist ADD watched_at failed (likely exists)")
            # Kullanıcı film puanı (1-10) + beğeni (like/dislike) — giriş zorunlu.
            await db.execute("""
                CREATE TABLE IF NOT EXISTS movie_ratings (
                    tmdb_id INTEGER NOT NULL,
                    rating INTEGER,
                    reaction TEXT,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    user_id INTEGER NOT NULL DEFAULT 0,
                    PRIMARY KEY (tmdb_id, user_id)
                )
            """)
            # Kullanıcının özel listeleri ("Nolan filmleri" vb.) + liste öğeleri.
            await db.execute("""
                CREATE TABLE IF NOT EXISTS user_lists (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    emoji TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            await db.execute("""
                CREATE TABLE IF NOT EXISTS list_items (
                    list_id INTEGER NOT NULL,
                    tmdb_id INTEGER NOT NULL,
                    title TEXT,
                    poster_url TEXT,
                    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (list_id, tmdb_id)
                )
            """)
            await db.execute("CREATE INDEX IF NOT EXISTS idx_user_lists_user ON user_lists(user_id)")
            await db.execute("CREATE INDEX IF NOT EXISTS idx_list_items_list ON list_items(list_id)")
            # OMDb Ratings Cache
            await db.execute("""
                CREATE TABLE IF NOT EXISTS omdb_cache (
                    tmdb_id INTEGER PRIMARY KEY,
                    imdb_rating REAL,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            # TMDB Response Cache (videos, similar, search, etc.)
            await db.execute("""
                CREATE TABLE IF NOT EXISTS tmdb_response_cache (
                    cache_key TEXT PRIMARY KEY,
                    data TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
                logger.warning("[DB] CREATE INDEX idx_repo_mood_vote failed")
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
                logger.warning("[DB] ALTER movie_repository ADD vote_count failed")
            try:
                await db.execute("ALTER TABLE movie_cache ADD COLUMN vote_count INTEGER DEFAULT 0")
            except Exception:
                logger.warning("[DB] ALTER movie_cache ADD vote_count failed")
            # original_language column for Turkish film detection
            try:
                await db.execute("ALTER TABLE movie_repository ADD COLUMN original_language TEXT DEFAULT ''")
            except Exception:
                logger.warning("[DB] ALTER movie_repository ADD original_language failed")
            # popularity column for better sorting
            try:
                await db.execute("ALTER TABLE movie_repository ADD COLUMN popularity REAL DEFAULT 0")
            except Exception:
                logger.warning("[DB] ALTER movie_repository ADD popularity failed")
            # Pre-computed mood_score for fast SQL-level filtering/sorting
            try:
                await db.execute("ALTER TABLE movie_repository ADD COLUMN mood_score REAL DEFAULT 0")
            except Exception:
                logger.warning("[DB] ALTER movie_repository ADD mood_score failed")
            try:
                await db.execute("""
                    CREATE INDEX IF NOT EXISTS idx_repo_mood_score
                    ON movie_repository(mood_id, mood_score DESC)
                """)
            except Exception:
                logger.warning("[DB] CREATE INDEX idx_repo_mood_score failed")
            # omdb_cache migration (imdb_votes, imdb_id)
            try:
                await db.execute("ALTER TABLE omdb_cache ADD COLUMN imdb_votes INTEGER DEFAULT 0")
            except Exception:
                logger.warning("[DB] ALTER omdb_cache ADD imdb_votes failed")
            try:
                await db.execute("ALTER TABLE omdb_cache ADD COLUMN imdb_id TEXT")
            except Exception:
                logger.warning("[DB] ALTER omdb_cache ADD imdb_id failed")
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
            # Semantic cache for "Kafan mı Karışık?" Claude intent extraction.
            # Local (reproducible) — survives restarts, auto-rewarms after wipe.
            await db.execute("""
                CREATE TABLE IF NOT EXISTS mood_query_cache (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    query_norm TEXT NOT NULL,
                    tokens TEXT NOT NULL,
                    intent_json TEXT NOT NULL,
                    hits INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    last_used TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            await db.execute("""
                CREATE INDEX IF NOT EXISTS idx_mqc_recent
                ON mood_query_cache(last_used DESC)
            """)
            # ── Fast Vector Search table ──────────────────────────────────────────
            # Stores pre-computed Gemini text-embedding-004 vectors (768 dims).
            # Enables <120ms end-to-end recommendations with zero LLM calls.
            await db.execute("""
                CREATE TABLE IF NOT EXISTS movie_fast_search (
                    tmdb_id       INTEGER PRIMARY KEY,
                    embedding_data BLOB NOT NULL,
                    search_document TEXT NOT NULL DEFAULT '',
                    ustad_notu    TEXT  NOT NULL DEFAULT '',
                    title         TEXT  NOT NULL DEFAULT '',
                    poster_url    TEXT,
                    backdrop_url  TEXT,
                    overview      TEXT  DEFAULT '',
                    release_date  TEXT  DEFAULT '',
                    vote_average  REAL  DEFAULT 0.0,
                    genre_ids     TEXT  DEFAULT '[]',
                    primary_mood_id TEXT DEFAULT '',
                    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            await db.execute("""
                CREATE INDEX IF NOT EXISTS idx_fast_search_vote
                ON movie_fast_search(vote_average DESC)
            """)
            # original_language kolonu — ülke/dil filtrelemesi için
            try:
                await db.execute("ALTER TABLE movie_fast_search ADD COLUMN original_language TEXT DEFAULT ''")
            except Exception:
                logger.warning("[DB] ALTER movie_fast_search ADD original_language failed")
            # TMDB API response cache — reduces latency for repeated queries
            await db.execute("""
                CREATE TABLE IF NOT EXISTS tmdb_response_cache (
                    cache_key TEXT PRIMARY KEY,
                    data TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)

            # ── Sosyal ağ: Arkadaşlık + Doğrudan Film Paylaşımı ──────────────
            # username kolonu (arkadaş arama tanımlayıcısı) — güvenli migration
            try:
                await db.execute("ALTER TABLE users ADD COLUMN username TEXT")
            except Exception:
                logger.warning("[DB] ALTER users ADD username failed (likely exists)")

            # avatar_data kolonu — BLOB, filesystem'siz kalıcı avatar depolama
            try:
                await db.execute("ALTER TABLE users ADD COLUMN avatar_data BLOB")
            except Exception:
                logger.warning("[DB] ALTER users ADD avatar_data failed (likely exists)")

            # password_hash kolonu — e-posta+şifre girişi (Google kullanıcılarında NULL)
            try:
                await db.execute("ALTER TABLE users ADD COLUMN password_hash TEXT")
            except Exception:
                logger.warning("[DB] ALTER users ADD password_hash failed (likely exists)")

            # last_active kolonu — pasif kullanıcı re-engagement push'u için
            try:
                await db.execute("ALTER TABLE users ADD COLUMN last_active TIMESTAMP")
            except Exception:
                logger.warning("[DB] ALTER users ADD last_active failed (likely exists)")

            # hide_activity kolonu — arkadaş aktivite akışında görünürlük kontrolü
            try:
                await db.execute("ALTER TABLE users ADD COLUMN hide_activity INTEGER NOT NULL DEFAULT 0")
            except Exception:
                logger.warning("[DB] ALTER users ADD hide_activity failed (likely exists)")

            # Eski /uploads yollarını temizle (ephemeral filesystem'de dosya yok)
            try:
                await db.execute("""
                    UPDATE users SET picture = NULL
                    WHERE picture LIKE '/uploads/%' AND avatar_data IS NULL
                """)
            except Exception:
                pass
            # Mevcut kullanıcılara benzersiz username üret (email öneki + id)
            try:
                await db.execute("""
                    UPDATE users SET username =
                        CASE
                            WHEN email IS NOT NULL AND instr(email,'@') > 1
                            THEN lower(substr(email,1,instr(email,'@')-1)) || '_' || id
                            ELSE 'user_' || id
                        END
                    WHERE username IS NULL OR username = ''
                """)
            except Exception:
                logger.warning("[DB] UPDATE users SET username (auto-generate) failed")
            try:
                await db.execute(
                    "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)"
                )
            except Exception:
                logger.warning("[DB] CREATE UNIQUE INDEX idx_users_username failed")

            # friendships — iki yönlü arkadaşlık + engelleme matrisi
            await db.execute("""
                CREATE TABLE IF NOT EXISTS friendships (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL REFERENCES users(id),
                    friend_id INTEGER NOT NULL REFERENCES users(id),
                    status TEXT NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING','ACCEPTED','DECLINED','BLOCKED')),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(user_id, friend_id)
                )
            """)
            await db.execute(
                "CREATE INDEX IF NOT EXISTS idx_friendships_lookup ON friendships(friend_id, status)"
            )

            # direct_recommendations — doğrudan film paylaşım odası
            await db.execute("""
                CREATE TABLE IF NOT EXISTS direct_recommendations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    sender_id INTEGER NOT NULL REFERENCES users(id),
                    receiver_id INTEGER NOT NULL REFERENCES users(id),
                    movie_id INTEGER NOT NULL,
                    user_note TEXT,
                    is_read INTEGER NOT NULL DEFAULT 0,
                    dismissed INTEGER NOT NULL DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            await db.execute(
                "CREATE INDEX IF NOT EXISTS idx_direct_rec_inbox ON direct_recommendations(receiver_id, is_read)"
            )
            # dismissed migration (alıcı kalıcı "okundu/gizle" — panelden tamamen kalkar)
            try:
                await db.execute("ALTER TABLE direct_recommendations ADD COLUMN dismissed INTEGER NOT NULL DEFAULT 0")
            except Exception:
                logger.warning("[DB] ALTER direct_recommendations ADD dismissed failed")
            # Ek performans index'leri
            await db.execute("CREATE INDEX IF NOT EXISTS idx_watchlist_user_date ON watchlist(user_id, added_at DESC)")
            await db.execute("CREATE INDEX IF NOT EXISTS idx_future_priority ON future_plans(user_id, priority DESC, added_at DESC)")
            await db.execute("CREATE INDEX IF NOT EXISTS idx_movie_cache_created ON movie_cache(created_at)")
            await db.execute("CREATE INDEX IF NOT EXISTS idx_mood_class_mood ON mood_classifications(classified_mood)")
            await db.execute("CREATE INDEX IF NOT EXISTS idx_community_created ON community_recommendations(created_at DESC)")
            # user_taste_profiles — önbelleklenmiş zevk haritası verisi
            await db.execute("""
                CREATE TABLE IF NOT EXISTS user_taste_profiles (
                    user_id INTEGER PRIMARY KEY REFERENCES users(id),
                    profile_data TEXT NOT NULL,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            # referrals — davet (referral) atıf kaydı. Her kullanıcı en fazla 1 kez davet edilebilir.
            await db.execute("""
                CREATE TABLE IF NOT EXISTS referrals (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    referrer_id INTEGER NOT NULL REFERENCES users(id),
                    referred_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            await db.execute(
                "CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id)"
            )
            # push_subscriptions — Web Push abonelikleri (endpoint başına tekil)
            await db.execute("""
                CREATE TABLE IF NOT EXISTS push_subscriptions (
                    endpoint TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id),
                    p256dh TEXT NOT NULL,
                    auth TEXT NOT NULL,
                    is_pwa INTEGER DEFAULT 0,
                    notify_hour INTEGER DEFAULT 18,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            await db.execute(
                "CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id)"
            )
            # user_moods — kullanıcının seçili mood'u (tekil, UPSERT)
            await db.execute("""
                CREATE TABLE IF NOT EXISTS user_moods (
                    user_id INTEGER PRIMARY KEY REFERENCES users(id),
                    mood_id TEXT NOT NULL,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            # is_pwa migration (güvenli ALTER TABLE)
            try:
                await db.execute("ALTER TABLE push_subscriptions ADD COLUMN is_pwa INTEGER DEFAULT 0")
            except Exception:
                logger.warning("[DB] ALTER push_subscriptions ADD is_pwa failed")
            # notify_hour migration (kullanıcı-ayarlı bildirim saati; varsayılan 18:00)
            try:
                await db.execute("ALTER TABLE push_subscriptions ADD COLUMN notify_hour INTEGER DEFAULT 18")
            except Exception:
                logger.warning("[DB] ALTER push_subscriptions ADD notify_hour failed")
            # reaction migration (öneri reaksiyonları)
            try:
                await db.execute("ALTER TABLE direct_recommendations ADD COLUMN reaction TEXT")
            except Exception:
                logger.warning("[DB] ALTER direct_recommendations ADD reaction failed")

            # ── Topluluk katmanı: Söz (public mini yorum) + moderasyon ────────
            # movie_reviews — movie_notes'tan AYRI: notlar özel günlük, Söz herkese açık.
            await db.execute("""
                CREATE TABLE IF NOT EXISTS movie_reviews (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    tmdb_id INTEGER NOT NULL,
                    user_id INTEGER NOT NULL REFERENCES users(id),
                    content TEXT NOT NULL,
                    has_spoiler INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL DEFAULT 'visible'
                        CHECK (status IN ('visible','hidden','removed')),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(tmdb_id, user_id)
                )
            """)
            await db.execute(
                "CREATE INDEX IF NOT EXISTS idx_reviews_movie ON movie_reviews(tmdb_id, status)"
            )
            await db.execute(
                "CREATE INDEX IF NOT EXISTS idx_reviews_user ON movie_reviews(user_id)"
            )
            # ugc_reports — store zorunluluğu: herkese açık içerik şikayet edilebilmeli
            await db.execute("""
                CREATE TABLE IF NOT EXISTS ugc_reports (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    content_type TEXT NOT NULL,
                    content_id TEXT NOT NULL,
                    reporter_id INTEGER NOT NULL REFERENCES users(id),
                    reason TEXT,
                    status TEXT NOT NULL DEFAULT 'open',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            # user_blocks — friendships.BLOCKED'dan ayrı: yabancılar arasında satır olmayabilir
            await db.execute("""
                CREATE TABLE IF NOT EXISTS user_blocks (
                    blocker_id INTEGER NOT NULL REFERENCES users(id),
                    blocked_id INTEGER NOT NULL REFERENCES users(id),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (blocker_id, blocked_id)
                )
            """)
            # review_likes — Söz beğenileri
            await db.execute("""
                CREATE TABLE IF NOT EXISTS review_likes (
                    review_id INTEGER NOT NULL REFERENCES movie_reviews(id),
                    user_id INTEGER NOT NULL REFERENCES users(id),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (review_id, user_id)
                )
            """)
            # user_lists public paylaşım kolonları
            for _col_mig in (
                "ALTER TABLE user_lists ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0",
                "ALTER TABLE user_lists ADD COLUMN slug TEXT",
                "ALTER TABLE user_lists ADD COLUMN description TEXT",
            ):
                try:
                    await db.execute(_col_mig)
                except Exception:
                    pass  # kolon zaten var
            try:
                await db.execute(
                    "CREATE UNIQUE INDEX IF NOT EXISTS idx_user_lists_slug ON user_lists(slug) WHERE slug IS NOT NULL"
                )
            except Exception:
                logger.warning("[DB] idx_user_lists_slug failed")
            await db.commit()

    async def _init_turso_user_tables(self):
        """Create user-data tables on Turso (idempotent). Called once at startup."""
        stmts = [
            """CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                google_id TEXT UNIQUE NOT NULL,
                email TEXT, name TEXT, picture TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )""",
            """CREATE TABLE IF NOT EXISTS watchlist (
                tmdb_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                poster_url TEXT,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                watched INTEGER DEFAULT 0,
                watched_at TIMESTAMP,
                user_id INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (tmdb_id, user_id)
            )""",
            """CREATE TABLE IF NOT EXISTS movie_notes (
                tmdb_id INTEGER NOT NULL,
                note_content TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                user_id INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (tmdb_id, user_id)
            )""",
            """CREATE TABLE IF NOT EXISTS future_plans (
                tmdb_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                poster_url TEXT,
                priority INTEGER DEFAULT 0,
                watch_date TEXT,
                notes TEXT,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                user_id INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (tmdb_id, user_id)
            )""",
            """CREATE TABLE IF NOT EXISTS community_recommendations (
                tmdb_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                username TEXT, avatar TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (tmdb_id, user_id)
            )""",
            """CREATE TABLE IF NOT EXISTS movie_ratings (
                tmdb_id INTEGER NOT NULL,
                rating INTEGER,
                reaction TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                user_id INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (tmdb_id, user_id)
            )""",
            """CREATE TABLE IF NOT EXISTS user_lists (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                emoji TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )""",
            """CREATE TABLE IF NOT EXISTS list_items (
                list_id INTEGER NOT NULL,
                tmdb_id INTEGER NOT NULL,
                title TEXT,
                poster_url TEXT,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (list_id, tmdb_id)
            )""",
            # ── Sosyal ağ tabloları ──────────────────────────────────────────
            """CREATE TABLE IF NOT EXISTS friendships (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id),
                friend_id INTEGER NOT NULL REFERENCES users(id),
                status TEXT NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING','ACCEPTED','DECLINED','BLOCKED')),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, friend_id)
            )""",
            """CREATE TABLE IF NOT EXISTS direct_recommendations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sender_id INTEGER NOT NULL REFERENCES users(id),
                receiver_id INTEGER NOT NULL REFERENCES users(id),
                movie_id INTEGER NOT NULL,
                user_note TEXT,
                is_read INTEGER NOT NULL DEFAULT 0,
                dismissed INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )""",
            """CREATE TABLE IF NOT EXISTS user_taste_profiles (
                user_id INTEGER PRIMARY KEY REFERENCES users(id),
                profile_data TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )""",
            """CREATE TABLE IF NOT EXISTS referrals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                referrer_id INTEGER NOT NULL REFERENCES users(id),
                referred_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )""",
            """CREATE TABLE IF NOT EXISTS push_subscriptions (
                endpoint TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                p256dh TEXT NOT NULL,
                auth TEXT NOT NULL,
                is_pwa INTEGER DEFAULT 0,
                notify_hour INTEGER DEFAULT 18,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )""",
            """CREATE TABLE IF NOT EXISTS user_moods (
                user_id INTEGER PRIMARY KEY REFERENCES users(id),
                mood_id TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )""",
            """CREATE TABLE IF NOT EXISTS daily_films (
                date_key TEXT PRIMARY KEY,
                payload TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )""",
            # ── Topluluk katmanı: Söz + moderasyon + beğeniler ───────────────
            """CREATE TABLE IF NOT EXISTS movie_reviews (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tmdb_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL REFERENCES users(id),
                content TEXT NOT NULL,
                has_spoiler INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'visible'
                    CHECK (status IN ('visible','hidden','removed')),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(tmdb_id, user_id)
            )""",
            """CREATE TABLE IF NOT EXISTS ugc_reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                content_type TEXT NOT NULL,
                content_id TEXT NOT NULL,
                reporter_id INTEGER NOT NULL REFERENCES users(id),
                reason TEXT,
                status TEXT NOT NULL DEFAULT 'open',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )""",
            """CREATE TABLE IF NOT EXISTS user_blocks (
                blocker_id INTEGER NOT NULL REFERENCES users(id),
                blocked_id INTEGER NOT NULL REFERENCES users(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (blocker_id, blocked_id)
            )""",
            """CREATE TABLE IF NOT EXISTS review_likes (
                review_id INTEGER NOT NULL REFERENCES movie_reviews(id),
                user_id INTEGER NOT NULL REFERENCES users(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (review_id, user_id)
            )""",
        ]
        for stmt in stmts:
            await _turso_client.execute(stmt)
        # username kolonu + benzersiz index (idempotent, hata loglanir)
        import logging as _mig_log
        _mig_logger = _mig_log.getLogger(__name__)
        for mig in (
            "ALTER TABLE users ADD COLUMN username TEXT",
            "ALTER TABLE users ADD COLUMN avatar_data BLOB",
            "ALTER TABLE users ADD COLUMN password_hash TEXT",
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)",
            "CREATE INDEX IF NOT EXISTS idx_friendships_lookup ON friendships(friend_id, status)",
            "CREATE INDEX IF NOT EXISTS idx_direct_rec_inbox ON direct_recommendations(receiver_id, is_read)",
            "CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id)",
            "CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id)",
            "ALTER TABLE push_subscriptions ADD COLUMN is_pwa INTEGER DEFAULT 0",
            "ALTER TABLE push_subscriptions ADD COLUMN notify_hour INTEGER DEFAULT 18",
            "ALTER TABLE direct_recommendations ADD COLUMN dismissed INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE users ADD COLUMN last_active TIMESTAMP",
            "ALTER TABLE watchlist ADD COLUMN watched_at TIMESTAMP",
            "CREATE INDEX IF NOT EXISTS idx_user_lists_user ON user_lists(user_id)",
            "CREATE INDEX IF NOT EXISTS idx_list_items_list ON list_items(list_id)",
            "ALTER TABLE users ADD COLUMN hide_activity INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE direct_recommendations ADD COLUMN reaction TEXT",
            # Topluluk katmanı index + public liste kolonları
            "CREATE INDEX IF NOT EXISTS idx_reviews_movie ON movie_reviews(tmdb_id, status)",
            "CREATE INDEX IF NOT EXISTS idx_reviews_user ON movie_reviews(user_id)",
            "ALTER TABLE user_lists ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE user_lists ADD COLUMN slug TEXT",
            "ALTER TABLE user_lists ADD COLUMN description TEXT",
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_user_lists_slug ON user_lists(slug) WHERE slug IS NOT NULL",
        ):
            try:
                await _turso_client.execute(mig)
            except Exception as _mig_e:
                _mig_logger.warning("[Migration] Turso: %s (%s)", _mig_e, mig)
        try:
            await _turso_client.execute("""
                UPDATE users SET username =
                    CASE
                        WHEN email IS NOT NULL AND instr(email,'@') > 1
                        THEN lower(substr(email,1,instr(email,'@')-1)) || '_' || id
                        ELSE 'user_' || id
                    END
                WHERE username IS NULL OR username = ''
            """)
        except Exception:
            logger.warning("[DB] Turso UPDATE username auto-generate failed")

    async def get_daily_film(self, date_key: str) -> Optional[dict]:
        """Daily film'i Turso'dan oku (varsa). Cloud'da kalici, restart'a dayanikli."""
        async with _get_connection(self.db_path, user_data=True) as db:
            cur = await db.execute(
                "SELECT payload FROM daily_films WHERE date_key = ?", (date_key,)
            )
            row = await cur.fetchone()
            if row:
                import json
                return json.loads(row[0])
            return None

    async def save_daily_film(self, date_key: str, payload: dict):
        """Daily film'i Turso'ya yaz (idempotent — INSERT OR REPLACE)."""
        import json
        async with _get_connection(self.db_path, user_data=True) as db:
            await db.execute(
                "INSERT OR REPLACE INTO daily_films (date_key, payload) VALUES (?, ?)",
                (date_key, json.dumps(payload, default=str)),
            )
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

    # ═══════════════════════════════════════════════════════════════════════
    # SOSYAL AĞ — Arkadaşlık & Doğrudan Film Paylaşımı
    # Tüm sorgular user_data=True (Turso varsa kalıcı, yoksa local SQLite)
    # ═══════════════════════════════════════════════════════════════════════

    async def ensure_username(self, user_id: int, email: str = "") -> str:
        """Kullanıcının username'i yoksa email öneki + id ile benzersiz üretir."""
        async with _get_connection(self.db_path, user_data=True) as db:
            cur = await db.execute("SELECT username FROM users WHERE id = ?", (user_id,))
            row = await cur.fetchone()
            if row and row[0]:
                return row[0]
            prefix = (email.split("@")[0] if email and "@" in email else "user").lower()
            prefix = re.sub(r"[^a-z0-9_]", "", prefix) or "user"
            username = f"{prefix}_{user_id}"
            await db.execute("UPDATE users SET username = ? WHERE id = ?", (username, user_id))
            await db.commit()
            return username

    async def get_user_by_username_by_id(self, user_id: int) -> Optional[dict]:
        """ID ile kullanıcı bilgisi çek (auth/me endpoint'i için)."""
        async with _get_connection(self.db_path, user_data=True) as db:
            cur = await db.execute(
                "SELECT id, username, name, picture, email FROM users WHERE id = ?",
                (user_id,),
            )
            row = await cur.fetchone()
            if not row:
                return None
            return {"id": row[0], "username": row[1], "name": row[2],
                    "picture": row[3], "email": row[4]}

    async def get_user_by_username(self, username: str) -> Optional[dict]:
        async with _get_connection(self.db_path, user_data=True) as db:
            cur = await db.execute(
                "SELECT id, username, name, picture, email FROM users WHERE lower(username) = ?",
                (username.strip().lower(),),
            )
            row = await cur.fetchone()
            if not row:
                return None
            return {"id": row[0], "username": row[1], "name": row[2],
                    "picture": row[3], "email": row[4]}

    # ── Referral (davet) sistemi ──────────────────────────────────────────
    async def record_referral(self, referrer_id: int, referred_id: int) -> bool:
        """Yeni kayıt için davet atıfı kaydeder. Kendine atıf / tekrar atıf engellenir.
        True → atıf kaydedildi (ilk kez), False → kaydedilmedi."""
        if not referrer_id or not referred_id or referrer_id == referred_id:
            return False
        async with _get_connection(self.db_path, user_data=True) as db:
            # Davet eden gerçekten var mı?
            cur = await db.execute("SELECT 1 FROM users WHERE id = ?", (referrer_id,))
            if not await cur.fetchone():
                return False
            try:
                await db.execute(
                    "INSERT INTO referrals (referrer_id, referred_id) VALUES (?, ?)",
                    (referrer_id, referred_id),
                )
                await db.commit()
                return True
            except Exception:
                # UNIQUE(referred_id) ihlali → kullanıcı zaten daha önce davet edilmiş
                return False

    async def get_referral_count(self, referrer_id: int) -> int:
        """Bir kullanıcının başarıyla davet ettiği kişi sayısı."""
        async with _get_connection(self.db_path, user_data=True) as db:
            cur = await db.execute(
                "SELECT COUNT(*) FROM referrals WHERE referrer_id = ?", (referrer_id,)
            )
            row = await cur.fetchone()
            return int(row[0]) if row else 0

    # ── Web Push abonelikleri ─────────────────────────────────────────────
    async def save_push_subscription(self, user_id: int, endpoint: str, p256dh: str, auth: str, is_pwa: int = 0) -> bool:
        """Push aboneliğini kaydeder/günceller (endpoint tekil)."""
        if not user_id or not endpoint or not p256dh or not auth:
            return False
        async with _get_connection(self.db_path, user_data=True) as db:
            # UPSERT: yeniden abone olunca notify_hour (kullanıcı tercihi) KORUNUR.
            await db.execute(
                """INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, is_pwa)
                   VALUES (?, ?, ?, ?, ?)
                   ON CONFLICT(endpoint) DO UPDATE SET
                       user_id=excluded.user_id, p256dh=excluded.p256dh,
                       auth=excluded.auth, is_pwa=excluded.is_pwa""",
                (endpoint, user_id, p256dh, auth, is_pwa),
            )
            await db.commit()
            return True

    async def set_notify_hour(self, user_id: int, hour: int) -> bool:
        """Kullanıcının tüm cihazları için günlük bildirim saatini ayarlar (0–23)."""
        if not user_id:
            return False
        hour = max(0, min(23, int(hour)))
        async with _get_connection(self.db_path, user_data=True) as db:
            await db.execute(
                "UPDATE push_subscriptions SET notify_hour = ? WHERE user_id = ?",
                (hour, user_id),
            )
            await db.commit()
            return True

    async def get_notify_hour(self, user_id: int) -> int:
        """Kullanıcının seçtiği bildirim saati (yoksa varsayılan 18)."""
        if not user_id:
            return 18
        async with _get_connection(self.db_path, user_data=True) as db:
            cur = await db.execute(
                "SELECT notify_hour FROM push_subscriptions WHERE user_id = ? LIMIT 1",
                (user_id,),
            )
            row = await cur.fetchone()
            return int(row[0]) if row and row[0] is not None else 18

    async def get_push_subscriptions_by_hour(self, hour: int) -> list:
        """notify_hour == hour olan tüm abonelikleri döndürür (saatlik günlük push)."""
        async with _get_connection(self.db_path, user_data=True) as db:
            cur = await db.execute(
                "SELECT endpoint, p256dh, auth, user_id, is_pwa FROM push_subscriptions WHERE notify_hour = ?",
                (int(hour),),
            )
            rows = await cur.fetchall()
            return [{"endpoint": r[0], "p256dh": r[1], "auth": r[2], "user_id": r[3], "is_pwa": r[4] or 0} for r in rows]

    async def delete_push_subscription(self, endpoint: str) -> bool:
        if not endpoint:
            return False
        async with _get_connection(self.db_path, user_data=True) as db:
            await db.execute("DELETE FROM push_subscriptions WHERE endpoint = ?", (endpoint,))
            await db.commit()
            return True

    async def get_push_subscriptions(self, user_id: int) -> list:
        """Bir kullanıcının tüm push aboneliklerini döndürür."""
        async with _get_connection(self.db_path, user_data=True) as db:
            cur = await db.execute(
                "SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?",
                (user_id,),
            )
            rows = await cur.fetchall()
            return [{"endpoint": r[0], "p256dh": r[1], "auth": r[2]} for r in rows]

    async def get_all_push_subscriptions(self) -> list:
        """Tüm aboneliği döndürür (toplu günlük bildirim için)."""
        async with _get_connection(self.db_path, user_data=True) as db:
            cur = await db.execute(
                "SELECT endpoint, p256dh, auth, user_id, is_pwa FROM push_subscriptions"
            )
            rows = await cur.fetchall()
            return [{"endpoint": r[0], "p256dh": r[1], "auth": r[2], "user_id": r[3], "is_pwa": r[4] or 0} for r in rows]

    async def update_last_active(self, user_id: int) -> None:
        """Kullanıcının son aktif olma zamanını günceller."""
        async with _get_connection(self.db_path, user_data=True) as db:
            await db.execute("UPDATE users SET last_active = CURRENT_TIMESTAMP WHERE id = ?", (user_id,))
            await db.commit()

    async def get_inactive_user_subs(self, days: int = 7) -> list:
        """Belirtilen gündür aktif olmayan kullanıcıların push aboneliklerini döndürür."""
        async with _get_connection(self.db_path, user_data=True) as db:
            cur = await db.execute(
                """SELECT ps.endpoint, ps.p256dh, ps.auth, ps.user_id, ps.is_pwa
                   FROM push_subscriptions ps
                   WHERE ps.user_id NOT IN (
                       SELECT id FROM users WHERE last_active >= datetime('now', ? || ' days')
                   )""",
                (f"-{int(days)}",),
            )
            rows = await cur.fetchall()
            return [{"endpoint": r[0], "p256dh": r[1], "auth": r[2], "user_id": r[3], "is_pwa": r[4] or 0} for r in rows]

    async def create_friend_request(self, user_id: int, friend_id: int) -> dict:
        """PENDING istek oluştur. Karşı taraf zaten istek attıysa karşılıklı ACCEPTED yapar."""
        async with _get_connection(self.db_path, user_data=True) as db:
            cur = await db.execute(
                "SELECT id, user_id, status FROM friendships "
                "WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)",
                (user_id, friend_id, friend_id, user_id),
            )
            existing = await cur.fetchone()
            if existing:
                ex_id, ex_uid, ex_status = existing
                if ex_status == "ACCEPTED":
                    return {"status": "ACCEPTED", "already": True}
                if ex_status == "BLOCKED":
                    return {"status": "BLOCKED", "already": True}
                # Karşı taraf bana PENDING istek attıysa → karşılıklı kabul
                if ex_uid == friend_id and ex_status == "PENDING":
                    await db.execute("UPDATE friendships SET status='ACCEPTED' WHERE id = ?", (ex_id,))
                    await db.commit()
                    return {"status": "ACCEPTED", "mutual": True}
                # Eski isteğimi tazele (DECLINED → PENDING)
                await db.execute("UPDATE friendships SET status='PENDING' WHERE id = ?", (ex_id,))
                await db.commit()
                return {"status": "PENDING", "request_id": ex_id}
            await db.execute(
                "INSERT INTO friendships (user_id, friend_id, status) VALUES (?, ?, 'PENDING')",
                (user_id, friend_id),
            )
            await db.commit()
            cur = await db.execute(
                "SELECT id FROM friendships WHERE user_id = ? AND friend_id = ?",
                (user_id, friend_id),
            )
            row = await cur.fetchone()
            return {"status": "PENDING", "request_id": row[0] if row else None}

    async def respond_friend_request(self, request_id: int, user_id: int, action: str) -> bool:
        """Sadece isteğin alıcısı (friend_id == user_id) yanıtlayabilir.
        
        Artık idempotent: zaten ACCEPTED durumdaysa True döner (hata fırlatmaz).
        ACCEPT durumunda, varsa karşı yöndeki PENDING isteği de otomatik kabul eder.
        """
        action = action.upper()
        async with _get_connection(self.db_path, user_data=True) as db:
            cur = await db.execute(
                "SELECT user_id, friend_id, status FROM friendships WHERE id = ?", (request_id,)
            )
            row = await cur.fetchone()
            if not row:
                return False
            req_user, req_friend, req_status = row
            if req_friend != user_id:
                return False
            # Zaten ACCEPTED — idempotent (double-click koruması)
            if req_status == "ACCEPTED":
                return True
            if req_status != "PENDING":
                return False
            new_status = "ACCEPTED" if action == "ACCEPT" else "DECLINED"
            await db.execute("UPDATE friendships SET status = ? WHERE id = ?", (new_status, request_id))
            if action == "ACCEPT":
                # Karşı yöndeki PENDING isteği de kabul et (çift taraflı arkadaşlık)
                await db.execute(
                    "UPDATE friendships SET status = 'ACCEPTED' WHERE user_id = ? AND friend_id = ? AND status = 'PENDING'",
                    (req_friend, req_user),
                )
            await db.commit()
            return True

    async def get_friends(self, user_id: int) -> list:
        """ACCEPTED arkadaşların karşı tarafının public bilgileri."""
        async with _get_connection(self.db_path, user_data=True) as db:
            cur = await db.execute(
                """SELECT u.id, u.username, u.name, u.picture
                   FROM friendships f
                   JOIN users u ON u.id = CASE WHEN f.user_id = ? THEN f.friend_id ELSE f.user_id END
                   WHERE (f.user_id = ? OR f.friend_id = ?) AND f.status = 'ACCEPTED'
                   ORDER BY u.name""",
                (user_id, user_id, user_id),
            )
            rows = await cur.fetchall()
            return [{"id": r[0], "username": r[1], "name": r[2], "avatar": r[3]} for r in rows]

    async def get_incoming_requests(self, user_id: int) -> list:
        """Bana gelen PENDING istekler + gönderen bilgisi."""
        async with _get_connection(self.db_path, user_data=True) as db:
            cur = await db.execute(
                """SELECT f.id, u.id, u.username, u.name, u.picture, f.created_at
                   FROM friendships f JOIN users u ON u.id = f.user_id
                   WHERE f.friend_id = ? AND f.status = 'PENDING'
                   ORDER BY f.created_at DESC""",
                (user_id,),
            )
            rows = await cur.fetchall()
            return [{"request_id": r[0], "id": r[1], "username": r[2], "name": r[3],
                     "avatar": r[4], "created_at": r[5]} for r in rows]

    async def are_friends(self, user_id: int, other_id: int) -> bool:
        async with _get_connection(self.db_path, user_data=True) as db:
            cur = await db.execute(
                """SELECT 1 FROM friendships WHERE status = 'ACCEPTED'
                   AND ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?))
                   LIMIT 1""",
                (user_id, other_id, other_id, user_id),
            )
            return (await cur.fetchone()) is not None

    async def create_direct_recommendation(self, sender_id: int, receiver_id: int,
                                           movie_id: int, user_note: str = "") -> None:
        async with _get_connection(self.db_path, user_data=True) as db:
            await db.execute(
                """INSERT INTO direct_recommendations (sender_id, receiver_id, movie_id, user_note)
                   VALUES (?, ?, ?, ?)""",
                (sender_id, receiver_id, movie_id, (user_note or "")[:250]),
            )
            await db.commit()

    async def get_unread_shares(self, user_id: int) -> list:
        async with _get_connection(self.db_path, user_data=True) as db:
            cur = await db.execute(
                """SELECT d.id, d.movie_id, d.user_note, d.created_at,
                          u.id, u.username, u.name, u.picture
                   FROM direct_recommendations d JOIN users u ON u.id = d.sender_id
                   WHERE d.receiver_id = ? AND d.is_read = 0
                   ORDER BY d.created_at DESC""",
                (user_id,),
            )
            rows = await cur.fetchall()
            return [{"id": r[0], "movie_id": r[1], "user_note": r[2], "created_at": r[3],
                     "sender": {"id": r[4], "username": r[5], "name": r[6], "avatar": r[7]}}
                    for r in rows]

    async def count_unread_shares(self, user_id: int) -> int:
        async with _get_connection(self.db_path, user_data=True) as db:
            cur = await db.execute(
                "SELECT COUNT(*) FROM direct_recommendations WHERE receiver_id = ? AND is_read = 0",
                (user_id,),
            )
            row = await cur.fetchone()
            return row[0] if row else 0

    async def delete_sent_recommendation(self, rec_id: int, sender_id: int) -> bool:
        """Gönderdiğim bir öneriyi geri al (yalnız gönderen silebilir)."""
        async with _get_connection(self.db_path, user_data=True) as db:
            cur = await db.execute(
                "DELETE FROM direct_recommendations WHERE id = ? AND sender_id = ?",
                (rec_id, sender_id),
            )
            await db.commit()
            return cur.rowcount > 0

    async def get_received_recommendations(self, user_id: int, limit: int = 60) -> list:
        """Bana gelen TÜM öneriler (okunmuş dahil) — profilde kalıcı liste için."""
        async with _get_connection(self.db_path, user_data=True) as db:
            cur = await db.execute(
                """SELECT d.id, d.movie_id, d.user_note, d.created_at, d.is_read,
                          u.id, u.username, u.name, u.picture, d.reaction
                   FROM direct_recommendations d JOIN users u ON u.id = d.sender_id
                   WHERE d.receiver_id = ? AND d.dismissed = 0
                   ORDER BY d.created_at DESC LIMIT ?""",
                (user_id, limit),
            )
            rows = await cur.fetchall()
            return [{"id": r[0], "movie_id": r[1], "user_note": r[2], "created_at": r[3],
                     "is_read": bool(r[4]),
                     "sender": {"id": r[5], "username": r[6], "name": r[7], "avatar": r[8]},
                     "reaction": r[9] if len(r) > 9 else None}
                    for r in rows]

    async def get_sent_recommendations(self, user_id: int, limit: int = 60) -> list:
        """Benim arkadaşlarıma gönderdiğim TÜM öneriler — profilde kalıcı liste için."""
        async with _get_connection(self.db_path, user_data=True) as db:
            cur = await db.execute(
                """SELECT d.id, d.movie_id, d.user_note, d.created_at, d.is_read,
                          u.id, u.username, u.name, u.picture, d.reaction
                   FROM direct_recommendations d JOIN users u ON u.id = d.receiver_id
                   WHERE d.sender_id = ?
                   ORDER BY d.created_at DESC LIMIT ?""",
                (user_id, limit),
            )
            rows = await cur.fetchall()
            return [{"id": r[0], "movie_id": r[1], "user_note": r[2], "created_at": r[3],
                     "is_read": bool(r[4]),
                     "receiver": {"id": r[5], "username": r[6], "name": r[7], "avatar": r[8]},
                     "reaction": r[9] if len(r) > 9 else None}
                    for r in rows]

    async def count_pending_requests(self, user_id: int) -> int:
        """Bana gelen bekleyen arkadaşlık isteklerinin sayısı."""
        async with _get_connection(self.db_path, user_data=True) as db:
            cur = await db.execute(
                "SELECT COUNT(*) FROM friendships WHERE friend_id = ? AND status = 'PENDING'",
                (user_id,),
            )
            row = await cur.fetchone()
            return row[0] if row else 0

    async def dismiss_recommendation(self, user_id: int, share_id: int) -> None:
        """Alıcı bir öneriyi kalıcı olarak gizler ('Okundu') — panelde bir daha görünmez."""
        async with _get_connection(self.db_path, user_data=True) as db:
            await db.execute(
                "UPDATE direct_recommendations SET is_read = 1, dismissed = 1 "
                "WHERE receiver_id = ? AND id = ?",
                (user_id, share_id),
            )
            await db.commit()

    async def mark_shares_read(self, user_id: int, share_ids: list = None) -> None:
        async with _get_connection(self.db_path, user_data=True) as db:
            if share_ids:
                placeholders = ",".join("?" for _ in share_ids)
                await db.execute(
                    f"UPDATE direct_recommendations SET is_read = 1 "
                    f"WHERE receiver_id = ? AND id IN ({placeholders})",
                    (user_id, *share_ids),
                )
            else:
                await db.execute(
                    "UPDATE direct_recommendations SET is_read = 1 WHERE receiver_id = ?",
                    (user_id,),
                )
            await db.commit()

    # ── Mood paylaşımı ─────────────────────────────────────────
    async def save_user_mood(self, user_id: int, mood_id: str) -> None:
        """Kullanıcının güncel mood'unu kaydet (UPSERT)."""
        async with _get_connection(self.db_path, user_data=True) as db:
            await db.execute(
                "INSERT INTO user_moods (user_id, mood_id, updated_at) VALUES (?, ?, datetime('now')) "
                "ON CONFLICT(user_id) DO UPDATE SET mood_id = excluded.mood_id, updated_at = excluded.updated_at",
                (user_id, mood_id),
            )
            await db.commit()

    async def get_friends_moods(self, user_id: int) -> list:
        """Arkadaşların son 7 gündeki mood seçimleri."""
        async with _get_connection(self.db_path, user_data=True) as db:
            cur = await db.execute(
                """SELECT u.id, u.username, u.name, u.picture, m.mood_id, m.updated_at
                   FROM user_moods m
                   JOIN users u ON u.id = m.user_id
                   JOIN friendships f ON (
                       (f.user_id = ? AND f.friend_id = m.user_id)
                       OR (f.friend_id = ? AND f.user_id = m.user_id)
                   )
                   WHERE f.status = 'ACCEPTED'
                     AND u.hide_activity = 0
                     AND m.updated_at > datetime('now', '-7 days')
                   ORDER BY m.updated_at DESC""",
                (user_id, user_id),
            )
            rows = await cur.fetchall()
            return [{"user_id": r[0], "username": r[1], "name": r[2], "avatar": r[3],
                     "mood_id": r[4], "updated_at": r[5]} for r in rows]

    # ── Öneri reaksiyonları ──────────────────────────────────
    async def set_recommendation_reaction(self, rec_id: int, user_id: int, reaction: str) -> bool:
        """Alıcı bir öneriye reaksiyon koyar."""
        async with _get_connection(self.db_path, user_data=True) as db:
            cur = await db.execute(
                "UPDATE direct_recommendations SET reaction = ? WHERE id = ? AND receiver_id = ?",
                (reaction, rec_id, user_id),
            )
            await db.commit()
            return cur.rowcount > 0

    async def is_auto_username(self, user_id: int) -> bool:
        """Kullanıcının username'i otomatik backfill mi (örn. email_123) yoksa custom mı?"""
        async with _get_connection(self.db_path, user_data=True) as db:
            cur = await db.execute("SELECT username FROM users WHERE id = ?", (user_id,))
            row = await cur.fetchone()
            if not row or not row[0]:
                return True
            un = row[0]
            # Otomatik format: <prefix>_<id> (ensure_username tarafından üretilir)
            return un.endswith(f"_{user_id}")

    async def set_custom_username(self, user_id: int, username: str) -> bool:
        """
        Kullanıcı adını güncelle.
        Benzersizlik çakışması varsa False döner, başarılı ise True.
        """
        async with _get_connection(self.db_path, user_data=True) as db:
            # Benzersizlik: aynı username başka birinde var mı?
            cur = await db.execute(
                "SELECT id FROM users WHERE lower(username) = ? AND id != ?",
                (username.lower(), user_id),
            )
            if await cur.fetchone():
                return False
            await db.execute("UPDATE users SET username = ? WHERE id = ?", (username, user_id))
            await db.commit()
            return True

    async def update_user_name(self, user_id: int, name: str):
        """Kullanıcının görüntü adını güncelle."""
        async with _get_connection(self.db_path, user_data=True) as db:
            await db.execute("UPDATE users SET name = ? WHERE id = ?", (name, user_id))
            await db.commit()

    async def update_user_picture(self, user_id: int, picture_url: str):
        """Kullanıcının profil fotoğrafı URL'sini güncelle."""
        async with _get_connection(self.db_path, user_data=True) as db:
            await db.execute("UPDATE users SET picture = ? WHERE id = ?", (picture_url, user_id))
            await db.commit()

    async def update_user_avatar_data(self, user_id: int, data: bytes):
        """Avatar binary verisini DB'ye kaydet (filesystem'siz kalıcı depolama).
        Kolon Turso'da yoksa (migration eksik) False döner, patlamaz."""
        try:
            async with _get_connection(self.db_path, user_data=True) as db:
                await db.execute(
                    "UPDATE users SET avatar_data = ? WHERE id = ?",
                    (base64.b64encode(data).decode(), user_id)
                )
                await db.commit()
            return True
        except Exception:
            return False

    async def get_user_avatar_data(self, user_id: int):
        """Avatar binary verisini DB'den oku. Yoksa None döner.

        Turso/SQLite blob'u bytes/memoryview döner; bazı kayıtlar (eski/karışık
        yazımlar) TEXT (base64 veya data-URL) olabilir — hepsini bytes'a çevir.
        Kolon Turso'da yoksa (migration eksik) None döner, patlamaz.
        """
        try:
            async with _get_connection(self.db_path, user_data=True) as db:
                cur = await db.execute(
                    "SELECT avatar_data FROM users WHERE id = ?", (user_id,)
                )
                row = await cur.fetchone()
        except Exception:
            return None
        if not row or row[0] is None:
            return None
        val = row[0]
        if isinstance(val, (bytes, bytearray, memoryview)):
            b = bytes(val)
            return b or None
        if isinstance(val, str):
            if not val:
                return None
            s = val.split(",", 1)[1] if val.startswith("data:") and "," in val else val
            try:
                return base64.b64decode(s)
            except Exception:
                return s.encode("latin-1", "ignore") or None
        return None

    async def remove_friend(self, user_id: int, friend_id: int) -> bool:
        """ACCEPTED arkadaşlık kaydını sil (iki yönlü kontrol)."""
        async with _get_connection(self.db_path, user_data=True) as db:
            cur = await db.execute(
                """DELETE FROM friendships
                   WHERE status = 'ACCEPTED'
                   AND ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?))""",
                (user_id, friend_id, friend_id, user_id),
            )
            await db.commit()
            return cur.rowcount > 0

    async def get_friends_activity(self, user_id: int, limit: int = 20) -> list:
        """Son 14 günde arkadaşların izlediği/kaydettiği filmler (hide_activity=0 olanlar)."""
        async with _get_connection(self.db_path, user_data=True) as db:
            cursor = await db.execute("""
                SELECT u.id, u.username, u.name, u.picture as avatar,
                       w.tmdb_id, w.title, w.poster_url,
                       w.watched,
                       COALESCE(w.watched_at, w.added_at) as action_at,
                       CASE WHEN w.watched = 1 THEN 'watched' ELSE 'saved' END as action_type
                FROM friendships f
                JOIN users u ON u.id = f.friend_id
                JOIN watchlist w ON w.user_id = f.friend_id
                WHERE f.user_id = ? AND f.status = 'ACCEPTED'
                  AND COALESCE(u.hide_activity, 0) = 0
                  AND w.added_at > datetime('now', '-14 days')
                ORDER BY action_at DESC
                LIMIT ?
            """, (user_id, limit))
            rows = await cursor.fetchall()
            return [
                {
                    "user_id": r[0], "username": r[1], "name": r[2], "avatar": r[3],
                    "tmdb_id": r[4], "title": r[5], "poster_url": r[6],
                    "watched": bool(r[7]), "action_at": r[8], "action_type": r[9],
                }
                for r in rows
            ]

    async def get_user_activity(self, user_id: int, limit: int = 20) -> list:
        """Tek kullanıcının son watchlist aktivitesi (sayfa/kullanıcı profili için)."""
        async with _get_connection(self.db_path, user_data=True) as db:
            cursor = await db.execute("""
                SELECT tmdb_id, title, poster_url, watched,
                       COALESCE(watched_at, added_at) as action_at,
                       CASE WHEN watched = 1 THEN 'watched' ELSE 'saved' END as action_type
                FROM watchlist WHERE user_id = ?
                  AND added_at > datetime('now', '-14 days')
                ORDER BY action_at DESC LIMIT ?
            """, (user_id, limit))
            rows = await cursor.fetchall()
            return [
                {
                    "tmdb_id": r[0], "title": r[1], "poster_url": r[2],
                    "watched": bool(r[3]), "action_at": r[4], "action_type": r[5],
                }
                for r in rows
            ]

    async def set_hide_activity(self, user_id: int, hide: bool) -> None:
        async with _get_connection(self.db_path, user_data=True) as db:
            await db.execute(
                "UPDATE users SET hide_activity = ? WHERE id = ?",
                (1 if hide else 0, user_id),
            )
            await db.commit()

    async def get_hide_activity(self, user_id: int) -> bool:
        async with _get_connection(self.db_path, user_data=True) as db:
            cursor = await db.execute(
                "SELECT COALESCE(hide_activity, 0) FROM users WHERE id = ?",
                (user_id,),
            )
            row = await cursor.fetchone()
            return bool(row[0]) if row else False

    async def get_movies_meta_by_ids(self, movie_ids: list) -> dict:
        """Toplu başlık/afiş çek: önce movie_repository, eksikler için movie_cache fallback."""
        if not movie_ids:
            return {}
        result: dict = {}
        placeholders = ",".join("?" for _ in movie_ids)

        # 1) movie_repository — küratörlü mood filmleri (poster_url direkt sütun)
        async with _get_connection(self.db_path) as db:
            cur = await db.execute(
                f"""SELECT tmdb_id, title, poster_url, vote_average, release_date
                    FROM movie_repository WHERE tmdb_id IN ({placeholders})""",
                tuple(movie_ids),
            )
            for r in await cur.fetchall():
                result[r[0]] = {"title": r[1], "poster_url": r[2],
                                "vote_average": r[3], "release_date": r[4]}

        # 2) movie_cache fallback — analiz edilmiş filmler (data JSON içinde poster_url)
        missing = [mid for mid in movie_ids if mid not in result]
        if missing:
            ph2 = ",".join("?" for _ in missing)
            async with _get_connection(self.db_path) as db:
                cur2 = await db.execute(
                    f"SELECT tmdb_id, title, data FROM movie_cache WHERE tmdb_id IN ({ph2})",
                    tuple(missing),
                )
                for r in await cur2.fetchall():
                    try:
                        data = json.loads(r[2]) if isinstance(r[2], str) else r[2]
                    except Exception:
                        data = {}
                    result[r[0]] = {
                        "title": data.get("title") or r[1],
                        "poster_url": data.get("poster_url"),
                        "vote_average": data.get("vote_average"),
                        "release_date": data.get("release_date"),
                    }

        # 3) watchlist fallback — kullanıcı defterine eklenmiş filmler
        still_missing = [mid for mid in movie_ids if mid not in result]
        if still_missing:
            ph3 = ",".join("?" for _ in still_missing)
            async with _get_connection(self.db_path, user_data=True) as db:
                cur3 = await db.execute(
                    f"""SELECT DISTINCT tmdb_id, title, poster_url
                        FROM watchlist WHERE tmdb_id IN ({ph3})""",
                    tuple(still_missing),
                )
                for r in await cur3.fetchall():
                    result[r[0]] = {
                        "title": r[1], "poster_url": r[2],
                        "vote_average": None, "release_date": None,
                    }

        return result

    # --- Watchlist (Defterim) Methods ---
    async def add_to_watchlist(self, tmdb_id: int, title: str, poster_url: str, user_id: int = 0):
        """Add a movie to the watchlist (kullanıcıya özel)."""
        async with _get_connection(self.db_path, user_data=True) as db:
            await db.execute(
                "INSERT OR IGNORE INTO watchlist (tmdb_id, title, poster_url, user_id) VALUES (?, ?, ?, ?)",
                (tmdb_id, title, poster_url, user_id)
            )
            await db.commit()

    async def remove_from_watchlist(self, tmdb_id: int, user_id: int = 0):
        """Remove a movie from the watchlist."""
        async with _get_connection(self.db_path, user_data=True) as db:
            await db.execute("DELETE FROM watchlist WHERE tmdb_id = ? AND user_id = ?", (tmdb_id, user_id))
            await db.commit()

    async def get_watchlist(self, user_id: int = 0) -> list:
        """Get all movies in the watchlist for a user (with personal notes + reaction)."""
        async with _get_connection(self.db_path, user_data=True) as db:
            cursor = await db.execute(
                """SELECT w.tmdb_id, w.title, w.poster_url, w.added_at, w.watched,
                          COALESCE(n.note_content, '') as personal_note, w.watched_at,
                          r.reaction
                   FROM watchlist w
                   LEFT JOIN movie_notes n ON w.tmdb_id = n.tmdb_id AND n.user_id = w.user_id
                   LEFT JOIN movie_ratings r ON w.tmdb_id = r.tmdb_id AND r.user_id = w.user_id
                   WHERE w.user_id = ? ORDER BY w.added_at DESC""",
                (user_id,)
            )
            rows = await cursor.fetchall()
            return [
                {"tmdb_id": r[0], "title": r[1], "poster_url": r[2],
                 "added_at": r[3], "watched": bool(r[4]),
                 "personal_note": r[5] or "",
                 "watched_at": r[6] if len(r) > 6 else None,
                 "reaction": r[7] if len(r) > 7 else None}
                for r in rows
            ]

    async def toggle_watched(self, tmdb_id: int, user_id: int = 0) -> bool:
        """Toggle watched status for a movie. Returns new watched state."""
        async with _get_connection(self.db_path, user_data=True) as db:
            cursor = await db.execute(
                "SELECT watched FROM watchlist WHERE tmdb_id = ? AND user_id = ?", (tmdb_id, user_id)
            )
            row = await cursor.fetchone()
            if not row:
                return False
            new_val = 0 if (row[0] or 0) else 1
            # İzlendi → zaman damgası set (added_at gibi DB-native); geri alınırsa temizle.
            if new_val:
                await db.execute(
                    "UPDATE watchlist SET watched = 1, watched_at = CURRENT_TIMESTAMP WHERE tmdb_id = ? AND user_id = ?",
                    (tmdb_id, user_id)
                )
            else:
                await db.execute(
                    "UPDATE watchlist SET watched = 0, watched_at = NULL WHERE tmdb_id = ? AND user_id = ?",
                    (tmdb_id, user_id)
                )
            await db.commit()
            return bool(new_val)

    async def is_in_watchlist(self, tmdb_id: int, user_id: int = 0) -> bool:
        """Check if a movie is in the watchlist."""
        async with _get_connection(self.db_path, user_data=True) as db:
            cursor = await db.execute(
                "SELECT 1 FROM watchlist WHERE tmdb_id = ? AND user_id = ?", (tmdb_id, user_id)
            )
            return await cursor.fetchone() is not None

    # --- Personal Notes Methods ---
    async def save_note(self, tmdb_id: int, note_content: str, user_id: int = 0):
        """Save or update a personal note for a movie."""
        async with _get_connection(self.db_path, user_data=True) as db:
            await db.execute(
                "INSERT OR REPLACE INTO movie_notes (tmdb_id, note_content, updated_at, user_id) VALUES (?, ?, CURRENT_TIMESTAMP, ?)",
                (tmdb_id, note_content, user_id)
            )
            await db.commit()

    async def get_note(self, tmdb_id: int, user_id: int = 0) -> Optional[str]:
        """Get the personal note for a movie."""
        async with _get_connection(self.db_path, user_data=True) as db:
            cursor = await db.execute(
                "SELECT note_content FROM movie_notes WHERE tmdb_id = ? AND user_id = ?", (tmdb_id, user_id)
            )
            row = await cursor.fetchone()
            return row[0] if row else None

    # --- Movie reaction (like/dislike) Methods ---
    async def save_rating(self, tmdb_id: int, rating: Optional[int], reaction: Optional[str], user_id: int):
        """Upsert kullanıcı beğenisi (rating parametresi artık kullanılmıyor)."""
        async with _get_connection(self.db_path, user_data=True) as db:
            await db.execute(
                """INSERT INTO movie_ratings (tmdb_id, user_id, reaction, updated_at)
                   VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                   ON CONFLICT(tmdb_id, user_id) DO UPDATE SET
                       reaction = excluded.reaction,
                       updated_at = CURRENT_TIMESTAMP""",
                (tmdb_id, user_id, reaction)
            )
            await db.commit()

    async def get_rating(self, tmdb_id: int, user_id: int) -> dict:
        """Get the user's reaction (like/dislike) for a movie."""
        async with _get_connection(self.db_path, user_data=True) as db:
            cursor = await db.execute(
                "SELECT reaction FROM movie_ratings WHERE tmdb_id = ? AND user_id = ?",
                (tmdb_id, user_id)
            )
            row = await cursor.fetchone()
            return {"reaction": row[0]} if row else {"reaction": None}

    # --- Custom Lists (kullanıcının kendi listeleri) Methods ---
    async def create_list(self, user_id: int, name: str, emoji: Optional[str] = None) -> Optional[int]:
        """Create a new custom list, return its id. (RETURNING → Turso + aiosqlite uyumlu;
        Turso HTTP cursor'unda lastrowid yok.)"""
        async with _get_connection(self.db_path, user_data=True) as db:
            cursor = await db.execute(
                "INSERT INTO user_lists (user_id, name, emoji) VALUES (?, ?, ?) RETURNING id",
                (user_id, name, emoji)
            )
            row = await cursor.fetchone()
            await db.commit()
            return row[0] if row else None

    async def rename_list(self, list_id: int, user_id: int, name: str, emoji: Optional[str] = None) -> bool:
        """Rename / re-emoji a list (only if owned). rowcount yerine açık sahiplik kontrolü."""
        async with _get_connection(self.db_path, user_data=True) as db:
            if not await self._owns_list(db, list_id, user_id):
                return False
            await db.execute(
                "UPDATE user_lists SET name = ?, emoji = ? WHERE id = ? AND user_id = ?",
                (name, emoji, list_id, user_id)
            )
            await db.commit()
            return True

    async def delete_list(self, list_id: int, user_id: int) -> bool:
        """Delete a list + its items (only if owned)."""
        async with _get_connection(self.db_path, user_data=True) as db:
            if not await self._owns_list(db, list_id, user_id):
                return False
            await db.execute("DELETE FROM list_items WHERE list_id = ?", (list_id,))
            await db.execute("DELETE FROM user_lists WHERE id = ? AND user_id = ?", (list_id, user_id))
            await db.commit()
            return True

    async def _owns_list(self, db, list_id: int, user_id: int) -> bool:
        cur = await db.execute(
            "SELECT 1 FROM user_lists WHERE id = ? AND user_id = ?", (list_id, user_id)
        )
        return await cur.fetchone() is not None

    async def get_lists(self, user_id: int) -> list:
        """All lists for a user with item count + up to 4 cover posters."""
        async with _get_connection(self.db_path, user_data=True) as db:
            cursor = await db.execute(
                "SELECT id, name, emoji, created_at FROM user_lists WHERE user_id = ? ORDER BY created_at DESC",
                (user_id,)
            )
            lists = await cursor.fetchall()
            result = []
            for lst in lists:
                lid = lst[0]
                cur2 = await db.execute(
                    "SELECT COUNT(*) FROM list_items WHERE list_id = ?", (lid,)
                )
                count = (await cur2.fetchone())[0]
                cur3 = await db.execute(
                    "SELECT poster_url FROM list_items WHERE list_id = ? AND poster_url IS NOT NULL ORDER BY added_at DESC LIMIT 4",
                    (lid,)
                )
                covers = [r[0] for r in await cur3.fetchall()]
                result.append({"id": lid, "name": lst[1], "emoji": lst[2],
                               "created_at": lst[3], "count": count, "covers": covers})
            return result

    async def get_list_items(self, list_id: int, user_id: int) -> Optional[dict]:
        """A list's header + its movies (None if not owned)."""
        async with _get_connection(self.db_path, user_data=True) as db:
            try:
                cur = await db.execute(
                    "SELECT id, name, emoji, is_public, slug FROM user_lists WHERE id = ? AND user_id = ?",
                    (list_id, user_id)
                )
                header = await cur.fetchone()
            except Exception:
                # is_public/slug kolonları henüz yoksa eski SELECT'e düş
                cur = await db.execute(
                    "SELECT id, name, emoji FROM user_lists WHERE id = ? AND user_id = ?",
                    (list_id, user_id)
                )
                header = await cur.fetchone()
                if header:
                    header = (*header, 0, None)
            if not header:
                return None
            cur2 = await db.execute(
                "SELECT tmdb_id, title, poster_url, added_at FROM list_items WHERE list_id = ? ORDER BY added_at DESC",
                (list_id,)
            )
            items = [
                {"tmdb_id": r[0], "title": r[1], "poster_url": r[2], "added_at": r[3]}
                for r in await cur2.fetchall()
            ]
            return {"id": header[0], "name": header[1], "emoji": header[2],
                    "is_public": bool(header[3]), "slug": header[4], "movies": items}

    async def add_to_list(self, list_id: int, user_id: int, tmdb_id: int, title: str, poster_url: Optional[str]) -> bool:
        """Add a movie to a list (only if owned). Returns False if not owned."""
        async with _get_connection(self.db_path, user_data=True) as db:
            if not await self._owns_list(db, list_id, user_id):
                return False
            await db.execute(
                "INSERT OR IGNORE INTO list_items (list_id, tmdb_id, title, poster_url) VALUES (?, ?, ?, ?)",
                (list_id, tmdb_id, title, poster_url)
            )
            await db.commit()
            return True

    async def remove_from_list(self, list_id: int, user_id: int, tmdb_id: int) -> bool:
        """Remove a movie from a list (only if owned)."""
        async with _get_connection(self.db_path, user_data=True) as db:
            if not await self._owns_list(db, list_id, user_id):
                return False
            await db.execute(
                "DELETE FROM list_items WHERE list_id = ? AND tmdb_id = ?", (list_id, tmdb_id)
            )
            await db.commit()
            return True

    # --- Future Plans Methods ---
    async def add_to_future(self, tmdb_id: int, title: str, poster_url: str, priority: int = 0, watch_date: str = None, notes: str = None, user_id: int = 0):
        """Add a movie to future plans."""
        async with _get_connection(self.db_path, user_data=True) as db:
            await db.execute(
                "INSERT OR REPLACE INTO future_plans (tmdb_id, title, poster_url, priority, watch_date, notes, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (tmdb_id, title, poster_url, priority, watch_date, notes, user_id)
            )
            await db.commit()

    async def remove_from_future(self, tmdb_id: int, user_id: int = 0):
        """Remove a movie from future plans."""
        async with _get_connection(self.db_path, user_data=True) as db:
            await db.execute("DELETE FROM future_plans WHERE tmdb_id = ? AND user_id = ?", (tmdb_id, user_id))
            await db.commit()

    async def get_future_plans(self, user_id: int = 0) -> list:
        """Get all movies in future plans, ordered by priority."""
        async with _get_connection(self.db_path, user_data=True) as db:
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
        async with _get_connection(self.db_path, user_data=True) as db:
            await db.execute("UPDATE future_plans SET priority = ? WHERE tmdb_id = ? AND user_id = ?", (priority, tmdb_id, user_id))
            await db.commit()

    async def update_future_date(self, tmdb_id: int, watch_date: str, user_id: int = 0):
        """Update watch date of a future plan."""
        async with _get_connection(self.db_path, user_data=True) as db:
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

    async def get_top_repository_movies_by_mood(self, mood_id: str, min_vote: float = 5.0, limit: int = 30, year_gte: int = None) -> list:
        """Fetch top N movies for a mood (LIMIT) — fast path for quick-mix.
        vote_count >= 50 filters out spam/adult 10-rated films with few votes.
        year_gte: optional minimum year filter (e.g. 2025 for recent films)."""
        query = """SELECT tmdb_id, title, poster_url, overview, release_date,
                          vote_average, genre_ids, backdrop_url, vote_count, original_language, popularity
                   FROM movie_repository
                   WHERE mood_id = ? AND vote_average >= ? AND vote_count >= 50"""
        params = [mood_id, min_vote]

        if year_gte:
            query += " AND CAST(SUBSTR(release_date, 1, 4) AS INTEGER) >= ?"
            params.append(year_gte)

        query += " ORDER BY vote_average DESC LIMIT ?"
        params.append(limit)

        async with _get_connection(self.db_path) as db:
            cursor = await db.execute(query, params)
            rows = await cursor.fetchall()
            return [{
                "id": r[0], "title": r[1], "poster_url": r[2],
                "overview": r[3], "release_date": r[4],
                "vote_average": r[5],
                "genre_ids": json.loads(r[6]) if r[6] else [],
                "backdrop_url": r[7],
                "vote_count": r[8] if len(r) > 8 else 0,
                "original_language": r[9] if len(r) > 9 else "",
                "popularity": r[10] if len(r) > 10 else 0,
            } for r in rows]

    async def get_top_scored_movies_by_mood(self, mood_id: str, min_vote: float = 5.0, limit: int = 30) -> list:
        """Fetch top N movies pre-sorted by mood_score (pre-computed). Fast — uses idx_repo_mood_score index.
        vote_count >= 50 filters out spam/adult films with inflated ratings."""
        async with _get_connection(self.db_path) as db:
            cursor = await db.execute(
                """SELECT tmdb_id, title, poster_url, overview, release_date,
                          vote_average, genre_ids, backdrop_url, vote_count,
                          original_language, popularity, mood_score
                   FROM movie_repository
                   WHERE mood_id = ? AND vote_average >= ? AND vote_count >= 50
                   ORDER BY mood_score DESC
                   LIMIT ?""",
                (mood_id, min_vote, limit)
            )
            rows = await cursor.fetchall()
            return [{
                "id": r[0], "title": r[1], "poster_url": r[2],
                "overview": r[3], "release_date": r[4],
                "vote_average": r[5],
                "genre_ids": json.loads(r[6]) if r[6] else [],
                "backdrop_url": r[7],
                "vote_count": r[8] if len(r) > 8 else 0,
                "original_language": r[9] if len(r) > 9 else "",
                "popularity": r[10] if len(r) > 10 else 0,
                "mood_score": r[11] if len(r) > 11 else 0.0,
            } for r in rows]

    async def get_tmdb_ids_by_mood(self, mood_id: str, limit: int = 200) -> list[int]:
        """Fetch distinct tmdb_ids for a given mood (LIMIT). Used by quiz vector averaging."""
        async with _get_connection(self.db_path) as db:
            cursor = await db.execute(
                "SELECT DISTINCT tmdb_id FROM movie_repository WHERE mood_id = ? ORDER BY vote_average DESC LIMIT ?",
                (mood_id, limit)
            )
            return [r[0] for r in await cursor.fetchall()]

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

            # Helper: parameterized NOT IN clause
            def _not_in_clause(ids_set):
                if not ids_set:
                    return "1=1", ()  # no exclusion
                ph = ','.join('?' * len(ids_set))
                return f"tmdb_id NOT IN ({ph})", tuple(ids_set)

            # 2. Title starts with query
            if len(results) < limit:
                excl_sql, excl_params = _not_in_clause(seen_ids)
                cursor = await db.execute(
                    f"""SELECT DISTINCT tmdb_id, title, poster_url, overview, release_date,
                              vote_average, genre_ids, backdrop_url, vote_count, original_language, popularity, mood_id
                       FROM movie_repository
                       WHERE LOWER(title) LIKE ? AND {excl_sql}
                       ORDER BY vote_average DESC LIMIT ?""",
                    (f"{q}%", *excl_params, limit - len(results))
                )
                for r in await cursor.fetchall():
                    if r[0] not in seen_ids:
                        seen_ids.add(r[0])
                        results.append(self._row_to_movie(r))

            # 3. Title contains query
            if len(results) < limit:
                excl_sql, excl_params = _not_in_clause(seen_ids)
                cursor = await db.execute(
                    f"""SELECT DISTINCT tmdb_id, title, poster_url, overview, release_date,
                              vote_average, genre_ids, backdrop_url, vote_count, original_language, popularity, mood_id
                       FROM movie_repository
                       WHERE LOWER(title) LIKE ? AND {excl_sql}
                       ORDER BY vote_average DESC LIMIT ?""",
                    (f"%{q}%", *excl_params, limit - len(results))
                )
                for r in await cursor.fetchall():
                    if r[0] not in seen_ids:
                        seen_ids.add(r[0])
                        results.append(self._row_to_movie(r))

            # 4. Try each word separately for multi-word queries
            if len(results) < limit and ' ' in q:
                words = [w for w in q.split() if len(w) >= 3]
                for word in words[:3]:
                    excl_sql, excl_params = _not_in_clause(seen_ids)
                    cursor = await db.execute(
                        f"""SELECT DISTINCT tmdb_id, title, poster_url, overview, release_date,
                                  vote_average, genre_ids, backdrop_url, vote_count, original_language, popularity, mood_id
                           FROM movie_repository
                           WHERE LOWER(title) LIKE ? AND {excl_sql}
                           ORDER BY vote_average DESC LIMIT ?""",
                        (f"%{word}%", *excl_params, limit - len(results))
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

    async def build_title_index(self) -> dict:
        """movie_repository başlıklarından bir-kez folded indeks (cache'li, bellek-içi).
        Anahtar: chat_engine._title_key(title) → {tmdb_id,title,genre_ids,vote_count,popularity}.
        Aynı anahtar çakışırsa popülerliği yüksek olanı tutar. ~22K giriş, hafif.
        "X gibi" / exact-title sorgularının TÜM sistem filmlerine çözülmesini sağlar."""
        if getattr(self, "_title_index", None) is not None:
            return self._title_index
        import logging
        from backend.services.chat_engine import _title_key
        index: dict = {}
        try:
            async with _get_connection(self.db_path) as db:
                cursor = await db.execute(
                    "SELECT tmdb_id, title, genre_ids, vote_count, popularity FROM movie_repository"
                )
                rows = await cursor.fetchall()
        except Exception as e:
            logging.getLogger("title_index").warning("[TitleIndex] build failed: %s", e)
            self._title_index = {}
            return self._title_index
        for tmdb_id, title, genre_ids, vote_count, popularity in rows:
            if not title:
                continue
            key = _title_key(title)
            if not key:
                continue
            pop = popularity or 0
            existing = index.get(key)
            if existing is not None and (existing.get("popularity") or 0) >= pop:
                continue
            try:
                gids = json.loads(genre_ids) if genre_ids else []
            except Exception:
                gids = []
            index[key] = {
                "tmdb_id": tmdb_id, "title": title, "genre_ids": gids,
                "vote_count": vote_count or 0, "popularity": pop,
            }
        self._title_index = index
        # Token ters-indeksi (kelime-bazlı typo fallback için): token → o token'ı
        # içeren başlık anahtarları. Sadece >=3 harfli token'lar (gürültüyü azalt).
        token_index: dict = {}
        for k in index:
            for tok in k.split():
                if len(tok) >= 3:
                    token_index.setdefault(tok, []).append(k)
        self._title_token_index = token_index
        self._title_vocab = list(token_index.keys())
        logging.getLogger("title_index").info("[TitleIndex] %d başlık indekslendi", len(index))
        return index

    async def resolve_title(self, text: str, min_ratio: float = 0.85):
        """Sorgu metnini yerel korpustaki bir filme çöz: önce exact (folded), sonra
        fuzzy (difflib >= min_ratio). Türkçe-duyarlı; tüm 22K sistem filmini kapsar.
        Dönüş: {tmdb_id,title,genre_ids,...} veya None."""
        from backend.services.chat_engine import _title_key
        key = _title_key(text)
        if not key or len(key) < 2:
            return None
        index = await self.build_title_index()
        if not index:
            return None
        hit = index.get(key)
        if hit:
            return hit
        # Fuzzy: en yakın anahtar (uzunluk-farkı ön filtresiyle hızlandırılır)
        from difflib import SequenceMatcher
        best, best_ratio = None, 0.0
        klen = len(key)
        for k, v in index.items():
            if abs(len(k) - klen) > 6:
                continue
            r = SequenceMatcher(None, key, k).ratio()
            if r > best_ratio:
                best_ratio, best = r, v
        if best and best_ratio >= min_ratio:
            return best

        # ── Kelime-bazlı typo fallback ──
        # Tam-string fuzzy başarısızsa (kelime sırası farklı / fazla-eksik kelime /
        # tek kelime bozuk) token örtüşmesiyle dene. Çok-kelimeli sorgular için.
        q_tokens = [t for t in key.split() if len(t) >= 3]
        if len(q_tokens) < 2:
            return None
        tok_index = getattr(self, "_title_token_index", None) or {}
        vocab = getattr(self, "_title_vocab", None) or []
        # Her sorgu token'ı için eşleşen başlık token'larını bul (exact + fuzzy)
        cand_counts: dict = {}
        for qt in q_tokens:
            matched_keys = set(tok_index.get(qt, ()))
            # Token exact yoksa, vocab içinde yakın token ara (tek bozuk kelime)
            if not matched_keys:
                qlen = len(qt)
                for vt in vocab:
                    if abs(len(vt) - qlen) > 2:
                        continue
                    if SequenceMatcher(None, qt, vt).ratio() >= 0.82:
                        matched_keys.update(tok_index.get(vt, ()))
            for mk in matched_keys:
                cand_counts[mk] = cand_counts.get(mk, 0) + 1
        if not cand_counts:
            return None
        # En çok token örtüşen aday; eşitlikte tam-string fuzzy'si yüksek olan
        need = max(2, (len(q_tokens) + 1) // 2)  # token'ların en az yarısı
        best_k, best_score = None, 0.0
        for mk, cnt in cand_counts.items():
            if cnt < need:
                continue
            coverage = cnt / len(q_tokens)
            sim = SequenceMatcher(None, key, mk).ratio()
            score = coverage * 0.7 + sim * 0.3
            if score > best_score:
                best_score, best_k = score, mk
        if best_k and best_score >= 0.6:
            return index.get(best_k)
        return None

    async def fetch_movies_by_exact_titles(self, titles: list, limit: int = 20) -> list:
        """
        Fetch movies by exact title match across the entire repository.
        Deduplicates by tmdb_id. Returns same format as get_repository_movies_paginated.
        Non-blocking: uses sync connection.
        """
        if not titles:
            return []
        placeholders = ",".join("?" * len(titles))
        lowered = [t.lower().strip() for t in titles]
        conn = self._sync_conn()
        try:
            rows = conn.execute(
                f"""SELECT tmdb_id, title, poster_url, overview, release_date,
                           vote_average, genre_ids, backdrop_url, vote_count,
                           original_language, popularity, mood_score
                    FROM movie_repository
                    WHERE LOWER(TRIM(title)) IN ({placeholders})
                    ORDER BY vote_average DESC
                    LIMIT ?""",
                lowered + [limit]
            ).fetchall()
        finally:
            conn.close()
        seen = set()
        movies = []
        for r in rows:
            if r[0] in seen:
                continue
            seen.add(r[0])
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
        return movies[:limit]

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
            "sipsak","deep-chills","kadraj-estetigi","geceyarisi-itirafi"
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

    async def remove_movies_from_repository(self, movie_ids: list, mood_id: str):
        """Remove specific movies from repository for a given mood."""
        if not movie_ids:
            return
        async with _get_connection(self.db_path) as db:
            placeholders = ",".join("?" * len(movie_ids))
            await db.execute(
                f"DELETE FROM movie_repository WHERE mood_id = ? AND tmdb_id IN ({placeholders})",
                [mood_id] + movie_ids
            )
            await db.commit()

    async def purge_low_quality_asian(self, min_vote_average: float = 7.2,
                                      min_vote_count: int = 600) -> dict:
        """Niş/obskür Doğu Asya (ja/ko/zh/cn) filmlerini repository'den temizle.
        Yalnız puanı/oy sayısı eşiği geçen tanınmış Asya filmleri kalır."""
        langs = ("ja", "ko", "zh", "cn")
        placeholders = ",".join("?" * len(langs))
        async with _get_connection(self.db_path) as db:
            cursor = await db.execute(
                f"SELECT COUNT(*) FROM movie_repository WHERE LOWER(original_language) IN ({placeholders})",
                list(langs))
            before = (await cursor.fetchone())[0]
            await db.execute(
                f"""DELETE FROM movie_repository
                    WHERE LOWER(original_language) IN ({placeholders})
                      AND NOT (vote_average >= ? AND vote_count >= ?)""",
                list(langs) + [min_vote_average, min_vote_count])
            await db.commit()
            cursor = await db.execute(
                f"SELECT COUNT(*) FROM movie_repository WHERE LOWER(original_language) IN ({placeholders})",
                list(langs))
            after = (await cursor.fetchone())[0]
        removed = before - after
        logger.info("[Cleanup] %d kalitesiz Asya filmi temizlendi (%d -> %d kaldı).",
                    removed, before, after)
        return {"asianBefore": before, "asianAfter": after, "removed": removed}

    async def remove_posterless_movies(self) -> int:
        """Remove all movies from repository where poster_url is NULL or empty. Returns count removed."""
        async with _get_connection(self.db_path) as db:
            cursor = await db.execute(
                "SELECT COUNT(*) FROM movie_repository WHERE poster_url IS NULL OR poster_url = ''"
            )
            count = (await cursor.fetchone())[0]
            if count > 0:
                await db.execute(
                    "DELETE FROM movie_repository WHERE poster_url IS NULL OR poster_url = ''"
                )
                await db.commit()
                logger.info("[Cleanup] %d poster'siz film temizlendi.", count)
            return count

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
                                    tr_min_vote_override: float = None,
                                    tr_genres: list = None,
                                    tr_min_vote_count: int = 5,
                                    with_runtime_lte: int = None) -> int:
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
            with_runtime_lte=with_runtime_lte,
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
                with_runtime_lte=strat.get("with_runtime_lte"),
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
            tr_g = tr_genres if tr_genres else genre_ids
            tr_movies = await tmdb_service.discover_pages_parallel(
                tr_g, list(range(1, tr_p + 1)),
                sort_by="vote_average.desc",
                min_vote_average=tr_min_vote,
                min_vote_count=tr_min_vote_count,
                with_keywords=with_keywords,
                without_genres=without_genres,
                with_origin_country="TR",
                with_original_language="tr",
                region="TR",
                primary_release_date_lte=primary_release_date_lte,
                primary_release_date_gte=primary_release_date_gte,
                with_runtime_lte=with_runtime_lte,
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
        """Collect a user's movie interaction signals for taste analysis.

        User tables (watchlist/future_plans/movie_notes) live in Turso;
        movie_cache is a shared local cache — so this reads from both.
        """
        signals = {}

        # ── User-specific signals (Turso when configured) ────────────────
        async with _get_connection(self.db_path, user_data=True) as db:
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

            # Movie notes (signal +3) — not METNİNİ de taşı (zevk haritası
            # duygu/tonu sıfır-maliyet çözümlemek için kullanır).
            cursor = await db.execute(
                "SELECT tmdb_id, note_content FROM movie_notes WHERE user_id = ?", (user_id,)
            )
            for row in await cursor.fetchall():
                tid = row[0]
                if tid not in signals:
                    signals[tid] = {"score": 0, "sources": []}
                signals[tid]["score"] += 3
                signals[tid]["sources"].append("note")
                if row[1]:
                    signals[tid]["note_text"] = row[1]

        # ── Analysis bonus: only for movies the user already interacted with ──
        # Previously this read the ENTIRE movie_cache table (shared pool),
        # inflating taste scores for users with zero defter entries.
        # Now: only give analysis bonus (+1) to movies already in the user's signals.
        if signals:
            user_tmdb_ids = list(signals.keys())
            async with _get_connection(self.db_path) as db:
                placeholders = ",".join("?" for _ in user_tmdb_ids)
                cursor = await db.execute(
                    f"SELECT tmdb_id FROM movie_cache WHERE tmdb_id IN ({placeholders})",
                    user_tmdb_ids
                )
                for row in await cursor.fetchall():
                    tid = row[0]
                    if tid in signals:
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
                    logger.warning("[DB] Failed to parse movie_cache JSON for tmdb_id=%s", r[0])
            return result
        finally:
            conn.close()

    async def get_movies_from_repository_batch(self, tmdb_ids: list) -> dict:
        """Batch fetch tmdb_id, mood_id, genre_ids, release_date, popularity from movie_repository.
        Returns {tmdb_id: {mood_id, genre_ids, release_date, popularity}}."""
        if not tmdb_ids:
            return {}
        conn = self._sync_conn()
        try:
            placeholders = ",".join("?" for _ in tmdb_ids)
            cursor = conn.execute(
                f"""SELECT tmdb_id, mood_id, genre_ids, release_date, popularity
                    FROM movie_repository
                    WHERE tmdb_id IN ({placeholders})""",
                tmdb_ids
            )
            result = {}
            for r in cursor.fetchall():
                tid = r[0]
                if tid not in result:
                    result[tid] = {
                        "mood_id": r[1],
                        "genre_ids": json.loads(r[2]) if r[2] else [],
                        "release_date": r[3] or "",
                        "popularity": r[4],
                    }
            return result
        finally:
            conn.close()

    # ──────────── Taste profile cache ────────────

    async def get_taste_profile(self, user_id: int) -> dict:
        """Get cached taste profile for user. Returns {} if not found."""
        async with _get_connection(self.db_path, user_data=True) as db:
            cursor = await db.execute(
                "SELECT profile_data, updated_at FROM user_taste_profiles WHERE user_id = ?",
                (user_id,)
            )
            row = await cursor.fetchone()
            if not row:
                return {}
            try:
                return {
                    "profile_data": json.loads(row[0]),
                    "updated_at": row[1],
                }
            except Exception:
                return {}

    async def save_taste_profile(self, user_id: int, profile_data: dict) -> None:
        """Save taste profile to cache. Call this after computing a fresh map."""
        async with _get_connection(self.db_path, user_data=True) as db:
            await db.execute(
                """INSERT OR REPLACE INTO user_taste_profiles (user_id, profile_data, updated_at)
                   VALUES (?, ?, CURRENT_TIMESTAMP)""",
                (user_id, json.dumps(profile_data, ensure_ascii=False))
            )
            await db.commit()

    async def invalidate_taste_profile(self, user_id: int) -> None:
        """Delete cached taste profile. Call when user modifies their list."""
        async with _get_connection(self.db_path, user_data=True) as db:
            await db.execute(
                "DELETE FROM user_taste_profiles WHERE user_id = ?",
                (user_id,)
            )
            await db.commit()

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
                                                sort_by: str = "recommended",
                                                min_vote_count: int = 0) -> dict:
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

        # WHERE clauses
        where_clauses = ["mood_id = ?", "vote_average >= ?", "COALESCE(mood_score, 0) >= ?", "poster_url IS NOT NULL AND poster_url != ''"]
        where_params = [mood_id, min_vote, min_mood_score]
        if min_vote_count > 0:
            where_clauses.append("vote_count >= ?")
            where_params.append(min_vote_count)
        where_sql = " AND ".join(where_clauses)

        conn = self._sync_conn()
        try:
            # Count total matching
            total = conn.execute(
                f"SELECT COUNT(*) FROM movie_repository WHERE {where_sql}",
                where_params
            ).fetchone()[0]

            # Fetch page
            rows = conn.execute(
                f"""SELECT tmdb_id, title, poster_url, overview, release_date,
                           vote_average, genre_ids, backdrop_url, vote_count,
                           original_language, popularity, mood_score
                    FROM movie_repository
                    WHERE {where_sql}
                    ORDER BY {order_by}
                    LIMIT ? OFFSET ?""",
                where_params + [per_page, offset]
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

    # ──────────── Semantic intent cache (Kafan mı Karışık?) ────────────

    async def get_recent_intent_cache(self, limit: int = 400) -> list:
        """Return recent cached (id, query_norm, tokens, intent_json) rows."""
        async with _get_connection(self.db_path) as db:
            cursor = await db.execute(
                """SELECT id, query_norm, tokens, intent_json
                   FROM mood_query_cache
                   ORDER BY last_used DESC LIMIT ?""",
                (limit,)
            )
            return await cursor.fetchall()

    async def save_intent_cache(self, query_norm: str, tokens_json: str,
                                intent_json: str):
        """Insert a new semantic-cache row; prune to the 1000 most useful."""
        async with _get_connection(self.db_path) as db:
            await db.execute(
                """INSERT INTO mood_query_cache (query_norm, tokens, intent_json)
                   VALUES (?, ?, ?)""",
                (query_norm, tokens_json, intent_json)
            )
            await db.execute(
                """DELETE FROM mood_query_cache WHERE id NOT IN (
                       SELECT id FROM mood_query_cache
                       ORDER BY hits DESC, last_used DESC LIMIT 1000
                   )"""
            )
            await db.commit()

    async def bump_intent_cache_hit(self, row_id: int):
        """Mark a cache row as freshly used (hit counter + recency)."""
        async with _get_connection(self.db_path) as db:
            await db.execute(
                """UPDATE mood_query_cache
                   SET hits = hits + 1, last_used = CURRENT_TIMESTAMP
                   WHERE id = ?""",
                (row_id,)
            )
            await db.commit()

    # ──────────── Üstad Notu pre-generation (warm pipeline) ────────────

    async def get_movies_needing_ustad_note(self, limit: int = 20) -> list:
        """Repository movies with NO cached analysis yet (Üstad Notu eksik).

        Returns [(tmdb_id, title)]. movie_cache PK = tmdb_id; bir kez
        üretilince burada artık görünmez (idempotent ısıtma)."""
        async with _get_connection(self.db_path) as db:
            cursor = await db.execute(
                """SELECT DISTINCT r.tmdb_id, r.title
                   FROM movie_repository r
                   LEFT JOIN movie_cache c ON r.tmdb_id = c.tmdb_id
                   WHERE c.tmdb_id IS NULL
                   LIMIT ?""",
                (limit,)
            )
            return await cursor.fetchall()

    # ──────────── FAST VECTOR SEARCH ─────────────────────────────────────────

    async def save_fast_search_row(
        self,
        tmdb_id: int,
        embedding_data: bytes,
        search_document: str,
        ustad_notu: str,
        title: str,
        poster_url: str,
        backdrop_url: str,
        overview: str,
        release_date: str,
        vote_average: float,
        genre_ids: list,
        primary_mood_id: str,
    ) -> None:
        """
        Upsert a movie embedding row into movie_fast_search.
        Idempotent — safe to call multiple times for the same tmdb_id.
        """
        async with _get_connection(self.db_path) as db:
            await db.execute(
                """INSERT INTO movie_fast_search (
                       tmdb_id, embedding_data, search_document, ustad_notu,
                       title, poster_url, backdrop_url, overview, release_date,
                       vote_average, genre_ids, primary_mood_id, updated_at
                   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                   ON CONFLICT(tmdb_id) DO UPDATE SET
                       embedding_data  = excluded.embedding_data,
                       search_document = excluded.search_document,
                       ustad_notu      = excluded.ustad_notu,
                       title           = excluded.title,
                       poster_url      = excluded.poster_url,
                       backdrop_url    = excluded.backdrop_url,
                       overview        = excluded.overview,
                       release_date    = excluded.release_date,
                       vote_average    = excluded.vote_average,
                       genre_ids       = excluded.genre_ids,
                       primary_mood_id = excluded.primary_mood_id,
                       updated_at      = CURRENT_TIMESTAMP
                """,
                (
                    tmdb_id, embedding_data, search_document, ustad_notu,
                    title, poster_url, backdrop_url, overview, release_date,
                    vote_average,
                    json.dumps(genre_ids, ensure_ascii=False),
                    primary_mood_id,
                ),
            )
            await db.commit()

    async def get_all_fast_search_rows(self) -> list[dict]:
        """
        Load all rows from movie_fast_search for in-memory embedding matrix.
        Returns list of dicts with raw embedding_data BLOBs.
        """
        async with _get_connection(self.db_path) as db:
            cursor = await db.execute(
                """SELECT tmdb_id, embedding_data, ustad_notu, title,
                          poster_url, backdrop_url, overview, release_date,
                          vote_average, genre_ids, primary_mood_id, original_language
                   FROM movie_fast_search
                   WHERE embedding_data IS NOT NULL
                   ORDER BY vote_average DESC"""
            )
            rows = await cursor.fetchall()

        result = []
        for r in rows:
            genre_ids = []
            try:
                genre_ids = json.loads(r[9]) if r[9] else []
            except Exception:
                logger.warning("[DB] Failed to parse genre_ids JSON for fast_search tmdb_id=%s", r[0])
            result.append({
                "tmdb_id":         r[0],
                "embedding_data":  r[1],
                "ustad_notu":      r[2] or "",
                "title":           r[3] or "",
                "poster_url":      r[4],
                "backdrop_url":    r[5],
                "overview":        r[6] or "",
                "release_date":    r[7] or "",
                "vote_average":    r[8] or 0.0,
                "genre_ids":       genre_ids,
                "primary_mood_id": r[10] or "",
                "original_language": r[11] if len(r) > 11 else "",
            })
        return result

    async def count_fast_search_rows(self) -> int:
        """Number of movies already embedded."""
        async with _get_connection(self.db_path) as db:
            cursor = await db.execute("SELECT COUNT(*) FROM movie_fast_search")
            row = await cursor.fetchone()
            return row[0] if row else 0

    async def get_unembedded_movies(self, limit: int = 200) -> list[dict]:
        """
        Return movies from movie_repository not yet present in movie_fast_search.
        Used by the background embedding job to find work.
        """
        async with _get_connection(self.db_path) as db:
            cursor = await db.execute(
                """SELECT DISTINCT r.tmdb_id, r.title, r.poster_url, r.backdrop_url,
                          r.overview, r.release_date, r.vote_average, r.genre_ids,
                          r.mood_id
                   FROM movie_repository r
                   LEFT JOIN movie_fast_search fs ON r.tmdb_id = fs.tmdb_id
                   WHERE fs.tmdb_id IS NULL
                     AND r.title IS NOT NULL
                     AND r.title != ''
                   ORDER BY r.vote_average DESC
                   LIMIT ?""",
                (limit,),
            )
            rows = await cursor.fetchall()

        result = []
        for r in rows:
            genre_ids = []
            try:
                genre_ids = json.loads(r[7]) if r[7] else []
            except Exception:
                logger.warning("[DB] Failed to parse genre_ids JSON for unembedded movie tmdb_id=%s", r[0])
            result.append({
                "tmdb_id":      r[0],
                "title":        r[1] or "",
                "poster_url":   r[2],
                "backdrop_url": r[3],
                "overview":     r[4] or "",
                "release_date": r[5] or "",
                "vote_average": r[6] or 0.0,
                "genre_ids":    genre_ids,
                "mood_id":      r[8] or "",
            })
        return result

    # ──────────────── TMDB Response Cache ────────────────

    async def get_tmdb_response(self, cache_key: str, max_age_hours: int = 24) -> Optional[dict]:
        """Get cached TMDB response if not stale. Uses SQLite datetime comparison."""
        async with _get_connection(self.db_path) as db:
            cursor = await db.execute(
                "SELECT data FROM tmdb_response_cache WHERE cache_key = ? "
                "AND (created_at IS NULL OR created_at > datetime('now', ?))",
                (cache_key, f'-{max_age_hours} hours')
            )
            row = await cursor.fetchone()
            return json.loads(row[0]) if row else None

    async def set_tmdb_response(self, cache_key: str, data: dict):
        """Cache a TMDB API response."""
        async with _get_connection(self.db_path) as db:
            await db.execute(
                "INSERT OR REPLACE INTO tmdb_response_cache (cache_key, data, created_at) VALUES (?, ?, CURRENT_TIMESTAMP)",
                (cache_key, json.dumps(data, ensure_ascii=False))
            )
            await db.commit()

    async def prune_tmdb_cache(self, max_age_hours: int = 48):
        """Remove stale entries from the TMDB response cache."""
        async with _get_connection(self.db_path) as db:
            await db.execute(
                "DELETE FROM tmdb_response_cache WHERE created_at < datetime('now', ?)",
                (f'-{max_age_hours} hours',)
            )
            await db.commit()

    async def prune_mood_query_cache(self, max_age_days: int = 30, max_rows: int = 10000):
        """Remove old mood query cache entries to prevent unbounded growth."""
        async with _get_connection(self.db_path) as db:
            await db.execute(
                "DELETE FROM mood_query_cache WHERE last_used < datetime('now', ?)",
                (f'-{max_age_days} days',)
            )
            await db.execute(
                """DELETE FROM mood_query_cache WHERE id NOT IN (
                    SELECT id FROM mood_query_cache ORDER BY hits DESC LIMIT ?
                )""", (max_rows,)
            )
            await db.commit()


cache = MovieCache()
