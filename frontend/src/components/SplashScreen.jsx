import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const SPLASH_KEY = 'fc_splash_seen_v9';

const EXPO_OUT = [0.16, 1, 0.3, 1];
const EASE_OUT = [0.25, 0.46, 0.45, 0.94];

/* S path — overlay animasyonu için (PNG üzerindeki SVG streak katmanı) */
const S = 'M 168 454 C 40 392, 40 270, 230 244 C 420 218, 478 118, 366 56';

const splashCSS = `
@keyframes dotPulse {
  0%,100% { opacity:.35; transform:scale(1) }
  50%     { opacity:1;   transform:scale(1.4) }
}
@keyframes flowA {
  0%   { stroke-dashoffset: 870; }
  100% { stroke-dashoffset: -130; }
}
@keyframes flowB {
  0%   { stroke-dashoffset: 900; }
  100% { stroke-dashoffset: -100; }
}
@keyframes glowPulse {
  0%,100% { opacity:0.20; transform:scale(1); }
  50%     { opacity:0.35; transform:scale(1.04); }
}
`;

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

          {/* Warm radial halo */}
          <div className="fixed inset-0 pointer-events-none" aria-hidden="true"
               style={{
                 background: 'radial-gradient(58% 42% at 50% 40%, rgba(255,178,80,0.16) 0%, rgba(255,150,40,0.05) 45%, transparent 72%)',
                 zIndex: 0,
               }} />

          {/* Center stack */}
          <div className="relative flex flex-col items-center justify-center w-full h-full"
               style={{ zIndex: 1 }}>

            {/* ── Logo block ── */}
            <motion.div
              initial={{ opacity: 0, scale: 0.88, filter: 'blur(14px)' }}
              animate={{
                opacity: exiting ? 0 : 1,
                scale: exiting ? 1.06 : 1,
                filter: exiting ? 'blur(10px)' : 'blur(0px)',
              }}
              transition={exiting
                ? { duration: 0.6, ease: EASE_OUT }
                : { duration: 1.3, ease: EXPO_OUT }
              }
              className="relative will-change-transform"
              style={{ width: 'min(60vmin, 310px)', aspectRatio: '1/1' }}
            >
              {/* Ambient outer glow — pulsing */}
              <div aria-hidden="true"
                   className="absolute inset-0 rounded-[22%]"
                   style={{
                     background: 'radial-gradient(circle, rgba(255,160,60,0.22) 0%, transparent 70%)',
                     filter: 'blur(28px)',
                     animation: 'glowPulse 3.5s ease-in-out infinite',
                   }} />

              {/* The real PNG logo */}
              <img
                src="/sinemod-mark.png"
                alt="Sinemod"
                className="relative w-full h-full"
                style={{
                  borderRadius: '21.5%',
                  filter: 'drop-shadow(0 16px 50px rgba(255,160,60,0.30)) drop-shadow(0 0 80px rgba(255,140,30,0.15))',
                  display: 'block',
                }}
                draggable={false}
              />

              {/* Flowing light overlay SVG — sits on top of PNG */}
              <svg
                viewBox="0 0 512 512" fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="absolute inset-0 w-full h-full pointer-events-none"
                style={{ borderRadius: '21.5%', overflow: 'hidden' }}
                aria-hidden="true"
              >
                <defs>
                  <filter id="sf" x="-30%" y="-30%" width="160%" height="160%">
                    <feGaussianBlur stdDeviation="3.5" />
                  </filter>
                  <clipPath id="sc"><rect width="512" height="512" rx="108" /></clipPath>
                </defs>
                <g clipPath="url(#sc)">
                  {/* Streak 1 — main bright light */}
                  <path d={S}
                        stroke="#FFFAF2" strokeWidth="18" fill="none" strokeLinecap="round"
                        strokeDasharray="130 870" opacity="0.65" filter="url(#sf)"
                        style={{ animation: 'flowA 3s ease-in-out infinite' }} />
                  {/* Streak 2 — softer trail */}
                  <path d={S}
                        stroke="#FFE8C0" strokeWidth="10" fill="none" strokeLinecap="round"
                        strokeDasharray="70 930" opacity="0.45" filter="url(#sf)"
                        style={{ animation: 'flowB 4.2s ease-in-out 1.1s infinite' }} />
                </g>
              </svg>
            </motion.div>

            {/* "Sinemod" wordmark */}
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
                fontSize: 'clamp(30px, 6vmin, 54px)',
                color: '#f3e9d2',
                letterSpacing: '-0.012em',
                lineHeight: 1,
                textShadow: '0 0 28px rgba(255,178,80,0.18)',
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
                  color: 'rgba(255,178,80,0.46)',
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
                background: i === 0 ? 'rgba(255,200,120,0.9)' : 'rgba(255,178,80,0.32)',
                animation: `dotPulse 1.6s ease-in-out ${d}s infinite`,
              }} />
            ))}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
