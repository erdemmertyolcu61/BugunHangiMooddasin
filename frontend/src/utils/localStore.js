// localStorage-tabanlı Defterim kalıcılığı
// Render free tier ephemeral disk sorununu çözer — her kullanıcı kendi cihazında saklar

const WL_KEY = 'fc_watchlist_v2';
const NOTES_KEY = 'fc_notes_v2';
const DELETED_KEY = 'fc_watchlist_deleted';

// ─── Deleted IDs (prevents re-merge from backend) ───────────────────────────

export function localGetDeletedIds() {
  try { return JSON.parse(localStorage.getItem(DELETED_KEY) || '[]'); }
  catch { return []; }
}

export function localAddDeletedId(tmdbId) {
  const ids = localGetDeletedIds();
  if (!ids.includes(tmdbId)) {
    ids.push(tmdbId);
    try { localStorage.setItem(DELETED_KEY, JSON.stringify(ids)); } catch {}
  }
}

export function localClearDeletedId(tmdbId) {
  const ids = localGetDeletedIds().filter(id => id !== tmdbId);
  try { localStorage.setItem(DELETED_KEY, JSON.stringify(ids)); } catch {}
}

// ─── Watchlist ───────────────────────────────────────────────────────────────

export function localGetWatchlist() {
  try { return JSON.parse(localStorage.getItem(WL_KEY) || '[]'); }
  catch { return []; }
}

export function localSaveWatchlist(items) {
  try { localStorage.setItem(WL_KEY, JSON.stringify(items)); } catch {}
}

export function localAddToWatchlist(movie) {
  const list = localGetWatchlist();
  const id = movie.tmdb_id || movie.id;
  if (list.find(m => m.tmdb_id === id)) return list; // zaten var
  // Daha önce silinmiş olabilir — deleted listesinden çıkar
  localClearDeletedId(id);
  const item = {
    tmdb_id: id,
    title: movie.title,
    poster_url: movie.poster_url || null,
    watched: false,
    personal_note: '',
    added_at: new Date().toISOString(),
  };
  const updated = [item, ...list];
  localSaveWatchlist(updated);
  return updated;
}

export function localRemoveFromWatchlist(tmdbId) {
  const updated = localGetWatchlist().filter(m => m.tmdb_id !== tmdbId);
  localSaveWatchlist(updated);
  // Silinen ID'yi kaydet — backend sync'te geri gelmesini engeller
  localAddDeletedId(tmdbId);
  return updated;
}

export function localToggleWatched(tmdbId) {
  const list = localGetWatchlist().map(m =>
    m.tmdb_id === tmdbId ? { ...m, watched: !m.watched } : m
  );
  localSaveWatchlist(list);
  return list;
}

// ─── Notes ───────────────────────────────────────────────────────────────────

export function localGetNotes() {
  try { return JSON.parse(localStorage.getItem(NOTES_KEY) || '{}'); }
  catch { return {}; }
}

export function localSaveNote(movieId, content) {
  const notes = localGetNotes();
  notes[String(movieId)] = content;
  try { localStorage.setItem(NOTES_KEY, JSON.stringify(notes)); } catch {}
}

export function localGetNote(movieId) {
  return localGetNotes()[String(movieId)] || '';
}
