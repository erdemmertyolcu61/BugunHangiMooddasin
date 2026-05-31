import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Calendar } from 'lucide-react';
import { proxyImageUrl } from '../services/api';
import { getApiUrl } from '../utils/apiConfig';

export default function UpcomingSlider() {
  const [upcoming, setUpcoming] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(1); // 1 = ileri, -1 = geri

  // Drag / swipe state
  const dragStartX = useRef(null);
  const autoTimer = useRef(null);

  useEffect(() => {
    fetch(getApiUrl('/api/movies/upcoming'))
      .then(r => r.json())
      .then(data => setUpcoming(data.movies || []))
      .catch(console.error);
  }, []);

  const goTo = (idx, dir) => {
    setDirection(dir);
    setCurrentIndex(idx);
  };

  const next = () => {
    if (upcoming.length === 0) return;
    goTo((currentIndex + 1) % upcoming.length, 1);
  };

  const prev = () => {
    if (upcoming.length === 0) return;
    goTo((currentIndex - 1 + upcoming.length) % upcoming.length, -1);
  };

  /* ── Auto-rotate ── */
  const resetTimer = () => {
    clearInterval(autoTimer.current);
    autoTimer.current = setInterval(next, 5000);
  };

  useEffect(() => {
    if (upcoming.length === 0) return;
    autoTimer.current = setInterval(next, 5000);
    return () => clearInterval(autoTimer.current);
  }, [upcoming, currentIndex]);

  /* ── Mouse drag ── */
  const onMouseDown = (e) => { dragStartX.current = e.clientX; };
  const onMouseUp = (e) => {
    if (dragStartX.current === null) return;
    const delta = dragStartX.current - e.clientX;
    if (Math.abs(delta) > 40) {
      delta > 0 ? next() : prev();
      resetTimer();
    }
    dragStartX.current = null;
  };

  /* ── Touch swipe ── */
  const onTouchStart = (e) => { dragStartX.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (dragStartX.current === null) return;
    const delta = dragStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(delta) > 40) {
      delta > 0 ? next() : prev();
      resetTimer();
    }
    dragStartX.current = null;
  };

  const formatDate = (d) => {
    if (!d) return '';
    const parts = d.split('-'); // YYYY-MM-DD
    if (parts.length !== 3) return d;
    const [y, m, day] = parts;
    return `${day}.${m}.${y}`;
  };

  if (upcoming.length === 0) return null;

  const film = upcoming[currentIndex];

  const variants = {
    enter: (dir) => ({ opacity: 0, x: dir > 0 ? 60 : -60 }),
    center: { opacity: 1, x: 0 },
    exit: (dir) => ({ opacity: 0, x: dir > 0 ? -60 : 60 }),
  };

  return (
    <section
      className="relative w-full h-[128px] sm:h-[180px] rounded-[1.5rem] sm:rounded-[2rem] overflow-hidden gurme-border bg-black/40 group cursor-grab active:cursor-grabbing select-none"
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={film.id}
          custom={direction}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="absolute inset-0 flex flex-row items-center"
        >
          {/* Background blur */}
          <div
            className="absolute inset-0 opacity-20 blur-3xl scale-110"
            style={{
              backgroundImage: `url(${proxyImageUrl(film.poster_url)})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />

          <div className="relative z-10 w-[92px] sm:w-1/3 h-full px-2.5 sm:p-4 flex items-center justify-center shrink-0">
            <img
              src={proxyImageUrl(film.poster_url)}
              alt={film.title}
              className="h-[88px] sm:h-[140px] rounded-lg sm:rounded-xl shadow-xl transform group-hover:scale-105 transition-transform duration-1000"
              draggable={false}
            />
          </div>

          <div className="relative z-10 flex-1 min-w-0 pr-4 sm:p-6 space-y-1 sm:space-y-3">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <span className="px-2 py-0.5 bg-amber/20 border border-amber/40 text-amber text-[9px] font-bold uppercase tracking-widest rounded-full flex items-center gap-1">
                <Sparkles size={8} /> Yakında
              </span>
              <span className="text-[9px] font-bold uppercase tracking-widest text-ivory/40 flex items-center gap-1">
                <Calendar size={8} /> {formatDate(film.release_date)}
              </span>
            </div>
            <h2 className="text-base sm:text-2xl font-serif font-bold tracking-tight leading-tight line-clamp-2 pr-2">
              {film.title}
            </h2>
            <p className="text-[12px] sm:text-sm font-serif italic text-amber/60 max-w-xl">
              Yakında bizlerle.
            </p>
          </div>
        </motion.div>
      </AnimatePresence>


    </section>
  );
}
