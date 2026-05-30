import { Brain } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

/**
 * Mood Kâhini keşif sekmesi — yalnız mood/keşif ekranında (/discover).
 * Sağ kenardan renkli bir dil olarak sarkar: amber→mor gradyan + "mood" ibaresi.
 * Hafifçe içeri sarkar (translate-x-1), hover'da tamamen açılır; mobilde göze
 * çarpan renkli bir çip olarak durur, tıklanınca /oyun'a gider.
 */
export default function GamePeekTab() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  if (pathname !== '/discover') return null;

  return (
    <button
      onClick={() => navigate('/oyun')}
      aria-label="Mini oyun: Mood Kâhini"
      className="
        group fixed right-0 top-[42%] z-[95]
        flex items-center gap-1.5 py-2.5 pl-3 pr-4
        rounded-l-2xl border border-r-0 border-white/25
        bg-gradient-to-r from-amber-500 via-orange-500 to-purple-600 text-white
        shadow-[0_10px_30px_-6px_rgba(168,85,247,0.55)]
        translate-x-1 hover:translate-x-0 transition-transform duration-500 ease-out
      "
    >
      {/* Göze çarpan yumuşak nabız parıltısı */}
      <span className="pointer-events-none absolute inset-0 rounded-l-2xl bg-white/30 opacity-0 group-hover:opacity-0 animate-pulse" style={{ mixBlendMode: 'overlay' }} />
      <Brain size={16} className="shrink-0 drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]" />
      <span className="text-[11px] font-black lowercase tracking-[0.18em] drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]">mood</span>
    </button>
  );
}
