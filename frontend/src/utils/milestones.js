/**
 * milestones.js — Defterim başarımları ("10 film izledin", "ilk eleştirin").
 *
 * Playbook'un "progress visibility" + "başarı anı" taktiği: kullanıcı ne kadar
 * yol geldiğini görür, eşik aşınca küçük bir kutlama alır. Tamamen cihazda
 * (localStorage) — açılan başarımlar tek sefer kutlanır.
 *
 * İstatistik girdisi: { saved, watched, notes } (Defterim hesaplar).
 * UI ikonları MilestonesStrip içinde (util'i lucide'den bağımsız tutmak için).
 */

const KEY = 'fc_milestones'; // açılan başarım id listesi (JSON array)

/** Başarım kataloğu — eşik küçükten büyüğe. `type` istatistik anahtarı. */
export const MILESTONES = [
  // ── Arşiv (kaydedilen film) ──
  { id: 'saved_1',    type: 'saved',   threshold: 1,   icon: 'BookMarked', title: 'İlk Sayfa',       blurb: 'Defterine ilk filmini ekledin.' },
  { id: 'saved_10',   type: 'saved',   threshold: 10,  icon: 'Library',    title: 'Koleksiyoner',    blurb: '10 film arşivledin.' },
  { id: 'saved_25',   type: 'saved',   threshold: 25,  icon: 'Library',    title: 'Sinefil Arşivi',  blurb: '25 film defterinde duruyor.' },
  { id: 'saved_50',   type: 'saved',   threshold: 50,  icon: 'Library',    title: 'Küratör',         blurb: '50 film — zevkin iyice şekillendi.' },
  { id: 'saved_100',  type: 'saved',   threshold: 100, icon: 'Crown',      title: 'Usta Arşivci',    blurb: '100 film! Kendi sinemateğini kurdun.' },
  // ── İzleme ──
  { id: 'watched_1',  type: 'watched', threshold: 1,   icon: 'Eye',        title: 'İlk Perde',       blurb: 'İlk filmini izledin olarak işaretledin.' },
  { id: 'watched_10', type: 'watched', threshold: 10,  icon: 'Film',       title: '10 Film İzledin', blurb: 'Karanlık salonun müdavimisin.' },
  { id: 'watched_25', type: 'watched', threshold: 25,  icon: 'Film',       title: 'Maraton',         blurb: '25 film bitti.' },
  { id: 'watched_50', type: 'watched', threshold: 50,  icon: 'Film',       title: 'Sinema Tutkunu',  blurb: '50 film izledin.' },
  { id: 'watched_100',type: 'watched', threshold: 100, icon: 'Crown',      title: 'Yüz Film Kulübü', blurb: '100 film! Üstad gururlu.' },
  // ── Eleştiri (gurme notu) ──
  { id: 'notes_1',    type: 'notes',   threshold: 1,   icon: 'PenLine',    title: 'İlk Eleştirin',   blurb: 'İlk gurme notunu düştün.' },
  { id: 'notes_10',   type: 'notes',   threshold: 10,  icon: 'PenLine',    title: 'Kalem Açıldı',    blurb: '10 filme not yazdın.' },
  { id: 'notes_25',   type: 'notes',   threshold: 25,  icon: 'Feather',    title: 'Eleştirmen',      blurb: '25 eleştiri — sesin oluştu.' },
];

const TYPE_LABEL = { saved: 'kayıt', watched: 'izleme', notes: 'eleştiri' };

function readUnlocked() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/**
 * İstatistiklere göre tüm başarımları döndürür (ilerleme çubuğu için).
 * Her öğe: { ...def, current, achieved, progress (0–1), label }.
 */
export function computeMilestones(stats = {}) {
  const s = {
    saved: stats.saved || 0,
    watched: stats.watched || 0,
    notes: stats.notes || 0,
  };
  return MILESTONES.map((m) => {
    const current = s[m.type] || 0;
    return {
      ...m,
      current,
      achieved: current >= m.threshold,
      progress: Math.max(0, Math.min(1, current / m.threshold)),
      label: TYPE_LABEL[m.type] || '',
    };
  });
}

/**
 * Açılmış ama daha önce kutlanmamış başarımları tespit eder; kalıcı listeye
 * ekler ve döner (kutlama için). İlk çağrıda zaten açık olanları "sessiz"
 * işaretleme seçeneği: silent=true → kutlama yok, sadece kaydet (ilk yüklemede
 * geçmiş başarımlar toast bombardımanı yapmasın diye).
 */
export function detectNewMilestones(stats, { silent = false } = {}) {
  try {
    const unlocked = new Set(readUnlocked());
    const achieved = computeMilestones(stats).filter((m) => m.achieved);
    const fresh = achieved.filter((m) => !unlocked.has(m.id));
    if (fresh.length === 0) return [];
    fresh.forEach((m) => unlocked.add(m.id));
    localStorage.setItem(KEY, JSON.stringify([...unlocked]));
    return silent ? [] : fresh;
  } catch {
    return [];
  }
}

/** Açılan başarım sayısı / toplam (özet rozet için). */
export function milestoneSummary(stats) {
  const all = computeMilestones(stats);
  return { unlocked: all.filter((m) => m.achieved).length, total: all.length };
}
