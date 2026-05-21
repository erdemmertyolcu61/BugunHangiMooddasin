import { useEffect, useRef } from 'react';

/**
 * SplashScreen — Handshake Controller
 *
 * The actual splash lives in index.html as pure CSS (paints on first frame,
 * zero JS dependency). This component's sole job is to dismiss that HTML
 * splash once React is hydrated and the router has mounted.
 *
 * Flow:
 *   1. index.html renders #sinemood-splash immediately (CSS-only)
 *   2. React boots → this component mounts
 *   3. After a minimum display time (lets animations complete), we:
 *      a. Add .splash-exit class → triggers opacity fade-out (0.55s CSS transition)
 *      b. After transition ends, remove #sinemood-splash from DOM entirely
 *      c. Remove the <style id="sinemood-splash-styles"> tag to free memory
 *   4. On repeat visits within the same session, splash is removed instantly
 */

const SPLASH_KEY = 'sinemood_splash_seen_v2';
const FADE_OUT_MS   = 250;     // quick exit

function dismissSplash(immediate = false) {
  const el = document.getElementById('sinemood-splash');
  if (!el) return;

  if (immediate) {
    el.remove();
    removeSplashStyles();
    return;
  }

  // Phase 1: trigger CSS fade-out
  el.classList.add('splash-exit');

  // Phase 2: remove from DOM after transition completes
  setTimeout(() => {
    el.remove();
    removeSplashStyles();
  }, FADE_OUT_MS);
}

function removeSplashStyles() {
  const style = document.getElementById('sinemood-splash-styles');
  if (style) style.remove();
}

export default function SplashScreen() {
  // Guard against React StrictMode double-mount: the first mount sets
  // sessionStorage, StrictMode unmounts (clearing timer), then re-mounts
  // and sees the key → instant dismiss. Using a module-level flag avoids this.
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const splashEl = document.getElementById('sinemood-splash');

    // No splash element → nothing to do (already removed)
    if (!splashEl) return;

    // Repeat visit this session → remove immediately, no animation
    if (sessionStorage.getItem(SPLASH_KEY)) {
      dismissSplash(true);
      return;
    }

    // First visit — mark session, then dismiss immediately.
    // CSS splash animation has been playing for hundreds of ms by hydration time.
    sessionStorage.setItem(SPLASH_KEY, '1');
    dismissSplash(false);
  }, []);

  // This component renders nothing — the splash is in index.html
  return null;
}
