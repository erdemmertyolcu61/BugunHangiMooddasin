/**
 * Mood sıralama kişiselleştirmesi — tamamen client-side, sıfır backend maliyeti.
 *
 * localStorage'daki seçim sayaçlarına göre kullanıcının en çok seçtiği
 * İLK 4 mood'u öne alır; kalanlar orijinal sırada kalır (yön kaybı olmasın).
 * Hiç geçmiş yoksa orijinal sıra döner.
 */
const STORAGE_KEY = 'fc_mood_picks';
const PROMOTE_COUNT = 4;

function readPicks() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

/** Mood seçimini kaydet (handleMoodClick'ten çağrılır). */
export function recordMoodPick(moodId) {
  if (!moodId) return;
  try {
    const picks = readPicks();
    picks[moodId] = (picks[moodId] || 0) + 1;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(picks));
  } catch { /* sessiz — private mode vb. */ }
}

/**
 * Mood listesini kişisel sıraya göre düzenle.
 * @param {Array} moods - orijinal sıralı mood dizisi ({id} alanlı)
 * @returns {Array} ilk PROMOTE_COUNT favori öne alınmış dizi
 */
export function rankMoods(moods) {
  const picks = readPicks();
  const ids = Object.keys(picks);
  if (ids.length === 0) return moods;

  const favorites = moods
    .filter((m) => picks[m.id] > 0)
    .sort((a, b) => (picks[b.id] || 0) - (picks[a.id] || 0))
    .slice(0, PROMOTE_COUNT);
  if (favorites.length === 0) return moods;

  const favSet = new Set(favorites.map((m) => m.id));
  return [...favorites, ...moods.filter((m) => !favSet.has(m.id))];
}
