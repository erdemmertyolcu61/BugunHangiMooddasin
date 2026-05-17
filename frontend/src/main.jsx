import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

import { ErrorBoundary } from './components/ErrorBoundary';

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
