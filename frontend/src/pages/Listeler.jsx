import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, BookOpen, Sparkles, Star, Check, BookmarkPlus, Eye } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getApiUrl } from '../utils/apiConfig';
import { proxyImageUrl, addToWatchlist, removeFromWatchlist, toggleWatched } from '../services/api';
import { MOODS } from '../context/MoodContext';
import FilmDetailModal from '../components/FilmDetailModal';

// Liste mood slug'ını sistemdeki gerçek mood adına çevir
const moodName = (slug) => MOODS[slug]?.title || slug;

const MOOD_COLORS = {
  zihin:       { bg: 'from-violet-950/60 to-black', accent: '#7c3aed', badge: 'bg-violet-900/50 text-violet-300' },
  gece:        { bg: 'from-slate-950/60 to-black',  accent: '#64748b', badge: 'bg-slate-900/50 text-slate-300' },
  'deep-chills': { bg: 'from-blue-950/60 to-black', accent: '#1e40af', badge: 'bg-blue-950/50 text-blue-300' },
  kalp:        { bg: 'from-pink-950/60 to-black',   accent: '#be185d', badge: 'bg-pink-950/50 text-pink-300' },
  Retro:       { bg: 'from-cyan-950/60 to-black',   accent: '#0891b2', badge: 'bg-cyan-950/50 text-cyan-300' },
  sessiz:      { bg: 'from-stone-950/60 to-black',  accent: '#78716c', badge: 'bg-stone-900/50 text-stone-300' },
  askbahcesi:  { bg: 'from-rose-950/60 to-black',   accent: '#e11d48', badge: 'bg-rose-950/50 text-rose-300' },
  zamanyolcusu:{ bg: 'from-amber-950/60 to-black',  accent: '#b45309', badge: 'bg-amber-950/50 text-amber-300' },
  yolculuk:    { bg: 'from-emerald-950/60 to-black', accent: '#059669', badge: 'bg-emerald-950/50 text-emerald-300' },
};
const DEFAULT_COLOR = { bg: 'from-zinc-950/60 to-black', accent: '#71717a', badge: 'bg-zinc-900/50 text-zinc-300' };

// ─── Liste Listesi Sayfası ───────────────────────────────────
function ListelerAnasayfa() {
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetch(getApiUrl('/api/lists'))
      .then(r => r.json())
      .then(data => { setLists(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen pb-32 pt-8 px-4 sm:px-8 max-w-5xl mx-auto">
      {/* Başlık */}
      <div className="mb-12 sm:mb-16">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-ivory/40 hover:text-ivory/70 transition-colors mb-8">
          <ChevronLeft size={18} />
          <span className="text-xs font-bold uppercase tracking-widest">Geri</span>
        </button>
        <div className="flex items-center gap-4 mb-4">
          <BookOpen size={28} className="text-amber" />
          <h1 className="text-3xl sm:text-5xl font-serif font-bold tracking-tight">Üstadın Listeleri</h1>
        </div>
        <p className="text-ivory/40 font-serif italic text-lg">Küratöryel koleksiyonlar — her biri bir sinema yolculuğu.</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-48 rounded-3xl bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {lists.map((lst, i) => {
            const colors = MOOD_COLORS[lst.mood] || DEFAULT_COLOR;
            return (
              <motion.button
                key={lst.slug}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07, duration: 0.5 }}
                onClick={() => navigate(`/listeler/${lst.slug}`)}
                className={`relative text-left p-7 sm:p-9 rounded-[1.75rem] bg-gradient-to-br ${colors.bg} border border-white/10 hover:border-amber/30 transition-all duration-500 hover:-translate-y-1.5 hover:shadow-[0_24px_60px_-15px_rgba(0,0,0,0.6)] group overflow-hidden`}
              >
                <div className="absolute -top-px left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="h-1 w-10 rounded-full mb-6 transition-all duration-500 group-hover:w-16" style={{ background: colors.accent }} />
                <h2 className="text-2xl sm:text-[28px] font-serif font-bold mb-3 leading-tight text-ivory group-hover:text-amber transition-colors duration-300">{lst.title}</h2>
                <p className="text-ivory/70 text-[15px] leading-relaxed line-clamp-2 mb-6 font-serif">{lst.description}</p>
                <div className="flex items-center justify-between">
                  <span className={`inline-block text-[10px] font-bold uppercase tracking-[0.2em] px-3.5 py-1.5 rounded-full ${colors.badge}`}>
                    {moodName(lst.mood)}
                  </span>
                  <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-ivory/30 group-hover:text-amber transition-colors duration-300">
                    İncele <ChevronLeft size={13} className="rotate-180" />
                  </span>
                </div>
              </motion.button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Tek Liste Detay Sayfası ─────────────────────────────────
function ListeDetay() {
  const { slug } = useParams();
  const [liste, setListe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [quickSaved, setQuickSaved] = useState(new Set());
  const [quickWatched, setQuickWatched] = useState(new Set());
  const navigate = useNavigate();

  const handleQuickSave = async (e, m) => {
    e.stopPropagation();
    if (quickSaved.has(m.id)) {
      setQuickSaved(prev => { const n = new Set(prev); n.delete(m.id); return n; });
      setQuickWatched(prev => { const n = new Set(prev); n.delete(m.id); return n; });
      try { await removeFromWatchlist(m.id); } catch {}
      return;
    }
    setQuickSaved(prev => new Set([...prev, m.id]));
    try { await addToWatchlist(m); } catch {}
  };

  const handleQuickWatched = async (e, m) => {
    e.stopPropagation();
    const now = !quickWatched.has(m.id);
    setQuickWatched(prev => { const n = new Set(prev); now ? n.add(m.id) : n.delete(m.id); return n; });
    if (!quickSaved.has(m.id)) {
      setQuickSaved(prev => new Set([...prev, m.id]));
      try { await addToWatchlist(m); } catch {}
    }
    try { await toggleWatched(m.id); } catch {}
  };

  useEffect(() => {
    fetch(getApiUrl(`/api/lists/${slug}`))
      .then(r => r.json())
      .then(data => { setListe(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Sparkles size={32} className="text-amber animate-spin" />
      </div>
    );
  }

  if (!liste) return <div className="min-h-screen flex items-center justify-center text-ivory/40">Liste bulunamadı.</div>;

  const colors = MOOD_COLORS[liste.mood] || DEFAULT_COLOR;

  return (
    <div className="min-h-screen pb-32">
      {/* Hero */}
      <div className={`px-4 sm:px-8 pt-8 pb-16 bg-gradient-to-b ${colors.bg}`}>
        <div className="max-w-4xl mx-auto">
          <button onClick={() => navigate('/listeler')} className="flex items-center gap-2 text-ivory/40 hover:text-ivory/70 transition-colors mb-10">
            <ChevronLeft size={18} />
            <span className="text-xs font-bold uppercase tracking-widest">Tüm Listeler</span>
          </button>
          <div className="w-14 h-px bg-amber/50 mb-7" />
          <h1 className="text-4xl sm:text-6xl font-serif font-bold tracking-tight mb-5 text-ivory">{liste.title}</h1>
          <p className="text-ivory/75 text-lg sm:text-2xl font-serif italic mb-12 max-w-2xl leading-relaxed">{liste.description}</p>

          {/* Üstad Girişi */}
          <div className="p-7 sm:p-12 rounded-[2rem] border border-amber/15 bg-black/40 backdrop-blur-sm">
            <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-amber mb-5">Üstadın Girişi</p>
            <p className="font-serif text-[#fdf3d8] text-lg sm:text-2xl leading-[1.7] first-letter:text-5xl sm:first-letter:text-6xl first-letter:float-left first-letter:mr-3 first-letter:mt-1 first-letter:font-bold first-letter:text-amber">
              {liste.ustad_intro}
            </p>
          </div>
        </div>
      </div>

      {/* Film Grid */}
      <div className="px-4 sm:px-8 max-w-4xl mx-auto mt-12">
        <p className="text-[10px] font-bold uppercase tracking-widest text-ivory/30 mb-8">
          {liste.movies?.length} film
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 sm:gap-6">
          {(liste.movies || []).map((movie, i) => (
            <motion.div
              key={movie.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="text-left group cursor-pointer"
              onClick={() => setSelectedMovie(movie.id)}
            >
              <div className="aspect-[2/3] rounded-xl overflow-hidden bg-white/5 mb-3 relative">
                {movie.poster_url ? (
                  <img
                    src={proxyImageUrl(movie.poster_url)}
                    alt={movie.title}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-white/5"><BookOpen size={28} className="text-ivory/20" /></div>
                )}
                {/* Sıra numarası */}
                <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-black/70 flex items-center justify-center z-10">
                  <span className="text-[9px] font-bold text-ivory/60">{i + 1}</span>
                </div>
                {/* Hızlı eylem butonları — mobilde her zaman, masaüstünde hover */}
                <div className="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-center gap-1.5 p-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all duration-300">
                  <button
                    onClick={(e) => handleQuickSave(e, movie)}
                    title="Deftere Ekle"
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[9px] font-bold uppercase tracking-wider backdrop-blur-md border transition-all active:scale-95 ${
                      quickSaved.has(movie.id)
                        ? 'bg-amber/90 border-amber/60 text-black'
                        : 'bg-black/70 border-white/20 text-white/80 hover:bg-amber/80 hover:text-black'
                    }`}
                  >
                    {quickSaved.has(movie.id) ? <><Check size={9} /> Eklendi</> : <><BookmarkPlus size={9} /> Deftere</>}
                  </button>
                  <button
                    onClick={(e) => handleQuickWatched(e, movie)}
                    title="İzledim"
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[9px] font-bold uppercase tracking-wider backdrop-blur-md border transition-all active:scale-95 ${
                      quickWatched.has(movie.id)
                        ? 'bg-emerald-500/90 border-emerald-400/60 text-white'
                        : 'bg-black/70 border-white/20 text-white/80 hover:bg-emerald-500/80 hover:text-white'
                    }`}
                  >
                    {quickWatched.has(movie.id) ? <><Check size={9} /> İzledim</> : <><Eye size={9} /> İzledim</>}
                  </button>
                </div>
              </div>
              <p className="text-xs sm:text-sm font-semibold line-clamp-2 group-hover:text-amber transition-colors duration-300 leading-snug">{movie.title}</p>
              {movie.vote_average && (
                <div className="flex items-center gap-1 mt-1">
                  <Star size={9} className="fill-amber text-amber" />
                  <span className="text-[10px] text-ivory/50">{movie.vote_average.toFixed(1)}</span>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </div>

      {selectedMovie && (
        <FilmDetailModal movieId={selectedMovie} onClose={() => setSelectedMovie(null)} />
      )}
    </div>
  );
}

// ─── Router Wrapper ──────────────────────────────────────────
export default function Listeler() {
  const { slug } = useParams();
  return slug ? <ListeDetay /> : <ListelerAnasayfa />;
}
