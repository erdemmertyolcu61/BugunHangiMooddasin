import { NavLink, useLocation } from 'react-router-dom';
import { Clapperboard, BookOpen, Compass, BookMarked, User, Sun, Moon } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

const NAV_ITEMS = [
  { label: 'Moodlar', icon: Clapperboard, path: '/', end: true },
  { label: 'Listeler', icon: BookOpen, path: '/listeler' },
  { label: 'Kafan mı Karışık', icon: Compass, path: '/kafan-mi-karisik' },
  { label: 'Defterim', icon: BookMarked, path: '/defterim' },
  { label: 'Profil', icon: User, path: '/profil' },
];

export default function Header() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const { pathname } = useLocation();

  const isDiscoverActive = pathname === '/' || pathname === '/moodlar' || pathname.startsWith('/discover');

  return (
    <header className="desktop-header hidden md:block sticky top-0 z-[95] border-b border-white/8 bg-bg/85 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto flex items-center justify-between px-6 lg:px-8 h-16">
        {/* Brand */}
        <NavLink to="/" className="flex items-center gap-3 shrink-0 group">
          <div className="w-8 h-8 rounded-full bg-amber/15 border border-amber/30 flex items-center justify-center group-hover:bg-amber/25 transition-colors">
            <span className="text-amber text-xs font-bold">S</span>
          </div>
          <span className="text-[13px] font-bold uppercase tracking-[0.25em] text-ivory/80 group-hover:text-ivory transition-colors">
            Sinemood
          </span>
        </NavLink>

        {/* Nav */}
        <nav className="flex items-center gap-1" aria-label="Ana menü">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = item.path === '/' ? isDiscoverActive : pathname.startsWith(item.path);
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.end}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-[0.2em] transition-all ${
                  isActive
                    ? 'text-amber bg-amber/10'
                    : 'text-ivory/45 hover:text-ivory/70 hover:bg-white/5'
                }`}
              >
                <Icon size={15} strokeWidth={isActive ? 2.4 : 1.8} />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          title={isDark ? 'Latte temasına geç' : 'Espresso temasına geç'}
          aria-label="Tema değiştir"
          className="flex items-center gap-2 px-3 py-2 rounded-full bg-white/5 border border-white/10 text-amber hover:bg-white/10 hover:border-amber/30 transition-all"
        >
          {isDark ? <Sun size={14} /> : <Moon size={14} />}
          <span className="text-[9px] font-bold uppercase tracking-[0.2em]">
            {isDark ? 'Latte' : 'Espresso'}
          </span>
        </button>
      </div>
    </header>
  );
}
