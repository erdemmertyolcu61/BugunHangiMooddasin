import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Clapperboard, Compass, BookMarked, BookOpen, Activity, Brain } from 'lucide-react';

const NAV_ITEMS = [
  { label: 'Moodlar', icon: Clapperboard, path: '/', match: (p) => p === '/' || p === '/discover' },
  { label: 'Ruh Halim', icon: Brain, path: null, match: (p) => false },
  { label: 'Listeler', icon: BookOpen, path: '/listeler', match: (p) => p.startsWith('/listeler') },
  { label: 'Kafan mi Karisik?', icon: Compass, path: '/kafan-mi-karisik', match: (p) => p === '/kafan-mi-karisik' },
  { label: 'Akış', icon: Activity, path: '/feed', match: (p) => p === '/feed' },
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

  const handlePress = (item) => {
    if (item.label === 'Ruh Halim') {
      sessionStorage.setItem('open_mood_quiz', '1');
      if (path === '/' || path === '/moodlar') {
        window.dispatchEvent(new CustomEvent('open-mood-quiz'));
      } else {
        navigate('/');
      }
      return;
    }
    navigate(item.path);
  };

  return (
    <nav
      className="app-bottom-nav md:hidden fixed bottom-0 inset-x-0 z-[90] bg-[#120d0b]/98 border-t border-white/10 pb-safe"
      aria-label="Ana menü"
    >
      <div className="flex items-stretch px-1 pt-2 pb-1">
        {NAV_ITEMS.map((item) => {
          const active = item.match(path);
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              onClick={() => handlePress(item)}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-col items-center justify-center gap-1 flex-1 basis-0 min-w-0 min-h-[52px] px-0.5 rounded-2xl transition-colors duration-300 ${
                active ? 'text-amber' : 'text-ivory/45 active:text-ivory/80'
              }`}
            >
              <Icon size={20} strokeWidth={active ? 2.4 : 1.8} className="shrink-0" />
              <span className="w-full text-center text-[8px] font-bold uppercase tracking-[0.01em] leading-[1.1] line-clamp-2 break-words">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
