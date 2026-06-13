import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, BookOpen, Star, Check, BookmarkPlus, Eye, Film, Trophy } from 'lucide-react';
import { motion } from 'framer-motion';
import { getApiUrl } from '../utils/apiConfig';
import { proxyImageUrl, addToWatchlist, removeFromWatchlist, toggleWatched, getAwardsToday } from '../services/api';
import { MOODS, useMood } from '../context/MoodContext';
import FilmDetailModal from '../components/FilmDetailModal';
import useDocumentMeta from '../utils/useDocumentMeta';

// Liste mood slug'ını sistemdeki gerçek mood adına çevir
const moodName = (slug) => MOODS[slug]?.title || slug;

/**
 * Renk paleti notu:
 * - Gradient zeminler (from-*-950/70 to-black) Latte temasında index.css'teki
 *   [class*="to-black"] kuralıyla otomatik düz beje dönüşür.
 * - accent: inline renk — her iki temada da o mood'un imza rengi olarak kalır
 *   (ince bir çizgi olduğu için Latte'de de hoş durur).
 * - Metinlerde slate/zinc YERİNE text-ivory token'ı kullanılıyor; bu token
 *   index.css'te [data-theme="light"] altında koyu espressoya (#2a2017)
 *   dönüştüğü için Latte temasında da kusursuz okunur.
 */
const MOOD_COLORS = {
  zihin:         { bg: 'from-violet-950/70 to-black',  accent: '#8b5cf6' },
  gece:          { bg: 'from-slate-900/70 to-black',   accent: '#94a3b8' },
  'deep-chills': { bg: 'from-blue-950/70 to-black',    accent: '#3b82f6' },
  kalp:          { bg: 'from-pink-950/70 to-black',    accent: '#ec4899' },
  sipsak:        { bg: 'from-yellow-950/70 to-black',  accent: '#d4af37' },
  sessiz:        { bg: 'from-stone-900/70 to-black',   accent: '#a8a29e' },
  askbahcesi:    { bg: 'from-rose-950/70 to-black',    accent: '#f43f5e' },
  zamanyolcusu:  { bg: 'from-amber-950/70 to-black',   accent: '#f59e0b' },
  yolculuk:      { bg: 'from-emerald-950/70 to-black', accent: '#10b981' },
  karmakar:      { bg: 'from-purple-950/70 to-black',  accent: '#a855f7' },
};
const DEFAULT_COLOR = { bg: 'from-zinc-900/70 to-black', accent: '#a1a1aa' };

// ─── Liste Listesi Sayfası ───────────────────────────────────
function ListelerAnasayfa() {
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [award, setAward] = useState(null); // bugün/yakında verilen ödül
  const navigate = useNavigate();
  const { selectedMood } = useMood();
  const goBack = () => navigate(selectedMood ? '/discover' : '/');

  useEffect(() => {
    fetch(getApiUrl('/api/lists'))
      .then(r => r.json())
      .then(data => { setLists(data); setLoading(false); })
      .catch(() => setLoading(false));
    getAwardsToday().then(d => setAward((d.awards || [])[0] || null)).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen pb-32 pt-8 px-4 sm:px-8 max-w-5xl mx-auto">
      {/* Başlık */}
      <div className="mb-12 sm:mb-16">
        <button
          onClick={goBack}
          className="flex items-center gap-2 text-ivory/55 hover:text-ivory transition-colors mb-8 group"
        >
          <ChevronLeft size={18} className="group-hover:-translate-x-0.5 transition-transform" />
          <span className="text-[11px] font-bold uppercase tracking-widest font-sans">
            {selectedMood ? 'Keşfete Dön' : 'Ana Sayfa'}
          </span>
        </button>

        <div className="flex items-center gap-4 mb-4">
          <div className="w-11 h-11 rounded-2xl bg-amber/15 flex items-center justify-center flex-shrink-0">
            <BookOpen size={21} className="text-amber" />
          </div>
          <h1 className="text-3xl sm:text-5xl font-serif font-bold tracking-tight text-ivory">
            Üstadın Listeleri
          </h1>
        </div>
        <p className="text-ivory/60 font-serif italic text-base sm:text-lg leading-relaxed">
          Sinemanın en prestijli ödüllerinin güncel kazananları — her biri bir zafer.
        </p>
      </div>

      {/* Ödül günü banner'ı */}
      {award && (
        <motion.button
          initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          onClick={() => navigate(`/listeler/${award.slug}`)}
          className="w-full flex items-center gap-3 mb-8 p-4 sm:p-5 rounded-2xl bg-amber/[0.08] border border-amber/30 hover:border-amber/50 hover:bg-amber/[0.12] transition-all text-left group"
        >
          <span className="w-10 h-10 rounded-full bg-amber/15 flex items-center justify-center shrink-0">
            <Trophy size={18} className="text-amber" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-serif font-bold text-ivory leading-snug">
              {award.status === 'today'
                ? `🏆 Bugün ${award.title} açıklandı!`
                : `🏆 ${award.title} yakında (${award.days_until} gün)`}
            </p>
            <p className="text-[12px] text-ivory/55 mt-0.5">
              {award.status === 'today' ? 'Kazananlar uygulamada hazır, keşfet' : 'Kazananları şimdiden incele'}
            </p>
          </div>
          <ChevronLeft size={16} className="rotate-180 text-amber/60 group-hover:text-amber transition-colors shrink-0" />
        </motion.button>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="animate-pulse p-7 sm:p-9 rounded-[1.75rem] bg-white/[0.03] border border-white/5">
              <div className="h-1 w-10 rounded-full bg-white/8 mb-6" />
              <div className="h-6 bg-white/8 rounded w-3/5 mb-3" />
              <div className="space-y-2 mb-6">
                <div className="h-3.5 bg-white/6 rounded w-full" />
                <div className="h-3.5 bg-white/6 rounded w-2/3" />
              </div>
              <div className="flex items-center justify-between">
                <div className="h-6 bg-white/8 rounded-full w-24" />
                <div className="h-3 bg-white/6 rounded w-16" />
              </div>
            </div>
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
                transition={{ delay: i * 0.06, duration: 0.45 }}
                onClick={() => navigate(`/listeler/${lst.slug}`)}
                className={`relative text-left p-7 sm:p-9 rounded-[1.75rem] bg-gradient-to-br ${colors.bg} border border-white/10 hover:border-amber/45 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_20px_50px_-12px_rgba(0,0,0,0.5)] group overflow-hidden`}
              >
                {/* Üst kenarda amber çizgi efekti */}
                <div className="absolute -top-px left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber/55 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-400" />

                {/* Renk aksanı — mood imza rengi (her iki temada da kalır) */}
                <div
                  className="h-1 w-10 rounded-full mb-6 transition-all duration-400 group-hover:w-16"
                  style={{ background: colors.accent }}
                />

                {/* Başlık — emojisiz, net */}
                <h2 className="text-xl sm:text-2xl font-serif font-bold leading-snug text-ivory group-hover:text-amber transition-colors duration-300 mb-3">
                  {lst.title}
                </h2>

                <p className="text-ivory/65 text-sm leading-relaxed line-clamp-2 mb-6 font-sans">
                  {lst.description}
                </p>

                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-[0.16em] px-3 py-1.5 rounded-full font-sans bg-amber/12 text-amber border border-amber/25">
                    {lst.badge || moodName(lst.mood)}
                  </span>
                  <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-ivory/45 group-hover:text-amber transition-colors duration-300 font-sans">
                    Keşfet <ChevronLeft size={13} className="rotate-180" />
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
        <div className="sinemood-spinner" />
      </div>
    );
  }

  if (!liste) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-ivory/55 font-serif italic text-lg">Liste bulunamadı.</p>
      </div>
    );
  }

  const colors = MOOD_COLORS[liste.mood] || DEFAULT_COLOR;

  // Sıfır puan + başlıksız filmleri frontend'de de filtrele
  const validMovies = (liste.movies || []).filter(
    m =>
      (m.title || '').trim() &&
      m.title !== '-' &&
      (m.vote_average == null || m.vote_average >= 0.5)
  );

  return (
    <div className="min-h-screen pb-32">

      {/* ── Hero ── */}
      <div className={`px-4 sm:px-8 pt-8 pb-16 bg-gradient-to-b ${colors.bg}`}>
        <div className="max-w-4xl mx-auto">

          {/* Geri butonu */}
          <button
            onClick={() => navigate('/listeler')}
            className="flex items-center gap-2 text-ivory/55 hover:text-ivory transition-colors mb-10 group"
          >
            <ChevronLeft size={18} className="group-hover:-translate-x-0.5 transition-transform" />
            <span className="text-[11px] font-bold uppercase tracking-widest font-sans">Tüm Listeler</span>
          </button>

          {/* Renk aksanı çizgisi */}
          <div className="h-px w-16 mb-7" style={{ background: colors.accent }} />

          {/* Başlık — emojisiz */}
          <h1 className="text-3xl sm:text-5xl font-serif font-bold tracking-tight text-ivory leading-tight mb-4">
            {liste.title}
          </h1>

          <p className="text-ivory/70 text-base sm:text-lg font-sans leading-relaxed mb-12 max-w-2xl">
            {liste.description}
          </p>

          {/* Üstadın Girişi — edebi, serif, yüksek kontrast */}
          <div className="p-7 sm:p-10 rounded-[2rem] border border-amber/25 bg-black/30 backdrop-blur-sm">
            <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-amber mb-5 font-sans">
              Üstadın Girişi
            </p>
            <p className="font-serif text-ivory/90 text-base sm:text-xl leading-[1.8]
              first-letter:text-5xl sm:first-letter:text-6xl first-letter:float-left
              first-letter:mr-3 first-letter:mt-1.5 first-letter:font-bold first-letter:text-amber">
              {liste.ustad_intro}
            </p>
          </div>
        </div>
      </div>

      {/* ── Film Grid ── */}
      <div className="px-4 sm:px-8 max-w-4xl mx-auto mt-12">
        <p className="text-[11px] font-bold uppercase tracking-widest text-ivory/50 mb-8 font-sans">
          {validMovies.length} film
        </p>

        {validMovies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <Film size={36} className="text-ivory/30" />
            <p className="text-ivory/50 font-serif italic text-lg">Filmler yükleniyor...</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-5 sm:gap-7">
            {validMovies.map((movie, i) => (
              <motion.div
                key={movie.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="group cursor-pointer"
                onClick={() => setSelectedMovie(movie)}
              >
                {/* Poster */}
                <div className="aspect-[2/3] rounded-xl overflow-hidden bg-white/5 mb-3 relative shadow-lg">
                  {movie.poster_url ? (
                    <img
                      src={proxyImageUrl(movie.poster_url)}
                      alt={movie.title}
                      loading="lazy"
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    /* Poster yoksa zarif placeholder */
                    <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-zinc-900 to-zinc-800 p-3">
                      <Film size={22} className="text-ivory/35" />
                      <span className="text-[10px] text-ivory/55 font-sans text-center leading-tight line-clamp-3">
                        {movie.title}
                      </span>
                    </div>
                  )}

                  {/* Sıra numarası */}
                  <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-black/75 flex items-center justify-center z-10 backdrop-blur-sm border border-white/15">
                    <span className="text-[9px] font-bold text-white font-sans">{i + 1}</span>
                  </div>

                  {/* Desktop: hover overlay butonları — MovieCard ile aynı */}
                  <div className="hidden sm:flex absolute bottom-0 left-0 right-0 z-10 items-center gap-1.5 p-2 opacity-0 group-hover:opacity-100 transition-all duration-300">
                    <button
                      onClick={(e) => handleQuickSave(e, movie)}
                      title="Deftere Ekle"
                      className={`flex-1 flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-full text-[9px] font-bold uppercase tracking-wider backdrop-blur-md border transition-all active:scale-95 ${
                        quickSaved.has(movie.id)
                          ? 'bg-amber/90 border-amber/60 text-black'
                          : 'bg-black/70 border-white/20 text-white/80 hover:bg-amber/80 hover:text-black hover:border-amber/50'
                      }`}
                    >
                      {quickSaved.has(movie.id)
                        ? <><Check size={9} /> Eklendi</>
                        : <><BookmarkPlus size={9} /> Deftere</>
                      }
                    </button>
                    <button
                      onClick={(e) => handleQuickWatched(e, movie)}
                      title="İzledim"
                      className={`flex-1 flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-full text-[9px] font-bold uppercase tracking-wider backdrop-blur-md border transition-all active:scale-95 ${
                        quickWatched.has(movie.id)
                          ? 'bg-emerald-500/90 border-emerald-400/60 text-white'
                          : 'bg-black/70 border-white/20 text-white/80 hover:bg-emerald-500/80 hover:text-white hover:border-emerald-400/50'
                      }`}
                    >
                      {quickWatched.has(movie.id)
                        ? <><Check size={9} /> İzledim</>
                        : <><Eye size={9} /> İzledim</>
                      }
                    </button>
                  </div>
                </div>

                {/* Mobil: ikon ibareler — yazı yok */}
                <div className="sm:hidden flex items-center gap-2 mt-2">
                  <button
                    onClick={(e) => handleQuickSave(e, movie)}
                    className={`w-9 h-9 flex items-center justify-center rounded-full border transition-colors duration-200 active:scale-90 ${
                      quickSaved.has(movie.id)
                        ? 'bg-amber/90 border-amber/60 text-black'
                        : 'bg-black/70 border-white/20 text-white/70 hover:bg-amber/80 hover:text-black hover:border-amber/50'
                    }`}
                    title={quickSaved.has(movie.id) ? 'Eklendi' : 'Deftere Ekle'}
                  >
                    {quickSaved.has(movie.id) ? <Check size={14} /> : <BookmarkPlus size={14} />}
                  </button>
                  <button
                    onClick={(e) => handleQuickWatched(e, movie)}
                    className={`w-9 h-9 flex items-center justify-center rounded-full border transition-colors duration-200 active:scale-90 ${
                      quickWatched.has(movie.id)
                        ? 'bg-emerald-500/90 border-emerald-400/60 text-white'
                        : 'bg-black/70 border-white/20 text-white/70 hover:bg-emerald-500/80 hover:text-white hover:border-emerald-400/50'
                    }`}
                    title={quickWatched.has(movie.id) ? 'İzledim' : 'İzlemedim'}
                  >
                    {quickWatched.has(movie.id) ? <Check size={14} /> : <Eye size={14} />}
                  </button>
                </div>

                {/* Ödül etiketi */}
                {movie.award && (
                  <span className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-full bg-amber/12 border border-amber/25 text-amber text-[9px] font-bold uppercase tracking-wide leading-none">
                    <Trophy size={9} /> {movie.award}
                  </span>
                )}

                {/* Film adı — yüksek kontrast */}
                <p className="text-sm font-semibold font-sans line-clamp-2 group-hover:text-amber transition-colors duration-300 leading-snug text-ivory mt-1.5">
                  {movie.title}
                </p>

                {/* Puan + yıl satırı */}
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  {movie.vote_average != null && movie.vote_average > 0 && (
                    <div className="flex items-center gap-1">
                      <Star size={9} className="fill-amber text-amber flex-shrink-0" />
                      <span className="text-[10px] text-ivory/65 font-sans font-medium">
                        {movie.vote_average.toFixed(1)}
                      </span>
                    </div>
                  )}
                  {movie.release_date && (
                    <span className="text-[10px] text-ivory/45 font-sans">
                      {movie.release_date.slice(0, 4)}
                    </span>
                  )}
                </div>

                {/* Yönetmen — sadece varsa ve biliniyorsa */}
                {movie.director && movie.director !== 'Bilinmiyor' && (
                  <p className="text-[10px] text-ivory/45 font-sans mt-0.5 truncate" title={movie.director}>
                    {movie.director}
                  </p>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {selectedMovie && (
        <FilmDetailModal
          movieId={selectedMovie.id}
          initialMovie={selectedMovie}
          onClose={() => setSelectedMovie(null)}
        />
      )}
    </div>
  );
}

// ─── Router Wrapper ──────────────────────────────────────────
export default function Listeler() {
  const { slug } = useParams();
  useDocumentMeta({
    title: slug ? 'Ödüllü Filmler | Sinemood' : 'Ödüllü Filmler | Festival Kazananları | Sinemood',
    description: 'Oscar, Cannes, Altın Küre, BAFTA, Venedik, Berlin ve daha fazlasının en güncel kazananları. Hangi film hangi ödülü aldı, Sinemood’da keşfet.',
  });
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="min-h-screen"
    >
      {slug ? <ListeDetay /> : <ListelerAnasayfa />}
    </motion.div>
  );
}
