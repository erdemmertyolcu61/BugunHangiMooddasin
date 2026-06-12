import { getApiUrl } from '../utils/apiConfig';
import {
  localGetWatchlist, localAddToWatchlist, localRemoveFromWatchlist,
  localToggleWatched, localSaveNote, localGetNote, localSaveWatchlist,
  localGetDeletedIds,
} from '../utils/localStore';
const BASE = getApiUrl('/api');

// Auth header helper — picks up Google user token if available
function authHeaders() {
  const token = window.__fc_user_token || localStorage.getItem('fc_user_token') || '';
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

// ─── Ortak GET yardımcısı: in-flight dedup + opsiyonel iptal ──────────────
// Aynı URL'ye eşzamanlı GET'ler tek ağ isteğini paylaşır (dedup) → mood çift
// seçimi/hızlı sayfa geçişlerinde fazladan istek ve race önlenir.
// `signal` verilirse istek iptal edilebilir (örn. bayatlamış arama) ve dedup
// atlanır — her çağıran kendi iptal edilebilir isteğini ister.
const _inflightGets = new Map();

async function getJson(url, { errorMsg, signal, dedup = true } = {}) {
  const canDedup = dedup && !signal;
  if (canDedup && _inflightGets.has(url)) return _inflightGets.get(url);

  const run = (async () => {
    const res = await fetch(url, signal ? { signal } : undefined);
    if (!res.ok) throw new Error(errorMsg ? `${errorMsg} (${res.status})` : `İstek başarısız (${res.status})`);
    return res.json();
  })();

  if (canDedup) {
    _inflightGets.set(url, run);
    run.finally(() => { if (_inflightGets.get(url) === run) _inflightGets.delete(url); });
  }
  return run;
}

// ─── E-posta + Şifre Auth ───────────────────────────────────────────────
export async function registerEmail(email, password, name = '') {
  const res = await fetch(`${BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || 'Kayıt başarısız');
  return data;
}

export async function loginEmail(email, password) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || 'Giriş başarısız');
  return data;
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
  return getJson(`${BASE}/movies?page=${page}`, { errorMsg: 'Filmler yüklenemedi' });
}

export async function getUpcomingMovies() {
  return getJson(`${BASE}/movies/upcoming`, { errorMsg: 'Yaklaşan filmler yüklenemedi' });
}

export async function analyzeMovie(movieId) {
  const res = await fetch(`${BASE}/movies/${movieId}/analyze`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error(`Film analiz edilemedi (${res.status})`);
  return res.json();
}

export async function discoverMovies(genreIds, page = 1, sortBy = "popularity.desc") {
  const genres = genreIds.join(",");
  return getJson(`${BASE}/movies/discover?genres=${genres}&page=${page}&sort_by=${sortBy}`, { errorMsg: 'Keşfet yüklenemedi' });
}

export async function repositoryMovies(moodId, page = 1, minVote = 5.0, sortBy = "recommended", minMoodScore = 0) {
  return getJson(`${BASE}/repository/movies/${moodId}?page=${page}&min_vote=${minVote}&sort_by=${sortBy}&min_mood_score=${minMoodScore}`, { errorMsg: 'Repository yüklenemedi' });
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

// `signal` ile bayatlamış arama istekleri iptal edilebilir (her tuş vuruşunda
// öncekini AbortController ile durdur → yarış ve gereksiz trafik önlenir).
export async function searchMovies(query, { signal } = {}) {
  return getJson(`${BASE}/movies/search?q=${encodeURIComponent(query)}`, { errorMsg: 'Arama başarısız', signal });
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

// Filmin en iyi resmî YouTube fragmanı → { key, name, type, official, site } veya {}
export async function getMovieVideos(movieId) {
  try {
    const res = await fetch(`${BASE}/movies/${movieId}/videos`);
    if (!res.ok) return {};
    return res.json();
  } catch {
    return {};
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
  try { window.dispatchEvent(new CustomEvent('check-achievements')); } catch {}
  return { success: true };
}

export async function removeFromWatchlist(movieId) {
  // localStorage'dan hemen sil
  localRemoveFromWatchlist(movieId);
  // Backend'den de sil (başarısız olsa sorun değil)
  try { await fetch(`${BASE}/watchlist/${movieId}`, { method: 'DELETE', headers: { ...authHeaders() } }); } catch {}
  try { window.dispatchEvent(new CustomEvent('check-achievements')); } catch {}
  return { success: true };
}

export async function toggleWatched(tmdbId) {
  // localStorage'da toggle et
  const updatedList = localToggleWatched(tmdbId);
  const localState = updatedList.find(m => m.tmdb_id === tmdbId);
  // Backend'e bildir ve yanıtı oku
  try {
    const res = await fetch(`${BASE}/watchlist/${tmdbId}/toggle-watched`, { method: 'POST', headers: { ...authHeaders() } });
    if (res.ok) {
      const data = await res.json();
      return data; // {tmdb_id, watched: boolean}
    }
  } catch {}
  // Backend başarısızsa localStorage durumuna güven
  try { window.dispatchEvent(new CustomEvent('check-achievements')); } catch {}
  return { tmdb_id: tmdbId, watched: localState ? localState.watched : false };
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
  try { window.dispatchEvent(new CustomEvent('check-achievements')); } catch {}
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

// "Sana Özel" — kullanıcının zevk profiline göre kişisel film seçkisi.
// Yetersiz sinyalde { movies: [], personalized: false } döner.
export async function getForYou(limit = 18) {
  const res = await fetch(`${BASE}/movies/for-you?limit=${limit}`, { headers: { ...authHeaders() } });
  if (!res.ok) return { movies: [], personalized: false };
  return res.json();
}

export async function getReferrals() {
  const res = await fetch(`${BASE}/user/referrals`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error(`Davet bilgisi alınamadı (${res.status})`);
  return res.json();
}

// ─── Günün Filmi ───
export async function getDailyFilm(personal = true, movieId = null) {
  const params = new URLSearchParams();
  if (!personal) params.set('personal', 'false');
  if (movieId) params.set('movie_id', movieId);
  const qs = params.toString() ? `?${params}` : '';
  const res = await fetch(`${BASE}/daily/film${qs}`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error(`Günün filmi alınamadı (${res.status})`);
  return res.json();
}

// ─── Ödül takvimi (Listeler banner'ı) ───
export async function getAwardsToday() {
  try {
    const res = await fetch(`${BASE}/awards/today`);
    if (!res.ok) return { awards: [] };
    return res.json(); // { awards: [{slug,title,badge,ceremony,status,days_until}] }
  } catch {
    return { awards: [] };
  }
}

// ─── Mini Oyun: Mood Kâhini ───
export async function getMoodOracleRounds(rounds = 5) {
  const res = await fetch(`${BASE}/game/mood-oracle?rounds=${rounds}`);
  if (!res.ok) throw new Error(`Oyun yüklenemedi (${res.status})`);
  return res.json(); // { rounds: [...], count }
}

// ─── Web Push ───
export async function getPushPublicKey() {
  const res = await fetch(`${BASE}/push/public-key`);
  if (!res.ok) throw new Error(`Push anahtarı alınamadı (${res.status})`);
  return res.json(); // { enabled, public_key }
}

export async function subscribePush(subscription) {
  const res = await fetch(`${BASE}/push/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(subscription),
  });
  if (!res.ok) throw new Error(`Push aboneliği kaydedilemedi (${res.status})`);
  return res.json();
}

export async function unsubscribePush(endpoint) {
  const res = await fetch(`${BASE}/push/unsubscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ endpoint }),
  });
  return res.ok ? res.json() : { ok: false };
}

export async function getNotifyTime() {
  const res = await fetch(`${BASE}/push/notify-time`, { headers: { ...authHeaders() } });
  return res.ok ? res.json() : { hour: 18 };
}

export async function setNotifyTime(hour) {
  const res = await fetch(`${BASE}/push/notify-time`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ hour }),
  });
  return res.ok ? res.json() : { ok: false };
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

export async function postConfusedRecommendation(text, limit = 6, minVote = 5.0, excludeIds = [], forcedMoodOverride = '', refine = '') {
  const res = await fetch(`${BASE}/recommend/confused`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, limit, min_vote: minVote, min_mood_score: 0, exclude_ids: excludeIds, forced_mood_override: forcedMoodOverride, refine })
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

// Topluluk önerisini geri al (yalnız kendi önerini)
export async function unrecommendFromCommunity(tmdbId) {
  const res = await fetch(`${BASE}/community/recommend/${tmdbId}`, {
    method: 'DELETE', headers: { ...authHeaders() },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || 'Geri alınamadı');
  }
  return res.json();
}

// Kullanıcının topluluğa önerdiği filmler
export async function getMyCommunityRecommendations() {
  try {
    const res = await fetch(`${BASE}/community/my-recommendations`, { headers: { ...authHeaders() } });
    if (!res.ok) return { recommendations: [], count: 0 };
    return res.json();
  } catch {
    return { recommendations: [], count: 0 };
  }
}

export async function getFriendsActivity() {
  try {
    const res = await fetch(`${BASE}/activity/friends`, { headers: { ...authHeaders() } });
    if (!res.ok) return { activities: [] };
    return res.json();
  } catch { return { activities: [] }; }
}

export async function setActivityVisibility(hideActivity) {
  try {
    await fetch(`${BASE}/user/activity-visibility`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ hide_activity: hideActivity }),
    });
  } catch {}
}

export async function getSurpriseMovie() {
  const res = await fetch(`${BASE}/recommend/surprise`);
  if (!res.ok) throw new Error('Sürpriz film alınamadı');
  return res.json();
}

// --- Kullanıcı Profil & Username ---

export async function getMe() {
  const res = await fetch(`${BASE}/auth/me`, { headers: { ...authHeaders() } });
  if (!res.ok) return null;
  return res.json();
}

export async function setUsername(username) {
  const res = await fetch(`${BASE}/users/set-username`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ username }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || 'Kullanıcı adı ayarlanamadı');
  }
  return res.json();
}

export async function updateProfile({ username, name }) {
  const res = await fetch(`${BASE}/users/profile`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ username, name }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || 'Profil güncellenemedi');
  }
  return res.json();
}

export async function uploadAvatar(base64Image) {
  const res = await fetch(`${BASE}/users/avatar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ image: base64Image }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || 'Avatar yüklenemedi');
  }
  return res.json();
}

export async function removeFriend(friendId) {
  const res = await fetch(`${BASE}/friends/${friendId}`, {
    method: 'DELETE',
    headers: { ...authHeaders() },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || 'Arkadaş silinemedi');
  }
  return res.json();
}

export async function getFriendProfile(userId) {
  const res = await fetch(`${BASE}/friends/${userId}/profile`, {
    headers: { ...authHeaders() },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || 'Profil yüklenemedi');
  }
  return res.json();
}

// --- Arkadaşıma Öner (Direct Film Sharing / Social) ---

async function _socialError(res, fallback) {
  const data = await res.json().catch(() => ({}));
  throw new Error(data.detail || fallback);
}

export async function sendFriendRequest(username) {
  const res = await fetch(`${BASE}/friends/request/${encodeURIComponent(username)}`, {
    method: 'POST',
    headers: { ...authHeaders() },
  });
  if (!res.ok) await _socialError(res, 'Arkadaşlık isteği gönderilemedi');
  return res.json();
}

export async function respondFriendRequest(requestId, action) {
  const res = await fetch(`${BASE}/friends/respond/${requestId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ action }),  // "ACCEPT" | "DECLINE"
  });
  if (!res.ok) await _socialError(res, 'İstek yanıtlanamadı');
  return res.json();
}

export async function getFriends() {
  const res = await fetch(`${BASE}/friends/list`, { headers: { ...authHeaders() } });
  if (!res.ok) return { friends: [] };
  return res.json();
}

export async function getFriendRequests() {
  const res = await fetch(`${BASE}/friends/requests`, { headers: { ...authHeaders() } });
  if (!res.ok) return { requests: [] };
  return res.json();
}

export async function recommendMovieToFriend(receiverId, movieId, userNote = '') {
  const res = await fetch(`${BASE}/movies/recommend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ receiver_id: receiverId, movie_id: movieId, user_note: userNote }),
  });
  if (!res.ok) await _socialError(res, 'Öneri gönderilemedi');
  return res.json();
}

export async function getShares() {
  const res = await fetch(`${BASE}/notifications/shares`, { headers: { ...authHeaders() } });
  if (!res.ok) return { shares: [], unread_count: 0 };
  return res.json();
}

export async function retractRecommendation(recId) {
  const res = await fetch(`${BASE}/movies/recommend/${recId}`, {
    method: 'DELETE',
    headers: { ...authHeaders() },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || 'Geri alınamadı');
  }
  return res.json();
}

export async function getRecommendationHistory() {
  try {
    const res = await fetch(`${BASE}/notifications/recommendations`, { headers: { ...authHeaders() } });
    if (!res.ok) return { received: [], sent: [] };
    return res.json();
  } catch {
    return { received: [], sent: [] };
  }
}

export async function getUnreadShareCount() {
  try {
    const res = await fetch(`${BASE}/notifications/count`, { headers: { ...authHeaders() } });
    if (!res.ok) return { unread_count: 0 };
    return res.json();
  } catch {
    return { unread_count: 0 };
  }
}

export async function markSharesRead() {
  const res = await fetch(`${BASE}/notifications/shares/read`, {
    method: 'POST',
    headers: { ...authHeaders() },
  });
  if (!res.ok) return { ok: false };
  return res.json();
}

export async function markShareRead(shareId) {
  const res = await fetch(`${BASE}/notifications/shares/${shareId}/read`, {
    method: 'POST',
    headers: { ...authHeaders() },
  });
  if (!res.ok) return { ok: false };
  return res.json();
}

// Öneriyi kalıcı gizle ('Okundu' butonu) — panelde bir daha görünmez.
export async function dismissShare(shareId) {
  const res = await fetch(`${BASE}/notifications/shares/${shareId}/dismiss`, {
    method: 'POST',
    headers: { ...authHeaders() },
  });
  if (!res.ok) return { ok: false };
  return res.json();
}

// ─── Mood Paylaşımı ─────────────────────────────────────────────────────
export async function shareMood(moodId) {
  try {
    const res = await fetch(`${BASE}/mood/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ mood_id: moodId }),
    });
    return res.ok ? res.json() : { ok: false };
  } catch { return { ok: false }; }
}

export async function getFriendsMoods() {
  const res = await fetch(`${BASE}/mood/friends`, { headers: { ...authHeaders() } });
  if (!res.ok) return { moods: [] };
  return res.json();
}

// ─── Öneri Reaksiyonları ────────────────────────────────────────────────
export async function reactToRecommendation(recId, reaction) {
  const res = await fetch(`${BASE}/movies/recommend/${recId}/reaction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ reaction }),
  });
  if (!res.ok) return { ok: false };
  return res.json();
}

// ─── Sosyal Akış (Feed) ────────────────────────────────────────────────
export async function getSocialFeed() {
  const res = await fetch(`${BASE}/feed`, { headers: { ...authHeaders() } });
  if (!res.ok) return { friend_moods: [], activities: [], recommendations: [] };
  return res.json();
}

// ─── Film beğeni (like/dislike) — giriş zorunlu, backend ──────────────────
export function isLoggedIn() {
  return !!(window.__fc_user_token || localStorage.getItem('fc_user_token'));
}

export async function getRating(movieId) {
  if (!isLoggedIn()) return { reaction: null };
  try {
    const res = await fetch(`${BASE}/movies/${movieId}/rating`, { headers: { ...authHeaders() } });
    if (!res.ok) return { reaction: null };
    return res.json();
  } catch { return { reaction: null }; }
}

export async function saveRating(movieId, { reaction = null } = {}) {
  if (!isLoggedIn()) return { ok: false };
  try {
    const res = await fetch(`${BASE}/movies/${movieId}/rating`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ reaction }),
    });
    if (!res.ok) return { ok: false };
    return res.json();
  } catch { return { ok: false }; }
}

// ─── Özel listeler — giriş zorunlu, backend ────────────────────────────────
export async function getCustomLists() {
  if (!isLoggedIn()) return { lists: [] };
  try {
    const res = await fetch(`${BASE}/custom-lists`, { headers: { ...authHeaders() } });
    if (!res.ok) return { lists: [] };
    return res.json();
  } catch { return { lists: [] }; }
}

export async function getCustomList(listId) {
  const res = await fetch(`${BASE}/custom-lists/${listId}`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error('Liste yüklenemedi');
  return res.json();
}

export async function createCustomList(name, emoji = null) {
  const res = await fetch(`${BASE}/custom-lists`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ name, emoji }),
  });
  if (!res.ok) await _socialError(res, 'Liste oluşturulamadı');
  return res.json();
}

export async function renameCustomList(listId, name, emoji = null) {
  const res = await fetch(`${BASE}/custom-lists/${listId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ name, emoji }),
  });
  if (!res.ok) await _socialError(res, 'Liste güncellenemedi');
  return res.json();
}

export async function deleteCustomList(listId) {
  const res = await fetch(`${BASE}/custom-lists/${listId}`, {
    method: 'DELETE', headers: { ...authHeaders() },
  });
  if (!res.ok) await _socialError(res, 'Liste silinemedi');
  return res.json();
}

export async function addToCustomList(listId, movie) {
  const res = await fetch(`${BASE}/custom-lists/${listId}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      tmdb_id: movie.id || movie.tmdb_id,
      title: movie.title,
      poster_url: movie.poster_url || (movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null),
    }),
  });
  if (!res.ok) await _socialError(res, 'Listeye eklenemedi');
  return res.json();
}

export async function removeFromCustomList(listId, tmdbId) {
  const res = await fetch(`${BASE}/custom-lists/${listId}/items/${tmdbId}`, {
    method: 'DELETE', headers: { ...authHeaders() },
  });
  if (!res.ok) await _socialError(res, 'Listeden çıkarılamadı');
  return res.json();
}

// ─── Topluluk Katmanı: Trend + Söz + Moderasyon + Engelleme ─────────────────

export async function getTrending(limit = 12) {
  try {
    const res = await fetch(`${BASE}/community/trending?limit=${limit}`);
    if (!res.ok) return { movies: [] };
    return res.json();
  } catch { return { movies: [] }; }
}

export async function getMovieReviews(tmdbId, limit = 20, offset = 0) {
  try {
    const res = await fetch(`${BASE}/movies/${tmdbId}/reviews?limit=${limit}&offset=${offset}`,
      { headers: { ...authHeaders() } });
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

export async function saveMovieReview(tmdbId, content, hasSpoiler = false) {
  const res = await fetch(`${BASE}/movies/${tmdbId}/reviews`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ content, has_spoiler: hasSpoiler }),
  });
  if (!res.ok) await _socialError(res, 'Söz kaydedilemedi');
  return res.json();
}

export async function deleteMovieReview(tmdbId) {
  const res = await fetch(`${BASE}/movies/${tmdbId}/reviews`, {
    method: 'DELETE', headers: { ...authHeaders() },
  });
  if (!res.ok) await _socialError(res, 'Söz silinemedi');
  return res.json();
}

export async function likeReview(reviewId, liked) {
  try {
    const res = await fetch(`${BASE}/reviews/${reviewId}/like`, {
      method: liked ? 'POST' : 'DELETE', headers: { ...authHeaders() },
    });
    return res.ok ? res.json() : { ok: false };
  } catch { return { ok: false }; }
}

export async function reportContent(contentType, contentId, reason = 'diger') {
  const res = await fetch(`${BASE}/reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ content_type: contentType, content_id: String(contentId), reason }),
  });
  if (!res.ok) await _socialError(res, 'Şikayet gönderilemedi');
  return res.json();
}

export async function blockUser(userId) {
  const res = await fetch(`${BASE}/users/${userId}/block`, {
    method: 'POST', headers: { ...authHeaders() },
  });
  if (!res.ok) await _socialError(res, 'Kullanıcı engellenemedi');
  return res.json();
}

export async function unblockUser(userId) {
  const res = await fetch(`${BASE}/users/${userId}/block`, {
    method: 'DELETE', headers: { ...authHeaders() },
  });
  if (!res.ok) await _socialError(res, 'Engel kaldırılamadı');
  return res.json();
}

export async function getBlockedUsers() {
  try {
    const res = await fetch(`${BASE}/users/blocks`, { headers: { ...authHeaders() } });
    if (!res.ok) return { blocked: [] };
    return res.json();
  } catch { return { blocked: [] }; }
}

// ─── Kişi keşfi ──────────────────────────────────────────────────────────────

export async function getSimilarUsers() {
  try {
    const res = await fetch(`${BASE}/community/similar-users`, { headers: { ...authHeaders() } });
    if (!res.ok) return { users: [] };
    return res.json();
  } catch { return { users: [] }; }
}

export async function getTopRecommenders() {
  try {
    const res = await fetch(`${BASE}/community/top-recommenders`, { headers: { ...authHeaders() } });
    if (!res.ok) return { users: [] };
    return res.json();
  } catch { return { users: [] }; }
}

// ─── Herkese açık listeler ───────────────────────────────────────────────────

export async function setListVisibility(listId, isPublic, description = null) {
  const res = await fetch(`${BASE}/custom-lists/${listId}/visibility`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ is_public: isPublic, description }),
  });
  if (!res.ok) await _socialError(res, 'Liste görünürlüğü değiştirilemedi');
  return res.json();
}

export async function getPublicList(slug) {
  const res = await fetch(`${BASE}/lists/public/${encodeURIComponent(slug)}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || 'Liste bulunamadı');
  }
  return res.json();
}
