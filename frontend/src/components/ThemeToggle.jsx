import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

/**
 * Gece/Gündüz tema anahtarı — sol-altta sabit.
 * AudioPlayer'ın (sağ-alt) simetriği; header geri butonuyla çakışmaz,
 * mobilde BottomNav'ın hemen üstünde durur.
 */
export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      onClick={toggleTheme}
      title={isDark ? 'Gündüz moduna geç' : 'Gece moduna geç'}
      aria-label="Tema değiştir"
      className="fixed left-4 bottom-28 md:bottom-6 z-[96] w-12 h-12 flex items-center justify-center rounded-full bg-black/50 backdrop-blur-md border border-amber/30 text-amber shadow-[0_8px_24px_rgba(0,0,0,0.4)] hover:scale-110 hover:border-amber/60 transition-all mb-safe md:mb-0"
    >
      {isDark ? <Sun size={19} /> : <Moon size={19} />}
    </button>
  );
}
