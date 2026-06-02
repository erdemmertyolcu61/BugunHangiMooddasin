/**
 * weeklyReport.js — "Bu Hafta" ilerleme digesti (playbook'un "ne kadar yol
 * geldin" özeti). Tamamen cihazdaki verilerden hesaplanır (watchlist + streak +
 * başarımlar). Push tarafı backend'de (Pazar 19:00 broadcast → /profil).
 *
 * Not: watchlist öğelerinde yalnız `added_at` zaman damgası var (watched_at yok),
 * bu yüzden "bu hafta" = added_at son 7 gün; izleme/not için toplamlar gösterilir.
 */
import { getStreak } from './streak';
import { milestoneSummary } from './milestones';

const WEEK_MS = 7 * 86400000;

function parseDate(s) {
  if (!s) return null;
  const d = new Date(String(s).trim().replace(' ', 'T'));
  return isNaN(d.getTime()) ? null : d;
}

/** "26 May – 1 Haz" gibi kısa Türkçe aralık. */
function formatRange(start, end) {
  const fmt = (d) => new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' }).format(d);
  return `${fmt(start)} – ${fmt(end)}`;
}

/**
 * Haftalık digest hesapla.
 * @param {Array} movies  watchlist öğeleri ({ added_at, watched, personal_note, ... })
 * @param {object} [opts] { topMood: {title}|null }
 * @returns {object} digest
 */
export function computeWeeklyReport(movies = [], opts = {}) {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - WEEK_MS);

  const savedThisWeek = movies.filter((m) => {
    const d = parseDate(m.added_at);
    return d && d >= weekAgo;
  });

  const watchedTotal = movies.filter((m) => m.watched).length;
  const notesTotal = movies.filter((m) => (m.personal_note || '').trim()).length;
  const streak = getStreak();
  const ms = milestoneSummary({ saved: movies.length, watched: watchedTotal, notes: notesTotal });

  const savedCount = savedThisWeek.length;
  const headline =
    savedCount >= 5 ? 'Yoğun bir haftaydı — defterin doluyor.' :
    savedCount >= 1 ? 'Güzel gidiyorsun, defterine yeni izler ekledin.' :
    streak.current >= 2 ? 'Serini koruyorsun — bu hafta bir film seç.' :
    'Bu hafta sessizdi. Bir ruh hali seç, Üstad seni bekliyor.';

  return {
    range: formatRange(weekAgo, now),
    savedCount,
    savedPosters: savedThisWeek.map((m) => m.poster_url).filter(Boolean).slice(0, 5),
    savedTitles: savedThisWeek.map((m) => m.title).filter(Boolean).slice(0, 3),
    watchedTotal,
    notesTotal,
    savedTotal: movies.length,
    streak: streak.current || 0,
    milestones: ms,            // { unlocked, total }
    topMood: opts.topMood?.title || null,
    headline,
    hasActivity: savedCount > 0 || watchedTotal > 0 || notesTotal > 0,
  };
}

/** Paylaşılabilir kısa metin (viral kart için). */
export function weeklyReportShareText(r) {
  const bits = [];
  if (r.savedCount) bits.push(`${r.savedCount} yeni film`);
  if (r.streak >= 2) bits.push(`${r.streak} günlük seri 🔥`);
  if (r.topMood) bits.push(`favori mood: ${r.topMood}`);
  const tail = bits.length ? ` (${bits.join(' · ')})` : '';
  return `Sinemood'da bu haftaki sinema karnem${tail}. Sen de ruh haline göre film bul →`;
}
