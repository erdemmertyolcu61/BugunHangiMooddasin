import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const SPLASH_KEY = 'fc_splash_seen_v5';

export default function SplashScreen() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(SPLASH_KEY)) return;
    sessionStorage.setItem(SPLASH_KEY, '1');
    setShow(true);
    const timer = setTimeout(() => setShow(false), 2200);
    return () => clearTimeout(timer);
  }, []);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="splash"
          initial={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.03 }}
          transition={{ duration: 0.5, ease: 'easeInOut' }}
          className="fixed inset-0 z-[9999] overflow-hidden"
          style={{ background: '#0a0606' }}
        >
          <iframe
            src="/splash/splash.html"
            title="Sinemod Splash"
            className="w-full h-full border-0"
            style={{ background: '#0a0606' }}
            aria-label="Sinemod yükleniyor"
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
