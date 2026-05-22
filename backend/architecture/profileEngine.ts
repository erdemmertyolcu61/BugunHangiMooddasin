/**
 * SINEMOD — Taste Matrix Profile Engine
 * 100% mathematical, zero LLM dependency at runtime.
 *
 * Computes user progression tier, mood matrix scores, and contextual
 * Üstad persona analysis from local arrays only. No network trips.
 *
 * Integration: import into any Node.js/Express or Next.js API route.
 * The current Python backend's _generate_taste_summary() and taste-map
 * endpoint logic is faithfully ported here with strict TypeScript types.
 */

// ════════════════════════════════════════════════════════════════
// 1. TYPE DEFINITIONS
// ════════════════════════════════════════════════════════════════

export type Tempo = 'slow' | 'balanced' | 'fast';
export type Focus = 'character' | 'plot' | 'visual';
export type ProgressionStatus = 'Empty' | 'Oluşuyor' | 'Olgun';
export type Confidence = 'low' | 'medium' | 'high';

export interface MovieMetadata {
  id: string | number;
  tmdb_id: number;
  title: string;
  mood_ids: string[];
  genres: string[];
  genre_ids: number[];
  tempo: Tempo;
  focus: Focus;
  release_year: number;
  vote_average?: number;
}

export interface MoodScore {
  mood_id: string;
  title: string;
  score: number;
}

export interface GenreScore {
  genre_id: number;
  name: string;
  score: number;
}

export interface EraPreferences {
  pre_1990: number;
  mid_1991_2009: number;
  post_2010: number;
  recent_5_years: number;
}

export interface SignalBreakdown {
  total_movies: number;
  watchlist_count: number;
  watched_count: number;
  future_count: number;
  notes_count: number;
}

export interface ProcessingResult {
  status: ProgressionStatus;
  totalSignals: number;
  confidence: Confidence;
  moodMatrix: MoodScore[];
  topGenres: GenreScore[];
  eraPreferences: EraPreferences;
  signals: SignalBreakdown;
  ustadReviews: string[];
}

// ════════════════════════════════════════════════════════════════
// 2. STATIC REFERENCE MAPS (mirrors Python backend constants)
// ════════════════════════════════════════════════════════════════

const MOOD_NAMES: Record<string, string> = {
  battaniye:     'Battaniye Modu',
  yolculuk:      'Yolculuk Ruhu',
  gece:          'Gece Kuşu',
  kahkaha:       'Kahkaha Molası',
  gozyasi:       'Gözyaşı Gecesi',
  adrenalin:     'Adrenalin Patlaması',
  askbahcesi:    'Aşk Bahçesi',
  zamanyolcusu:  'Zaman Yolcusu',
  sessiz:        'Sessiz Yolculuk',
  zihin:         'Zihin Savaşı',
  kalp:          'Kalbimin Sesi',
  karmakar:      'Karmaşakar',
  sipsak:        'Şipşak',
  'deep-chills': 'Derin Ürperti',
};

const MOOD_TEMPO: Record<string, Tempo> = {
  battaniye:    'slow',
  gozyasi:      'slow',
  sessiz:       'slow',
  kalp:         'slow',
  sipsak:       'fast',
  gece:         'balanced',
  askbahcesi:   'balanced',
  zamanyolcusu: 'balanced',
  zihin:        'balanced',
  karmakar:     'balanced',
  kahkaha:      'fast',
  adrenalin:    'fast',
  yolculuk:     'fast',
  'deep-chills':'balanced',
};

const MOOD_ATMOSPHERE: Record<string, string> = {
  gece:         'dark',
  'deep-chills':'dark',
  zihin:        'dark',
  karmakar:     'dark',
  askbahcesi:   'romantic',
  gozyasi:      'romantic',
  kalp:         'romantic',
  battaniye:    'romantic',
};

const GENRE_NAMES_TR: Record<number, string> = {
  28: 'Aksiyon',    12: 'Macera',      16: 'Animasyon',   35: 'Komedi',
  80: 'Suç',        99: 'Belgesel',    18: 'Drama',       10751: 'Aile',
  14: 'Fantastik',  36: 'Tarih',       27: 'Korku',       10402: 'Müzik',
  9648: 'Gizem',    10749: 'Romantik', 878: 'Bilim Kurgu',
  10752: 'Savaş',   53: 'Gerilim',     37: 'Western',     10770: 'TV Film',
};

// ════════════════════════════════════════════════════════════════
// 3. CORE COMPUTATION ENGINE
// ════════════════════════════════════════════════════════════════

/**
 * Compute user profile from defter + watched arrays.
 * Pure function — deterministic, no side effects, no network calls.
 *
 * @param defter      All movies saved to user's defter (watchlist)
 * @param watched     Subset of defter that user marked as watched
 * @param futurePlan  Movies in "izlenecekler" (future plans) list
 * @param notedIds    Set of tmdb_ids that have user notes (signal +3 weight)
 */
export function computeUserProfile(
  defter: MovieMetadata[],
  watched: MovieMetadata[],
  futurePlan: MovieMetadata[] = [],
  notedIds: Set<number> = new Set(),
): ProcessingResult {

  // ── Step 1: Total Signal Calculation ──
  // Each unique movie interaction counts as 1 signal.
  // A movie can appear in multiple lists but counts once for total.
  const seenTmdbIds = new Set<number>();
  const allMovies: Array<{ movie: MovieMetadata; weight: number }> = [];

  // Defter (watchlist): base signal weight = 1
  for (const m of defter) {
    if (!seenTmdbIds.has(m.tmdb_id)) {
      seenTmdbIds.add(m.tmdb_id);
    }
    allMovies.push({ movie: m, weight: 1 });
  }

  // Watched: additional weight = +2 (indicates deeper engagement)
  for (const m of watched) {
    allMovies.push({ movie: m, weight: 2 });
  }

  // Future plans: weight = 2 (intentional interest signal)
  for (const m of futurePlan) {
    if (!seenTmdbIds.has(m.tmdb_id)) {
      seenTmdbIds.add(m.tmdb_id);
    }
    allMovies.push({ movie: m, weight: 2 });
  }

  // Notes: bonus weight for movies with written notes
  for (const entry of allMovies) {
    if (notedIds.has(entry.movie.tmdb_id)) {
      entry.weight += 3;
    }
  }

  const totalSignals = seenTmdbIds.size;
  const watchlistCount = defter.length;
  const watchedCount = watched.length;
  const futureCount = futurePlan.length;
  const notesCount = notedIds.size;

  // ── Step 2: Progression State Evaluation ──
  let status: ProgressionStatus;
  if (totalSignals === 0) {
    status = 'Empty';
  } else if (totalSignals <= 5) {
    status = 'Oluşuyor';
  } else {
    status = 'Olgun';
  }

  // Early exit: Empty state — no calculations needed
  if (status === 'Empty') {
    return {
      status: 'Empty',
      totalSignals: 0,
      confidence: 'low',
      moodMatrix: [],
      topGenres: [],
      eraPreferences: { pre_1990: 0, mid_1991_2009: 0, post_2010: 0, recent_5_years: 0 },
      signals: {
        total_movies: 0,
        watchlist_count: 0,
        watched_count: 0,
        future_count: 0,
        notes_count: 0,
      },
      ustadReviews: [],
    };
  }

  // ── Step 3: Mood Matrix Score Accumulation ──
  // Map-reduce mood_ids occurrences. Weight is capped at 5 per entry.
  const moodAccumulator: Record<string, number> = {};
  const genreAccumulator: Record<number, number> = {};
  const eraCounts = { pre_1990: 0, mid: 0, post_2010: 0, recent: 0 };

  for (const { movie, weight } of allMovies) {
    const cappedWeight = Math.min(weight, 5);

    // Mood scoring: each mood_id occurrence = +cappedWeight points
    for (const moodId of movie.mood_ids) {
      moodAccumulator[moodId] = (moodAccumulator[moodId] || 0) + cappedWeight;
    }

    // Genre scoring
    for (const gid of movie.genre_ids) {
      genreAccumulator[gid] = (genreAccumulator[gid] || 0) + cappedWeight;
    }

    // Era classification
    const year = movie.release_year;
    if (year > 0) {
      if (year <= 1990) eraCounts.pre_1990 += cappedWeight;
      else if (year <= 2009) eraCounts.mid += cappedWeight;
      else eraCounts.post_2010 += cappedWeight;
      if (year >= 2021) eraCounts.recent += cappedWeight;
    }
  }

  // Build sorted mood matrix (only moods with > 0 points)
  const moodMatrix: MoodScore[] = Object.entries(moodAccumulator)
    .filter(([, score]) => score > 0)
    .map(([moodId, score]) => ({
      mood_id: moodId,
      title: MOOD_NAMES[moodId] || moodId,
      score,
    }))
    .sort((a, b) => b.score - a.score);

  // Build sorted genre list
  const topGenres: GenreScore[] = Object.entries(genreAccumulator)
    .map(([gidStr, score]) => ({
      genre_id: Number(gidStr),
      name: GENRE_NAMES_TR[Number(gidStr)] || '?',
      score,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const eraPreferences: EraPreferences = {
    pre_1990: eraCounts.pre_1990,
    mid_1991_2009: eraCounts.mid,
    post_2010: eraCounts.post_2010,
    recent_5_years: eraCounts.recent,
  };

  // ── Step 4: Confidence Level ──
  let confidence: Confidence;
  if (totalSignals < 3) confidence = 'low';
  else if (totalSignals < 8) confidence = 'medium';
  else confidence = 'high';

  // ── Step 5: Contextual Persona Analysis (Üstad Reviews) ──
  const ustadReviews = generateUstadReviews(
    moodMatrix,
    topGenres,
    eraCounts,
    allMovies,
    totalSignals,
  );

  return {
    status,
    totalSignals,
    confidence,
    moodMatrix,
    topGenres,
    eraPreferences,
    signals: {
      total_movies: totalSignals,
      watchlist_count: watchlistCount,
      watched_count: watchedCount,
      future_count: futureCount,
      notes_count: notesCount,
    },
    ustadReviews,
  };
}


// ════════════════════════════════════════════════════════════════
// 4. ÜSTAD PERSONA ANALYSIS — Rule-based Turkish summary engine
// ════════════════════════════════════════════════════════════════

/**
 * Generates contextual Turkish analysis strings from the Üstad persona.
 * Mirrors Python _generate_taste_summary() with additional ratio-based rules.
 * Returns max 5 summary strings.
 */
function generateUstadReviews(
  topMoods: MoodScore[],
  topGenres: GenreScore[],
  eraCounts: { pre_1990: number; mid: number; post_2010: number; recent: number },
  allMovies: Array<{ movie: MovieMetadata; weight: number }>,
  totalSignals: number,
): string[] {
  // Minimum 3 signals required for meaningful analysis
  if (totalSignals < 3) return [];

  const summaries: string[] = [];
  const moodIds = topMoods.slice(0, 3).map((m) => m.mood_id);
  const topMid = moodIds[0] || null;

  // ── Tempo-based rules ──
  // Rule: if > 40% of total history entries have slow tempo
  const totalEntries = allMovies.length || 1;
  const slowCount = allMovies.filter((e) => e.movie.tempo === 'slow').length;
  const fastCount = allMovies.filter((e) => e.movie.tempo === 'fast').length;

  if (slowCount / totalEntries > 0.4) {
    summaries.push('Yavaş tempolu, karakter odaklı ve duygusal filmler sende daha çok iz bırakıyor.');
  } else {
    // Fallback: check top moods for slow indicators
    const slowMoods = moodIds.filter((mid) => MOOD_TEMPO[mid] === 'slow');
    if (slowMoods.length >= 2) {
      summaries.push('Yavaş tempolu, karakter odaklı ve duygusal filmler sende daha çok iz bırakıyor.');
    } else if (slowMoods.length >= 1 && topMid && slowMoods.includes(topMid)) {
      summaries.push('Sakin ve derinlikli hikayelere daha çok yaklaşıyorsun.');
    }
  }

  // Fast tempo
  if (fastCount / totalEntries > 0.4) {
    summaries.push('Yüksek tempolu, enerjik ve heyecanlı filmlere güçlü bir ilgin var.');
  } else {
    const fastMoods = moodIds.filter((mid) => MOOD_TEMPO[mid] === 'fast');
    if (fastMoods.length >= 2) {
      summaries.push('Yüksek tempolu, enerjik ve heyecanlı filmlere güçlü bir ilgin var.');
    }
  }

  // ── Atmosphere-based rules ──
  const darkMoods = moodIds.filter((mid) => MOOD_ATMOSPHERE[mid] === 'dark');
  if (darkMoods.length >= 2) {
    summaries.push('Karanlık, gizemli ve düşündüren atmosferler sana daha yakın geliyor.');
  } else if (topMid === 'deep-chills') {
    summaries.push('Korkuda ani sıçratmalardan çok atmosferik ve psikolojik gerilimlere yakınsın.');
  } else if (topMid === 'zihin') {
    summaries.push('Beklenmedik dönüşler, karmaşık planlar ve zihin açan hikayeler seni daha çok çekiyor.');
  }

  // Romantic
  const romanticMoods = moodIds.filter((mid) => MOOD_ATMOSPHERE[mid] === 'romantic');
  if (romanticMoods.length >= 2) {
    summaries.push('Romantikte sıcak, kırılgan ve gerçekçi hikayelere daha çok yaklaşıyorsun.');
  }

  // ── Specific mood leader rules ──
  if (topMid === 'zamanyolcusu') {
    summaries.push('Eski sinema hissi, klasikler ve geçmiş dönem atmosferi ilgini çekiyor.');
  }
  if (topMid === 'kahkaha') {
    summaries.push('Bazen sinemayı sadece rahatlamak ve gülmek için kullandığın çok belli.');
  }
  if (topMid === 'kalp') {
    summaries.push('Büyük hikayelerden çok, küçük ama derin dokunuşlar seni daha çok etkiliyor.');
  }

  // ── Era rules: ratio-based (> 30% threshold) ──
  const preCount = allMovies.filter((e) => e.movie.release_year > 0 && e.movie.release_year < 1990).length;
  if (preCount / totalEntries > 0.3) {
    summaries.push('1990 öncesi klasiklere ve eski sinema hissine ilgin artıyor.');
  } else if (eraCounts.pre_1990 > eraCounts.post_2010 && eraCounts.pre_1990 > 0) {
    summaries.push('1990 öncesi klasiklere ve eski sinema hissine ilgin artıyor.');
  } else if (eraCounts.recent > eraCounts.pre_1990) {
    summaries.push('Daha güncel ve modern tempolu filmlere yakın duruyorsun.');
  }

  // ── Genre-based rules ──
  for (const g of topGenres.slice(0, 2)) {
    if (g.genre_id === 18) {
      summaries.push('Drama türüne ilgin belirgin şekilde yüksek.');
      break;
    } else if (g.genre_id === 27 && topMid !== 'deep-chills') {
      summaries.push('Korku türüne ilgin var, özellikle atmosferik yapımlara yöneliyorsun.');
      break;
    } else if (g.genre_id === 35) {
      summaries.push('Komedi türünden keyif aldığın belli oluyor.');
      break;
    } else if (g.genre_id === 10749) {
      summaries.push('Romantik filmlere sıcak bakıyorsun.');
      break;
    }
  }

  // Cap at 5 summaries
  return summaries.slice(0, 5);
}


// ════════════════════════════════════════════════════════════════
// 5. SEARCH DOCUMENT BUILDER
// ════════════════════════════════════════════════════════════════

/**
 * Compile a search document string for a movie.
 * This string is what gets vectorized and stored in the `embedding` column.
 * Actor/director names embedded here allow semantic resolution of credit queries.
 */
export function buildSearchDocument(movie: {
  title: string;
  title_tr?: string;
  directors: string[];
  actors: string[];
  genres: string[];
  mood_ids: string[];
  tempo: Tempo;
  focus: Focus;
  release_year: number;
  overview?: string;
}): string {
  const parts = [
    `Title: ${movie.title}.`,
    movie.title_tr ? `Turkish Title: ${movie.title_tr}.` : '',
    `Directed by: ${movie.directors.join(', ')}.`,
    `Cast: ${movie.actors.join(', ')}.`,
    `Genres: ${movie.genres.join(', ')}.`,
    `Mood Trait: ${movie.mood_ids.map((id) => MOOD_NAMES[id] || id).join(', ')}.`,
    `Aesthetic: ${movie.tempo} paced, ${movie.focus} driven film.`,
    `Year: ${movie.release_year}.`,
    movie.overview ? `Overview: ${movie.overview.slice(0, 300)}.` : '',
  ];

  return parts.filter(Boolean).join(' ');
}


// ════════════════════════════════════════════════════════════════
// 6. MOOD FALLBACK REVIEW (matches USTAD_MOOD_REVIEWS in Profil.jsx)
// ════════════════════════════════════════════════════════════════

const USTAD_MOOD_REVIEWS: Record<string, string> = {
  battaniye:     'Sakin ve derinlikli hikayelere daha çok yaklaşıyorsun.',
  gece:          'Gecenin sessizliğinde parlayan, karanlık anlatılara çekiliyorsun.',
  gozyasi:       'Duygusal ve insani hikayelere kalbini açıyorsun.',
  askbahcesi:    'Romantikte sıcak, kırılgan ve gerçekçi hikayelere daha çok yaklaşıyorsun.',
  kahkaha:       'Hayatı hafifletmeyi seven, neşeli bir ruhun var.',
  adrenalin:     'Daha güncel ve modern tempolu filmlere yakın duruyorsun.',
  yolculuk:      'Sınırları zorlayan, ufuk açan yolculuklara düşkünsün.',
  zamanyolcusu:  'Geçmişle gelecek arasındaki köprülere ilgi duyuyorsun.',
  sessiz:        'Minimal ve sessiz anlatıların gücüne inanıyorsun.',
  zihin:         'Zihnin labirentlerinde dolaşmayı seviyorsun.',
  kalp:          'Festival sinemasının bağımsız ruhuna yakınsın.',
  karmakar:      'Türleri karıştıran cesur hikayelere açıksın.',
  sipsak:        'Kısa ve vurucu başyapıtları tercih ediyorsun — zamanı etkili kullanan bir sinemaseversin.',
  'deep-chills': 'Seni ürperten, derinden sarsan yapıtlara yöneliyorsun.',
};

/**
 * Fallback: single mood-based Üstad review when backend summary is empty.
 * Used by the frontend when totalSignals < 3 (too few for full analysis).
 */
export function getUstadMoodFallback(moodId: string): string {
  return USTAD_MOOD_REVIEWS[moodId] || '';
}
