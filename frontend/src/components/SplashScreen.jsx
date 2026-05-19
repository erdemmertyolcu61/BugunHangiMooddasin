import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const SPLASH_KEY = 'fc_splash_seen_v8';

const EXPO_OUT = [0.16, 1, 0.3, 1];
const EASE_OUT = [0.25, 0.46, 0.45, 0.94];

/* S path — single source of truth (sine-wave ribbon, wide arcs) */
const S = 'M 168 454 C 40 392, 40 270, 230 244 C 420 218, 478 118, 366 56';

const splashCSS = `
@keyframes dotPulse {
  0%,100% { opacity:.35; transform:scale(1) }
  50%     { opacity:1;   transform:scale(1.4) }
}
@keyframes flowA {
  0%   { stroke-dashoffset: 850; }
  100% { stroke-dashoffset: -150; }
}
@keyframes flowB {
  0%   { stroke-dashoffset: 900; }
  100% { stroke-dashoffset: -100; }
}
@keyframes breathe {
  0%,100% { opacity: 0.35; }
  50%     { opacity: 0.55; }
}
`;

/* ─── Animated S Logo (inline SVG with flowing light) ─── */
function AnimatedS() {
  return (
    <svg viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg"
         style={{ width: 'min(60vmin, 320px)', aspectRatio: '1/1' }}>
      <defs>
        <filter id="f1" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="60" /></filter>
        <filter id="f2" x="-80%"  y="-80%"  width="260%" height="260%"><feGaussianBlur stdDeviation="38" /></filter>
        <filter id="f3" x="-60%"  y="-60%"  width="220%" height="220%"><feGaussianBlur stdDeviation="20" /></filter>
        <filter id="f4" x="-40%"  y="-40%"  width="180%" height="180%"><feGaussianBlur stdDeviation="9" /></filter>
        <filter id="f5" x="-30%"  y="-30%"  width="160%" height="160%"><feGaussianBlur stdDeviation="3.5" /></filter>

        <linearGradient id="rg" x1="0.18" y1="0.9" x2="0.82" y2="0.1">
          <stop offset="0%"   stopColor="#7A4A0E" />
          <stop offset="20%"  stopColor="#C8821A" />
          <stop offset="45%"  stopColor="#F0A830" />
          <stop offset="70%"  stopColor="#FFD070" />
          <stop offset="100%" stopColor="#FFF0D8" />
        </linearGradient>

        <linearGradient id="cg" x1="0.1" y1="0.9" x2="0.9" y2="0.1">
          <stop offset="0%"   stopColor="#D4921E" />
          <stop offset="35%"  stopColor="#FFD090" />
          <stop offset="100%" stopColor="#FFFAF2" />
        </linearGradient>

        <clipPath id="rc"><rect width="512" height="512" rx="108" /></clipPath>
      </defs>

      {/* Background */}
      <rect width="512" height="512" rx="108" fill="#120A05" />
      <rect x="1" y="1" width="510" height="510" rx="107"
            stroke="rgba(255,178,80,0.07)" strokeWidth="1.5" />

      <g clipPath="url(#rc)">
        {/* L1 — massive ambient warmth (breathing) */}
        <path d={S} stroke="#5C3408" strokeWidth="220" fill="none" strokeLinecap="round"
              filter="url(#f1)" opacity="0.38"
              style={{ animation: 'breathe 4s ease-in-out infinite' }} />

        {/* L2 — wide warm glow */}
        <path d={S} stroke="#945E18" strokeWidth="165" fill="none" strokeLinecap="round"
              filter="url(#f2)" opacity="0.42" />

        {/* L3 — golden mid glow */}
        <path d={S} stroke="#C88420" strokeWidth="120" fill="none" strokeLinecap="round"
              filter="url(#f3)" opacity="0.55" />

        {/* L4 — ribbon body glow */}
        <path d={S} stroke="#D4921E" strokeWidth="88" fill="none" strokeLinecap="round"
              filter="url(#f4)" opacity="0.72" />

        {/* L5 — main ribbon gradient */}
        <path d={S} stroke="url(#rg)" strokeWidth="68" fill="none" strokeLinecap="round"
              filter="url(#f5)" opacity="0.95" />

        {/* L6 — bright core */}
        <path d={S} stroke="url(#cg)" strokeWidth="30" fill="none" strokeLinecap="round"
              filter="url(#f5)" opacity="0.88" />

        {/* L7 — hot white center */}
        <path d={S} stroke="#FFF8F0" strokeWidth="10" fill="none" strokeLinecap="round"
              opacity="0.60" />

        {/* ── Flowing light streaks along ribbon ── */}
        <path d={S} stroke="#FFFAF2" strokeWidth="18" fill="none" strokeLinecap="round"
              strokeDasharray="130 870" opacity="0.72" filter="url(#f5)"
              style={{ animation: 'flowA 3s ease-in-out infinite' }} />

        <path d={S} stroke="#FFE8C0" strokeWidth="10" fill="none" strokeLinecap="round"
              strokeDasharray="70 930" opacity="0.50" filter="url(#f5)"
              style={{ animation: 'flowB 4.2s ease-in-out 1.1s infinite' }} />
      </g>
    </svg>
  );
}

export default function SplashScreen() {
  const [show, setShow] = useState(() => {
    if (typeof window === 'undefined') return false;
    if (sessionStorage.getItem(SPLASH_KEY)) return false;
    sessionStorage.setItem(SPLASH_KEY, '1');
    return true;
  });
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (!show) return;
    const t1 = setTimeout(() => setExiting(true), 2800);
    const t2 = setTimeout(() => setShow(false), 2800 + 700);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [show]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="splash"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: 'easeInOut' }}
          className="fixed inset-0 z-[9999] overflow-hidden"
          style={{ background: '#0a0606' }}
          role="status"
          aria-label="Sinemod yukleniyor"
        >
          <style dangerouslySetInnerHTML={{ __html: splashCSS }} />

          {/* Warm ambient halo */}
          <div className="fixed inset-0 pointer-events-none" aria-hidden="true"
               style={{
                 background: 'radial-gradient(60% 45% at 50% 40%, rgba(255,178,80,0.18) 0%, rgba(255,178,80,0.05) 40%, transparent 72%)',
                 zIndex: 0,
               }} />

          {/* Center content */}
          <div className="relative flex flex-col items-center justify-center w-full h-full"
               style={{ zIndex: 1 }}>

            {/* Animated logo */}
            <motion.div
              initial={{ opacity: 0, scale: 0.88, filter: 'blur(14px)' }}
              animate={{
                opacity: exiting ? 0 : 1,
                scale: exiting ? 1.08 : 1,
                filter: exiting ? 'blur(10px)' : 'blur(0px)',
              }}
              transition={exiting
                ? { duration: 0.6, ease: EASE_OUT }
                : { duration: 1.3, ease: EXPO_OUT }
              }
              className="will-change-transform"
              style={{
                filter: 'drop-shadow(0 20px 60px rgba(255,170,60,0.25)) drop-shadow(0 0 100px rgba(255,170,60,0.10))',
              }}
            >
              <AnimatedS />
            </motion.div>

            {/* "Sinemod" */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: exiting ? 0 : 1, y: exiting ? -6 : 0 }}
              transition={exiting
                ? { duration: 0.45, ease: EASE_OUT }
                : { duration: 1.0, ease: 'easeOut', delay: 0.4 }
              }
              className="text-center"
              style={{ marginTop: 'clamp(22px, 5vmin, 44px)' }}
            >
              <div style={{
                fontFamily: "'Playfair Display', 'Cormorant Garamond', serif",
                fontWeight: 600,
                fontSize: 'clamp(30px, 6vmin, 56px)',
                color: '#f3e9d2',
                letterSpacing: '-0.012em',
                lineHeight: 1,
                textShadow: '0 0 30px rgba(255,178,80,0.20)',
              }} aria-hidden="true">
                Sinemod
              </div>

              {/* Tagline */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: exiting ? 0 : 1, y: exiting ? -4 : 0 }}
                transition={exiting
                  ? { duration: 0.35, ease: EASE_OUT }
                  : { duration: 0.9, ease: 'easeOut', delay: 0.6 }
                }
                style={{
                  marginTop: 'clamp(8px, 2vmin, 16px)',
                  fontFamily: "'Montserrat', 'Inter', sans-serif",
                  fontWeight: 500,
                  fontSize: 'clamp(9px, 2vmin, 13px)',
                  letterSpacing: '0.38em',
                  textTransform: 'uppercase',
                  color: 'rgba(255,178,80,0.48)',
                }}
                aria-hidden="true"
              >
                Bugün hangi mooddasın?
              </motion.div>
            </motion.div>
          </div>

          {/* Pulsing dots */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: exiting ? 0 : 1 }}
            transition={exiting ? { duration: 0.3 } : { duration: 0.6, delay: 0.9 }}
            className="fixed left-1/2 -translate-x-1/2 flex gap-1.5"
            style={{ bottom: 'max(38px, calc(env(safe-area-inset-bottom, 0px) + 24px))', zIndex: 2 }}
            aria-hidden="true"
          >
            {[0, 0.3, 0.6].map((d, i) => (
              <span key={i} className="block rounded-full" style={{
                width: 5, height: 5,
                background: i === 0 ? 'rgba(255,200,120,0.9)' : 'rgba(255,178,80,0.35)',
                animation: `dotPulse 1.6s ease-in-out ${d}s infinite`,
              }} />
            ))}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
