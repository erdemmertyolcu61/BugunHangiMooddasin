import { useState, useEffect, useRef } from 'react';

const SPLASH_KEY = 'sinemood_splash_seen_v2';
const MIN_SPLASH_MS = 3000;
const FADE_OUT_MS = 300;

function dismissHtmlSplash() {
  const el = document.getElementById('sinemood-splash');
  if (!el) return;
  el.classList.add('splash-exit');
  setTimeout(() => { el.remove(); }, 300);
}

function prewarmEndpoints() {
  const base = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_BASE_URL || '');
  return Promise.allSettled([
    fetch(`${base}/api/moods/config`).catch(() => {}),
    fetch(`${base}/api/search/status`).catch(() => {}),
  ]);
}

export default function SplashScreen({ children }) {
  const [phase, setPhase] = useState('splash'); // splash → fading → ready
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    dismissHtmlSplash();

    const isRepeat = sessionStorage.getItem(SPLASH_KEY);
    if (isRepeat) {
      setPhase('ready');
      return;
    }
    sessionStorage.setItem(SPLASH_KEY, '1');

    const boot = async () => {
      await Promise.all([
        new Promise((r) => setTimeout(r, MIN_SPLASH_MS)),
        prewarmEndpoints(),
      ]);
      setPhase('fading');
      setTimeout(() => setPhase('ready'), FADE_OUT_MS);
    };
    boot();
  }, []);

  if (phase === 'ready') return children;

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#000000] select-none transition-opacity duration-300 ${phase === 'fading' ? 'opacity-0' : 'opacity-100'}`}
    >
      <div className="relative flex flex-col items-center gap-5">
        <h1 className="text-4xl md:text-5xl font-light tracking-[0.25em] text-white select-none uppercase font-serif animate-pulse duration-[2000ms]">
          SINE<span className="text-[#d4af37] font-normal">MOOD</span>
        </h1>

        <div className="w-24 h-[1px] bg-gradient-to-r from-transparent via-[#d4af37] to-transparent overflow-hidden relative">
          <div
            className="absolute inset-0 bg-white w-1/2"
            style={{ animation: 'spShimmer 1.5s infinite linear' }}
          />
        </div>
      </div>

      <p className="absolute bottom-12 text-xs font-light tracking-[0.4em] text-zinc-500 uppercase select-none">
        Üstad ruh halini süzüyor...
      </p>

      <style>{`
        @keyframes spShimmer {
          0%   { transform: translateX(-150%); }
          100% { transform: translateX(250%); }
        }
      `}</style>
    </div>
  );
}
