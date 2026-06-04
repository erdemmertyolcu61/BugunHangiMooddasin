/**
 * personalMatch — kullanıcının zevk haritasına göre KİŞİSEL "uyum %" hesabı.
 *
 * Neden: Discover'da gösterilen uyum yüzdesi eskiden sahte, deterministik bir
 * seed'di (`(movieId*13 + moodId.length*7) % 100`) — herkese aynı, kullanıcı
 * geçmişini hiç kullanmıyordu. Bu yardımcı, zaten hesaplanan taste map'i
 * (tür profili + mood dağılımı) kullanarak kişisel bir skor üretir.
 *
 * Sıfır maliyet: tamamen yerel/deterministik, LLM/embedding yok.
 *
 * Kullanım:
 *   const matcher = buildMatcher(tasteMap);     // tasteMap zayıfsa null
 *   const pct = matcher ? matcher(movie, moodId) : null;  // null → çağıran
 *                                                         //   mood_score'a düşer
 */

const GENRE_W = 0.6;
const MOOD_W = 0.4;

/**
 * @param {object|null} tasteMap  /api/user/taste-map yanıtı (top_genres, mood_pct, confidence)
 * @returns {((movie:object, moodId?:string)=>number)|null}
 *   Yeterli veri yoksa null (yeni kullanıcı / düşük confidence) → sahte yüzde gösterilmez.
 */
export function buildMatcher(tasteMap) {
  if (!tasteMap || tasteMap.confidence === 'low') return null;

  const genreWeight = {};
  let maxG = 1;
  for (const g of tasteMap.top_genres || []) {
    if (g && g.genre_id != null) {
      const s = g.score || 0;
      genreWeight[g.genre_id] = s;
      if (s > maxG) maxG = s;
    }
  }
  const hasGenres = Object.keys(genreWeight).length > 0;
  const moodPct = tasteMap.mood_pct || {};

  return function match(movie, moodId) {
    // Taban: filmin mood ilgisi (backend mood_score) ya da nötr 72.
    const base = typeof movie?.mood_score === 'number' ? movie.mood_score : 72;

    let adj = 0;
    let weighted = false;

    // Tür örtüşmesi: kullanıcının sevdiği türler filmde varsa yukarı, hiç yoksa hafif aşağı.
    const gids = movie?.genre_ids || [];
    if (hasGenres && gids.length) {
      let g = 0;
      for (const id of gids) if (genreWeight[id]) g += genreWeight[id] / maxG;
      g = Math.min(1, g / Math.min(gids.length, 3)); // 0..1 (en çok 3 tür üzerinden ortalama)
      adj += (g - 0.4) * 30 * GENRE_W;
      weighted = true;
    }

    // Mood yakınlığı: kullanıcı bu mood'u ne kadar seviyor (mood_pct).
    const mp = moodId && moodPct[moodId] != null ? moodPct[moodId] : null;
    if (mp != null) {
      adj += (Math.min(1, mp / 35) - 0.5) * 20 * MOOD_W;
      weighted = true;
    }

    if (!weighted) return Math.round(base);
    return Math.max(60, Math.min(99, Math.round(base + adj)));
  };
}

export default buildMatcher;
