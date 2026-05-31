import { motion } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';

/**
 * Mood Kâhini keşif sekmesi — yalnız mood/keşif ekranında (/discover).
 * Sağ kenardan sarkan küçük bir YARIM ÇEMBER: renkli amber→mor gradyan,
 * ibaresi "?" — merak uyandırır ("aa bu neymiş?"). Hafifçe nabız atıp
 * içeri-dışarı süzülür, tıklanınca /oyun'a gider.
 */
export default function GamePeekTab() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  if (pathname !== '/discover') return null;

  return (
    <motion.button
      onClick={() => navigate('/oyun')}
      aria-label="Mini oyun: Mood Kâhini"
      initial={{ x: 6, opacity: 0 }}
      animate={{ x: [4, 0, 4], opacity: 1 }}
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
