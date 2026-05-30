import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Shuffle, RefreshCw, X, Star, BookOpen, Sparkles, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { proxyImageUrl } from '../services/api';
import { getApiUrl } from '../utils/apiConfig';
import FilmDetailModal from '../components/FilmDetailModal';
import { track, EVENTS } from '../utils/analytics';
import useDocumentMeta from '../utils/useDocumentMeta';

const LOADING_PHRASES = [
  "Kader zarları atılıyor...",
  "Bu gecenin filmi aranıyor...",
  "Sinema ruhu konuşuyor...",
  "Arşiv derinlikleri taranıyor...",
  "Üstad düşünüyor...",
];

const SURPRISE_STYLE = `
  .surprise-film-root [class*="hover:bg-white/10"]:hover {
    background-color: rgba(255, 255, 255, 0.1) !important;
  }
  .surprise-film-root [class*="hover:bg-white/20"]:hover {
    background-color: rgba(255, 255, 255, 0.2) !important;
  }
  .surprise-film-root [class*="hover:text-white"]:hover {
    color: rgb(255, 255, 255) !important;
  }
`;

export default function SurpriseFilm() {
  const navigate = useNavigate();
  useDocumentMeta({
    title: 'Sürpriz Film — Ne İzlesem? | Sinemood',
    description: 'Kararsız mısın? Üstad senin için arşivin derinliklerinden sürpriz bir film seçsin. Tek tıkla ne izleyeceğini keşfet.',
  });
  const [movie, setMovie] = useState(null);
  const [spinning, setSpinning] = useState(false);
  const [error, setError] = useState(null);
  const [seenIds, setSeenIds] = useState([]);
  const [ustadLine, setUstadLine] = useState('');
  const [phraseIdx, setPhraseIdx] = useState(0);

  // Film detay state
  const [showDetail, setShowDetail] = useState(false);
  const [analysisData, setAnalysisData] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const phraseTimer = useRef(null);

  const startPhraseRotation = () => {
    setPhraseIdx(0);
    phraseTimer.current = setInterval(() => {
      setPhraseIdx(p => (p + 1) % LOADING_PHRASES.length);
    }, 900);
  };

  const stopPhraseRotation = () => {
    if (phraseTimer.current) clearInterval(phraseTimer.current);
  };

  const fetchSurprise = async () => {
    setSpinning(true);
    setError(null);
    setMovie(null);
    setShowDetail(false);
    setAnalysisData(null);
    startPhraseRotation();
    try {
      const res = await fetch(getApiUrl(`/api/recommend/surprise?exclude_ids=${seenIds.join(',')}`));
      const data = await res.json();
      if (!res.ok || data.source === 'error' || data.source === 'empty') {
        setError(data.message || 'Sürpriz film alınamadı');
        stopPhraseRotation();
        setSpinning(false);
      } else {
        setTimeout(() => {
          setMovie(data.movie);
          track(EVENTS.SURPRISE_VIEW, { id: data.movie?.id || data.movie?.tmdb_id });
          setUstadLine(data.ustad_line || '');
          setSeenIds(prev => [...prev, data.movie?.id || data.movie?.tmdb_id]);
          stopPhraseRotation();
          setSpinning(false);
        }, 2000);
      }
    } catch (err) {
      setError(err.message || 'Sürpriz alınamadı');
      stopPhraseRotation();
      setSpinning(false);
    }
  };

  useEffect(() => { fetchSurprise(); return () => stopPhraseRotation(); }, []);

  // FilmDetailModal kendi /analyze çağrısını yapar — burada sadece açıyoruz.
  const handleInspect = () => {
    if (!movie) return;
    setShowDetail(true);
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans relative overflow-hidden flex flex-col surprise-film-root">
      <style>{SURPRISE_STYLE}</style>
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#1a0533] via-[#2d1b69] to-[#1a0a2e]">
        <div className="absolute inset-0 opacity-30" style={{
          backgroundImage: `
            radial-gradient(ellipse at 20% 20%, #ff6b35 0%, transparent 50%),
            radial-gradient(ellipse at 80% 30%, #00d4ff 0%, transparent 50%),
            radial-gradient(ellipse at 50% 80%, #ffbf00 0%, transparent 50%),
            radial-gradient(ellipse at 30% 60%, #ff006e 0%, transparent 40%)
          `
        }} />
      </div>
      <div className="absolute inset-0 opacity-[0.05] pointer-events-none"
        style={{ backgroundImage: "url('https://www.transparenttextures.com/patterns/stardust.png')" }} />

      <header className="relative z-10 p-4 sm:p-6 pt-safe flex items-center gap-3">
        <button onClick={() => navigate('/')}
          className="w-12 h-12 sm:w-14 sm:h-14 flex-shrink-0 flex items-center justify-center hover:bg-white/10 rounded-full border border-white/20 transition-all text-white/70 hover:text-white">
          <ChevronLeft size={24} />
        </button>
        {movie && (
          <h1 className="text-sm sm:text-base font-sans font-semibold tracking-wide truncate max-w-[55vw] sm:max-w-[60vw]"
            style={{ color: 'rgba(255,255,255,0.85)' }}>
            {movie.title}
          </h1>
        )}
      </header>

      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-5 sm:px-6 pb-nav md:pb-20">

        {/* Loading */}
        {spinning && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-10">
            {/* Animated film reel */}
            <div className="relative w-36 h-36">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                className="w-36 h-36 rounded-full border-2 border-[#ffbf00]/30 border-t-[#ffbf00]"
              />
              <motion.div
                animate={{ rotate: -360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                className="absolute inset-4 rounded-full border border-[#00d4ff]/20 border-b-[#00d4ff]/60"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <Sparkles size={28} className="text-[#ffbf00]/60" />
              </div>
            </div>
            <AnimatePresence mode="wait">
              <motion.p
                key={phraseIdx}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.4 }}
                className="text-xl font-serif italic text-[#ffbf00]/80 tracking-wide"
              >
                {LOADING_PHRASES[phraseIdx]}
              </motion.p>
            </AnimatePresence>
          </motion.div>
        )}

        {/* Error */}
        {error && !spinning && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex flex-col items-center gap-6 text-center">
            <p className="text-xl font-serif italic text-[#ff6b35] max-w-md">{error}</p>
            <button onClick={fetchSurprise}
              className="px-8 py-4 bg-white/10 hover:bg-white/20 border border-white/20 rounded-full flex items-center gap-3 transition-all text-sm font-bold uppercase tracking-widest text-white">
              <RefreshCw size={16} /> Tekrar Dene
            </button>
          </motion.div>
        )}

        {/* Movie card */}
        <AnimatePresence>
          {movie && !spinning && (
            <motion.div
              key={movie.id}
              initial={{ scale: 0.8, opacity: 0, y: 50 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ type: "spring", bounce: 0.4, duration: 1 }}
              className="relative w-full max-w-lg md:max-w-2xl lg:max-w-3xl"
            >
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 flex gap-2 z-20 flex-wrap justify-center">
                <span className="bg-[#ff6b35] text-white px-4 py-1.5 rounded-full font-bold uppercase tracking-widest text-[10px] shadow-lg">Sürpriz</span>
                <span className="bg-[#00d4ff] text-black px-4 py-1.5 rounded-full font-bold text-[10px] uppercase tracking-widest shadow-lg">
                  {movie.vote_average > 0 ? movie.vote_average.toFixed(1) : '—'} ★
                </span>
                <span className="bg-[#ffbf00] text-black px-4 py-1.5 rounded-full font-bold text-[10px] uppercase tracking-widest shadow-lg">
                  {movie.release_date?.split('-')[0] || '?'}
                </span>
              </div>

              <div className="bg-black/70 backdrop-blur-md rounded-[2.5rem] overflow-hidden border border-white/10 shadow-[0_0_80px_rgba(255,107,53,0.15)]">
                <div className="relative w-full h-[420px] md:h-[560px] lg:h-[640px]">
                  <img src={proxyImageUrl(movie.poster_url)} className="w-full h-full object-cover object-center" alt={movie.title} />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-10">
                    <h2 className="text-3xl sm:text-5xl lg:text-6xl font-serif font-bold text-white tracking-tight leading-tight drop-shadow-xl">
                      {movie.title}
                    </h2>
                    {ustadLine && (
                      <p className="mt-3 text-[15px] sm:text-xl text-[#ffe9b8] font-serif italic line-clamp-2 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
                        "{ustadLine}"
                      </p>
                    )}
                  </div>
                </div>

                <div className="p-6 flex gap-3 justify-center">
                  <button onClick={fetchSurprise}
                    className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#ff6b35] to-[#ffbf00] text-black rounded-full font-bold uppercase tracking-widest text-xs hover:scale-105 transition-all">
                    <Shuffle size={14} /> Yeni Sürpriz
                  </button>
                  <button onClick={handleInspect}
                    className="flex items-center gap-2 px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-full font-bold uppercase tracking-widest text-xs transition-all border border-white/20">
                    <BookOpen size={14} /> Filmi İncele
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Film Detail Modal — birleşik tasarım (FilmDetailModal) */}
      {showDetail && movie && (
        <FilmDetailModal
          movieId={movie.id || movie.tmdb_id}
          initialMovie={movie}
          onClose={() => setShowDetail(false)}
        />
      )}
    </div>
  );
}
