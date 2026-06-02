/**
 * API Configuration for Gourmet Cinema Club.
 * Vite development proxy (vite.config.js) handles /api -> backend (8002).
 * Production: VITE_API_BASE_URL env ile backend adresini belirt.
 */

// Vite dev'de proxy kullan (relative path -> ayni origin -> CORS yok)
// Production'da VITE_API_BASE_URL ile backend adresini set et
const PROXY_BASE = "";  // relative: /api/movies/turkish gibi
export const DIRECT_BASE = "http://127.0.0.1:8002";

// Vite dev server'da proxy calisir, production'da direkt baglanti gerekir
const isDev = import.meta.env.DEV;
// NOT: eski onrender backend KAPALI. Env set değilse canlı Railway backend'e düş
// (ölü host'a giden istekler "Bağlantı hatası" / push gelmeme sebebiydi).
const prodBase = import.meta.env.VITE_API_BASE_URL || "https://bug-nhangimooddas-n-production.up.railway.app";
if (!isDev && !prodBase) {
  console.error("[API] VITE_API_BASE_URL not set! Frontend cannot reach backend.");
}
export const API_BASE_URL = isDev ? PROXY_BASE : prodBase;

export const getApiUrl = (path) => {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${cleanPath}`;
};

/**
 * Avatar URL çözümleyici — /uploads veya /api ile başlayan lokal yolları
 * API base'e bağlar. Google/harici URL'leri olduğu gibi döndürür.
 */
export const resolveAvatarUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('/uploads') || url.startsWith('/api')) {
    return `${API_BASE_URL}${url}`;
  }
  return url;
};

export const checkBackendHealth = async () => {
  try {
    const urls = [getApiUrl('/api/health'), getApiUrl('/health')];
    for (const url of urls) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
        if (response.ok) {
          console.log("[API] Backend is healthy via", url);
          return true;
        }
      } catch (_) {}
    }
  } catch (err) {
    console.warn("[API] Backend unreachable at", API_BASE_URL);
  }
  return false;
};
