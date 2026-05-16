import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Shuffle, RefreshCw, X, Star, BookOpen, Sparkles, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { proxyImageUrl } from '../services/api';
import { getApiUrl } from '../utils/apiConfig';

const LOADING_PHRASES = [
  "Kader zarları atılıyor...",
  "Bu gecenin filmi aranıyor...",
  "Sinema ruhu konuşuyor...",
  "Arşiv derinlikleri taranıyor...",
  "Üstad düşünüyor...",
];

export default function SurpriseFilm() {
  const navigate = useNavigate();
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

  const handleInspect = async () => {
    if (!movie) return;
    const movieId = movie.id || movie.tmdb_id;
    setLoadingDetail(true);
    setShowDetail(true);
    try {
      const res = await fetch(getApiUrl(`/api/movies/${movieId}/analyze`));
      if (!res.ok) throw new Error('Analiz alınamadı');
      const data = await res.json();
      setAnalysisData(data);
    } catch (err) {
      setAnalysisData({ error: err.message });
    } finally {
      setLoadingDetail(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans relative overflow-hidden flex flex-col">
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

      <header className="relative z-10 p-4 sm:p-6 pt-safe flex items-center">
        <button onClick={() => navigate('/')}
          className="w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center hover:bg-white/10 rounded-full border border-white/20 transition-all text-white/70 hover:text-white">
          <ChevronLeft size={24} />
        </button>
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
              className="px-8 py-4 bg-white/10 hover:bg-white/20 border border-white/20 rounded-full flex items-center gap-3 transition-all text-sm font-bold uppercase tracking-widest">
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
              className="relative w-full max-w-lg"
            >
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 flex gap-2 z-20 flex-wrap justify-center">
                <span className="bg-[#ff6b35] text-white px-4 py-1.5 rounded-full font-bold uppercase tracking-widest text-[10px] shadow-lg">Sürpriz</span>
                <span className="bg-[#00d4ff] text-black px-4 py-1.5 rounded-full font-bold text-[10px] uppercase tracking-widest shadow-lg">
                  {movie.vote_average?.toFixed(1) || '?'} ★
                </span>
                <span className="bg-[#ffbf00] text-black px-4 py-1.5 rounded-full font-bold text-[10px] uppercase tracking-widest shadow-lg">
                  {movie.release_date?.split('-')[0] || '?'}
                </span>
              </div>

              <div className="bg-black/70 backdrop-blur-2xl rounded-[2.5rem] overflow-hidden border border-white/10 shadow-[0_0_80px_rgba(255,107,53,0.15)]">
                <div className="relative w-full h-[420px]">
                  <img src={proxyImageUrl(movie.poster_url)} className="w-full h-full object-cover object-center" alt={movie.title} />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-6">
                    <h2 className="text-3xl font-serif font-bold text-white tracking-tight leading-tight drop-shadow-xl">
                      {movie.title}
                    </h2>
                    {ustadLine && (
                      <p className="mt-2 text-sm text-[#ffbf00]/70 font-serif italic line-clamp-2">"{ustadLine}"</p>
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

      {/* Film Detail Modal */}
      <AnimatePresence>
        {showDetail && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/90 backdrop-blur-xl flex items-center justify-center p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setShowDetail(false); }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", bounce: 0.3 }}
              className="w-full max-w-xl bg-[#1a1410] border border-white/10 rounded-[2rem] overflow-hidden shadow-2xl max-h-[85vh] overflow-y-auto"
            >
              {/* Header */}
              <div className="relative">
                {movie?.poster_url && (
                  <img src={proxyImageUrl(movie.poster_url)} className="w-full h-52 object-cover" alt={movie.title} />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-[#1a1410] via-[#1a1410]/50 to-transparent" />
                <button onClick={() => setShowDetail(false)}
                  className="absolute top-4 right-4 w-9 h-9 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center transition-all border border-white/20">
                  <X size={16} />
                </button>
                <div className="absolute bottom-0 left-0 right-0 p-6">
                  <h2 className="text-2xl font-serif font-bold text-white">{movie?.title}</h2>
                  <div className="flex items-center gap-3 mt-1">
                    {movie?.vote_average && (
                      <span className="flex items-center gap-1 text-[#ffbf00] text-sm font-bold">
                        <Star size={12} fill="currentColor" /> {movie.vote_average.toFixed(1)}
                      </span>
                    )}
                    {movie?.release_date && (
                      <span className="text-white/40 text-xs">{movie.release_date.split('-')[0]}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-5">
                {loadingDetail ? (
                  <div className="flex flex-col items-center gap-4 py-8">
                    <div className="w-8 h-8 rounded-full border-2 border-[#ffbf00]/30 border-t-[#ffbf00] animate-spin" />
                    <p className="text-white/40 text-sm font-serif italic">Üstad inceliyor...</p>
                  </div>
                ) : analysisData?.error ? (
                  <p className="text-red-400 text-sm text-center py-4">{analysisData.error}</p>
                ) : analysisData ? (
                  <>
                    {/* Özet */}
                    {(analysisData.overview || movie?.overview) && (
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.3em] text-white/30 mb-2">Özet</p>
                        <p className="text-white/70 text-sm leading-relaxed font-serif">
                          {analysisData.overview || movie.overview}
                        </p>
                      </div>
                    )}

                    {/* Üstadın Notu */}
                    {analysisData.ai_analysis?.mood_note && (
                      <div className="bg-[#ffbf00]/5 border border-[#ffbf00]/20 rounded-2xl p-4">
                        <p className="text-[10px] uppercase tracking-[0.3em] text-[#ffbf00]/50 mb-2 flex items-center gap-1">
                          <Sparkles size={8} /> Üstadın Notu
                        </p>
                        <p className="text-[#ffbf00]/80 text-sm font-serif italic leading-relaxed">
                          "{analysisData.ai_analysis.mood_note}"
                        </p>
                      </div>
                    )}

                    {/* Puanlar */}
                    {analysisData.ratings?.length > 0 && (
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.3em] text-white/30 mb-2">Puanlar</p>
                        <div className="flex flex-wrap gap-2">
                          {analysisData.ratings.map((r, i) => (
                            <span key={i} className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-xs text-white/60">
                              {r.source}: <span className="text-white font-bold">{r.value}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Cast */}
                    {analysisData.cast?.length > 0 && (
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.3em] text-white/30 mb-2">Oyuncular</p>
                        <p className="text-white/50 text-sm">
                          {analysisData.cast.slice(0, 4).map(c => c.name).join(', ')}
                        </p>
                      </div>
                    )}
                  </>
                ) : null}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
