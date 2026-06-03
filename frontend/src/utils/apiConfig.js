/**
 * API Configuration for Gourmet Cinema Club.
 * Vite development proxy (vite.config.js) handles /api -> backend (8002).
 * Production: VITE_API_BASE_URL env ile backend adresini belirt.
 */

export const DIRECT_BASE = "http://127.0.0.1:8002";

// ─── API tabanı: SAME-ORIGIN proxy ───
// API/XHR çağrıları RELATIVE ("/api/...") yapılır → hem dev (vite proxy) hem
// prod (Vercel rewrite, vercel.json) backend'e same-origin olarak iletir.
// Neden: iOS standalone PWA'da cross-origin fetch WebKit tarafından
// "TypeError: Load failed" ile engelleniyordu (CORS/ITP). Same-origin'de bu yok.
export const API_BASE_URL = "";

// Backend'in MUTLAK adresi — yalnız tarayıcıda açılan (fetch değil) paylaşım/OG
// linkleri için. Env yoksa canlı Railway'e düşer (eski onrender KAPALI).
const BACKEND_ABSOLUTE = (import.meta.env.VITE_API_BASE_URL
  || "https://bug-nhangimooddas-n-production.up.railway.app").replace(/\/$/, "");

// Kanonik herkese açık FRONTEND adresi — paylaşım/QR linkleri için TEK kaynak.
// `window.location.origin` web'de doğru ama native (Capacitor) içinde
// "capacitor://localhost" döner → paylaşılan linkler bozulur. Bu sabiti
// kullanan kod hem web hem native'de doğru linki üretir. İleride özel domaine
// (ör. sinemood.app) geçişte yalnız burası / VITE_SITEMAP_HOST değişir.
export const CANONICAL_URL = (import.meta.env.VITE_SITEMAP_HOST
  || "https://bug-n-hangi-mooddas-n.vercel.app").replace(/\/$/, "");

export const getApiUrl = (path) => {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${cleanPath}`; // relative → same-origin proxy
};

/**
 * Paylaşım/OG linki üretir — MUTLAK backend URL'si döner. Bu linkler dış
 * uygulamalarda/sekmede açılır (fetch değil, navigasyon) ve backend OG meta'sını
 * sunar; o yüzden same-origin proxy'ye değil doğrudan backend'e gitmeli.
 */
export const getShareUrl = (path) => {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${BACKEND_ABSOLUTE}${cleanPath}`;
};

/**
 * Avatar URL çözümleyici — /uploads veya /api ile başlayan yolları same-origin
 * proxy üzerinden (relative) döndürür. Google/harici URL'leri olduğu gibi.
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
