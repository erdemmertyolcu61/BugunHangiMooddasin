import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import LottieAnimation from './LottieAnimation';

/**
 * Günlük seri (streak) kutlaması.
 *
 * main.jsx açılışta recordStreakOpen() çağırır; streak arttıysa
 * window.__streakMilestone = N atar. Bu bileşen mount'ta o değeri
 * okur ve ateş (🔥) Lottie animasyonuyla tam-ekran bir kutlama gösterir.
 * Kullanıcı tıklayana kadar açık kalır, animasyon bir kere oynar.
 * Sonradan tetiklenebilmesi için 'streak-milestone' window event'ini de dinler.
 * Tema-bağımsız token'lar (bg-[#1c1512]/text-amber) açık temaya otomatik uyar.
 */
export default function StreakCelebration() {
  const [n, setN] = useState(null);

  useEffect(() => {
    // Açılışta bekleyen milestone var mı?
    const pending = window.__streakMilestone;
    if (typeof pending === 'number' && pending > 0) {
      setN(pending);
      window.__streakMilestone = undefined;
    }
    const handler = (e) => {
      const val = e?.detail?.n;
      if (typeof val === 'number' && val > 0) setN(val);
    };
    window.addEventListener('streak-milestone', handler);
    return () => window.removeEventListener('streak-milestone', handler);
  }, []);

  return createPortal(
    <AnimatePresence>
      {n != null && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onClick={() => setN(null)}
          className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/65 backdrop-blur-sm cursor-pointer p-6"
        >
          <motion.div
            initial={{ scale: 0.82, y: 24, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-72 sm:w-80 aspect-[3/4] rounded-2xl overflow-hidden shadow-2xl"
          >
            <LottieAnimation
              path="/lottie/streak-fire.json"
              loop={false}
              autoplay
              preserveAspectRatio="xMidYMid slice"
              className="absolute inset-0 w-full h-full"
            />
            <button onClick={() => setN(null)}
              className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/30 backdrop-blur-sm
                flex items-center justify-center text-ivory/60 hover:text-ivory hover:bg-black/50 transition-all">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
