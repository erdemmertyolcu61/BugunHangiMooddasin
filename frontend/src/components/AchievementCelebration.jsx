import { createContext, useContext, useCallback, useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy } from 'lucide-react';
import LottieAnimation from './LottieAnimation';
import { detectNewMilestones } from '../utils/milestones';
import { track } from '../utils/analytics';
import { getApiUrl } from '../utils/apiConfig';

/**
 * Başarım kutlama sistemi (global).
 *
 * useAchievements().check(stats) çağrılır → yeni açılan başarım(lar) tespit edilir
 * ve ekranın ortasında Lottie'li "Başarım Kazanıldı!" animasyonu sıraya alınır.
 * Tema-bağımsız: bg-[#1c1512]/text-[#f5f2eb]/text-amber token'ları index.css'teki
 * [data-theme="light"] override'larıyla otomatik açık temaya uyum sağlar.
 *
 * İlk-yükleme bombardımanı koruması: bir seferde 3+ başarım açılırsa (mevcut
 * kullanıcının geçmişi ilk kez işleniyor) yalnız en büyüğü kutlanır.
 */
const AchievementContext = createContext(null);

export function AchievementProvider({ children }) {
  const [queue, setQueue] = useState([]);
  const current = queue[0] || null;

  const check = useCallback((stats) => {
    if (!stats) return;
    const fresh = detectNewMilestones(stats);
    if (!fresh.length) return;
    const toCelebrate = fresh.length >= 3 ? [fresh[fresh.length - 1]] : fresh;
    toCelebrate.forEach((m) => track('milestone_unlock', { id: m.id }));
    setQueue((q) => [...q, ...toCelebrate]);
  }, []);

  const checkFromRemote = useCallback(async () => {
    try {
      const res = await fetch(getApiUrl('/api/watchlist'));
      if (!res.ok) return;
      const data = await res.json();
      const movies = data.movies || [];
      check({
        saved: movies.length,
        watched: movies.filter((m) => m.watched).length,
        notes: movies.filter((m) => (m.personal_note || '').trim()).length,
      });
    } catch {}
  }, [check]);

  // 500ms debounce ile window event dinle
  const debounceRef = useRef(null);
  useEffect(() => {
    const handler = () => {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(checkFromRemote, 500);
    };
    window.addEventListener('check-achievements', handler);
    return () => {
      window.removeEventListener('check-achievements', handler);
      clearTimeout(debounceRef.current);
    };
  }, [checkFromRemote]);

  const dismiss = useCallback(() => setQueue((q) => q.slice(1)), []);

  return (
    <AchievementContext.Provider value={{ check }}>
      {children}
      {createPortal(
        <AnimatePresence>
          {current && (
            <CelebrationOverlay key={current.id} milestone={current} onDismiss={dismiss} />
          )}
        </AnimatePresence>,
        document.body
      )}
    </AchievementContext.Provider>
  );
}

function CelebrationOverlay({ milestone, onDismiss }) {
  // 4.2sn sonra otomatik kapan (dokunarak da kapanır)
  useEffect(() => {
    const t = setTimeout(onDismiss, 4200);
    return () => clearTimeout(t);
  }, [milestone.id, onDismiss]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      onClick={onDismiss}
      className="fixed inset-0 z-[3000] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm cursor-pointer"
      role="alertdialog"
      aria-label={`Başarım kazanıldı: ${milestone.title}`}
    >
      <motion.div
        initial={{ scale: 0.8, y: 24, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm rounded-[2rem] border border-amber/30 bg-[#1c1512] px-8 py-10 text-center shadow-2xl overflow-hidden"
      >
        {/* Atmosferik altın parıltı */}
        <div className="absolute inset-0 bg-gradient-to-b from-amber-500/[0.12] via-transparent to-transparent pointer-events-none" />
        <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-56 h-56 bg-amber-500/20 blur-[80px] rounded-full pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center gap-4">
          {/* Lottie kutlama (başarı tiki) */}
          <div className="relative w-32 h-32 flex items-center justify-center">
            <LottieAnimation
              path="/lottie/success-check.json"
              loop={false}
              autoplay
              speed={1}
              className="w-32 h-32"
            />
          </div>

          <div className="flex items-center gap-2 text-amber">
            <Trophy size={15} />
            <span className="text-[11px] font-bold uppercase tracking-[0.35em]">Başarım Kazanıldı</span>
          </div>

          <h3 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-[#f5f2eb] leading-tight">
            {milestone.title}
          </h3>
          <p className="text-sm text-[#f5f2eb]/55 leading-relaxed max-w-[15rem]">
            {milestone.blurb}
          </p>

          <button
            onClick={onDismiss}
            className="mt-2 px-7 py-2.5 rounded-full bg-amber text-[#120d0b] font-bold text-[11px] uppercase tracking-[0.2em] hover:scale-105 active:scale-95 transition-transform"
          >
            Harika
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/** Başarım kutlamasını tetiklemek için: const { check } = useAchievements(); check(stats) */
export function useAchievements() {
  return useContext(AchievementContext) || { check: () => {} };
}

export default AchievementProvider;
