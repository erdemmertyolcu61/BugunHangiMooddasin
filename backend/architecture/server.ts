/**
 * SINEMOD — Express Server Entry Point
 * Wires together: PostgreSQL pool, embedding service, chat router, profile engine.
 *
 * Environment Variables Required:
 *   DATABASE_URL     — PostgreSQL connection string (with pgvector extension)
 *   OPENAI_API_KEY   — For text-embedding-3-large (or swap provider)
 *   JWT_SECRET       — For auth middleware (existing)
 *   PORT             — Server port (default: 8000)
 */

import express from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import { createChatRouter, createOpenAIEmbeddingService } from './chatRouter';
import { computeUserProfile } from './profileEngine';
import type { MovieMetadata, ProcessingResult } from './profileEngine';

// ════════════════════════════════════════════════════════════════
// 1. DATABASE POOL
// ════════════════════════════════════════════════════════════════

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,                    // connection pool ceiling
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
});

// Verify pgvector extension on startup
pool.query('SELECT 1 FROM pg_extension WHERE extname = $1', ['vector']).then((r) => {
  if (r.rows.length === 0) {
    console.error('FATAL: pgvector extension not installed. Run: CREATE EXTENSION IF NOT EXISTS pgvector;');
    process.exit(1);
  }
  console.log('[DB] pgvector extension verified.');
});


// ════════════════════════════════════════════════════════════════
// 2. EXPRESS APP
// ════════════════════════════════════════════════════════════════

const app = express();

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));


// ════════════════════════════════════════════════════════════════
// 3. MOUNT CHAT ROUTER
// ════════════════════════════════════════════════════════════════

const embeddingService = createOpenAIEmbeddingService(
  process.env.OPENAI_API_KEY || '',
);

const chatRouter = createChatRouter({ pool, embeddingService });
app.use(chatRouter);


// ════════════════════════════════════════════════════════════════
// 4. TASTE MAP ENDPOINT (uses TypeScript profile engine)
// ════════════════════════════════════════════════════════════════

/**
 * GET /api/user/taste-map
 * Mirrors the existing Python endpoint but uses the TS profile engine.
 * Requires JWT auth middleware (not shown — use existing implementation).
 */
app.get('/api/user/taste-map', async (req, res) => {
  try {
    // TODO: Extract user_id from JWT (use existing auth middleware)
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ error: 'Auth required.' });
    }

    // Fetch user's defter movies with metadata
    const watchlistResult = await pool.query(
      `SELECT w.tmdb_id, w.watched, m.title, m.mood_ids, m.genres, m.genre_ids,
              m.tempo, m.focus, m.release_year, m.vote_average
       FROM watchlist w
       JOIN movies m ON m.tmdb_id = w.tmdb_id
       WHERE w.user_id = $1`,
      [userId],
    );

    const allDefter: MovieMetadata[] = watchlistResult.rows.map((r: any) => ({
      id: r.tmdb_id,
      tmdb_id: r.tmdb_id,
      title: r.title,
      mood_ids: r.mood_ids || [],
      genres: r.genres || [],
      genre_ids: r.genre_ids || [],
      tempo: r.tempo || 'balanced',
      focus: r.focus || 'plot',
      release_year: r.release_year || 0,
      vote_average: r.vote_average,
    }));

    const watched = allDefter.filter((_, i) => watchlistResult.rows[i].watched);

    // Future plans
    const futureResult = await pool.query(
      `SELECT f.tmdb_id, m.title, m.mood_ids, m.genres, m.genre_ids,
              m.tempo, m.focus, m.release_year, m.vote_average
       FROM future_plans f
       JOIN movies m ON m.tmdb_id = f.tmdb_id
       WHERE f.user_id = $1`,
      [userId],
    );

    const futurePlan: MovieMetadata[] = futureResult.rows.map((r: any) => ({
      id: r.tmdb_id,
      tmdb_id: r.tmdb_id,
      title: r.title,
      mood_ids: r.mood_ids || [],
      genres: r.genres || [],
      genre_ids: r.genre_ids || [],
      tempo: r.tempo || 'balanced',
      focus: r.focus || 'plot',
      release_year: r.release_year || 0,
      vote_average: r.vote_average,
    }));

    // Notes
    const notesResult = await pool.query(
      'SELECT tmdb_id FROM movie_notes WHERE user_id = $1',
      [userId],
    );
    const notedIds = new Set<number>(notesResult.rows.map((r: any) => r.tmdb_id));

    // ── Run the pure computation engine ──
    const profile: ProcessingResult = computeUserProfile(
      allDefter,
      watched,
      futurePlan,
      notedIds,
    );

    // Map to existing frontend API contract
    return res.status(200).json({
      summary: profile.ustadReviews,
      top_moods: profile.moodMatrix.slice(0, 5).map((m) => ({
        mood_id: m.mood_id,
        title: m.title,
        score: m.score,
      })),
      top_genres: profile.topGenres,
      era_preferences: {
        pre_1990: profile.eraPreferences.pre_1990,
        '1991_2009': profile.eraPreferences.mid_1991_2009,
        '2010_plus': profile.eraPreferences.post_2010,
        recent_5_years: profile.eraPreferences.recent_5_years,
      },
      signals: profile.signals,
      confidence: profile.confidence,
    });

  } catch (error) {
    console.error('Taste map error:', error);
    return res.status(500).json({
      summary: [],
      top_moods: [],
      top_genres: [],
      era_preferences: {},
      signals: { total_movies: 0, watchlist_count: 0, future_count: 0, notes_count: 0 },
      confidence: 'low',
      error: String(error),
    });
  }
});


// ════════════════════════════════════════════════════════════════
// 5. HEALTH CHECK
// ════════════════════════════════════════════════════════════════

app.get('/api/health', async (_req, res) => {
  try {
    const dbCheck = await pool.query('SELECT COUNT(*) as count FROM movies');
    const movieCount = dbCheck.rows[0]?.count || 0;
    return res.json({
      status: 'ok',
      movies_indexed: movieCount,
      pgvector: true,
      timestamp: new Date().toISOString(),
    });
  } catch {
    return res.status(500).json({ status: 'error', pgvector: false });
  }
});


// ════════════════════════════════════════════════════════════════
// 6. START
// ════════════════════════════════════════════════════════════════

const PORT = parseInt(process.env.PORT || '8000', 10);

app.listen(PORT, () => {
  console.log(`[Sinemod] Hybrid engine running on port ${PORT}`);
  console.log(`[Sinemod] pgvector cosine search + GIN array filters active`);
});

export { app, pool };
