import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/* Splash ekran — koyu velvet zemin üzerinde Sinemod simgesi.
 * Simge: /public/sinemod-mark.png (köşeleri şeffaf, kendi ışıması olan PNG).
 *
 * Animasyonlar transform odaklı — iframe throttle olsa bile element görünür kalır. */

const SPLASH_KEY = 'fc_splash_seen_v3';
const MARK_SRC   = '/sinemod-mark.png';

export default function SplashScreen() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(SPLASH_KEY)) return;
    sessionStorage.setItem(SPLASH_KEY, '1');
    setShow(true);
    const timer = setTimeout(() => setShow(false), 2400);
    return () => clearTimeout(timer);
  }, []);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="splash"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: 'easeInOut' }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
          style={{ backgroundColor: '#0a0606' }}
        >
          {/* Ambient amber wash — simgeden çıkan ışık tüm ekrana yayılıyormuş hissi */}
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'radial-gradient(60% 45% at 50% 42%, rgba(255,178,80,0.16) 0%, rgba(255,178,80,0.06) 35%, transparent 70%), radial-gradient(120% 80% at 50% 100%, rgba(0,0,0,0.6) 0%, transparent 60%)',
            }}
          />

          {/* Marka simgesi — yüklenen PNG */}
          <motion.img
            src={MARK_SRC}
            alt="Sinemod"
            draggable={false}
            initial={{ scale: 0.96 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            className="relative select-none"
            style={{
              width: 'min(58vmin, 280px)',
              height: 'auto',
              aspectRatio: '1 / 1',
              objectFit: 'contain',
              filter:
                'drop-shadow(0 24px 60px rgba(255,178,80,0.18)) drop-shadow(0 0 80px rgba(255,178,80,0.10))',
            }}
          />

          {/* Wordmark */}
          <motion.p
            initial={{ y: 6 }}
            animate={{ y: 0 }}
            transition={{ delay: 0.25, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="relative mt-6 font-serif font-semibold tracking-wide"
            style={{
              color: '#f3e9d2',
              fontSize: 'clamp(28px, 6vmin, 44px)',
              textShadow: '0 0 30px rgba(255,178,80,0.18)',
              letterSpacing: '-0.012em',
              lineHeight: 1,
            }}
          >
            Sinemod
          </motion.p>

          <p
            className="relative mt-3 font-mono uppercase"
            style={{
              fontSize: 'clamp(9px, 1.4vmin, 11px)',
              letterSpacing: '0.4em',
              color: 'rgba(255,178,80,0.55)',
            }}
          >
            Bugün hangi mooddasın?
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
