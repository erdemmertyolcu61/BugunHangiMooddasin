/**
 * Mood Kâhini — "Üstad'ın Güveni / Sinefil Rütbesi" ilerleme yardımcıları.
 * Skor cihazda (localStorage) tutulur; giriş gerektirmez.
 */
const TRUST_KEY = 'fc_oracle_trust';
const BEST_KEY = 'fc_oracle_best';
const GAMES_KEY = 'fc_oracle_games';

const START_TRUST = 30;
const CORRECT_DELTA = 6;
const WRONG_DELTA = -8;

/** Eşiğe göre rütbe (büyükten küçüğe ilk uyan). */
const RANKS = [
  { min: 85, name: 'Kült', blurb: 'Üstad sana kıskançlıkla bakıyor.' },
  { min: 65, name: "Üstad'ın Çırağı", blurb: 'Perdenin dilini neredeyse Üstad kadar iyi okuyorsun.' },
  { min: 40, name: 'Sinefil', blurb: 'Filmlerin ruhunu duyan bir kulağın var.' },
  { min: 20, name: 'Meraklı', blurb: 'Gözün açık, ama daha yolun var evlat.' },
  { min: 0, name: 'Çaylak', blurb: 'Üstad seni eğitmeye yeni başladı.' },
];

const clamp = (n) => Math.max(0, Math.min(100, n));

function readNum(key, fallback) {
  try {
    const v = parseInt(localStorage.getItem(key) ?? '', 10);
    return Number.isFinite(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

export function rankFor(trust) {
  return RANKS.find((r) => trust >= r.min) || RANKS[RANKS.length - 1];
}

export function getOracleState() {
  const trust = readNum(TRUST_KEY, START_TRUST);
  return {
    trust,
    best: readNum(BEST_KEY, trust),
    games: readNum(GAMES_KEY, 0),
    rank: rankFor(trust),
  };
}

/**
 * Oturum sonucunu uygula: her doğru +6, her yanlış -8 (0–100 clamp).
 * Döner: { before, after, delta, rank, best, games }
 */
export function applyResult(correctCount, total) {
  const before = readNum(TRUST_KEY, START_TRUST);
  const wrong = Math.max(0, total - correctCount);
  const delta = correctCount * CORRECT_DELTA + wrong * WRONG_DELTA;
  const after = clamp(before + delta);
  const best = Math.max(readNum(BEST_KEY, after), after);
  const games = readNum(GAMES_KEY, 0) + 1;
  try {
    localStorage.setItem(TRUST_KEY, String(after));
    localStorage.setItem(BEST_KEY, String(best));
    localStorage.setItem(GAMES_KEY, String(games));
  } catch { /* sessiz */ }
  return { before, after, delta, rank: rankFor(after), best, games };
}

export { RANKS };
