import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { CalendarDays, Star, ChevronRight, X } from 'lucide-react';
import { getDailyFilm, proxyImageUrl } from '../services/api';

/**
 * Günün Filmi — kompakt banner.
 * MoodSelector (ana sayfa) ve/veya MoodFeed'de gösterilir.
 * getDailyFilm cache'li döner; ekstra maliyet yok.
 */
export default function DailyFilmBanner() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Session içinde dismiss edildiyse tekrar gösterme
    if (sessionStorage.getItem('daily_film_dismissed')) {
      setDismissed(true);
      return;
    }
    let alive = true;
    getDailyFilm()
      .then((d) => { if (alive && d?.movie) setData(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const handleDismiss = (e) => {
    e.stopPropagation();
    setDismissed(true);
    sessionStorage.setItem('daily_film_dismissed', '1');
  };

  if (dismissed || !data?.movie) return null;

  const movie = data.movie;
  const dateLabel = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        onClick={() => navigate('/gunun-filmi')}
        className="group relative w-full max-w-2xl mx-auto mb-8 cursor-pointer"
      >
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#1a1210] via-[#17100d] to-[#1a1210] border border-amber/15 hover:border-amber/30 transition-all duration-500 shadow-[0_8px_40px_-12px_rgba(212,175,55,0.15)]">
          {/* Subtle glow */}
          <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full blur-3xl bg-amber/8 pointer-events-none" />

          <div className="relative flex items-center gap-4 p-3 sm:p-4">
            {/* Poster */}
            <div className="w-14 h-20 sm:w-16 sm:h-24 shrink-0 rounded-xl overflow-hidden bg-white/5 ring-1 ring-white/10 shadow-lg">
              {movie.poster_url ? (
                <img
                  src={proxyImageUrl(movie.poster_url)}
                  alt={movie.title}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-2xl opacity-30">🎬</div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <CalendarDays size={12} className="text-amber/60 shrink-0" />
                <span className="text-[9px] font-bold uppercase tracking-[0.3em] text-amber/50">
                  {dateLabel} — Üstad'ın Seçimi
                </span>
              </div>
              <h3 className="font-serif text-base sm:text-lg font-bold text-ivory truncate group-hover:text-amber transition-colors duration-300">
                {movie.title}
              </h3>
              <div className="flex items-center gap-3 mt-1 text-ivory/40 text-xs">
                {movie.release_date && <span>{String(movie.release_date).slice(0, 4)}</span>}
                {movie.vote_average > 0 && (
                  <span className="flex items-center gap-1 text-amber/80 font-semibold">
                    <Star size={10} className="fill-amber/80" />{Number(movie.vote_average).toFixed(1)}
                  </span>
                )}
              </div>
              {data.ustad_line && (
                <p className="mt-1.5 font-serif italic text-[12px] text-ivory/45 line-clamp-1">
                  &ldquo;{data.ustad_line}&rdquo;
                </p>
              )}
            </div>

            {/* Arrow */}
            <ChevronRight size={18} className="text-amber/30 group-hover:text-amber/70 group-hover:translate-x-0.5 transition-all duration-300 shrink-0" />
          </div>
        </div>

        {/* Dismiss */}
        <button
          onClick={handleDismiss}
          className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full bg-black/60 text-ivory/30 hover:text-ivory/70 transition-colors z-10"
          aria-label="Kapat"
        >
          <X size={12} />
        </button>
      </motion.div>
    </AnimatePresence>
  );
}
