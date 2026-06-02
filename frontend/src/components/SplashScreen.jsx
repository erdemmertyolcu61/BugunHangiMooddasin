import { useEffect, useRef } from 'react';

/**
 * SplashScreen — Handshake Controller
 *
 * The actual splash lives in index.html as pure CSS (paints on first frame,
 * zero JS dependency). This component's sole job is to dismiss that HTML
 * splash once React is hydrated and the minimum 3s cinematic window completes.
 *
 * Flow:
 *   1. index.html renders #sinemood-splash immediately (CSS-only)
 *   2. React boots → this component mounts
 *   3. On first visit: wait min 3s (background API prewarm runs during this time)
 *      then trigger CSS fade-out and remove from DOM
 *   4. On repeat visits within same session: splash removed instantly
 */

const SPLASH_KEY = 'sinemood_splash_seen_v2';
const MIN_SPLASH_MS = 3000;
const MAX_APP_WAIT_MS = 3000;
const CSS_FADE_MS = 550;

function dismissSplash(immediate = false) {
  const el = document.getElementById('sinemood-splash');
  if (!el) return;

  if (immediate) {
    el.remove();
    removeSplashStyles();
    return;
  }

  el.classList.add('splash-exit');
  setTimeout(() => {
    el.remove();
    removeSplashStyles();
  }, CSS_FADE_MS);
}

function removeSplashStyles() {
  const style = document.getElementById('sinemood-splash-styles');
  if (style) style.remove();
}

function prewarmEndpoints() {
  // Same-origin (dev: vite proxy, prod: vercel rewrite) → cross-origin gerekmez.
  return Promise.allSettled([
    fetch('/api/health').catch(() => {}),
    fetch('/api/repository/stats').catch(() => {}),
  ]);
}

function waitForAppReadiness() {
  return new Promise((resolve) => {
    if (window.__APP_READY) { resolve(); return; }
    let done = false;
    const onReady = () => { done = true; resolve(); };
    window.addEventListener('app-ready', onReady, { once: true });
    setTimeout(() => {
      if (!done) {
        window.removeEventListener('app-ready', onReady);
        resolve();
      }
    }, MAX_APP_WAIT_MS);
  });
}

export default function SplashScreen() {
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const splashEl = document.getElementById('sinemood-splash');
    if (!splashEl) return;

    if (sessionStorage.getItem(SPLASH_KEY)) {
      dismissSplash(true);
      return;
    }
    sessionStorage.setItem(SPLASH_KEY, '1');

    Promise.all([
      new Promise((r) => setTimeout(r, MIN_SPLASH_MS)),
      prewarmEndpoints(),
      waitForAppReadiness(),
    ]).then(() => {
      dismissSplash(false);
    }).catch(() => {
      dismissSplash(false);
    });
  }, []);

  return null;
}
