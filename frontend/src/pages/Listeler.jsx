import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, BookOpen, Sparkles, Star } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getApiUrl } from '../utils/apiConfig';
import { proxyImageUrl } from '../services/api';

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
                className={`text-left p-6 sm:p-8 rounded-3xl bg-gradient-to-br ${colors.bg} border border-white/8 hover:border-white/20 transition-all duration-500 hover:scale-[1.02] group`}
              >
                <div className="w-10 h-px bg-amber/40 mb-5" />
                <h2 className="text-xl sm:text-2xl font-serif font-bold mb-2 group-hover:text-amber transition-colors duration-300">{lst.title}</h2>
                <p className="text-ivory/50 text-sm leading-relaxed line-clamp-2 mb-4">{lst.description}</p>
                <span className={`inline-block text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full ${colors.badge}`}>
                  {lst.mood} modu
                </span>
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
  const navigate = useNavigate();

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
          <h1 className="text-4xl sm:text-6xl font-serif font-bold tracking-tight mb-4">{liste.title}</h1>
          <p className="text-ivory/60 text-lg sm:text-xl font-serif italic mb-10 max-w-2xl">{liste.description}</p>

          {/* Üstad Girişi */}
          <div className="p-6 sm:p-10 rounded-[2rem] border border-white/8 bg-black/30 backdrop-blur-sm">
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber/60 mb-4">Üstadın Girişi</p>
            <p className="font-serif italic text-ivory/80 text-lg sm:text-xl leading-relaxed first-letter:text-4xl first-letter:float-left first-letter:mr-3 first-letter:font-bold first-letter:text-amber">
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
            <motion.button
              key={movie.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => navigate(`/discover?film=${movie.id}`)}
              className="text-left group"
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
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-3">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-amber">İncele</span>
                </div>
                {/* Sıra numarası */}
                <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-black/70 flex items-center justify-center">
                  <span className="text-[9px] font-bold text-ivory/60">{i + 1}</span>
                </div>
              </div>
              <p className="text-xs sm:text-sm font-semibold line-clamp-2 group-hover:text-amber transition-colors duration-300 leading-snug">{movie.title}</p>
              {movie.vote_average && (
                <div className="flex items-center gap-1 mt-1">
                  <Star size={9} className="fill-amber text-amber" />
                  <span className="text-[10px] text-ivory/50">{movie.vote_average.toFixed(1)}</span>
                </div>
              )}
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Router Wrapper ──────────────────────────────────────────
export default function Listeler() {
  const { slug } = useParams();
  return slug ? <ListeDetay /> : <ListelerAnasayfa />;
}
