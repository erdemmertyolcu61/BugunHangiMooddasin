import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import SinemodLogo from './SinemodLogo';

const SPLASH_KEY = 'fc_splash_seen_v2';

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
          style={{ backgroundColor: '#0a0807' }}
        >
          {/* Arka plan altın parıltı */}
          <div className="absolute inset-0 pointer-events-none">
            <div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full opacity-20"
              style={{
                background: 'radial-gradient(circle, #ffbf00 0%, transparent 70%)',
                filter: 'blur(60px)',
                animation: 'goldenPulse 3s ease-in-out infinite',
              }}
            />
          </div>

          {/* Logo */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0, filter: 'blur(10px)' }}
            animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="relative"
          >
            <SinemodLogo variant="square" size="xl" />
          </motion.div>

          {/* marka ismi */}
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.6, ease: 'easeOut' }}
            className="mt-5 font-serif text-xl font-semibold tracking-wider"
            style={{
              color: '#ffbf00',
              textShadow: '0 0 20px rgba(255,191,0,0.15)',
            }}
          >
            Sinemod
          </motion.p>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8, duration: 0.5 }}
            className="mt-2 text-[10px] font-mono tracking-[0.3em] uppercase"
            style={{ color: 'rgba(255,191,0,0.3)' }}
          >
            Bugün Hangi Mooddasın?
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
