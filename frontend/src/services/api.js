import { getApiUrl } from '../utils/apiConfig';
import {
  localGetWatchlist, localAddToWatchlist, localRemoveFromWatchlist,
  localToggleWatched, localSaveNote, localGetNote, localSaveWatchlist,
  localGetDeletedIds,
} from '../utils/localStore';
const BASE = getApiUrl('/api');

// Auth header helper — picks up Google user token if available
function authHeaders() {
  const token = window.__fc_user_token || localStorage.getItem('fc_user_token') || localStorage.getItem('beta_token') || '';
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

// Simple in-memory cache for Turkish movies
let TURKISH_CACHE = {};

export function clearTurkishCache() {
  TURKISH_CACHE = {};
}

/**
 * TMDB görsel URL'lerini backend proxy üzerinden yükle.
 * ISP DNS engelini aşmak için image.tmdb.org istekleri backend'den geçer.
 */
export function proxyImageUrl(url) {
  if (!url) return null;
  if (url.includes('image.tmdb.org')) {
    return `${BASE}/image-proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
}

export async function getMovies(page = 1) {
  const res = await fetch(`${BASE}/movies?page=${page}`);
  if (!res.ok) throw new Error(`Filmler yüklenemedi (${res.status})`);
  return res.json();
}

export async function getUpcomingMovies() {
  const res = await fetch(`${BASE}/movies/upcoming`);
  if (!res.ok) throw new Error(`Yaklaşan filmler yüklenemedi (${res.status})`);
  return res.json();
}

export async function analyzeMovie(movieId) {
  const res = await fetch(`${BASE}/movies/${movieId}/analyze`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error(`Film analiz edilemedi (${res.status})`);
  return res.json();
}

export async function discoverMovies(genreIds, page = 1, sortBy = "popularity.desc") {
  const genres = genreIds.join(",");
  const res = await fetch(`${BASE}/movies/discover?genres=${genres}&page=${page}&sort_by=${sortBy}`);
  if (!res.ok) throw new Error(`Keşfet yüklenemedi (${res.status})`);
  return res.json();
}

export async function repositoryMovies(moodId, page = 1, minVote = 5.0, sortBy = "recommended", minMoodScore = 0) {
  const res = await fetch(`${BASE}/repository/movies/${moodId}?page=${page}&min_vote=${minVote}&sort_by=${sortBy}&min_mood_score=${minMoodScore}`);
  if (!res.ok) throw new Error(`Repository yüklenemedi (${res.status})`);
  return res.json();
}

export async function seedRepository(moodId = null) {
  const url = moodId ? `${BASE}/repository/seed?mood_id=${moodId}` : `${BASE}/repository/seed`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Seed başarısız (${res.status})`);
  return res.json();
}

export async function getTurkishMovies(page = 1, sortBy = "popularity.desc", minVoteCount = 0, minVoteAvg = 0, yearFrom = null) {
  const key = `tr:${page}:${sortBy}:${minVoteCount}:${minVoteAvg}:${yearFrom}`;
  if (TURKISH_CACHE[key]) return TURKISH_CACHE[key];

  let url = `${BASE}/movies/turkish?page=${page}&sort_by=${sortBy}&min_vote_count=${minVoteCount}&min_vote_average=${minVoteAvg}`;
  if (yearFrom) url += `&year_from=${yearFrom}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Türk filmleri yüklenemedi (${res.status})`);
  const data = await res.json();
  TURKISH_CACHE[key] = data;
  return data;
}

export async function searchMovies(query) {
  const res = await fetch(`${BASE}/movies/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error(`Arama başarısız (${res.status})`);
  return res.json();
}

export async function getSimilarMovies(movieId) {
  try {
    const res = await fetch(`${BASE}/movies/${movieId}/similar`);
    if (!res.ok) return { movies: [] };
    return res.json();
  } catch {
    return { movies: [] };
  }
}

// --- Watchlist (Defterim) API — localStorage primary, backend best-effort ---

export async function getWatchlist() {
  // localStorage'dan anında döndür
  const local = localGetWatchlist();

  // Arka planda backend ile senkronize et (sessizce)
  try {
    const res = await fetch(`${BASE}/watchlist`, { headers: { ...authHeaders() } });
    if (res.ok) {
      const data = await res.json();
      const backendMovies = data.movies || [];
      if (backendMovies.length > 0) {
        // Backend'deki filmleri localStore'a merge et (yeni olanları ekle)
        // Kullanıcının sildiği filmler tekrar eklenmesini engelle
        const localIds = new Set(local.map(m => m.tmdb_id));
        const deletedIds = new Set(localGetDeletedIds());
        const toAdd = backendMovies.filter(m => !localIds.has(m.tmdb_id) && !deletedIds.has(m.tmdb_id));
        if (toAdd.length > 0) {
          const merged = [...local, ...toAdd];
          localSaveWatchlist(merged);
          return { movies: merged };
        }
      }
    }
  } catch {}

  return { movies: local };
}

export async function addToWatchlist(movie) {
  // localStorage'a hemen ekle
  const updated = localAddToWatchlist(movie);
  // Backend'e de gönder (başarısız olsa sorun değil)
  try {
    await fetch(`${BASE}/watchlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        tmdb_id: movie.id || movie.tmdb_id,
        title: movie.title,
        poster_url: movie.poster_url || (movie.poster_path ? `https://image.tmdb.org/t/p/w1280${movie.poster_path}` : null)
      })
    });
  } catch {}
  return { success: true };
}

export async function removeFromWatchlist(movieId) {
  // localStorage'dan hemen sil
  localRemoveFromWatchlist(movieId);
  // Backend'den de sil (başarısız olsa sorun değil)
  try { await fetch(`${BASE}/watchlist/${movieId}`, { method: 'DELETE', headers: { ...authHeaders() } }); } catch {}
  return { success: true };
}

export async function toggleWatched(tmdbId) {
  // localStorage'da toggle et
  localToggleWatched(tmdbId);
  // Backend'e bildir
  try {
    await fetch(`${BASE}/watchlist/${tmdbId}/toggle-watched`, { method: 'POST', headers: { ...authHeaders() } });
  } catch {}
  return { success: true };
}

// --- Notes API ---

export async function saveNote(movieId, content) {
  // localStorage'a hemen kaydet
  localSaveNote(movieId, content);
  // Backend'e de gönder
  try {
    await fetch(`${BASE}/movies/${movieId}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ content })
    });
  } catch {}
  return { success: true };
}

export async function getNote(movieId) {
  // Önce localStorage'dan al
  const local = localGetNote(movieId);
  if (local) return { note: local };
  // Yoksa backend'den dene
  try {
    const res = await fetch(`${BASE}/movies/${movieId}/notes`, { headers: { ...authHeaders() } });
    if (res.ok) {
      const data = await res.json();
      if (data.note) localSaveNote(movieId, data.note);
      return data;
    }
  } catch {}
  return { note: '' };
}

// --- Future Plans API (Gelecek Planları) ---

export async function getFuturePlans() {
  const res = await fetch(`${BASE}/future`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error(`Gelecek planları yüklenemedi`);
  return res.json();
}

export async function addToFuture(movie) {
  const res = await fetch(`${BASE}/future`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      tmdb_id: movie.id,
      title: movie.title,
      poster_url: movie.poster_url || (movie.poster_path ? `https://image.tmdb.org/t/p/w1280${movie.poster_path}` : null),
      priority: 0,
      watch_date: null,
      notes: null
    })
  });
  if (!res.ok) throw new Error(`Gelecek planlarına eklenemedi`);
  return res.json();
}

export async function removeFromFuture(movieId) {
  const res = await fetch(`${BASE}/future/${movieId}`, {
    method: 'DELETE', headers: { ...authHeaders() }
  });
  if (!res.ok) throw new Error(`Gelecek planlarından çıkarılamadı`);
  return res.json();
}

export async function updateFuturePriority(movieId, priority) {
  const res = await fetch(`${BASE}/future/${movieId}/priority?priority=${priority}`, {
    method: 'PUT', headers: { ...authHeaders() }
  });
  if (!res.ok) throw new Error(`Öncelik güncellenemedi`);
  return res.json();
}

export async function updateFutureDate(movieId, watchDate) {
  const res = await fetch(`${BASE}/future/${movieId}/date?watch_date=${encodeURIComponent(watchDate || '')}`, {
    method: 'PUT', headers: { ...authHeaders() }
  });
  if (!res.ok) throw new Error(`Tarih güncellenemedi`);
  return res.json();
}

// --- "Kafan mı Karışık?" API ---

export async function getTasteMap() {
  const res = await fetch(`${BASE}/user/taste-map`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error(`Zevk haritası alınamadı (${res.status})`);
  return res.json();
}

/**
 * Quick mood mix — rule-based, no Claude API.
 * @param {Array} moodMix - [{mood_id, percentage}, ...]
 * @param {Object} opts
 */
export async function quickMoodMix(moodMix, { limit = 6, minVote = 5.0, excludeIds = [] } = {}) {
  const res = await fetch(`${BASE}/recommend/quick-mix`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mood_mix: moodMix, limit, min_vote: minVote, exclude_ids: excludeIds })
  });
  if (!res.ok) throw new Error(`Hızlı öneri alınamadı (${res.status})`);
  return res.json();
}

export async function postConfusedRecommendation(text, limit = 6, minVote = 5.0, excludeIds = [], forcedMoodOverride = '') {
  const res = await fetch(`${BASE}/recommend/confused`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, limit, min_vote: minVote, min_mood_score: 0, exclude_ids: excludeIds, forced_mood_override: forcedMoodOverride })
  });
  if (!res.ok) throw new Error(`Öneri alınamadı (${res.status})`);
  return res.json();
}



/**
 * Ultra-fast semantic öneri — Gemini embedding + numpy cosine, <300ms.
 * Hiçbir LLM çağrısı yapmaz. Fast Search Engine hazır değilse kural tabanlı fallback döner.
 *
 * @param {string} text   - Kullanıcının doğal dil isteği
 * @param {number} limit  - Kaç film isteniyor (3-12)
 * @param {number} minVote
 * @param {number[]} excludeIds - Anti-repetition için dışlanacak tmdb_id'ler
 * @returns {Promise<{ok, source, elapsed_ms, movies}>}
 */
export async function postFastRecommendation(text, limit = 6, minVote = 5.5, excludeIds = []) {
  const res = await fetch(`${BASE}/recommend/fast`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ text, limit, min_vote: minVote, exclude_ids: excludeIds }),
  });
  if (!res.ok) throw new Error(`Hızlı öneri alınamadı (${res.status})`);
  return res.json();
}

export async function getConfusedRecommendation(mood = null) {
  const url = mood ? `${BASE}/recommend/confused?mood=${mood}` : `${BASE}/recommend/confused`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Öneri alınamadı`);
  return res.json();
}

/**
 * 6-step mood quiz → backend vector-averaged semantic search.
 * @param {string[]} targets - Flattened mood tags from quiz answers
 * @param {Object} opts
 */
export async function moodQuizSearch(targets, { limit = 6, minVote = 5.0, excludeIds = [] } = {}) {
  const res = await fetch(`${BASE}/recommend/mood-quiz`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targets, limit, min_vote: minVote, exclude_ids: excludeIds }),
  });
  if (!res.ok) throw new Error(`Quiz önerisi alınamadı (${res.status})`);
  return res.json();
}

// --- Topluluk Önerileri (Community Sharing) ---

export async function recommendToCommunity(tmdbId) {
  const res = await fetch(`${BASE}/community/recommend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ tmdb_id: tmdbId }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || 'Öneri kaydedilemedi');
  }
  return res.json();
}

export async function getCommunityRecommendations(tmdbId) {
  try {
    const res = await fetch(`${BASE}/community/recommendations/${tmdbId}`);
    if (!res.ok) return { count: 0, recommenders: [] };
    return res.json();
  } catch {
    return { count: 0, recommenders: [] };
  }
}

export async function getSurpriseMovie() {
  const res = await fetch(`${BASE}/recommend/surprise`);
  if (!res.ok) throw new Error('Sürpriz film alınamadı');
  return res.json();
}
