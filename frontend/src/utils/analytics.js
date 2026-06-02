/**
 * analytics.js — hafif, gizlilik-dostu olay (event) sarmalayıcı.
 *
 * Amaç: büyüme hunisini ölçmek (landing → mood → sonuç → kayıt → paylaşım → davet).
 * Sağlayıcı bağımsız: Umami (self-host, ücretsiz) veya Plausible script'i
 * yüklendiğinde otomatik kullanılır. Hiçbiri yapılandırılmamışsa TAMAMEN no-op
 * (hata fırlatmaz, performans etkisi yok).
 *
 * Yapılandırma (.env / Render static site env):
 *   VITE_ANALYTICS_PROVIDER = "umami" | "plausible" | "" (boş = kapalı)
 *   VITE_ANALYTICS_SRC      = analytics script URL'i
 *   VITE_ANALYTICS_SITE_ID  = Umami website-id (umami için zorunlu)
 *   VITE_ANALYTICS_DOMAIN   = Plausible domain (plausible için zorunlu)
 *
 * Kullanım:
 *   import { track, EVENTS, initAnalytics } from '../utils/analytics';
 *   track(EVENTS.MOOD_SELECT, { mood: 'gece' });
 */

const PROVIDER = (import.meta.env.VITE_ANALYTICS_PROVIDER || '').toLowerCase();
const SRC = import.meta.env.VITE_ANALYTICS_SRC || '';
const SITE_ID = import.meta.env.VITE_ANALYTICS_SITE_ID || '';
const DOMAIN = import.meta.env.VITE_ANALYTICS_DOMAIN || '';

const enabled = !!PROVIDER && !!SRC;
let _booted = false;

// ── KVKK/gizlilik: çerezsiz analitik (opt-OUT modeli) ────────────────
// Umami çerezsiz ve anonimdir (çerez yok, IP saklanmaz, kişisel veri yok) →
// KVKK'da çerezsiz anonim sayım meşru menfaat kapsamında rıza-kapısı
// gerektirmeden yüklenebilir. Bu yüzden VARSAYILAN AÇIK; yalnızca kullanıcı
// açıkça "kapat" derse ('0') devre dışı kalır. Banner artık opt-out (bilgilendirme).
const CONSENT_KEY = 'fc_consent';
export function hasAnalyticsConsent() {
  try { return localStorage.getItem(CONSENT_KEY) !== '0'; } catch { return true; }
}
/** Kullanıcı "açık kalsın" dedi: işaretle + (yapılandırılmışsa) hemen başlat. */
export function grantAnalyticsConsent() {
  try { localStorage.setItem(CONSENT_KEY, '1'); } catch { /* sessiz */ }
  initAnalytics();
}
/** Opt-out: analitiği kapat (sonraki yüklemelerde script hiç enjekte edilmez). */
export function revokeAnalyticsConsent() {
  try { localStorage.setItem(CONSENT_KEY, '0'); } catch { /* sessiz */ }
}

/** Standart olay adları — tutarlılık için tek kaynak. */
export const EVENTS = {
  LANDING: 'landing',
  APP_OPEN: 'app_open',            // her açılış (gün-n + dönen kullanıcı)
  MOOD_SELECT: 'mood_select',
  SURPRISE_VIEW: 'surprise_view',
  CONFUSED_SUBMIT: 'confused_submit',
  RESULT_VIEW: 'result_view',
  FILM_INSPECT: 'film_inspect',
  SAVE_MOVIE: 'save_movie',
  WATCHED_MOVIE: 'watched_movie',
  SIGNUP: 'signup',
  SHARE_CLICK: 'share_click',
  INVITE_LANDING: 'invite_landing',
  INVITED_SIGNUP: 'invited_signup',
  // ── Aktivasyon & retention (Faz 1) ──
  ACTIVATED: 'activated',          // ilk değer: film_inspect + save_movie
  RETAINED_D1: 'retained_d1',
  RETAINED_D7: 'retained_d7',
  // ── Bildirim ──
  NOTIF_ENABLED: 'notif_enabled',
  // ── Monetizasyon (Faz 3'te tetiklenecek) ──
  PAYWALL_VIEW: 'paywall_view',
  TRIAL_START: 'trial_start',
  SUBSCRIBE: 'subscribe',
  AD_IMPRESSION: 'ad_impression',
};

/**
 * Analytics script'ini bir kez DOM'a enjekte eder. Yapılandırma yoksa no-op.
 * main.jsx içinde uygulama açılışında çağrılır.
 */
export function initAnalytics() {
  if (!enabled || _booted || typeof document === 'undefined') return;
  if (!hasAnalyticsConsent()) return; // onay verilene kadar bekle
  _booted = true;
  try {
    const s = document.createElement('script');
    s.async = true;
    s.defer = true;
    s.src = SRC;
    if (PROVIDER === 'umami') {
      if (!SITE_ID) return;
      s.setAttribute('data-website-id', SITE_ID);
    } else if (PROVIDER === 'plausible') {
      if (DOMAIN) s.setAttribute('data-domain', DOMAIN);
    }
    document.head.appendChild(s);
  } catch {
    /* sessizce geç — analytics asla uygulamayı bozmamalı */
  }
}

/**
 * Bir olayı kaydeder. Sağlayıcı yüklü değilse sessizce yutar.
 * @param {string} event  EVENTS sabitlerinden biri (veya serbest metin)
 * @param {object} [props] İsteğe bağlı özellikler (mood, kaynak vb.)
 */
export function track(event, props = {}) {
  if (!enabled || !event || typeof window === 'undefined') return;
  if (!hasAnalyticsConsent()) return; // onaysız ölçüm yok
  try {
    if (PROVIDER === 'umami' && window.umami?.track) {
      window.umami.track(event, props);
    } else if (PROVIDER === 'plausible' && typeof window.plausible === 'function') {
      window.plausible(event, { props });
    }
  } catch {
    /* no-op */
  }

  // Aktivasyon sinyali — film_inspect + save_movie birlikte → 'activated' (bir kez)
  if (event === EVENTS.FILM_INSPECT) _recordActivation('inspect');
  else if (event === EVENTS.SAVE_MOVIE) _recordActivation('save');
}

// ── Aktivasyon & retention yardımcıları ──────────────────────────────
const ACT_KEY = 'fc_activation'; // {inspect, save, done}

/** Aktivasyon sinyali kaydet; her iki sinyal toplanınca ACTIVATED bir kez tetiklenir. */
function _recordActivation(signal) {
  try {
    const cur = JSON.parse(localStorage.getItem(ACT_KEY) || '{}');
    if (cur.done) return;
    cur[signal] = true;
    if (cur.inspect && cur.save) {
      cur.done = true;
      track(EVENTS.ACTIVATED);
    }
    localStorage.setItem(ACT_KEY, JSON.stringify(cur));
  } catch { /* sessiz */ }
}

const FIRST_OPEN_KEY = 'fc_first_open';   // YYYY-MM-DD
const LAST_OPEN_KEY = 'fc_last_open';
const RET_D1_KEY = 'fc_ret_d1';
const RET_D7_KEY = 'fc_ret_d7';

/**
 * Uygulama açılışında çağrılır (main.jsx). İlk açılış tarihini kaydeder, kaçıncı
 * gün olduğunu (day_n) hesaplar, APP_OPEN ile dönen-kullanıcı sinyali + D1/D7
 * retention olaylarını (bir kez) gönderir.
 */
export function trackAppOpen() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    let first = localStorage.getItem(FIRST_OPEN_KEY);
    if (!first) { first = today; localStorage.setItem(FIRST_OPEN_KEY, first); }
    const dayN = Math.max(0, Math.round((Date.parse(today) - Date.parse(first)) / 86400000));
    localStorage.setItem(LAST_OPEN_KEY, today);
    // Olay gönderimi + retention flag'leri yalnız analytics aktif + onaylıyken
    // (yoksa onaysız açılışta flag yanıp event kaybolurdu).
    if (!enabled || !hasAnalyticsConsent()) return;
    track(EVENTS.APP_OPEN, { day_n: dayN, returning: dayN > 0 });
    if (dayN >= 1 && !localStorage.getItem(RET_D1_KEY)) {
      localStorage.setItem(RET_D1_KEY, '1');
      track(EVENTS.RETAINED_D1, { day_n: dayN });
    }
    if (dayN >= 7 && !localStorage.getItem(RET_D7_KEY)) {
      localStorage.setItem(RET_D7_KEY, '1');
      track(EVENTS.RETAINED_D7, { day_n: dayN });
    }
  } catch { /* sessiz */ }
}

/** Sağlayıcı yapılandırılmış mı (test/dallanma için). */
export const isAnalyticsEnabled = () => enabled;

export default { track, initAnalytics, EVENTS, isAnalyticsEnabled };
