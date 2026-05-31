import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';

const DAILY_KEY = 'fc_oracle_last_played'; // YYYY-MM-DD (MoodOracle ile aynı)
const todayStr = () => new Date().toISOString().slice(0, 10);
const hasPlayedToday = () => {
  try { return localStorage.getItem(DAILY_KEY) === todayStr(); } catch { return false; }
};

/**
 * Mood Kâhini keşif sekmesi — yalnız mood/keşif ekranında (/discover).
 * Sağ kenardan sarkan küçük bir YARIM ÇEMBER: renkli amber→mor gradyan, ibaresi "?".
 * Günün testi çözülünce kaybolur; gece sıfırlanıp yeni test hazır olunca geri gelir.
 */
export default function GamePeekTab() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [ready, setReady] = useState(!hasPlayedToday());

  useEffect(() => {
    const check = () => setReady(!hasPlayedToday());
    check();
    // Gece sıfırlanmasını ve sekmeler arası değişimi yakala
    const id = setInterval(check, 30000);
    window.addEventListener('storage', check);
    window.addEventListener('oracle-updated', check);
    window.addEventListener('focus', check);
    return () => {
      clearInterval(id);
      window.removeEventListener('storage', check);
      window.removeEventListener('oracle-updated', check);
      window.removeEventListener('focus', check);
    };
  }, [pathname]);

  if (pathname !== '/discover' || !ready) return null;

  return (
    <motion.button
      onClick={() => navigate('/oyun')}
      aria-label="Mini oyun: Mood Kâhini"
      initial={{ x: 6, opacity: 0 }}
      animate={{ x: [4, 0, 4], opacity: 1 }}
      exit={{ x: 16, opacity: 0 }}
      transition={{ x: { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }, opacity: { duration: 0.5 } }}
      whileTap={{ scale: 0.92 }}
      className="
        group fixed right-0 top-[44%] z-[95]
        flex items-center justify-center
        w-7 h-14 pl-1
        rounded-l-full border border-r-0 border-white/25
        bg-gradient-to-br from-amber-500 via-orange-500 to-purple-600 text-white
        shadow-[0_8px_24px_-6px_rgba(168,85,247,0.6)]
        hover:w-9 transition-[width] duration-300
      "
    >
      {/* Yumuşak nabız hâlesi */}
      <span className="pointer-events-none absolute inset-0 rounded-l-full bg-white/25 opacity-0 group-hover:opacity-100 animate-pulse" style={{ mixBlendMode: 'overlay' }} />
      <span className="text-[17px] font-black leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]">?</span>
    </motion.button>
  );
}
