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
          className="fixed inset-0 z-[3000] bg-black/65 backdrop-blur-sm cursor-pointer overflow-hidden"
        >
          <LottieAnimation
            path="/lottie/streak-fire.json"
            loop={false}
            autoplay
            preserveAspectRatio="xMidYMid slice"
            className="absolute inset-0 w-full h-full"
          />
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
