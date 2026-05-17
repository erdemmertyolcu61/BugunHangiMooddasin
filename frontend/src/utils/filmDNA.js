// Mood → DNA eksenleri: hız(0-100), karanlık(0-100), duygu(0-100), bağımsız(0-100), nostalji(0-100)
export const MOOD_DNA = {
  battaniye:    { hiz: 15, karanlik: 5,  duygu: 65, bagimsiz: 20, nostalji: 45 },
  yolculuk:     { hiz: 60, karanlik: 20, duygu: 50, bagimsiz: 40, nostalji: 30 },
  gece:         { hiz: 50, karanlik: 85, duygu: 45, bagimsiz: 35, nostalji: 55 },
  kahkaha:      { hiz: 70, karanlik: 5,  duygu: 55, bagimsiz: 25, nostalji: 20 },
  gozyasi:      { hiz: 25, karanlik: 50, duygu: 95, bagimsiz: 45, nostalji: 60 },
  adrenalin:    { hiz: 95, karanlik: 45, duygu: 30, bagimsiz: 15, nostalji: 20 },
  askbahcesi:   { hiz: 30, karanlik: 10, duygu: 85, bagimsiz: 30, nostalji: 35 },
  zamanyolcusu: { hiz: 25, karanlik: 35, duygu: 60, bagimsiz: 30, nostalji: 95 },
  sessiz:       { hiz: 10, karanlik: 30, duygu: 55, bagimsiz: 75, nostalji: 50 },
  zihin:        { hiz: 55, karanlik: 55, duygu: 35, bagimsiz: 60, nostalji: 25 },
  kalp:         { hiz: 20, karanlik: 35, duygu: 70, bagimsiz: 95, nostalji: 40 },
  karmakar:     { hiz: 35, karanlik: 65, duygu: 50, bagimsiz: 90, nostalji: 30 },
  Retro:        { hiz: 65, karanlik: 40, duygu: 45, bagimsiz: 20, nostalji: 90 },
  'deep-chills':{ hiz: 20, karanlik: 90, duygu: 60, bagimsiz: 55, nostalji: 35 },
};

export const DNA_AXES = [
  { key: 'hiz',      label: 'Hız' },
  { key: 'karanlik', label: 'Karanlık' },
  { key: 'duygu',    label: 'Duygu' },
  { key: 'bagimsiz', label: 'Bağımsız' },
  { key: 'nostalji', label: 'Nostalji' },
];

// Kullanıcının top_moods'undan ağırlıklı DNA hesapla
export function computeDNA(topMoods) {
  if (!topMoods || topMoods.length === 0) return null;

  const total = topMoods.reduce((s, m) => s + (m.score || 1), 0);
  const result = { hiz: 0, karanlik: 0, duygu: 0, bagimsiz: 0, nostalji: 0 };

  for (const m of topMoods) {
    const dna = MOOD_DNA[m.mood_id];
    if (!dna) continue;
    const w = (m.score || 1) / total;
    for (const key of Object.keys(result)) {
      result[key] += dna[key] * w;
    }
  }

  // Round
  for (const k of Object.keys(result)) result[k] = Math.round(result[k]);
  return result;
}

// DNA profilinden unvan üret
export function getDNATitle(dna) {
  if (!dna) return { title: 'Sinema Gezgini', emoji: '🎬' };

  const { hiz, karanlik, duygu, bagimsiz, nostalji } = dna;
  const max = Math.max(hiz, karanlik, duygu, bagimsiz, nostalji);

  if (max === karanlik && karanlik > 70) return { title: 'Gece Kartalı',      emoji: '🦅' };
  if (max === duygu    && duygu > 70)    return { title: 'Duygu Mimarı',      emoji: '💎' };
  if (max === bagimsiz && bagimsiz > 70) return { title: 'Bağımsız Ruh',      emoji: '🌿' };
  if (max === nostalji && nostalji > 70) return { title: 'Zaman Yolcusu',     emoji: '⏳' };
  if (max === hiz      && hiz > 70)      return { title: 'Adrenalin Avcısı',  emoji: '⚡' };
  if (duygu > 60 && bagimsiz > 50)       return { title: 'Festival Ruhu',     emoji: '🏆' };
  if (karanlik > 50 && duygu > 50)       return { title: 'Noir Şairi',        emoji: '🖤' };
  if (nostalji > 60 && hiz < 40)         return { title: 'Klasik Sever',      emoji: '📽️' };
  return                                        { title: 'Sinema Gezgini',    emoji: '🎬' };
}
