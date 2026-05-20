/**
 * SINEMOD — Hybrid Chat Routing & Semantic Matching Engine
 * Express router that resolves natural Turkish chat queries combining:
 *   - Abstract moods ("içimi ısıtacak hüzünlü")
 *   - Actor names ("Leonardo DiCaprio filmleri")
 *   - Director styles ("Nolan tarzı akıl oyunları")
 *   - Metadata filters ("yavaş tempolu dramalar", "90 öncesi klasikler")
 *
 * Architecture:
 *   1. Intent detection (regex + keyword routing)
 *   2. Query → embedding via embedding service (text-embedding-3-large)
 *   3. Hybrid SQL: pgvector cosine similarity + relational array filters
 *   4. Pre-baked ustad_notu returned per result (zero LLM at read time)
 *
 * Dependencies: pg (or pg-promise), express, embedding service
 */

import { Router, Request, Response } from 'express';
import type { Pool, QueryResult } from 'pg';

// ════════════════════════════════════════════════════════════════
// 1. TYPE DEFINITIONS
// ════════════════════════════════════════════════════════════════

interface RecommendedMovie {
  id: number;
  tmdb_id: number;
  title: string;
  title_tr: string | null;
  directors: string[];
  actors: string[];
  genres: string[];
  mood_ids: string[];
  tempo: string;
  focus: string;
  release_year: number;
  vote_average: number;
  poster_path: string | null;
  backdrop_path: string | null;
  ustad_notu: string;
  distance: number;
}

interface IntentSignals {
  hasActorQuery: boolean;
  hasDirectorQuery: boolean;
  hasTempoFilter: boolean;
  hasEraFilter: boolean;
  hasMoodKeyword: boolean;
  extractedActors: string[];
  extractedDirectors: string[];
  tempoFilter: string | null;
  eraFilter: { min?: number; max?: number } | null;
  moodFilter: string[];
}

interface EmbeddingService {
  getEmbedding(text: string): Promise<number[]>;
}

interface ChatRouterDeps {
  pool: Pool;
  embeddingService: EmbeddingService;
}

// ════════════════════════════════════════════════════════════════
// 2. TURKISH INTENT DETECTION ENGINE
// ════════════════════════════════════════════════════════════════

/**
 * Known actor/director name patterns for Turkish chat.
 * This is a lightweight regex-based detector — the heavy lifting
 * is done by vector similarity (names are in search_document).
 */
const DIRECTOR_KEYWORDS = [
  'yönetmen', 'yönetmenin', 'tarzı', 'tarzında', 'çektiği',
  'filmografisi', 'yönetti',
];

const ACTOR_KEYWORDS = [
  'oynadığı', 'oyuncusu', 'filmleri', 'başrol', 'rol aldığı',
  'oynayan', 'oyuncu',
];

const TEMPO_MAP: Record<string, string> = {
  'yavaş': 'slow', 'sakin': 'slow', 'ağır': 'slow', 'dinlendirici': 'slow',
  'hızlı': 'fast', 'tempolu': 'fast', 'enerjik': 'fast', 'aksiyon dolu': 'fast',
  'dengeli': 'balanced', 'orta': 'balanced',
};

const ERA_PATTERNS: Array<{ pattern: RegExp; min?: number; max?: number }> = [
  { pattern: /90\s*öncesi|1990\s*öncesi|klasik/i, max: 1990 },
  { pattern: /80['']?ler|1980/i, min: 1980, max: 1989 },
  { pattern: /90['']?lar|1990/i, min: 1990, max: 1999 },
  { pattern: /2000['']?ler|2000\s*sonrası/i, min: 2000, max: 2009 },
  { pattern: /yeni|güncel|son\s*dönem|2020/i, min: 2020 },
];

const MOOD_KEYWORD_MAP: Record<string, string[]> = {
  battaniye:     ['sıcak', 'rahat', 'huzurlu', 'battaniye', 'cozy', 'ısıtacak'],
  gece:          ['karanlık', 'gece', 'noir', 'loş', 'kasvetli'],
  gozyasi:       ['hüzünlü', 'ağlatacak', 'duygusal', 'gözyaşı', 'üzücü', 'dokunaklı'],
  askbahcesi:    ['romantik', 'aşk', 'sevgi', 'love'],
  kahkaha:       ['komik', 'güldüren', 'komedi', 'eğlenceli', 'kahkaha'],
  adrenalin:     ['adrenalin', 'heyecanlı', 'gerilimli', 'aksiyon'],
  yolculuk:      ['macera', 'yolculuk', 'keşif', 'epik'],
  zamanyolcusu:  ['zaman', 'retro', 'nostaljik', 'eski'],
  sessiz:        ['sessiz', 'minimal', 'yavaş', 'sanat filmi'],
  zihin:         ['zihin', 'akıl', 'bulmaca', 'twist', 'beyin'],
  kalp:          ['bağımsız', 'indie', 'festival', 'küçük'],
  karmakar:      ['karışık', 'tür karıştıran', 'farklı', 'deneysel'],
  'deep-chills': ['korku', 'ürpertici', 'gerilim', 'korkunç', 'ürkütücü'],
};

function detectIntent(query: string): IntentSignals {
  const lower = query.toLowerCase().trim();
  const signals: IntentSignals = {
    hasActorQuery: false,
    hasDirectorQuery: false,
    hasTempoFilter: false,
    hasEraFilter: false,
    hasMoodKeyword: false,
    extractedActors: [],
    extractedDirectors: [],
    tempoFilter: null,
    eraFilter: null,
    moodFilter: [],
  };

  // Director detection
  if (DIRECTOR_KEYWORDS.some((kw) => lower.includes(kw))) {
    signals.hasDirectorQuery = true;
    // Extract proper nouns before director keywords (simple heuristic)
    const dirMatch = lower.match(/([A-ZÇĞİÖŞÜa-zçğıöşü]+(?:\s+[A-ZÇĞİÖŞÜa-zçğıöşü]+)*)\s+(?:tarzı|tarzında|yönetmen|filmleri)/i);
    if (dirMatch) {
      signals.extractedDirectors.push(dirMatch[1].trim());
    }
  }

  // Actor detection
  if (ACTOR_KEYWORDS.some((kw) => lower.includes(kw))) {
    signals.hasActorQuery = true;
    const actMatch = lower.match(/([A-ZÇĞİÖŞÜa-zçğıöşü]+(?:\s+[A-ZÇĞİÖŞÜa-zçğıöşü]+)*)\s+(?:filmleri|oynadığı|oyuncusu)/i);
    if (actMatch) {
      signals.extractedActors.push(actMatch[1].trim());
    }
  }

  // Tempo detection
  for (const [tr, en] of Object.entries(TEMPO_MAP)) {
    if (lower.includes(tr)) {
      signals.hasTempoFilter = true;
      signals.tempoFilter = en;
      break;
    }
  }

  // Era detection
  for (const era of ERA_PATTERNS) {
    if (era.pattern.test(lower)) {
      signals.hasEraFilter = true;
      signals.eraFilter = { min: era.min, max: era.max };
      break;
    }
  }

  // Mood keyword detection
  for (const [moodId, keywords] of Object.entries(MOOD_KEYWORD_MAP)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      signals.hasMoodKeyword = true;
      signals.moodFilter.push(moodId);
    }
  }

  return signals;
}

// ════════════════════════════════════════════════════════════════
// 3. HYBRID SQL QUERY BUILDER
// ════════════════════════════════════════════════════════════════

interface HybridQueryParams {
  queryVector: number[];
  intent: IntentSignals;
  excludeIds: number[];
  limit: number;
  distanceThreshold: number;
}

function buildHybridQuery(params: HybridQueryParams): { text: string; values: unknown[] } {
  const { queryVector, intent, excludeIds, limit, distanceThreshold } = params;

  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIdx = 1;

  // $1 = query vector (always present)
  values.push(JSON.stringify(queryVector));
  const vectorParam = `$${paramIdx++}`;

  // Distance threshold filter
  conditions.push(`(embedding <=> ${vectorParam}::vector) < $${paramIdx}`);
  values.push(distanceThreshold);
  paramIdx++;

  // Exclude already-recommended IDs (anti-repetition)
  if (excludeIds.length > 0) {
    conditions.push(`id != ALL($${paramIdx}::int[])`);
    values.push(excludeIds);
    paramIdx++;
  }

  // Relational filters from intent detection
  if (intent.hasActorQuery && intent.extractedActors.length > 0) {
    // Use array overlap: actors && ARRAY[...]
    conditions.push(`actors && $${paramIdx}::varchar[]`);
    values.push(intent.extractedActors);
    paramIdx++;
  }

  if (intent.hasDirectorQuery && intent.extractedDirectors.length > 0) {
    conditions.push(`directors && $${paramIdx}::varchar[]`);
    values.push(intent.extractedDirectors);
    paramIdx++;
  }

  if (intent.hasTempoFilter && intent.tempoFilter) {
    conditions.push(`tempo = $${paramIdx}::movie_tempo`);
    values.push(intent.tempoFilter);
    paramIdx++;
  }

  if (intent.hasEraFilter && intent.eraFilter) {
    if (intent.eraFilter.min) {
      conditions.push(`release_year >= $${paramIdx}`);
      values.push(intent.eraFilter.min);
      paramIdx++;
    }
    if (intent.eraFilter.max) {
      conditions.push(`release_year <= $${paramIdx}`);
      values.push(intent.eraFilter.max);
      paramIdx++;
    }
  }

  if (intent.hasMoodKeyword && intent.moodFilter.length > 0) {
    // mood_ids array must overlap with detected moods
    conditions.push(`mood_ids && $${paramIdx}::varchar[]`);
    values.push(intent.moodFilter);
    paramIdx++;
  }

  // Limit param
  values.push(limit);
  const limitParam = `$${paramIdx}`;

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const text = `
    SELECT
      id, tmdb_id, title, title_tr,
      directors, actors, genres, mood_ids,
      tempo, focus, release_year, vote_average,
      poster_path, backdrop_path,
      ustad_notu,
      (embedding <=> ${vectorParam}::vector) AS distance
    FROM movies
    ${whereClause}
    ORDER BY distance ASC
    LIMIT ${limitParam};
  `;

  return { text, values };
}


// ════════════════════════════════════════════════════════════════
// 4. EXPRESS ROUTER
// ════════════════════════════════════════════════════════════════

export function createChatRouter({ pool, embeddingService }: ChatRouterDeps): Router {
  const router = Router();

  /**
   * POST /api/chat/recommend
   * Body: { message: string, sessionKey?: string }
   *
   * Returns top 5 semantically + relationally matched movies with
   * pre-baked ustad_notu for each.
   */
  router.post('/api/chat/recommend', async (req: Request, res: Response) => {
    try {
      const { message, sessionKey } = req.body as {
        message?: string;
        sessionKey?: string;
      };

      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Mesaj boş bırakılamaz evlat.',
        });
      }

      const sanitizedMessage = message.trim().slice(0, 500); // cap input length

      // ── Step 1: Detect intent from Turkish natural language ──
      const intent = detectIntent(sanitizedMessage);

      // ── Step 2: Get embedding vector (~50ms with cached model) ──
      const queryVector = await embeddingService.getEmbedding(sanitizedMessage);

      // ── Step 3: Load anti-repetition buffer from session ──
      let excludeIds: number[] = [];
      if (sessionKey) {
        const sessionResult = await pool.query(
          'SELECT recommended_ids FROM chat_sessions WHERE session_key = $1',
          [sessionKey],
        );
        if (sessionResult.rows.length > 0) {
          excludeIds = sessionResult.rows[0].recommended_ids || [];
        }
      }

      // ── Step 4: Execute hybrid query ──
      // Wider threshold (0.45) when relational filters are active,
      // tighter (0.35) for pure semantic search
      const hasRelationalFilters =
        intent.hasActorQuery ||
        intent.hasDirectorQuery ||
        intent.hasTempoFilter ||
        intent.hasEraFilter;
      const distanceThreshold = hasRelationalFilters ? 0.45 : 0.35;

      const query = buildHybridQuery({
        queryVector,
        intent,
        excludeIds,
        limit: 5,
        distanceThreshold,
      });

      const result: QueryResult<RecommendedMovie> = await pool.query(query.text, query.values);
      const movies = result.rows;

      // ── Step 5: Update anti-repetition buffer ──
      if (sessionKey && movies.length > 0) {
        const newIds = movies.map((m) => m.id);
        await pool.query(
          `INSERT INTO chat_sessions (session_key, recommended_ids, last_query, updated_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (session_key)
           DO UPDATE SET
             recommended_ids = array_cat(chat_sessions.recommended_ids, $2),
             last_query = $3,
             updated_at = NOW()`,
          [sessionKey, newIds, sanitizedMessage],
        );
      }

      // ── Step 6: Format response ──
      return res.status(200).json({
        success: true,
        query_intent: {
          actors: intent.extractedActors,
          directors: intent.extractedDirectors,
          tempo: intent.tempoFilter,
          era: intent.eraFilter,
          moods: intent.moodFilter,
        },
        results: movies.map((m) => ({
          id: m.id,
          tmdb_id: m.tmdb_id,
          title: m.title,
          title_tr: m.title_tr,
          directors: m.directors,
          actors: m.actors,
          genres: m.genres,
          mood_ids: m.mood_ids,
          tempo: m.tempo,
          release_year: m.release_year,
          vote_average: m.vote_average,
          poster_path: m.poster_path,
          backdrop_path: m.backdrop_path,
          ustad_notu: m.ustad_notu,
          similarity: Math.round((1 - m.distance) * 100), // 0-100 match score
        })),
        count: movies.length,
      });

    } catch (error) {
      console.error('Critical chat match system failure:', error);
      return res.status(500).json({
        success: false,
        error: 'Zaman akışı kesintiye uğradı.',
      });
    }
  });


  /**
   * POST /api/chat/recommend/by-mood
   * Body: { mood_id: string, sessionKey?: string }
   *
   * Direct mood-based lookup — no embedding needed.
   * Uses GIN index on mood_ids for O(1) array containment.
   */
  router.post('/api/chat/recommend/by-mood', async (req: Request, res: Response) => {
    try {
      const { mood_id, sessionKey } = req.body as {
        mood_id?: string;
        sessionKey?: string;
      };

      if (!mood_id || typeof mood_id !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Mod seçimi gerekli evlat.',
        });
      }

      // Load anti-repetition buffer
      let excludeIds: number[] = [];
      if (sessionKey) {
        const sessionResult = await pool.query(
          'SELECT recommended_ids FROM chat_sessions WHERE session_key = $1',
          [sessionKey],
        );
        if (sessionResult.rows.length > 0) {
          excludeIds = sessionResult.rows[0].recommended_ids || [];
        }
      }

      const excludeClause = excludeIds.length > 0
        ? 'AND id != ALL($2::int[])'
        : '';
      const params: unknown[] = [mood_id];
      if (excludeIds.length > 0) params.push(excludeIds);

      const result = await pool.query(
        `SELECT
          id, tmdb_id, title, title_tr,
          directors, actors, genres, mood_ids,
          tempo, focus, release_year, vote_average,
          poster_path, backdrop_path, ustad_notu
        FROM movies
        WHERE $1 = ANY(mood_ids)
        ${excludeClause}
        ORDER BY vote_average DESC, popularity DESC
        LIMIT 5`,
        params,
      );

      return res.status(200).json({
        success: true,
        mood_id,
        results: result.rows,
        count: result.rows.length,
      });

    } catch (error) {
      console.error('Mood recommendation failure:', error);
      return res.status(500).json({
        success: false,
        error: 'Mod arayışında bir sorun oluştu.',
      });
    }
  });


  /**
   * GET /api/movies/search?q=...
   * Fuzzy title search using pg_trgm trigram similarity.
   * No embedding needed — pure relational text matching.
   */
  router.get('/api/movies/search', async (req: Request, res: Response) => {
    try {
      const q = (req.query.q as string || '').trim();
      if (!q || q.length < 2) {
        return res.status(400).json({
          success: false,
          error: 'En az 2 karakter gerekli.',
        });
      }

      const result = await pool.query(
        `SELECT
          id, tmdb_id, title, title_tr,
          directors, actors, genres, mood_ids,
          release_year, vote_average, poster_path,
          ustad_notu,
          GREATEST(
            similarity(title, $1),
            similarity(COALESCE(title_tr, ''), $1)
          ) AS match_score
        FROM movies
        WHERE
          title % $1
          OR COALESCE(title_tr, '') % $1
        ORDER BY match_score DESC
        LIMIT 10`,
        [q],
      );

      return res.status(200).json({
        success: true,
        results: result.rows,
        count: result.rows.length,
      });

    } catch (error) {
      console.error('Search failure:', error);
      return res.status(500).json({
        success: false,
        error: 'Arama sırasında bir sorun oluştu.',
      });
    }
  });

  return router;
}


// ════════════════════════════════════════════════════════════════
// 5. EMBEDDING SERVICE INTERFACE
// ════════════════════════════════════════════════════════════════

/**
 * Example embedding service implementation using OpenAI.
 * Replace with your preferred provider (Cohere, local model, etc.)
 *
 * Usage:
 *   const embeddingService = createOpenAIEmbeddingService(process.env.OPENAI_API_KEY);
 *   const router = createChatRouter({ pool, embeddingService });
 */
export function createOpenAIEmbeddingService(apiKey: string): EmbeddingService {
  return {
    async getEmbedding(text: string): Promise<number[]> {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'text-embedding-3-large',
          input: text,
          dimensions: 1536,
        }),
      });

      if (!response.ok) {
        throw new Error(`Embedding API error: ${response.status}`);
      }

      const data = (await response.json()) as {
        data: Array<{ embedding: number[] }>;
      };

      return data.data[0].embedding;
    },
  };
}


// ════════════════════════════════════════════════════════════════
// 6. INGESTION UTILITY — Bulk movie import with search_document + embedding
// ════════════════════════════════════════════════════════════════

/**
 * Ingest a batch of movies: build search_document, get embeddings, upsert.
 * Call during nightly cron or initial data load.
 *
 * The search_document is auto-built by the PostgreSQL trigger,
 * but we also need the embedding which requires an API call.
 */
export async function ingestMovieBatch(
  pool: Pool,
  embeddingService: EmbeddingService,
  movies: Array<{
    tmdb_id: number;
    title: string;
    title_tr?: string;
    directors: string[];
    actors: string[];
    genres: string[];
    genre_ids: number[];
    mood_ids: string[];
    tempo: string;
    focus: string;
    release_year: number;
    vote_average: number;
    popularity: number;
    poster_path?: string;
    backdrop_path?: string;
    overview?: string;
    overview_tr?: string;
    ustad_notu: string;
    keywords?: object[];
    mood_scores?: Record<string, number>;
  }>,
): Promise<{ inserted: number; errors: number }> {
  let inserted = 0;
  let errors = 0;

  // Process in chunks of 10 for embedding batching
  const CHUNK_SIZE = 10;

  for (let i = 0; i < movies.length; i += CHUNK_SIZE) {
    const chunk = movies.slice(i, i + CHUNK_SIZE);

    // Build search documents for embedding
    const searchDocs = chunk.map((m) => {
      const parts = [
        `Title: ${m.title}.`,
        m.title_tr ? `Turkish Title: ${m.title_tr}.` : '',
        `Directed by: ${m.directors.join(', ')}.`,
        `Cast: ${m.actors.join(', ')}.`,
        `Genres: ${m.genres.join(', ')}.`,
        `Mood Trait: ${m.mood_ids.join(', ')}.`,
        `Aesthetic: ${m.tempo} paced, ${m.focus} driven film.`,
        `Year: ${m.release_year}.`,
        m.overview ? `Overview: ${m.overview.slice(0, 300)}.` : '',
      ];
      return parts.filter(Boolean).join(' ');
    });

    // Get embeddings for all docs in chunk
    const embeddings: number[][] = [];
    for (const doc of searchDocs) {
      try {
        const emb = await embeddingService.getEmbedding(doc);
        embeddings.push(emb);
      } catch {
        embeddings.push([]); // will skip this movie
      }
    }

    // Upsert each movie
    for (let j = 0; j < chunk.length; j++) {
      const m = chunk[j];
      const embedding = embeddings[j];

      if (embedding.length === 0) {
        errors++;
        continue;
      }

      try {
        await pool.query(
          `INSERT INTO movies (
            tmdb_id, title, title_tr, directors, actors, genres, genre_ids,
            mood_ids, tempo, focus, release_year, vote_average, popularity,
            poster_path, backdrop_path, overview, overview_tr,
            ustad_notu, embedding, keywords, mood_scores
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            $8, $9::movie_tempo, $10::movie_focus, $11, $12, $13,
            $14, $15, $16, $17,
            $18, $19::vector, $20::jsonb, $21::jsonb
          )
          ON CONFLICT (tmdb_id) DO UPDATE SET
            title = EXCLUDED.title,
            title_tr = EXCLUDED.title_tr,
            directors = EXCLUDED.directors,
            actors = EXCLUDED.actors,
            genres = EXCLUDED.genres,
            genre_ids = EXCLUDED.genre_ids,
            mood_ids = EXCLUDED.mood_ids,
            tempo = EXCLUDED.tempo,
            focus = EXCLUDED.focus,
            release_year = EXCLUDED.release_year,
            vote_average = EXCLUDED.vote_average,
            popularity = EXCLUDED.popularity,
            poster_path = EXCLUDED.poster_path,
            backdrop_path = EXCLUDED.backdrop_path,
            overview = EXCLUDED.overview,
            overview_tr = EXCLUDED.overview_tr,
            ustad_notu = EXCLUDED.ustad_notu,
            embedding = EXCLUDED.embedding,
            keywords = EXCLUDED.keywords,
            mood_scores = EXCLUDED.mood_scores,
            updated_at = NOW()`,
          [
            m.tmdb_id, m.title, m.title_tr || null,
            m.directors, m.actors, m.genres, m.genre_ids,
            m.mood_ids, m.tempo, m.focus, m.release_year,
            m.vote_average, m.popularity,
            m.poster_path || null, m.backdrop_path || null,
            m.overview || null, m.overview_tr || null,
            m.ustad_notu,
            JSON.stringify(embedding),
            JSON.stringify(m.keywords || []),
            JSON.stringify(m.mood_scores || {}),
          ],
        );
        inserted++;
      } catch (err) {
        console.error(`Failed to ingest tmdb_id=${m.tmdb_id}:`, err);
        errors++;
      }
    }
  }

  return { inserted, errors };
}
