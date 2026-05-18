/**
 * SimilarFilmsStrip — "Bunları da Sevebilirsin" yatay film şeridi.
 * Mobilde dokunarak kaydırılır; web'de sol/sağ ok butonlarıyla kaydırılır.
 */
import { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { proxyImageUrl } from '../services/api';

export default function SimilarFilmsStrip({ movies, onSelect }) {
  const scrollRef = useRef(null);

  if (!movies || movies.length === 0) return null;

  const scrollBy = (dir) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.round(el.clientWidth * 0.8), behavior: 'smooth' });
  };

  return (
    <div className="border-t border-white/5 pt-7 sm:pt-12 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-widest text-ivory/20">Bunları da Sevebilirsin</p>
        {/* Ok butonları — sadece web (md+) */}
        <div className="hidden md:flex items-center gap-2">
          <button
            type="button"
            onClick={() => scrollBy(-1)}
            aria-label="Geri kaydır"
            className="w-9 h-9 flex items-center justify-center rounded-full bg-white/5 border border-white/10 text-ivory/60 hover:bg-amber hover:text-bg hover:border-amber transition-all"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            onClick={() => scrollBy(1)}
            aria-label="İleri kaydır"
            className="w-9 h-9 flex items-center justify-center rounded-full bg-white/5 border border-white/10 text-ivory/60 hover:bg-amber hover:text-bg hover:border-amber transition-all"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-3 sm:gap-4 overflow-x-auto no-scrollbar pb-2 -mx-1 px-1 snap-x snap-mandatory overscroll-x-contain scroll-smooth"
        style={{ touchAction: 'pan-x', WebkitOverflowScrolling: 'touch' }}
      >
        {movies.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onSelect(m)}
            className="group shrink-0 snap-start w-[100px] sm:w-[130px] text-left"
            title={m.title}
          >
            <div className="aspect-[2/3] rounded-xl sm:rounded-2xl overflow-hidden bg-white/5 border border-white/10 group-hover:border-amber/40 transition-all duration-500 shadow-lg">
              <img
                src={proxyImageUrl(m.poster_url) || 'https://via.placeholder.com/300x450'}
                alt={m.title}
                loading="lazy"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
              />
            </div>
            <p className="mt-2 text-[11px] sm:text-xs font-sans font-semibold text-ivory/60 group-hover:text-amber transition-colors line-clamp-2 leading-tight">
              {m.title}
            </p>
            {m.release_date && (
              <p className="text-[10px] text-ivory/25 font-sans mt-0.5">{m.release_date.split('-')[0]}</p>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
