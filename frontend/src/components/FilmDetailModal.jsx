/**
 * FilmDetailModal — Listeler ve diğer sayfalarda kullanılan, kendi içinde
 * çalışan tam film detay pop-up'ı. Mood'a yönlendirmez, yerinde açılır.
 * İçerik: poster, özet, Üstad notu, Nerede İzlenir, Benzer Filmler.
 */
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Check, Eye } from 'lucide-react';
import { getApiUrl } from '../utils/apiConfig';
import {
  proxyImageUrl, getSimilarMovies,
  addToWatchlist, removeFromWatchlist, toggleWatched,
} from '../services/api';
import SimilarFilmsStrip from './SimilarFilmsStrip';

const IMG_LG = 'https://image.tmdb.org/t/p/original';

const reliableRating = (m) => {
  if (m?.imdb_rating) {
    const n = parseFloat(m.imdb_rating);
    if (!isNaN(n) && n > 0) return n.toFixed(1);
  }
  const avg = m?.vote_average;
  if (avg == null || avg <= 0) return null;
  const c = m?.vote_count;
  if (c != null) return c >= 50 ? avg.toFixed(1) : null;
  return avg <= 9.0 ? avg.toFixed(1) : null;
};

export default function FilmDetailModal({ movieId, onClose }) {
  const [movie, setMovie] = useState(null);
  const [loading, setLoading] = useState(true);
  const [similar, setSimilar] = useState([]);
  const [saved, setSaved] = useState(false);
  const [watched, setWatched] = useState(false);
  const [activeId, setActiveId] = useState(movieId);

  useEffect(() => { setActiveId(movieId); }, [movieId]);

  useEffect(() => {
    if (!activeId) return;
    let active = true;
    setLoading(true);
    setMovie(null);
    setSimilar([]);
    (async () => {
      try {
        const res = await fetch(getApiUrl(`/api/movies/${activeId}/analyze`));
        if (res.ok && active) {
          const data = await res.json();
          setMovie({ id: activeId, ...data });
          setSaved(!!data.in_watchlist);
        }
      } catch {}
      finally { if (active) setLoading(false); }
    })();
    getSimilarMovies(activeId).then((d) => { if (active) setSimilar(d.movies || []); });
    return () => { active = false; };
  }, [activeId]);

  const handleSave = async () => {
    if (!movie) return;
    if (saved) {
      setSaved(false); setWatched(false);
      try { await removeFromWatchlist(movie.id); } catch {}
    } else {
      setSaved(true);
      try { await addToWatchlist(movie); } catch {}
    }
  };

  const handleWatched = async () => {
    if (!movie) return;
    const now = !watched;
    setWatched(now);
    if (now && !saved) { setSaved(true); try { await addToWatchlist(movie); } catch {} }
    try { await toggleWatched(movie.id); } catch {}
  };

  const poster = movie && proxyImageUrl(
    movie.poster_url || (movie.poster_path ? `${IMG_LG}${movie.poster_path}` : null)
  );

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[120] flex items-start sm:items-center justify-center overflow-y-auto p-0 sm:p-6 md:p-12"
      >
        <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" onClick={onClose} />
        <motion.div
          initial={{ scale: 0.94, y: 24, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.94, y: 24, opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-5xl my-auto bg-[#1a1a1a]/95 backdrop-blur-md border border-white/10 rounded-none sm:rounded-[2.5rem] p-5 sm:p-12 md:p-14 pt-safe pb-24 sm:pb-12 shadow-2xl"
        >
          <button onClick={onClose}
            className="absolute top-4 right-4 sm:top-8 sm:right-8 z-10 w-11 h-11 flex items-center justify-center rounded-full bg-black/50 text-ivory/60 hover:text-amber transition-colors">
            <X size={24} />
          </button>

          {loading && !movie ? (
            <div className="flex flex-col items-center justify-center gap-6 py-32">
              <div className="w-10 h-10 rounded-full border-2 border-amber/30 border-t-amber animate-spin" />
              <p className="font-serif italic text-ivory/40 text-lg">Üstad notlarını hazırlıyor...</p>
            </div>
          ) : movie ? (
            <div className="flex flex-col md:flex-row gap-6 sm:gap-14 relative z-[1]">
              <div className="w-[72%] sm:w-full md:w-[34%] shrink-0 aspect-[2/3] mx-auto relative rounded-2xl sm:rounded-[2rem] overflow-hidden shadow-[0_30px_70px_-15px_rgba(0,0,0,0.7)] ring-1 ring-white/10">
                <img src={poster || 'https://via.placeholder.com/500x750'} alt={movie.title}
                  className="w-full h-full object-cover object-center" loading="eager" />
                <div className="absolute inset-x-0 top-0 h-1/4 bg-gradient-to-b from-white/8 to-transparent pointer-events-none" />
              </div>

              <div className="flex-1 min-w-0 space-y-7 sm:space-y-10">
                <header className="space-y-4">
                  <p className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.4em] text-amber/40">Film Özeti</p>
                  <h2 className="text-3xl sm:text-5xl lg:text-6xl font-serif font-bold tracking-tight leading-[1.05] break-words">{movie.title}</h2>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:gap-5 text-sm sm:text-lg font-serif italic text-ivory/35">
                    <span>{movie.release_date?.split('-')[0]}</span>
                    <span className="w-1 h-1 bg-white/20 rounded-full" />
                    <span>{movie.runtime || '90+'} Dakika</span>
                    <span className="w-1 h-1 bg-white/20 rounded-full" />
                    <span>{movie.genres?.join(', ') || 'Sinema'}</span>
                  </div>
                </header>

                <p className="text-base sm:text-xl font-serif leading-relaxed text-ivory/80 italic">
                  {movie.overview || 'Bu yapıt hakkında henüz bir özet bulunmuyor...'}
                </p>

                <div className="p-6 sm:p-10 rounded-[1.5rem] sm:rounded-[2.5rem] bg-black/40 border border-white/5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-amber/40 mb-4">Üstadın Notu</p>
                  <p className="text-lg sm:text-3xl font-serif italic leading-relaxed sm:leading-[1.25] text-ivory tracking-tight first-letter:text-4xl sm:first-letter:text-6xl first-letter:float-left first-letter:mr-3 first-letter:font-bold first-letter:text-amber">
                    {movie.ai_analysis || 'Üstad bu başyapıt için notlarını hazırlıyor...'}
                  </p>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-3 gap-6 border-t border-white/5 pt-7">
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-ivory/20">Üstat</p>
                    <p className="text-base sm:text-xl font-serif text-ivory/80">{movie.director || 'Gizli'}</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-ivory/20">Zamanın Ruhu</p>
                    <p className="text-base sm:text-xl font-serif text-ivory/80">{movie.genres?.slice(0, 2).join(', ')}</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-ivory/20">Küresel Yankı</p>
                    <p className="text-2xl sm:text-3xl font-serif font-bold text-amber">★ {reliableRating(movie) ?? '—'}</p>
                  </div>
                </div>

                {/* Nerede İzlenir */}
                {movie.watch_providers && (() => {
                  const wp = movie.watch_providers;
                  const all = [
                    ...(wp.flatrate || []).map(p => ({ ...p, tag: 'Abonelik' })),
                    ...(wp.rent || []).map(p => ({ ...p, tag: 'Kiralık' })),
                    ...(wp.buy || []).map(p => ({ ...p, tag: 'Satın Al' })),
                    ...(wp.free || []).map(p => ({ ...p, tag: 'Ücretsiz' })),
                    ...(wp.ads || []).map(p => ({ ...p, tag: 'Reklamlı' })),
                  ];
                  const seen = new Set();
                  const uniq = all.filter(p => !seen.has(p.provider_id) && seen.add(p.provider_id));
                  if (uniq.length === 0 && !wp.link) return null;
                  return (
                    <div className="border-t border-white/5 pt-7 space-y-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-ivory/20">Nerede İzlenir?</p>
                      <div className="flex flex-wrap gap-3">
                        {uniq.length === 0 ? (
                          <a href={wp.link} target="_blank" rel="noopener noreferrer"
                            className="px-5 py-3 bg-white/5 border border-white/10 rounded-full text-[10px] font-bold uppercase tracking-widest text-amber hover:bg-white/10 transition-all">
                            İzleme Seçenekleri
                          </a>
                        ) : uniq.slice(0, 8).map(p => (
                          <span key={p.provider_id} title={`${p.provider_name} (${p.tag})`}
                            className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-full">
                            {p.logo_url && <img src={p.logo_url} alt={p.provider_name} className="w-6 h-6 rounded object-contain" />}
                            <span className="text-[10px] font-bold uppercase tracking-wider text-ivory/60">{p.provider_name}</span>
                            <span className="text-[8px] uppercase tracking-widest text-ivory/20">{p.tag}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Benzer Filmler */}
                <SimilarFilmsStrip movies={similar} onSelect={(m) => setActiveId(m.id)} />

                <div className="flex flex-col sm:flex-row gap-3 sm:gap-5 pt-3">
                  <button onClick={handleSave}
                    className={`flex-1 py-4 sm:py-5 rounded-full text-[10px] font-bold uppercase tracking-[0.3em] transition-all flex items-center justify-center gap-3 ${
                      saved ? 'bg-amber/10 text-amber border border-amber/30' : 'bg-amber text-bg hover:scale-[1.02] shadow-[0_20px_50px_-10px_rgba(255,191,0,0.3)]'
                    }`}>
                    {saved ? <><Check size={16} /> Deftere Eklendi</> : <><Plus size={16} /> Deftere Kaydet</>}
                  </button>
                  <button onClick={handleWatched}
                    className={`px-6 sm:px-10 py-4 sm:py-5 rounded-full text-[10px] font-bold uppercase tracking-[0.3em] transition-all flex items-center justify-center gap-2 ${
                      watched ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'border border-white/10 text-ivory/60 hover:bg-white/5'
                    }`}>
                    {watched ? <><Check size={14} /> İzledim</> : <><Eye size={14} /> İzledim</>}
                  </button>
                  <button onClick={onClose}
                    className="px-8 sm:px-10 py-4 sm:py-5 rounded-full text-[10px] font-bold uppercase tracking-[0.3em] border border-white/10 hover:bg-white/5 transition-all">
                    Kapat
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-32 text-center">
              <p className="font-serif italic text-ivory/40 text-lg">Film bilgisi yüklenemedi.</p>
              <button onClick={onClose} className="mt-6 px-8 py-3 rounded-full border border-white/10 text-ivory/60 text-sm hover:bg-white/5">Kapat</button>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
