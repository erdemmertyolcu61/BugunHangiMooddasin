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

// ── KVKK/gizlilik onayı ──────────────────────────────────────────────
// Analytics yalnız kullanıcı onay verdiğinde başlar. Onay yoksa tamamen no-op.
const CONSENT_KEY = 'fc_consent';
export function hasAnalyticsConsent() {
  try { return localStorage.getItem(CONSENT_KEY) === '1'; } catch { return false; }
}
/** Onay ver + (yapılandırılmışsa) analytics'i hemen başlat. */
export function grantAnalyticsConsent() {
  try { localStorage.setItem(CONSENT_KEY, '1'); } catch { /* sessiz */ }
  initAnalytics();
}
export function revokeAnalyticsConsent() {
  try { localStorage.setItem(CONSENT_KEY, '0'); } catch { /* sessiz */ }
}

/** Standart olay adları — tutarlılık için tek kaynak. */
export const EVENTS = {
  LANDING: 'landing',
  MOOD_SELECT: 'mood_select',
  SURPRISE_VIEW: 'surprise_view',
  CONFUSED_SUBMIT: 'confused_submit',
  RESULT_VIEW: 'result_view',
  FILM_INSPECT: 'film_inspect',
  SAVE_MOVIE: 'save_movie',
  SIGNUP: 'signup',
  SHARE_CLICK: 'share_click',
  INVITE_LANDING: 'invite_landing',
  INVITED_SIGNUP: 'invited_signup',
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
}

/** Sağlayıcı yapılandırılmış mı (test/dallanma için). */
export const isAnalyticsEnabled = () => enabled;

export default { track, initAnalytics, EVENTS, isAnalyticsEnabled };
