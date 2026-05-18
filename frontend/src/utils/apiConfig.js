/**
 * API Configuration for Gourmet Cinema Club.
 * Vite development proxy (vite.config.js) handles /api -> backend (8002).
 * Production: VITE_API_BASE_URL env ile backend adresini belirt.
 */

// Vite dev'de proxy kullan (relative path -> ayni origin -> CORS yok)
// Production'da VITE_API_BASE_URL ile backend adresini set et
const PROXY_BASE = "";  // relative: /api/movies/turkish gibi
const DIRECT_BASE = "http://127.0.0.1:8002";

// Vite dev server'da proxy calisir, production'da direkt baglanti gerekir
const isDev = import.meta.env.DEV;
const prodBase = import.meta.env.VITE_API_BASE_URL;
if (!isDev && !prodBase) {
  console.error("[API] VITE_API_BASE_URL not set! Frontend cannot reach backend.");
}
export const API_BASE_URL = isDev ? PROXY_BASE : (prodBase || DIRECT_BASE);

export const getApiUrl = (path) => {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${cleanPath}`;
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
