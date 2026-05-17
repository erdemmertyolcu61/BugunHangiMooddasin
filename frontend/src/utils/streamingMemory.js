/**
 * Akıllı Yayın Platformu Hafızası (Streaming Memory Engine)
 * ─────────────────────────────────────────────────────────
 * Kullanıcının hangi yayın platformlarında aktif hesabı olduğu tercihini
 * HİÇBİR ŞİFRE/KİMLİK BİLGİSİ TUTMADAN saklar. Sadece "bu platformu
 * eşleştirdim" bayrakları + tercih sırası tutulur.
 *
 * İlk tıklama → onay modalı → platform "linked" işaretlenir.
 * Sonraki tıklamalar → soru sorulmadan doğrudan deep-link'e gider.
 *
 * Not: localStorage içeriği hafif obfuscation (XOR + base64) ile saklanır.
 * Bu kriptografik güvenlik değildir — zaten hassas veri yoktur; amaç
 * verinin düz metin olarak göze çarpmamasıdır.
 */

const STORE_KEY = 'fc_streaming_vault_v1';
const XOR_KEY = 'fc-streaming-2026';

function _xor(str) {
  let out = '';
  for (let i = 0; i < str.length; i++) {
    out += String.fromCharCode(str.charCodeAt(i) ^ XOR_KEY.charCodeAt(i % XOR_KEY.length));
  }
  return out;
}

function _encode(obj) {
  try {
    return btoa(unescape(encodeURIComponent(_xor(JSON.stringify(obj)))));
  } catch {
    return '';
  }
}

function _decode(raw) {
  try {
    return JSON.parse(decodeURIComponent(escape(_xor(atob(raw)))));
  } catch {
    return null;
  }
}

const DEFAULT_VAULT = { linked: {}, preferred: [], updated_at: null };

export function getVault() {
  const raw = localStorage.getItem(STORE_KEY);
  if (!raw) return { ...DEFAULT_VAULT };
  const decoded = _decode(raw);
  return decoded && typeof decoded === 'object'
    ? { ...DEFAULT_VAULT, ...decoded }
    : { ...DEFAULT_VAULT };
}

function saveVault(vault) {
  vault.updated_at = new Date().toISOString();
  localStorage.setItem(STORE_KEY, _encode(vault));
}

export function isPlatformLinked(providerId) {
  return !!getVault().linked[String(providerId)];
}

export function linkPlatform(providerId) {
  const vault = getVault();
  vault.linked[String(providerId)] = true;
  if (!vault.preferred.includes(String(providerId))) {
    vault.preferred.unshift(String(providerId));
  }
  saveVault(vault);
}

export function unlinkPlatform(providerId) {
  const vault = getVault();
  delete vault.linked[String(providerId)];
  vault.preferred = vault.preferred.filter((p) => p !== String(providerId));
  saveVault(vault);
}

export function clearVault() {
  localStorage.removeItem(STORE_KEY);
}

/**
 * PlatformMapping — TMDB provider_id → erişim bilgisi.
 * web(title): platformun film arama/oynatma URL'i (platforma özel film id'si
 *   olmadığı için en isabetli yöntem başlık aramasıdır).
 * app(title): mobil deep-link şeması (destekleyen platformlarda).
 * home: oturum açık değilse düşülecek ana sayfa.
 */
const PLATFORM_MAPPING = {
  8:    { name: 'Netflix',        color: '#E50914', web: (t) => `https://www.netflix.com/search?q=${encodeURIComponent(t)}`, app: (t) => `nflx://www.netflix.com/search?q=${encodeURIComponent(t)}`, home: 'https://www.netflix.com' },
  337:  { name: 'Disney+',        color: '#113CCF', web: (t) => `https://www.disneyplus.com/search?q=${encodeURIComponent(t)}`, app: null, home: 'https://www.disneyplus.com' },
  119:  { name: 'Amazon Prime',   color: '#00A8E1', web: (t) => `https://www.primevideo.com/search?phrase=${encodeURIComponent(t)}`, app: null, home: 'https://www.primevideo.com' },
  10:   { name: 'Amazon Video',   color: '#00A8E1', web: (t) => `https://www.amazon.com/s?k=${encodeURIComponent(t)}&i=instant-video`, app: null, home: 'https://www.amazon.com/gp/video' },
  350:  { name: 'Apple TV+',      color: '#000000', web: (t) => `https://tv.apple.com/search?term=${encodeURIComponent(t)}`, app: null, home: 'https://tv.apple.com' },
  2:    { name: 'Apple TV',       color: '#000000', web: (t) => `https://tv.apple.com/search?term=${encodeURIComponent(t)}`, app: null, home: 'https://tv.apple.com' },
  3:    { name: 'Google Play',    color: '#01875F', web: (t) => `https://play.google.com/store/search?q=${encodeURIComponent(t)}&c=movies`, app: null, home: 'https://play.google.com/store/movies' },
  188:  { name: 'YouTube',        color: '#FF0000', web: (t) => `https://www.youtube.com/results?search_query=${encodeURIComponent(t + ' full film')}`, app: null, home: 'https://www.youtube.com/movies' },
  192:  { name: 'YouTube',        color: '#FF0000', web: (t) => `https://www.youtube.com/results?search_query=${encodeURIComponent(t + ' full film')}`, app: null, home: 'https://www.youtube.com/movies' },
  341:  { name: 'BluTV',          color: '#00B6F1', web: (t) => `https://www.blutv.com/arama?q=${encodeURIComponent(t)}`, app: null, home: 'https://www.blutv.com' },
  1899: { name: 'MUBI',          color: '#001E3C', web: (t) => `https://mubi.com/search/films?query=${encodeURIComponent(t)}`, app: null, home: 'https://mubi.com' },
  531:  { name: 'Paramount+',     color: '#0064FF', web: (t) => `https://www.paramountplus.com/search/?query=${encodeURIComponent(t)}`, app: null, home: 'https://www.paramountplus.com' },
  1796: { name: 'puhuTV',         color: '#FF6A00', web: (t) => `https://puhutv.com/arama?q=${encodeURIComponent(t)}`, app: null, home: 'https://puhutv.com' },
  1898: { name: 'Gain',           color: '#FF2D55', web: (t) => `https://www.gain.tv/arama?q=${encodeURIComponent(t)}`, app: null, home: 'https://www.gain.tv' },
};

export function getPlatformInfo(providerId) {
  return PLATFORM_MAPPING[providerId] || null;
}

/**
 * Filmi ilgili platformda açacak en isabetli URL'i üretir.
 * Mobilde app deep-link şeması varsa onu, değilse web URL'ini döndürür.
 * fallbackLink: TMDB/JustWatch toplu linki (eşleşme yoksa kullanılır).
 */
export function buildWatchUrl(providerId, movieTitle, fallbackLink = null) {
  const info = PLATFORM_MAPPING[providerId];
  if (!info) return fallbackLink || '#';
  const title = (movieTitle || '').trim();
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
  if (isMobile && info.app && title) return info.app(title);
  if (title) return info.web(title);
  return info.home;
}
