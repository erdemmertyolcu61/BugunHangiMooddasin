import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

/**
 * Gece/Gündüz tema anahtarı — sol üstte küçük, sabit.
 * BottomNav (mobil) ve AudioPlayer ile çakışmaz.
 */
export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      onClick={toggleTheme}
      title={isDark ? 'Gündüz moduna geç' : 'Gece moduna geç'}
      aria-label="Tema değiştir"
      className="fixed top-4 left-4 z-[96] w-10 h-10 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-md border border-white/15 text-amber hover:scale-110 hover:border-amber/50 transition-all"
    >
      {isDark ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}
