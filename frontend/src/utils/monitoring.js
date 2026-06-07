/**
 * Hata izleme (Sentry) — yapılandırılmadıysa tamamen no-op.
 *
 * VITE_SENTRY_DSN env değişkeni yoksa hiçbir şey yüklenmez (analytics deseni gibi).
 * @sentry/react yalnız DSN varsa dinamik import edilir → ana bundle şişmez,
 * Sentry kendi chunk'ına kod-bölünür.
 */
let _sentry = null;
let _ready = false;

export async function initMonitoring() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;
  try {
    const Sentry = await import('@sentry/react');
    Sentry.init({
      dsn,
      environment: import.meta.env.MODE,
      // Düşük örnekleme — maliyet/gürültü dengesi
      tracesSampleRate: 0.1,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
    });
    _sentry = Sentry;
    _ready = true;
  } catch (e) {
    // İzleme aracı kendisi uygulamayı asla bozmamalı
    if (import.meta.env.DEV) console.warn('[monitoring] init failed:', e);
  }
}

export function captureException(error, context) {
  if (_ready && _sentry) {
    try {
      _sentry.captureException(error, context ? { extra: context } : undefined);
      return;
    } catch { /* yut */ }
  }
  if (import.meta.env.DEV) console.error('[monitoring] (DSN yok)', error, context || '');
}

export function isMonitoringEnabled() {
  return _ready;
}
