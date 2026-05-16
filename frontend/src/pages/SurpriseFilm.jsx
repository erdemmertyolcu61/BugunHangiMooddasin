import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Shuffle, Sparkles, Star, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { proxyImageUrl } from '../services/api';

const IMG_BASE = 'https://image.tmdb.org/t/p/w780';

export default function SurpriseFilm() {
  const navigate = useNavigate();
  const [movie, setMovie] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [spinning, setSpinning] = useState(false);
  const [seenIds, setSeenIds] = useState([]);
  const [ustadLine, setUstadLine] = useState('');

  const fetchSurprise = async () => {
    setLoading(true);
    setSpinning(true);
    setError(null);
    setMovie(null);
    try {
      const res = await fetch(`/api/recommend/surprise?exclude_ids=${seenIds.join(',')}`);
      const data = await res.json();
      if (!res.ok || data.source === 'error' || data.source === 'empty') {
        setError(data.message || 'Sürpriz film alınamadı');
      } else {
        setTimeout(() => {
          setMovie(data.movie);
          setUstadLine(data.ustad_line || '');
          setSeenIds(prev => [...prev, data.movie.id || data.movie.tmdb_id]);
          setSpinning(false);
          setLoading(false);
        }, 2000);
      }
    } catch (err) {
      setError(err.message || 'Sürpriz alınamadı');
      setSpinning(false);
      setLoading(false);
    }
  };

  useEffect(() => { fetchSurprise(); }, []);

  return (
    <div className="min-h-screen bg-black text-ivory font-sans relative overflow-hidden flex flex-col">
      {/* Vibrant colorful gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#1a0533] via-[#2d1b69] to-[#1a0a2e]">
        <div className="absolute inset-0 bg-gradient-to-t from-[#ff6b35]/10 via-[#ffbf00]/5 to-[#00d4ff]/10" />
        <div className="absolute top-0 left-0 w-full h-full opacity-30"
          style={{
            backgroundImage: `
              radial-gradient(ellipse at 20% 20%, #ff6b35 0%, transparent 50%),
              radial-gradient(ellipse at 80% 30%, #00d4ff 0%, transparent 50%),
              radial-gradient(ellipse at 50% 80%, #ffbf00 0%, transparent 50%),
              radial-gradient(ellipse at 30% 60%, #ff006e 0%, transparent 40%)
            `
          }}
        />
      </div>
      {/* Texture overlay */}
      <div className="absolute inset-0 opacity-[0.05] mix-blend-overlay pointer-events-none"
        style={{ backgroundImage: "url('https://www.transparenttextures.com/patterns/black-scales.png')" }} />
      <div className="absolute inset-0 opacity-[0.08] mix-blend-overlay pointer-events-none"
        style={{ backgroundImage: "url('https://www.transparenttextures.com/patterns/stardust.png')" }} />

      <header className="relative z-10 p-6 flex items-center">
        <button onClick={() => navigate('/')}
          className="w-14 h-14 flex items-center justify-center hover:bg-white/10 rounded-full border border-white/20 transition-all text-white/70 hover:text-white">
          <ChevronLeft size={24} />
        </button>
      </header>

      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 pb-20">
        {/* Initial / Retry state */}
        {!movie && !spinning && !error && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center space-y-6">
            <button onClick={fetchSurprise}
              className="px-10 py-5 bg-gradient-to-r from-[#ff6b35] via-[#ffbf00] to-[#00d4ff] text-black font-bold text-lg uppercase tracking-[0.3em] rounded-full hover:scale-105 transition-all shadow-[0_0_40px_rgba(255,107,53,0.4)]">
              <Shuffle size={20} className="inline mr-3" /> Sürpriz Çek
            </button>
          </motion.div>
        )}

        {/* Spinning / Loading */}
        {spinning && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex flex-col items-center gap-10">
            <motion.div
              animate={{ rotateY: 360 }}
              transition={{ duration: 0.6, repeat: Infinity, ease: "linear" }}
              className="w-40 h-56 bg-white/10 rounded-3xl border-2 border-[#ffbf00]/50 shadow-[0_0_50px_rgba(255,191,0,0.3)]"
              style={{
                background: 'linear-gradient(135deg, rgba(255,107,53,0.2), rgba(0,212,255,0.2))',
              }}
            />
            <div className="text-center space-y-3">
              <motion.p
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="text-2xl font-serif italic text-[#ffbf00] drop-shadow-[0_0_10px_rgba(255,191,0,0.3)]"
              >
                Perde açılıyor...
              </motion.p>
            </div>
          </motion.div>
        )}

        {/* Error */}
        {error && !spinning && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center gap-8 text-center">
            <p className="text-2xl font-serif italic text-[#ff6b35] max-w-xl">{error}</p>
            <button onClick={fetchSurprise}
              className="px-8 py-4 bg-white/10 hover:bg-white/20 border border-white/20 rounded-full flex items-center gap-3 transition-all">
              <RefreshCw size={20} /> <span className="tracking-widest uppercase text-sm font-bold">Tekrar Dene</span>
            </button>
          </motion.div>
        )}

        {/* Movie Reveal */}
        <AnimatePresence>
          {movie && !spinning && (
            <motion.div
              key={movie.id}
              initial={{ scale: 0.7, opacity: 0, y: 60 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ type: "spring", bounce: 0.5, duration: 1.2 }}
              className="relative w-full max-w-2xl"
            >
              {/* Multi-color glow badges */}
              <div className="absolute -top-5 left-1/2 -translate-x-1/2 flex gap-3 z-20 flex-wrap justify-center">
                <span className="bg-[#ff6b35] text-white px-5 py-2 rounded-full font-bold uppercase tracking-widest text-xs shadow-lg shadow-[#ff6b35]/40">
                  Sürpriz
                </span>
                <span className="bg-[#00d4ff] text-black px-5 py-2 rounded-full font-bold uppercase tracking-widest text-xs shadow-lg shadow-[#00d4ff]/40">
                  {movie.vote_average?.toFixed(1) || '?'} ★
                </span>
                <span className="bg-[#ffbf00] text-black px-5 py-2 rounded-full font-bold uppercase tracking-widest text-xs shadow-lg shadow-[#ffbf00]/40">
                  {movie.release_date?.split('-')[0] || '?'}
                </span>
              </div>

              {/* Film card */}
              <div className="w-full bg-black/70 backdrop-blur-2xl rounded-[3rem] overflow-hidden border border-white/10 shadow-[0_0_80px_rgba(255,107,53,0.15)]">
                <div className="aspect-[16/9] md:aspect-[2/3] relative">
                  <img
                    src={proxyImageUrl(movie.poster_url) || `${IMG_BASE}/placeholder`}
                    className="w-full h-full object-cover"
                    alt={movie.title}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-8 md:p-12">
                    <h2 className="text-5xl md:text-7xl font-serif font-bold text-white tracking-tighter leading-tight drop-shadow-xl">
                      {movie.title}
                    </h2>
                    {movie.overview && (
                      <p className="mt-4 text-base md:text-lg text-white/60 line-clamp-2 max-w-xl">
                        {movie.overview}
                      </p>
                    )}
                    {ustadLine && (
                      <p className="mt-3 text-sm md:text-base text-[#ffbf00]/70 font-serif italic">
                        "{ustadLine}"
                      </p>
                    )}
                  </div>
                </div>

                <div className="p-8 md:p-12 bg-white/5 flex flex-wrap gap-4 justify-center">
                  <button onClick={fetchSurprise}
                    className="flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-[#ff6b35] to-[#ffbf00] text-black rounded-full font-bold uppercase tracking-widest text-xs hover:scale-105 transition-all shadow-[0_0_25px_rgba(255,107,53,0.3)]">
                    <Shuffle size={16} /> Yeni Sürpriz
                  </button>
                  <button onClick={() => navigate(`/discover?analyze=${movie.id || movie.tmdb_id}`)}
                    className="px-8 py-4 bg-white/10 text-white rounded-full font-bold uppercase tracking-widest text-xs hover:bg-white/20 transition-all">
                    Filmi İncele
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
