import { Brain } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

/**
 * Mini oyun (Mood Kâhini) için sol-altta yüzen baloncuk.
 * ThemeToggle'ın hemen üstünde durur (sol kenar; AudioPlayer sağ-altta).
 * Web + mobil görünür; oyun sayfasında gizlenir. İki temaya da uyumlu
 * (ThemeToggle ile aynı görsel dil; bg-black/55 latte'de override ile açılır).
 */
export default function GameBubble() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  if (pathname === '/oyun') return null;

  return (
    <button
      onClick={() => navigate('/oyun')}
      title="Mini Oyun — Mood Kâhini"
      aria-label="Mini oyun: Mood Kâhini"
      className="
        group fixed left-4 z-[96]
        bottom-[11rem] md:bottom-[5.25rem]
        flex items-center justify-center
        w-12 h-12 md:w-auto md:gap-2 md:pl-3 md:pr-4
        rounded-full bg-black/55 backdrop-blur-md border border-amber/30 text-amber
        shadow-[0_8px_24px_rgba(0,0,0,0.45)]
        hover:scale-105 hover:border-amber/60 transition-all
      "
    >
      {/* Dikkat çeken hafif nabız halkası */}
      <span className="pointer-events-none absolute inset-0 rounded-full border border-amber/40 animate-ping opacity-30 group-hover:opacity-0" />
      <Brain size={18} />
      <span className="hidden md:inline text-[10px] font-bold uppercase tracking-[0.2em]">Oyun</span>
    </button>
  );
}
