import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Clapperboard, Compass, BookMarked, BookOpen } from 'lucide-react';

const NAV_ITEMS = [
  { label: 'Moodlar', icon: Clapperboard, path: '/', match: (p) => p === '/' || p === '/discover' },
  { label: 'Listeler', icon: BookOpen, path: '/listeler', match: (p) => p.startsWith('/listeler') },
  { label: 'Kafan Karışık?', icon: Compass, path: '/kafan-mi-karisik', match: (p) => p === '/kafan-mi-karisik' },
  { label: 'Defterim', icon: BookMarked, path: '/defterim', match: (p) => p === '/defterim' },
];

/**
 * Mobil alt navigasyon. Sadece mobil/tablet (md altı) görünür.
 * iPhone home-indicator için güvenli alan boşluğu içerir.
 */
export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const path = location.pathname;

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-[90] bg-[#120d0b]/98 border-t border-white/10 pb-safe"
      aria-label="Ana menü"
    >
      <div className="flex items-stretch justify-around px-2 pt-2 pb-1">
        {NAV_ITEMS.map((item) => {
          const active = item.match(path);
          const Icon = item.icon;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-col items-center justify-center gap-1 flex-1 min-h-[52px] rounded-2xl transition-colors duration-300 ${
                active ? 'text-amber' : 'text-ivory/45 active:text-ivory/80'
              }`}
            >
              <Icon size={21} strokeWidth={active ? 2.4 : 1.8} />
              <span className="text-[9.5px] font-bold uppercase tracking-[0.02em] leading-none whitespace-nowrap">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
