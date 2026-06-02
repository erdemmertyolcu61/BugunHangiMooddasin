/**
 * streak.js — günlük açılış serisi (retention mekaniği).
 *
 * Tanım: kullanıcı uygulamayı günde bir kez açınca seri ilerler. Bir gün
 * atlanırsa seri sıfırlanır ("tatlı baskı"). localStorage tabanlı (oracleRank
 * ile aynı desen); native'de secure storage'a taşınabilir (Faz 2).
 */

const KEY = 'fc_streak'; // { current, best, lastDay: 'YYYY-MM-DD' }

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function dayDiff(a, b) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

/** Mevcut seri durumu: { current, best, lastDay }. */
export function getStreak() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { current: s.current || 0, best: s.best || 0, lastDay: s.lastDay || null };
  } catch {
    return { current: 0, best: 0, lastDay: null };
  }
}

/**
 * Açılışta çağrılır. Bugün ilk açılışsa seriyi günceller.
 * Döner: { current, best, lastDay, changed, increased, reset }
 *  - changed: bugün ilk kez işlendi mi
 *  - increased: seri arttı mı (dün → bugün)
 *  - reset: gün atlandığı için 1'e döndü mü
 */
export function recordStreakOpen() {
  try {
    const today = todayStr();
    const s = getStreak();
    if (s.lastDay === today) return { ...s, changed: false, increased: false, reset: false };

    let current;
    let reset = false;
    if (s.lastDay && dayDiff(s.lastDay, today) === 1) {
      current = s.current + 1; // dün de açmış → seri devam
    } else {
      current = 1;             // ilk gün veya gün atlanmış → yeniden başla
      reset = !!s.lastDay && s.current > 1;
    }
    const best = Math.max(s.best || 0, current);
    const next = { current, best, lastDay: today };
    localStorage.setItem(KEY, JSON.stringify(next));
    return { ...next, changed: true, increased: current > s.current, reset };
  } catch {
    return { current: 0, best: 0, lastDay: null, changed: false, increased: false, reset: false };
  }
}

/** Milestone eşikleri (kutlama/rozet için). */
export const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100];
export function isStreakMilestone(n) {
  return STREAK_MILESTONES.includes(n);
}
