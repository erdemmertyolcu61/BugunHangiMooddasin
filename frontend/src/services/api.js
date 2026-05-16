import { getApiUrl } from '../utils/apiConfig';
const BASE = getApiUrl('/api');

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
  const res = await fetch(`${BASE}/movies/${movieId}/analyze`);
  if (!res.ok) throw new Error(`Film analiz edilemedi (${res.status})`);
  return res.json();
}

export async function discoverMovies(genreIds, page = 1, sortBy = "popularity.desc") {
  const genres = genreIds.join(",");
  const res = await fetch(`${BASE}/movies/discover?genres=${genres}&page=${page}&sort_by=${sortBy}`);
  if (!res.ok) throw new Error(`Keşfet yüklenemedi (${res.status})`);
  return res.json();
}

export async function repositoryMovies(moodId, page = 1, minVote = 5.0, sortBy = "recommended", minMoodScore = 40) {
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

// --- Watchlist (Defterim) API ---

export async function getWatchlist() {
  const res = await fetch(`${BASE}/watchlist`);
  if (!res.ok) throw new Error(`Defterim yüklenemedi`);
  return res.json();
}

export async function addToWatchlist(movie) {
  const res = await fetch(`${BASE}/watchlist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tmdb_id: movie.id,
      title: movie.title,
      poster_url: movie.poster_url || (movie.poster_path ? `https://image.tmdb.org/t/p/w1280${movie.poster_path}` : null)
    })
  });
  if (!res.ok) throw new Error(`Deftere eklenemedi`);
  return res.json();
}

export async function removeFromWatchlist(movieId) {
  const res = await fetch(`${BASE}/watchlist/${movieId}`, {
    method: 'DELETE'
  });
  if (!res.ok) throw new Error(`Defterden çıkarılamadı`);
  return res.json();
}

export async function toggleWatched(tmdbId) {
  const res = await fetch(`${BASE}/watchlist/${tmdbId}/toggle-watched`, { method: 'POST' });
  if (!res.ok) throw new Error('İzlendi durumu değiştirilemedi');
  return res.json();
}

// --- Notes API ---

export async function saveNote(movieId, content) {
  const res = await fetch(`${BASE}/movies/${movieId}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content })
  });
  if (!res.ok) throw new Error(`Not kaydedilemedi`);
  return res.json();
}

export async function getNote(movieId) {
  const res = await fetch(`${BASE}/movies/${movieId}/notes`);
  if (!res.ok) throw new Error(`Not yüklenemedi`);
  return res.json();
}

// --- Future Plans API (Gelecek Planları) ---

export async function getFuturePlans() {
  const res = await fetch(`${BASE}/future`);
  if (!res.ok) throw new Error(`Gelecek planları yüklenemedi`);
  return res.json();
}

export async function addToFuture(movie) {
  const res = await fetch(`${BASE}/future`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
    method: 'DELETE'
  });
  if (!res.ok) throw new Error(`Gelecek planlarından çıkarılamadı`);
  return res.json();
}

export async function updateFuturePriority(movieId, priority) {
  const res = await fetch(`${BASE}/future/${movieId}/priority?priority=${priority}`, {
    method: 'PUT'
  });
  if (!res.ok) throw new Error(`Öncelik güncellenemedi`);
  return res.json();
}

export async function updateFutureDate(movieId, watchDate) {
  const res = await fetch(`${BASE}/future/${movieId}/date?watch_date=${encodeURIComponent(watchDate || '')}`, {
    method: 'PUT'
  });
  if (!res.ok) throw new Error(`Tarih güncellenemedi`);
  return res.json();
}

// --- "Kafan mı Karışık?" API ---

export async function getTasteMap() {
  const res = await fetch(`${BASE}/user/taste-map`);
  if (!res.ok) throw new Error(`Zevk haritası alınamadı (${res.status})`);
  return res.json();
}

export async function postConfusedRecommendation(text, limit = 6, minVote = 5.0) {
  const res = await fetch(`${BASE}/recommend/confused`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, limit, min_vote: minVote, min_mood_score: 0 })
  });
  if (!res.ok) throw new Error(`Öneri alınamadı (${res.status})`);
  return res.json();
}

export async function getConfusedRecommendation(mood = null) {
  const url = mood ? `${BASE}/recommend/confused?mood=${mood}` : `${BASE}/recommend/confused`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Öneri alınamadı`);
  return res.json();
}

export async function getSurpriseMovie() {
  const res = await fetch(`${BASE}/recommend/surprise`);
  if (!res.ok) throw new Error('Sürpriz film alınamadı');
  return res.json();
}
