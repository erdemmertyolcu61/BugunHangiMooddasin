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
const MIN_DISPLAY_MS = 3400;   // Extended ritual: ignition(0.5) + trace(2.0) + bloom(0.5) + linger(0.4) = 3.4s
const FADE_OUT_MS   = 550;     // matches .splash-exit transition (opacity + scale)

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

    // First visit — mark session, then dismiss after min display time
    sessionStorage.setItem(SPLASH_KEY, '1');

    // performance.now() is ms since navigation start — which is roughly
    // when the HTML splash first painted. So it already tells us how long
    // the splash has been visible.
    const alreadyShown = performance.now();
    const remaining = Math.max(0, MIN_DISPLAY_MS - alreadyShown);

    setTimeout(() => dismissSplash(false), remaining);
  }, []);

  // This component renders nothing — the splash is in index.html
  return null;
}
