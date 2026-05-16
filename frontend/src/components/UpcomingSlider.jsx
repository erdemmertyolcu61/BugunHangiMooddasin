import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Calendar } from 'lucide-react';
import { proxyImageUrl } from '../services/api';
import { getApiUrl } from '../utils/apiConfig';

export default function UpcomingSlider() {
  const [upcoming, setUpcoming] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    fetch(getApiUrl('/api/movies/upcoming'))
      .then(r => r.json())
      .then(data => setUpcoming(data.movies || []))
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (upcoming.length === 0) return;
    const interval = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % upcoming.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [upcoming]);

  if (upcoming.length === 0) return null;

  return (
    <section className="relative w-full h-[180px] rounded-[2rem] overflow-hidden gurme-border bg-black/40 group">
      <AnimatePresence mode="wait">
        <motion.div
          key={upcoming[currentIndex].id}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          className="absolute inset-0 flex flex-col md:flex-row items-center"
        >
          {/* Background Blur */}
          <div 
            className="absolute inset-0 opacity-20 blur-3xl scale-110"
            style={{
              backgroundImage: `url(${proxyImageUrl(upcoming[currentIndex].poster_url)})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center'
            }}
          />
          
<div className="relative z-10 w-full md:w-1/3 h-full p-4 flex items-center justify-center">
            <img 
              src={proxyImageUrl(upcoming[currentIndex].poster_url)}
              alt={upcoming[currentIndex].title}
              className="h-[140px] rounded-xl shadow-xl transform group-hover:scale-105 transition-transform duration-1000"
            />
          </div>
          
          <div className="relative z-10 flex-1 p-6 space-y-3">
            <div className="flex items-center gap-2">
               <span className="px-2 py-0.5 bg-amber/20 border border-amber/40 text-amber text-[9px] font-bold uppercase tracking-widest rounded-full flex items-center gap-1">
                  <Sparkles size={8} /> Yakında
                </span>
                <span className="text-[9px] font-bold uppercase tracking-widest text-ivory/30 flex items-center gap-1">
                  <Calendar size={8} /> {upcoming[currentIndex].release_date}
                </span>
            </div>
            <h2 className="text-2xl font-serif font-bold tracking-tighter leading-none">
              {upcoming[currentIndex].title}
            </h2>
            <p className="text-sm font-serif italic text-ivory/40 max-w-xl">
              Çok yakında...
            </p>
          </div>
        </motion.div>
      </AnimatePresence>
      
      {/* Pagination dots */}
      <div className="absolute bottom-4 right-6 flex gap-1.5 z-20">
        {upcoming.map((_, i) => (
          <button 
            key={i}
            onClick={() => setCurrentIndex(i)}
            className={`h-1 transition-all duration-500 rounded-full ${i === currentIndex ? 'w-8 bg-amber' : 'w-2 bg-white/10'}`}
          />
        ))}
      </div>
    </section>
  );
}
