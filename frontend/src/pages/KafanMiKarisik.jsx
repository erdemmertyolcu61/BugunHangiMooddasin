import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useMood } from '../context/MoodContext';
import { ChevronLeft, Sparkles, Send, RefreshCw, Star, Brain, Eye, BookmarkPlus, Check, Clock, TrendingUp, Gem } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { postConfusedRecommendation, proxyImageUrl, addToWatchlist, toggleWatched } from '../services/api';
import OptimizedImage from '../components/OptimizedImage';
import FilmDetailModal from '../components/FilmDetailModal';
import { playMoodAudio } from '../utils/moodAudioManager';
import LottieAnimation from '../components/LottieAnimation';
import { track, EVENTS } from '../utils/analytics';
import useDocumentMeta from '../utils/useDocumentMeta';

const QUICK_MOODS = [
  {
    id: "relaxing_cinema",
    label: "Günün yorgunluğunu silecek yumuşacık filmler",
    slug: "battaniye",
  },
  {
    id: "high_joy",
    label: "Modu anında yükselten neşeli reçeteler",
    slug: "kahkaha",
  },
  {
    id: "premium_dark",
    label: "Gözünü kırpmadan izleyeceğin karanlık işler",
    slug: "gece",
  },
  {
    id: "organic_romance",
    label: "İçini kıpır kıpır edecek ama klişesiz",
    slug: "askbahcesi",
  },
  {
    id: "deep_intellect",
    label: "Bittiğinde bile saatlerce kafanda yaşayacaklar",
    slug: "zihin",
  },
  {
    id: "high_tension",
    label: "Koltukta dikilerek izletecek yüksek tansiyon",
    slug: "adrenalin",
  },
  {
    id: "timeless_vintage",
    label: "Eski güzel günlerin o sıcancık sinema kokusu",
    slug: "zamanyolcusu",
  },
  {
    id: "sipsak_ustad",
    label: "Üstad'ın Şipşak Önerileri",
    slug: "sipsak",
  },
];

const LOADING_PHRASES = [
  "Arşiv taranıyor...",
  "Ruh halin analiz ediliyor...",
  "Bu geceye özel seçiliyor...",
  "Binlerce film arasında...",
  "Neredeyse hazır...",
];

// 4 deterministik geri-bildirim — backend `refine` modlarını tetikler.
const FEEDBACK_BUTTONS = [
  { label: "Daha Popüler", refine: "more_popular", icon: TrendingUp },
  { label: "Daha Yeni", refine: "newer", icon: Clock },
  { label: "Daha Farklı", refine: "different", icon: RefreshCw },
  { label: "Az Bilinen", refine: "less_known", icon: Gem },
];

export default function KafanMiKarisik() {
  const navigate = useNavigate();
  const location = useLocation();
  const { selectMood } = useMood();

  useDocumentMeta({
    title: 'Kafan Mı Karışık? — İçini Dök, Film Bul | Sinemood',
    description: 'Ne hissettiğini yaz, Üstad ruh haline göre tam sana göre filmi bulsun. Kararsız kaldığın geceler için.',
  });

  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const inputRef = useRef(null);
  const phraseTimer = useRef(null);

  // Session tracking — exclude already recommended movies
  const [sessionExcludeIds, setSessionExcludeIds] = useState([]);
  const [lastQuery, setLastQuery] = useState('');

  // Quick-action states for card buttons
  const [quickSavedIds, setQuickSavedIds] = useState(new Set());
  const [quickWatchedIds, setQuickWatchedIds] = useState(new Set());

  // Film detail modal — opens in-place instead of navigating away
  const [detailMovieId, setDetailMovieId] = useState(null);
  const [detailInitialMovie, setDetailInitialMovie] = useState(null);

  useEffect(() => {
    if (loading) {
      setPhraseIdx(0);
      phraseTimer.current = setInterval(() => {
        setPhraseIdx(p => (p + 1) % LOADING_PHRASES.length);
      }, 1200);
    } else {
      clearInterval(phraseTimer.current);
    }
    return () => clearInterval(phraseTimer.current);
  }, [loading]);

  const analyze = async (inputText, feedbackMode = false, refine = '') => {
    // refine modunda metin = son sorgu bağlamı; aksi halde girilen metin
    const txt = (refine ? lastQuery : (inputText || text)).trim().replace(/\s+/g, ' ');
    if (!txt || txt.length < 3) {
      setError('En az 3 karakter yazmalısın evlat.');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    if (!feedbackMode) setLastQuery(txt);
    if (!feedbackMode) track(EVENTS.CONFUSED_SUBMIT, { len: txt.length });

    try {
      const data = await postConfusedRecommendation(txt, 6, 5.0, sessionExcludeIds, '', refine);

      if (data?.movies?.length) {
        setResult(data);
        const newIds = data.movies.map(m => m.id || m.tmdb_id).filter(Boolean);
        setSessionExcludeIds(prev => [...new Set([...prev, ...newIds])]);
      } else {
        setError(data?.ustad_line || 'Aradığın kriterlere uygun film bulamadım. Biraz daha detay verir misin?');
      }
    } catch (err) {
      setError(err.message || 'Bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickMood = async (quickMood) => {
    setLoading(true);
    setError(null);
    setResult(null);
    setLastQuery(quickMood.label);
    try {
      const data = await postConfusedRecommendation(quickMood.label, 6, 5.0, sessionExcludeIds, quickMood.slug);
      
      // Validate response
      if (!data) {
        throw new Error('Sunucu yanıt vermedi');
      }
      
      if (!data.movies || !Array.isArray(data.movies)) {
        throw new Error('Film listesi alınamadı');
      }
      
      if (data.movies.length === 0) {
        throw new Error('Bu ruh haline uygun film bulunamadı');
      }
      
      setResult(data);
      const newIds = data.movies.map(m => m.id || m.tmdb_id).filter(Boolean);
      setSessionExcludeIds(prev => [...new Set([...prev, ...newIds])]);
    } catch (err) {
      setError(err.message || 'Bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (location.state?.quickMoodId) {
      const qm = QUICK_MOODS.find(q => q.id === location.state.quickMoodId);
      if (qm) {
        handleQuickMood(qm);
      }
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state?.quickMoodId, navigate]);

  const handleFeedback = (refineKey) => {
    // Deterministik refine — son sorgu bağlamını koruyup backend'de modifier uygular
    analyze(null, true, refineKey);
  };

  const goToMood = (moodId) => {
    try { playMoodAudio(moodId); } catch (e) {}
    selectMood(moodId);
    navigate('/discover');
  };

  const handleQuickSave = async (e, movie) => {
    e.stopPropagation();
    if (quickSavedIds.has(movie.id)) return;
    setQuickSavedIds(prev => new Set([...prev, movie.id]));
    try { await addToWatchlist(movie); } catch (err) { console.error('Quick save error:', err); }
  };

  const handleQuickWatched = async (e, movie) => {
    e.stopPropagation();
    const nowWatched = !quickWatchedIds.has(movie.id);
    setQuickWatchedIds(prev => {
      const next = new Set(prev);
      if (nowWatched) next.add(movie.id); else next.delete(movie.id);
      return next;
    });
    if (!quickSavedIds.has(movie.id)) {
      setQuickSavedIds(prev => new Set([...prev, movie.id]));
      try { await addToWatchlist(movie); } catch {}
    }
    try { await toggleWatched(movie.id); } catch (err) { console.error('Quick watched error:', err); }
  };

  // Prefer ustad_line, fall back to message
  const quote = result?.ustad_line || result?.message;

  return (
    <div className="min-h-screen bg-[#120d0b] text-[#f5f2eb] font-sans relative overflow-hidden">
      <div
        className="fixed inset-0 pointer-events-none z-[999] opacity-[0.03] mix-blend-overlay"
        style={{ backgroundImage: "url('https://www.transparenttextures.com/patterns/natural-paper.png')" }}
      />

      <header className="sticky top-0 z-50 bg-[#120d0b]/98 border-b border-white/5 pt-safe">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6 flex items-center justify-between">
          <div className="flex items-center gap-3 sm:gap-6">
            <button onClick={() => navigate('/')} className="p-3 -ml-1 hover:bg-white/5 rounded-full transition-all tap-target flex items-center justify-center">
              <ChevronLeft size={24} />
            </button>
            <div>
              <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.4em] sm:tracking-[0.6em] text-amber/60">AKILLI SİNEMA DOSTU</p>
              <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight">Kafan mı Karışık?</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-10 pb-nav">
        {/* Input area — show when no result and not loading */}
        {!result && !loading && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
            <p className="text-lg md:text-xl font-serif font-medium text-amber-100/90 leading-relaxed text-center max-w-2xl mx-auto drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
              Film adı, yönetmen, oyuncu veya ruh halini yaz — sana en uygun filmleri bulalım.
            </p>

            <div className="relative max-w-2xl mx-auto">
              <textarea
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={'Örn: "Interstellar gibi", "Tom Hanks filmi", "Kafam dağılsın hafif bir şey"'}
                className="w-full h-32 bg-white/8 border border-white/15 rounded-[2rem] p-8 text-lg font-serif font-semibold text-[#f5f2eb]/90 placeholder:text-[#f5f2eb]/50 focus:outline-none focus:border-amber/50 transition-all resize-none no-scrollbar"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); analyze(); }
                }}
              />
              <button
                onClick={() => analyze()}
                disabled={!text.trim()}
                className="absolute bottom-6 right-6 w-12 h-12 rounded-full bg-[#ffbf00] hover:bg-amber-400 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all shadow-[0_0_20px_rgba(255,191,0,0.3)]"
              >
                <Send size={18} className="text-[#120d0b]" />
              </button>
            </div>

            {/* Action buttons */}
            <div className="flex flex-col items-center gap-3">
              <div className="flex items-center justify-center gap-4 flex-wrap">
                <button
                  onClick={() => analyze()}
                  disabled={!text.trim()}
                  className="px-8 py-4 bg-[#ffbf00] hover:bg-amber-400 disabled:opacity-30 text-[#120d0b] rounded-full text-[10px] font-bold uppercase tracking-[0.2em] transition-all shadow-[0_0_20px_rgba(255,191,0,0.2)] disabled:cursor-not-allowed"
                >
                  Bana Film Seç
                </button>
                <button
                  onClick={() => navigate('/surprise')}
                  className="flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-purple-600 to-amber-500 hover:from-purple-500 hover:to-amber-400 text-white rounded-full text-[10px] font-bold uppercase tracking-[0.2em] transition-all shadow-[0_0_20px_rgba(168,85,247,0.3)]"
                >
                  Sürpriz Film
                </button>
              </div>
              <p className="text-[11px] font-serif italic text-[#f5f2eb]/70">Hiç düşünme, perde açılsın.</p>
            </div>

            {/* Quick mood pills — rule-based, premium layout */}
            <div className="max-w-3xl mx-auto">
              <p className="quick-mood-title">Ya da hızlı öneri</p>
              <div className="quick-mood-grid">
                {QUICK_MOODS.map((qm) => (
                  <button
                    key={qm.id}
                    onClick={() => handleQuickMood(qm)}
                    className="quick-mood-chip"
                  >
                    {qm.label}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* Loading — Üstad yazıyor: mistik altın nokta animasyonu */}
        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-20 gap-10"
          >
            {/* Film makarası Lottie animasyonu */}
            <LottieAnimation
              path="/lottie/film-reel.json"
              className="w-20 h-20"
              speed={0.8}
            />
            <AnimatePresence mode="wait">
              <motion.p
                key={phraseIdx}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.35 }}
                className="text-lg font-serif italic font-medium text-center max-w-sm leading-relaxed"
                style={{ color: '#d4af37', opacity: 0.75 }}
              >
                {LOADING_PHRASES[phraseIdx]}
              </motion.p>
            </AnimatePresence>
          </motion.div>
        )}

        {/* Üstad'ın Sinematik Fallback — teknik hata yerine şiirsel dil */}
        {error && !loading && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col items-center justify-center py-20 gap-7 text-center"
          >
            {/* Dekoratif öge */}
            <motion.div
              animate={{ opacity: [0.2, 0.6, 0.2] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              className="text-4xl font-serif select-none"
              style={{ color: '#d4af37' }}
            >
              ✦
            </motion.div>

            <div className="space-y-3 max-w-sm">
              <p className="text-xl font-serif italic leading-relaxed text-amber-100/80">
                &ldquo;Ruh halini süzerken küçük bir sinematik parazit oluştu...&rdquo;
              </p>
              <p className="text-sm font-serif text-amber-100/40 italic">
                Kahveni tazelerken tekrar denemek ister misin?
              </p>
            </div>

            <div className="flex flex-col items-center gap-3">
              <button
                onClick={() => { setError(null); setResult(null); }}
                className="px-8 py-4 border border-amber/40 text-[#ffbf00] rounded-full text-[10px] font-bold uppercase tracking-widest hover:bg-amber/5 transition-all shadow-[0_0_15px_rgba(255,191,0,0.1)]"
              >
                Tekrar Dene
              </button>
              <button
                onClick={() => navigate('/')}
                className="text-[10px] font-bold uppercase tracking-widest text-[#f5f2eb]/30 hover:text-[#f5f2eb]/60 transition-all"
              >
                Ana Sayfa&apos;ya Dön
              </button>
            </div>
          </motion.div>
        )}

        {/* Results */}
        <AnimatePresence>
          {result && !loading && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-10"
            >
              {/* Ustad quote */}
              {quote && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-6 sm:p-8 md:p-10 rounded-[2rem] bg-gradient-to-br from-amber-500/[0.05] to-amber-900/[0.08] border border-white/10"
                >
                  <p className="text-xl sm:text-2xl md:text-[1.65rem] font-serif italic font-medium leading-[1.6] text-amber-100/90 text-center">
                    &ldquo;{quote}&rdquo;
                  </p>
                </motion.div>
              )}

              {/* Mood mix chips — only show for mood-based results */}
              {result.mood_mix && result.mood_mix.length > 0 && (
                <div className="space-y-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-amber/60">Ruh Halin</p>
                  <div className="flex flex-wrap gap-3">
                    {result.mood_mix.map((m) => (
                      <button
                        key={m.mood_id}
                        onClick={() => goToMood(m.mood_id)}
                        className="group flex items-center gap-2.5 px-5 py-3 rounded-full bg-white/8 border border-white/15 hover:border-amber/40 transition-all"
                      >
                        <Brain size={15} className="text-amber/60" />
                        <span className="text-[13px] font-bold uppercase tracking-wide text-amber-100/75 group-hover:text-[#ffbf00] transition-colors">
                          {m.title}
                        </span>
                        <span className="text-[11px] font-bold text-amber/70">{m.percentage}%</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Movie cards */}
              {result.movies && result.movies.length > 0 && (
                <div className="space-y-6">
                  <p className="text-[12px] font-bold uppercase tracking-[0.25em] text-amber/70">
                    {result.intent === 'similar_to_movie' ? 'Benzer Filmler'
                      : result.intent === 'actor_recommendation' || result.intent === 'director_recommendation' ? 'Filmografi'
                      : 'Bunları Öneriyorum'}
                  </p>
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                    {result.movies.map((movie) => (
                      <motion.div
                        key={movie.id}
                        layout
                        className={`movie-grid-item rounded-[2rem] border overflow-hidden group transition-all cursor-pointer ${
                          movie.is_primary_match
                            ? 'bg-amber-500/[0.08] border-amber/30 ring-1 ring-amber/20'
                            : 'bg-white/8 border-white/10 hover:border-amber/35'
                        }`}
                        onClick={() => { setDetailInitialMovie(movie); setDetailMovieId(movie.id); }}
                      >
                        <div className="aspect-[2/3] relative overflow-hidden">
                          <OptimizedImage
                            src={movie.poster_url}
                            alt={movie.title}
                            fallbackTitle={movie.title}
                            aspect="poster"
                            size="md"
                            className="w-full h-full"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

                          {/* Primary match badge */}
                          {movie.is_primary_match && (
                            <div className="absolute top-3 right-3 px-3 py-1 rounded-full bg-amber/90 text-black text-[9px] font-bold uppercase tracking-wider">
                              Tam Eşleşme
                            </div>
                          )}

                          <div className="absolute bottom-4 left-4 right-4">
                            <h3 className="text-xl font-serif font-bold text-white drop-shadow-lg line-clamp-2">
                              {movie.title}
                            </h3>
                            <div className="flex items-center gap-3 mt-2 flex-wrap">
                              <span className="flex items-center gap-1 text-[11px] text-[#ffbf00] font-bold">
                                <Star size={11} className="fill-[#ffbf00]" />
                                {movie.vote_average > 0 ? movie.vote_average.toFixed(1) : '—'}
                              </span>
                              {movie.release_date && (
                                <span className="text-[10px] text-amber-100/50">
                                  {movie.release_date?.split('-')[0]}
                                </span>
                              )}
                              {movie.matched_moods && movie.matched_moods.slice(0, 2).map((mood) => (
                                <span
                                  key={mood}
                                  className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber/10 text-amber/80 border border-amber/20"
                                >
                                  {mood}
                                </span>
                              ))}
                            </div>
                          </div>

                          {/* Desktop: hover overlay butonları — MovieCard ile aynı */}
                          <div className="hidden sm:flex absolute bottom-0 left-0 right-0 z-10 items-center gap-1.5 p-2 opacity-0 group-hover:opacity-100 transition-all duration-300">
                            <button
                              onClick={(e) => handleQuickSave(e, movie)}
                              title="Deftere Ekle"
                              className={`flex-1 flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-full text-[9px] font-bold uppercase tracking-wider backdrop-blur-md border transition-all active:scale-95 ${
                                quickSavedIds.has(movie.id)
                                  ? 'bg-amber/90 border-amber/60 text-black'
                                  : 'bg-black/70 border-white/20 text-white/80 hover:bg-amber/80 hover:text-black hover:border-amber/50'
                              }`}
                            >
                              {quickSavedIds.has(movie.id)
                                ? <><Check size={9} /> Eklendi</>
                                : <><BookmarkPlus size={9} /> Deftere</>
                              }
                            </button>
                            <button
                              onClick={(e) => handleQuickWatched(e, movie)}
                              title="İzledim"
                              className={`flex-1 flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-full text-[9px] font-bold uppercase tracking-wider backdrop-blur-md border transition-all active:scale-95 ${
                                quickWatchedIds.has(movie.id)
                                  ? 'bg-emerald-500/90 border-emerald-400/60 text-white'
                                  : 'bg-black/70 border-white/20 text-white/80 hover:bg-emerald-500/80 hover:text-white hover:border-emerald-400/50'
                              }`}
                            >
                              {quickWatchedIds.has(movie.id)
                                ? <><Check size={9} /> İzledim</>
                                : <><Eye size={9} /> İzledim</>
                              }
                            </button>
                          </div>
                        </div>

                        {/* Mobil: ikon ibareler — yazı yok */}
                        <div className="sm:hidden flex items-center gap-2 px-4 pb-3">
                          <button
                            onClick={(e) => handleQuickSave(e, movie)}
                            className={`w-9 h-9 flex items-center justify-center rounded-full border transition-colors duration-200 active:scale-90 ${
                              quickSavedIds.has(movie.id)
                                ? 'bg-amber/90 border-amber/60 text-black'
                                : 'bg-black/70 border-white/20 text-white/70 hover:bg-amber/80 hover:text-black hover:border-amber/50'
                            }`}
                            title={quickSavedIds.has(movie.id) ? 'Eklendi' : 'Deftere Ekle'}
                          >
                            {quickSavedIds.has(movie.id) ? <Check size={14} /> : <BookmarkPlus size={14} />}
                          </button>
                          <button
                            onClick={(e) => handleQuickWatched(e, movie)}
                            className={`w-9 h-9 flex items-center justify-center rounded-full border transition-colors duration-200 active:scale-90 ${
                              quickWatchedIds.has(movie.id)
                                ? 'bg-emerald-500/90 border-emerald-400/60 text-white'
                                : 'bg-black/70 border-white/20 text-white/70 hover:bg-emerald-500/80 hover:text-white hover:border-emerald-400/50'
                            }`}
                            title={quickWatchedIds.has(movie.id) ? 'İzledim' : 'İzlemedim'}
                          >
                            {quickWatchedIds.has(movie.id) ? <Check size={14} /> : <Eye size={14} />}
                          </button>
                        </div>

                        {/* Üstad'ın Gerekçesi */}
                        {movie.reason && (
                          <div className="p-4 sm:p-5 space-y-1.5 sm:space-y-2 max-sm:hidden">
                            <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.25em] text-amber/55">
                              {movie.is_primary_match ? 'Eşleşme' : "Üstad'ın Gerekçesi"}
                            </p>
                            <p className="text-xs sm:text-sm font-serif text-amber-100/80 leading-relaxed line-clamp-3">
                              &ldquo;{movie.reason}&rdquo;
                            </p>
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              {/* Feedback buttons — adjust recommendations */}
              <div className="space-y-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-amber/55">Beğenmedin mi? Ayarla</p>
                <div className="flex flex-wrap gap-2.5">
                  {FEEDBACK_BUTTONS.map(({ label, refine: refineKey, icon: Icon }) => (
                    <button
                      key={label}
                      onClick={() => handleFeedback(refineKey)}
                      className="flex items-center gap-2 px-5 py-3 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 hover:border-amber/30 transition-all text-[12px] font-semibold tracking-wide text-[#f5f2eb]/55 hover:text-amber-100"
                    >
                      <Icon size={14} />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Bottom actions */}
              <div className="flex flex-wrap gap-4 justify-center pb-12">
                <button
                  onClick={() => { setResult(null); setText(''); }}
                  className="flex items-center gap-2 px-8 py-4 bg-[#ffbf00] hover:bg-amber-400 text-[#120d0b] rounded-full text-[10px] font-bold uppercase tracking-widest transition-all shadow-[0_0_20px_rgba(255,191,0,0.25)]"
                >
                  <RefreshCw size={14} /> Yeni Soru Sor
                </button>
                {result.mood_mix?.[0] && (
                  <button
                    onClick={() => goToMood(result.mood_mix[0].mood_id)}
                    className="flex items-center gap-2 px-8 py-4 border border-amber/35 text-amber/80 hover:text-[#ffbf00] rounded-full text-[10px] font-bold uppercase tracking-widest hover:bg-amber/5 transition-all"
                  >
                    <Sparkles size={14} /> Bu Mood'a Git
                  </button>
                )}
                <button
                  onClick={() => navigate('/')}
                  className="px-8 py-4 text-[10px] font-bold uppercase tracking-widest text-[#f5f2eb]/40 hover:text-[#f5f2eb]/70 transition-all"
                >
                  Ana Sayfa
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Film Detail Modal — opens in-place, no navigation away */}
      {detailMovieId && (
        <FilmDetailModal
          movieId={detailMovieId}
          initialMovie={detailInitialMovie}
          onClose={() => { setDetailMovieId(null); setDetailInitialMovie(null); }}
        />
      )}
    </div>
  );
}
