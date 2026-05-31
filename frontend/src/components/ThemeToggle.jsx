import { Sun, Moon } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';

/**
 * Gece/Gündüz tema anahtarı — sol-altta sabit.
 * AudioPlayer'ın (sağ-alt) simetriği. Mobilde kompakt yuvarlak buton
 * (ses vinyl'iyle aynı görsel dil), masaüstünde etiketli pill.
 * Mobilde BottomNav'ın net biçimde üstünde durur (bottom-[7.5rem]).
 */
export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const { pathname } = useLocation();
  const isDark = theme === 'dark';

  // Yalnızca ana sayfada görünür (sol üst). İç sayfalarda gizli — tema oradan
  // değil, Profil → Ayarlar'dan değiştirilir.
  const isHome = pathname === '/' || pathname === '/moodlar';
  if (!isHome) return null;
  const posClass = 'top-4 md:top-auto md:bottom-6 mt-safe md:mt-0';

  return (
    <button
      onClick={toggleTheme}
      title={isDark ? 'Latte (gündüz) temasına geç' : 'Espresso (gece) temasına geç'}
      aria-label="Tema değiştir"
      className={`
        fixed left-4 z-[96] ${posClass}
        flex items-center justify-center
        w-12 h-12 md:w-auto md:gap-2 md:pl-3 md:pr-4
        rounded-full bg-black/55 backdrop-blur-md border border-amber/30 text-amber
        shadow-[0_8px_24px_rgba(0,0,0,0.45)]
        hover:scale-105 hover:border-amber/60 transition-all
      `}
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
      {/* Etiket sadece masaüstünde; mobilde kompakt yuvarlak buton */}
      <span className="hidden md:inline text-[10px] font-bold uppercase tracking-[0.2em]">
        {isDark ? 'Latte' : 'Espresso'}
      </span>
    </button>
  );
}
