import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import LottieAnimation from './LottieAnimation';

/**
 * Günlük seri (streak) milestone kutlaması.
 *
 * main.jsx açılışta recordStreakOpen() çağırır; bir milestone'a (3/7/14/…)
 * ULAŞILDIYSA window.__streakMilestone = N atar. Bu bileşen mount'ta o değeri
 * okur ve ateş (🔥) Lottie animasyonuyla tam-ekran bir kutlama gösterir.
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

  // 5sn sonra otomatik kapan (dokunarak da kapanır)
  useEffect(() => {
    if (n == null) return;
    const t = setTimeout(() => setN(null), 5000);
    return () => clearTimeout(t);
  }, [n]);

  return createPortal(
    <AnimatePresence>
      {n != null && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onClick={() => setN(null)}
          className="fixed inset-0 z-[3000] flex items-center justify-center p-6 bg-black/65 backdrop-blur-sm cursor-pointer"
          role="alertdialog"
          aria-label={`${n} günlük seri`}
        >
          <motion.div
            initial={{ scale: 0.82, y: 24, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-sm rounded-[2rem] border border-amber/30 bg-[#1c1512] px-8 py-10 text-center shadow-2xl overflow-hidden"
          >
            {/* Atmosferik turuncu/altın parıltı */}
            <div className="absolute inset-0 bg-gradient-to-b from-orange-500/[0.14] via-transparent to-transparent pointer-events-none" />
            <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-56 h-56 bg-orange-500/25 blur-[80px] rounded-full pointer-events-none" />

            <div className="relative z-10 flex flex-col items-center gap-3">
              <div className="relative w-40 h-40 flex items-center justify-center -mb-2">
                <LottieAnimation
                  path="/lottie/streak-fire.json"
                  loop
                  autoplay
                  className="w-40 h-40"
                />
              </div>

              <span className="text-[11px] font-bold uppercase tracking-[0.35em] text-orange-400">
                Seri Devam Ediyor
              </span>

              <h3 className="font-serif text-4xl font-bold tracking-tight text-[#f5f2eb] leading-none">
                {n} <span className="text-orange-400">gün</span>
              </h3>
              <p className="text-sm text-[#f5f2eb]/55 leading-relaxed max-w-[15rem]">
                Üst üste {n} gündür buradasın. Alevi söndürme — yarın yine bekleriz.
              </p>

              <button
                onClick={() => setN(null)}
                className="mt-3 px-7 py-2.5 rounded-full bg-amber text-[#120d0b] font-bold text-[11px] uppercase tracking-[0.2em] hover:scale-105 active:scale-95 transition-transform"
              >
                Devam
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
