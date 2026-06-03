import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './context/ToastContext';
import { AchievementProvider } from './components/AchievementCelebration';
import { initAnalytics, track, trackAppOpen, EVENTS } from './utils/analytics';
import { recordStreakOpen } from './utils/streak';
import { captureReferral } from './context/AuthContext';

// Gizlilik-dostu analytics (yapılandırılmadıysa no-op)
initAnalytics();
track(EVENTS.LANDING);
trackAppOpen(); // app_open + day_n + D1/D7 retention sinyalleri

// Günlük açılış serisi (retention) — açılışta bir kez işlenir
const _streak = recordStreakOpen();
if (_streak.changed && _streak.current > 1) track('streak_continue', { n: _streak.current });

// Davet linki ?ref=<username> yakala (kayıt öncesi sakla)
captureReferral();
if (new URLSearchParams(window.location.search).get('ref')) {
  track(EVENTS.INVITE_LANDING);
}

// ─── Aktiflik ping'i (5 dk) — pasif kullanıcı re-engagement push'u için ───
// last_active'i günceller; 7+ gün ping göndermeyen kullanıcı hatırlatma push'u alır.
(() => {
  const ping = () => {
    fetch('/api/users/ping', { method: 'POST', keepalive: true }).catch(() => {});
  };
  ping();
  setInterval(ping, 300000); // 5 dakika
})();

// ─── Backend Cold-Start Warm-Up ───
// Render free tier 15dk boştan sonra uyur; ilk istek ~30sn sürer.
// React render'dan ÖNCE fire-and-forget ping → kullanıcı ana sayfayı
// okurken backend arka planda uyanır, mood'a tıklayınca hazır olur.
(() => {
  try {
    // Same-origin (dev: vite proxy, prod: vercel rewrite) → cross-origin gerekmez.
    fetch('/api/health', { method: 'GET', keepalive: true }).catch(() => {});
  } catch { /* sessizce geç */ }
})();

// ─── Kalıcı depolama isteği ───
// Bazı tarayıcılarda (özellikle iOS Safari ITP) localStorage 7 gün
// etkileşimsizlikte tahliye edilebilir → kullanıcı tekrar giriş yapmak zorunda kalır.
// persist() best-effort; kurulu PWA'da genelde otomatik verilir. Tam çözüm native
// secure storage (Capacitor) — bu yalnız hafifletme.
(() => {
  try {
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persisted().then((already) => {
        if (!already) navigator.storage.persist().catch(() => {});
      }).catch(() => {});
    }
  } catch { /* sessizce geç */ }
})();

// ─── PWA Service Worker — her açılışta/öne gelişte güncelleme kontrolü ───
// iOS PWA'da WKWebView SW güncellemesini kendi kendine kontrol etmez.
// visibilitychange + reg.update() ile her kullanıcı en geç bir sonraki
// açılışında Railway'deki son sürümü alır. Tüm platformlarda çalışır.
(() => {
  try {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js');
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          navigator.serviceWorker.getRegistration().then(r => r?.update());
        }
      });
    }
  } catch { /* sessizce geç */ }
})();

// Eski deploy chunk'ı 404 verince (sekme uzun süre açık kalıp yeni deploy gelince)
// sayfayı bir kez yenile — "Failed to fetch dynamically imported module" hatasını çözer.
const RELOAD_FLAG = 'fc_chunk_reloaded';
function isChunkLoadError(msg) {
  return /dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk/i.test(msg || '');
}
window.addEventListener('error', (e) => {
  if (isChunkLoadError(e?.message) && !sessionStorage.getItem(RELOAD_FLAG)) {
    sessionStorage.setItem(RELOAD_FLAG, '1');
    window.location.reload();
  }
});
window.addEventListener('unhandledrejection', (e) => {
  if (isChunkLoadError(e?.reason?.message) && !sessionStorage.getItem(RELOAD_FLAG)) {
    sessionStorage.setItem(RELOAD_FLAG, '1');
    window.location.reload();
  }
});
// Başarılı yüklemede bayrağı temizle ki sonsuz döngü olmasın
window.addEventListener('load', () => {
  setTimeout(() => sessionStorage.removeItem(RELOAD_FLAG), 5000);
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <AchievementProvider>
          <App />
        </AchievementProvider>
      </ToastProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
