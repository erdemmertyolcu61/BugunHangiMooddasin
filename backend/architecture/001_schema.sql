-- ============================================================================
-- SINEMOD — PostgreSQL + pgvector Schema
-- Hybrid vector-relational architecture for 65K+ cinematic works
-- Run against a PostgreSQL 15+ instance with pgvector extension installed.
-- ============================================================================

-- 0. Extensions
CREATE EXTENSION IF NOT EXISTS pgvector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- trigram fuzzy text search

-- 1. Custom Enums
DO $$ BEGIN
  CREATE TYPE movie_tempo  AS ENUM ('slow', 'balanced', 'fast');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE movie_focus  AS ENUM ('character', 'plot', 'visual');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE progression_tier AS ENUM ('Empty', 'Oluşuyor', 'Olgun');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================================
-- 2. Core Movies Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS movies (
  id              SERIAL PRIMARY KEY,
  tmdb_id         INT UNIQUE NOT NULL,
  title           VARCHAR(512) NOT NULL,
  title_tr        VARCHAR(512),                        -- Turkish title alias
  directors       VARCHAR(255)[] NOT NULL DEFAULT '{}', -- array for multi-director
  actors          VARCHAR(255)[] NOT NULL DEFAULT '{}', -- lead + supporting cast
  genres          VARCHAR(100)[] NOT NULL DEFAULT '{}', -- e.g. {'Drama','Sci-Fi'}
  genre_ids       INT[]          NOT NULL DEFAULT '{}', -- TMDB numeric genre IDs
  mood_ids        VARCHAR(100)[] NOT NULL DEFAULT '{}', -- e.g. {'battaniye','gozyasi'}
  tempo           movie_tempo    NOT NULL DEFAULT 'balanced',
  focus           movie_focus    NOT NULL DEFAULT 'plot',
  release_year    INT            NOT NULL DEFAULT 0,
  vote_average    NUMERIC(3,1)   DEFAULT 0.0,
  popularity      NUMERIC(10,2)  DEFAULT 0.0,
  poster_path     VARCHAR(255),
  backdrop_path   VARCHAR(255),
  overview        TEXT,
  overview_tr     TEXT,                                 -- Turkish overview
  ustad_notu      TEXT           NOT NULL DEFAULT '',   -- Pre-baked 1-sentence expert opinion
  search_document TEXT           NOT NULL DEFAULT '',   -- Compiled metadata string for vectorizer
  embedding       vector(1536),                         -- text-embedding-3-large compatible
  keywords        JSONB          DEFAULT '[]',          -- TMDB keyword objects
  mood_scores     JSONB          DEFAULT '{}',          -- { "battaniye": 72, "gece": 45, ... }
  created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- Unique constraint on tmdb_id already exists via UNIQUE above


-- ============================================================================
-- 3. Users Table (mirrors current JWT/Google OAuth flow)
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
  id              SERIAL PRIMARY KEY,
  google_id       VARCHAR(255) UNIQUE NOT NULL,
  email           VARCHAR(255) NOT NULL,
  name            VARCHAR(255),
  picture         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================================
-- 4. User Watchlist (Defter)
-- ============================================================================
CREATE TABLE IF NOT EXISTS watchlist (
  id              SERIAL PRIMARY KEY,
  user_id         INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tmdb_id         INT NOT NULL,
  watched         BOOLEAN NOT NULL DEFAULT FALSE,
  priority        INT DEFAULT 0,
  added_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  watched_at      TIMESTAMPTZ,
  UNIQUE(user_id, tmdb_id)
);


-- ============================================================================
-- 5. Movie Notes
-- ============================================================================
CREATE TABLE IF NOT EXISTS movie_notes (
  id              SERIAL PRIMARY KEY,
  user_id         INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tmdb_id         INT NOT NULL,
  note_text       TEXT NOT NULL DEFAULT '',
  rating          NUMERIC(2,1),                        -- user's 1-10 rating
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, tmdb_id)
);


-- ============================================================================
-- 6. Future Plans
-- ============================================================================
CREATE TABLE IF NOT EXISTS future_plans (
  id              SERIAL PRIMARY KEY,
  user_id         INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tmdb_id         INT NOT NULL,
  priority        INT DEFAULT 0,
  added_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, tmdb_id)
);


-- ============================================================================
-- 7. User Taste Profile (Materialized / Cached)
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_taste_profiles (
  user_id         INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  tier            progression_tier NOT NULL DEFAULT 'Empty',
  total_signals   INT NOT NULL DEFAULT 0,
  top_moods       JSONB DEFAULT '[]',      -- [{mood_id, title, score}, ...]
  top_genres      JSONB DEFAULT '[]',      -- [{genre_id, name, score}, ...]
  era_preferences JSONB DEFAULT '{}',      -- {pre_1990, mid, post_2000, recent}
  summary         JSONB DEFAULT '[]',      -- Array of Ustad summary strings
  mood_matrix     JSONB DEFAULT '{}',      -- {battaniye: 12, gece: 7, ...} full scores
  confidence      VARCHAR(10) DEFAULT 'low',
  computed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================================
-- 8. Chat Sessions (for anti-repetition and context)
-- ============================================================================
CREATE TABLE IF NOT EXISTS chat_sessions (
  id              SERIAL PRIMARY KEY,
  user_id         INT REFERENCES users(id) ON DELETE SET NULL,
  session_key     VARCHAR(128) NOT NULL,               -- anonymous or user-based
  recommended_ids INT[] DEFAULT '{}',                   -- anti-repetition buffer
  last_query      TEXT,
  last_mood_id    VARCHAR(100),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================================
-- 9. INDEXING STRATEGY
-- ============================================================================

-- A. HNSW vector index — cosine distance for semantic similarity
--    ef_construction=128 gives strong recall on 65K rows; m=16 balances speed/memory
CREATE INDEX IF NOT EXISTS idx_movies_embedding_hnsw
  ON movies USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 128);

-- B. GIN array indexes — O(1) containment checks on metadata arrays
CREATE INDEX IF NOT EXISTS idx_movies_mood_ids     ON movies USING GIN (mood_ids);
CREATE INDEX IF NOT EXISTS idx_movies_actors       ON movies USING GIN (actors);
CREATE INDEX IF NOT EXISTS idx_movies_directors    ON movies USING GIN (directors);
CREATE INDEX IF NOT EXISTS idx_movies_genres       ON movies USING GIN (genres);
CREATE INDEX IF NOT EXISTS idx_movies_genre_ids    ON movies USING GIN (genre_ids);

-- C. GIN trigram index for fuzzy title search
CREATE INDEX IF NOT EXISTS idx_movies_title_trgm   ON movies USING GIN (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_movies_title_tr_trgm ON movies USING GIN (title_tr gin_trgm_ops);

-- D. B-tree indexes for filtered scans
CREATE INDEX IF NOT EXISTS idx_movies_release_year ON movies (release_year);
CREATE INDEX IF NOT EXISTS idx_movies_tmdb_id      ON movies (tmdb_id);
CREATE INDEX IF NOT EXISTS idx_movies_tempo        ON movies (tempo);
CREATE INDEX IF NOT EXISTS idx_movies_focus        ON movies (focus);
CREATE INDEX IF NOT EXISTS idx_movies_vote_avg     ON movies (vote_average DESC);

-- E. User relation indexes
CREATE INDEX IF NOT EXISTS idx_watchlist_user       ON watchlist (user_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_tmdb       ON watchlist (tmdb_id);
CREATE INDEX IF NOT EXISTS idx_movie_notes_user     ON movie_notes (user_id);
CREATE INDEX IF NOT EXISTS idx_future_plans_user    ON future_plans (user_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_key    ON chat_sessions (session_key);

-- F. JSONB index on mood_scores for advanced taste queries
CREATE INDEX IF NOT EXISTS idx_movies_mood_scores  ON movies USING GIN (mood_scores);


-- ============================================================================
-- 10. Helper Functions
-- ============================================================================

-- search_document builder: call after INSERT/UPDATE to compile the metadata blob
CREATE OR REPLACE FUNCTION build_search_document(m movies) RETURNS TEXT AS $$
BEGIN
  RETURN format(
    'Title: %s. Turkish Title: %s. Directed by: %s. Cast: %s. Genres: %s. Mood Trait: %s. Aesthetic: %s paced, %s driven film. Year: %s. Overview: %s',
    m.title,
    COALESCE(m.title_tr, ''),
    array_to_string(m.directors, ', '),
    array_to_string(m.actors, ', '),
    array_to_string(m.genres, ', '),
    array_to_string(m.mood_ids, ', '),
    m.tempo::text,
    m.focus::text,
    m.release_year::text,
    COALESCE(LEFT(m.overview, 300), '')
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Auto-update search_document on insert/update
CREATE OR REPLACE FUNCTION trg_build_search_document() RETURNS TRIGGER AS $$
BEGIN
  NEW.search_document := build_search_document(NEW);
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_movies_search_doc ON movies;
CREATE TRIGGER trg_movies_search_doc
  BEFORE INSERT OR UPDATE ON movies
  FOR EACH ROW EXECUTE FUNCTION trg_build_search_document();


-- ============================================================================
-- 11. Taste Profile Tier Function
-- ============================================================================
CREATE OR REPLACE FUNCTION compute_progression_tier(signal_count INT) RETURNS progression_tier AS $$
BEGIN
  IF signal_count = 0 THEN RETURN 'Empty';
  ELSIF signal_count <= 5 THEN RETURN 'Oluşuyor';
  ELSE RETURN 'Olgun';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
