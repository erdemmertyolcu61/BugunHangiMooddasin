import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Calendar } from 'lucide-react';
import { proxyImageUrl } from '../services/api';
import { getApiUrl } from '../utils/apiConfig';

export default function UpcomingSlider() {
  const [upcoming, setUpcoming] = useState([]);
  const scrollRef = useRef(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);
  const hasDragged = useRef(false);

  useEffect(() => {
    fetch(getApiUrl('/api/movies/upcoming'))
      .then(r => r.json())
      .then(data => setUpcoming(data.movies || []))
      .catch(console.error);
  }, []);

  /* ── Mouse drag handlers ── */
  const onMouseDown = (e) => {
    isDragging.current = true;
    hasDragged.current = false;
    startX.current = e.pageX - scrollRef.current.offsetLeft;
    scrollLeft.current = scrollRef.current.scrollLeft;
    scrollRef.current.style.cursor = 'grabbing';
  };

  const onMouseMove = (e) => {
    if (!isDragging.current) return;
    e.preventDefault();
    const x = e.pageX - scrollRef.current.offsetLeft;
    const walk = (x - startX.current) * 1.4;
    if (Math.abs(walk) > 4) hasDragged.current = true;
    scrollRef.current.scrollLeft = scrollLeft.current - walk;
  };

  const onMouseUp = () => {
    isDragging.current = false;
    if (scrollRef.current) scrollRef.current.style.cursor = 'grab';
  };

  if (upcoming.length === 0) return null;

  return (
    <div className="relative">
      {/* Gradient fade edges */}
      <div className="absolute left-0 top-0 bottom-2 w-8 bg-gradient-to-r from-[#120d0b] to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-2 w-12 bg-gradient-to-l from-[#120d0b] to-transparent z-10 pointer-events-none" />

      <div
        ref={scrollRef}
        className="flex gap-3 sm:gap-4 overflow-x-auto no-scrollbar pb-2 select-none"
        style={{ cursor: 'grab', scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch' }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        {upcoming.map((film) => (
          <div
            key={film.id}
            className="shrink-0 w-[120px] sm:w-[140px] md:w-[160px]"
            style={{ scrollSnapAlign: 'start' }}
          >
            <div className="aspect-[2/3] rounded-[1.25rem] overflow-hidden bg-white/5 border border-white/10 relative group">
              {film.poster_url
                ? <img
                    src={proxyImageUrl(film.poster_url)}
                    alt={film.title}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    draggable={false}
                    loading="lazy"
                    decoding="async"
                  />
                : <div className="w-full h-full flex items-center justify-center bg-white/5">
                    <span className="text-amber/30 text-3xl">🎬</span>
                  </div>
              }

              {/* Gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />

              {/* Badge */}
              <div className="absolute top-2 left-2 z-10">
                <span className="px-2 py-0.5 bg-amber/20 border border-amber/40 text-amber text-[8px] font-bold uppercase tracking-widest rounded-full flex items-center gap-1">
                  <Sparkles size={6} /> Yakında
                </span>
              </div>

              {/* Info at bottom */}
              <div className="absolute bottom-0 left-0 right-0 p-3 z-10">
                <h3 className="text-[11px] sm:text-xs font-serif font-bold text-white leading-tight line-clamp-2 mb-1">
                  {film.title}
                </h3>
                {film.release_date && (
                  <p className="text-[8px] text-white/40 flex items-center gap-1">
                    <Calendar size={6} /> {film.release_date}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}

        {/* Spacer at end so last card doesn't hide behind fade */}
        <div className="shrink-0 w-4" />
      </div>
    </div>
  );
}
