import { Brain } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

/**
 * Mood Kâhini keşif sekmesi — yalnız mood/keşif ekranında (/discover).
 * Sağ kenardan YARISI sarkar (translate-x-1/2): "aa bu neymiş?" dedirtip
 * tıklatır. Masaüstünde hover'da tamamen içeri kayar; mobilde yarım durur,
 * görünen yarısı tıklanınca /oyun'a gider. İki temaya da uyumlu.
 */
export default function GamePeekTab() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  if (pathname !== '/discover') return null;

  return (
    <button
      onClick={() => navigate('/oyun')}
      title="?"
      aria-label="Gizli mini oyun: Mood Kâhini"
      className="
        group fixed right-0 top-[42%] z-[95]
        translate-x-1/2 hover:translate-x-0 transition-transform duration-500 ease-out
        w-14 h-14 flex items-center justify-start pl-3
        rounded-full bg-black/55 backdrop-blur-md border border-amber/30 text-amber
        shadow-[0_8px_28px_rgba(0,0,0,0.5)]
        hover:border-amber/60
      "
    >
      {/* Dikkat çeken nabız halkası — yarım dururken göze çarpar */}
      <span className="pointer-events-none absolute inset-0 rounded-full border border-amber/40 animate-ping opacity-30 group-hover:opacity-0" />
      <Brain size={20} className="shrink-0 drop-shadow" />
    </button>
  );
}
