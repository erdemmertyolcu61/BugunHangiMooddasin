import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

import { ErrorBoundary } from './components/ErrorBoundary';

// ─── Backend Cold-Start Warm-Up ───
// Render free tier 15dk boştan sonra uyur; ilk istek ~30sn sürer.
// React render'dan ÖNCE fire-and-forget ping → kullanıcı ana sayfayı
// okurken backend arka planda uyanır, mood'a tıklayınca hazır olur.
(() => {
  try {
    const base = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_BASE_URL || '');
    fetch(`${base}/api/health`, { method: 'GET', mode: 'cors', keepalive: true }).catch(() => {});
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
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
