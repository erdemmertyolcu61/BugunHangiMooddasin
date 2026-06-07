import React, { useState, useRef, useEffect } from 'react';
import { ArrowUpDown, ChevronRight } from 'lucide-react';

const SORT_OPTIONS = [
  { value: 'recommended', label: 'Önerilen' },
  { value: 'rating_desc', label: 'Puan: Yüksekten Düşüğe' },
  { value: 'rating_asc', label: 'Puan: Düşükten Yükseğe' },
  { value: 'mood_desc', label: "Mood'a Uyum: Yüksekten Düşüğe" },
  { value: 'mood_asc', label: "Mood'a Uyum: Düşükten Yükseğe" },
  { value: 'newest', label: 'En Yeni' },
  { value: 'oldest', label: 'En Eski' },
];

/**
 * Sıralama dropdown'u — açık/kapalı state'i ve dış-tıklama/Esc kapanışını
 * kendi içinde yönetir. Parent yalnız mevcut `sortBy` ve `onSelect`'i verir.
 * (Discover.jsx'ten ayrıştırıldı — davranış birebir korunur.)
 */
export default function SortControl({ sortBy, onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const handleEsc = (e) => { if (e.key === 'Escape') setOpen(false); };
    if (open) {
      document.addEventListener('mousedown', handleClick);
      document.addEventListener('keydown', handleEsc);
    }
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [open]);

  const handleSelect = (value) => {
    onSelect(value);
    setOpen(false);
  };

  return (
    <div className="relative ml-auto" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-5 py-2.5 rounded-full border border-amber-400/45 bg-black/45 backdrop-blur-sm text-amber-100/80 hover:text-amber-50 hover:border-amber-300/60 hover:bg-amber-950/20 transition-all text-[10px] font-bold uppercase tracking-[0.14em] focus:outline-none focus:ring-2 focus:ring-amber-400/30 shadow-[0_0_20px_rgba(245,158,11,0.08)]"
      >
        <ArrowUpDown size={13} className="text-amber-400/60 shrink-0" />
        <span className="truncate max-w-[100px] sm:max-w-none">{SORT_OPTIONS.find(o => o.value === sortBy)?.label || 'Önerilen'}</span>
        <ChevronRight size={12} className={`text-amber-400/50 shrink-0 transition-transform duration-200 ${open ? 'rotate-90' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-60 sm:w-64 overflow-hidden rounded-2xl border border-amber-400/30 bg-[#120d0a]/98 backdrop-blur-md shadow-2xl shadow-black/50">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleSelect(opt.value)}
              className={`w-full px-5 py-3 text-left text-xs font-bold uppercase tracking-[0.12em] transition-all ${
                sortBy === opt.value
                  ? 'bg-amber-500/18 text-amber-200 font-semibold'
                  : 'text-stone-400 hover:bg-amber-500/10 hover:text-amber-100'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
