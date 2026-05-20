import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMood } from '../context/MoodContext';
import { ChevronLeft, Sparkles, Send, RefreshCw, Star, Brain, Shuffle, Eye, BookmarkPlus, Check, ThumbsDown, Sun, Moon, Laugh, Clock, TrendingUp, TrendingDown, AlertCircle, Users, Cloud } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { postConfusedRecommendation, streamConfusedRecommendation, postFastRecommendation, quickMoodMix, proxyImageUrl, addToWatchlist, toggleWatched } from '../services/api';
import OptimizedImage from '../components/OptimizedImage';
import FilmDetailModal from '../components/FilmDetailModal';
import { playMoodAudio } from '../utils/moodAudioManager';

const QUICK_MOODS = [
  {
    id: "relaxing_cinema",
    label: "Günün yorgunluğunu silecek yumuşacık filmler",
    mood_mix: [
      { mood_id: "battaniye", percentage: 50 },
      { mood_id: "kalp",      percentage: 30 },
      { mood_id: "sessiz",    percentage: 20 },
    ],
  },
  {
    id: "high_joy",
    label: "Modu anında yükselten neşeli reçeteler",
    mood_mix: [
      { mood_id: "kahkaha",   percentage: 55 },
      { mood_id: "battaniye", percentage: 25 },
      { mood_id: "askbahcesi",percentage: 20 },
    ],
  },
  {
    id: "premium_dark",
    label: "Gözünü kırpmadan izleyeceğin karanlık işler",
    mood_mix: [
      { mood_id: "gece",        percentage: 45 },
      { mood_id: "deep-chills", percentage: 35 },
      { mood_id: "zihin",       percentage: 20 },
    ],
  },
  {
    id: "organic_romance",
    label: "İçini kıpır kıpır edecek ama klişesiz",
    mood_mix: [
      { mood_id: "kalp",        percentage: 40 },
      { mood_id: "sessiz",      percentage: 35 },
      { mood_id: "askbahcesi",  percentage: 25 },
    ],
  },
  {
    id: "deep_intellect",
    label: "Bittiğinde bile saatlerce kafanda yaşayacaklar",
    mood_mix: [
      { mood_id: "zihin",       percentage: 50 },
      { mood_id: "sessiz",      percentage: 25 },
      { mood_id: "karmakar",    percentage: 25 },
    ],
  },
  {
    id: "high_tension",
    label: "Koltukta dikilerek izletecek yüksek tansiyon",
    mood_mix: [
      { mood_id: "adrenalin",   percentage: 50 },
      { mood_id: "gece",        percentage: 30 },
      { mood_id: "deep-chills", percentage: 20 },
    ],
  },
  {
    id: "timeless_vintage",
    label: "Eski güzel günlerin o sıcacık sinema kokusu",
    mood_mix: [
      { mood_id: "zamanyolcusu", percentage: 45 },
      { mood_id: "battaniye",    percentage: 30 },
      { mood_id: "gozyasi",      percentage: 25 },
    ],
  },
];

const LOADING_PHRASES = [
  "Arşiv taranıyor...",
  "Ruh halin analiz ediliyor...",
  "Bu geceye özel seçiliyor...",
  "Binlerce film arasında...",
  "Neredeyse hazır...",
];

const FEEDBACK_BUTTONS = [
  { label: "Daha Farklı", text: "daha farklı", icon: RefreshCw },
  { label: "Daha Hafif", text: "daha hafif", icon: Sun },
  { label: "Daha Karanlık", text: "daha karanlık", icon: Moon },
  { label: "Daha Komik", text: "daha komik", icon: Laugh },
  { label: "Daha Yeni", text: "daha yeni", icon: Clock },
  { label: "Daha Popüler", text: "daha popüler", icon: TrendingUp },
  { label: "Az Bilinen", text: "daha az bilinen", icon: TrendingDown },
];

export default function KafanMiKarisik() {
  const navigate = useNavigate();
  const { selectMood } = useMood();
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

  // Early intent data — shown while full results load
  const [earlyIntent, setEarlyIntent] = useState(null);

  const analyze = async (inputText, feedbackMode = false) => {
    const txt = inputText || text;
    if (!txt.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setEarlyIntent(null);
    if (!feedbackMode) setLastQuery(txt);

    try {
      // ── Phase 0: Fast vector path (<300ms) ──────────────────────────────
      // Show results immediately without any LLM calls.
      let fastShown = false;
      try {
        const fast = await postFastRecommendation(txt, 6, 5.0, sessionExcludeIds);
        if (fast?.movies?.length) {
          setResult(fast);
          setLoading(false); // unblock UI immediately
          fastShown = true;
          if (fast.movies) {
            const newIds = fast.movies.map(m => m.id).filter(Boolean);
            setSessionExcludeIds(prev => [...new Set([...prev, ...newIds])]);
          }
        }
      } catch (fastErr) {
        // Fast path failed — continue to SSE path, still loading
      }

      // ── Phase 1+: SSE pipeline — upgrades with intent + reranked results ─
      // Runs in background even if fast results are already shown.
      try {
        const data = await streamConfusedRecommendation(txt, {
          limit: 6,
          minVote: 5.0,
          excludeIds: sessionExcludeIds,
          onIntent: (intentData) => {
            setEarlyIntent(intentData);
          },
          onError: (err) => {
            if (!fastShown) setError(err.message || 'Bir hata oluştu');
          },
        });

        // SSE returned a 'fast' phase with vector results — fast_search_engine
        // is also wired into the SSE stream now, so we get best-of-both.
        if (data?.movies?.length) {
          setResult(data);
          setEarlyIntent(null);
          if (data.movies) {
            const newIds = data.movies.map(m => m.id).filter(Boolean);
            setSessionExcludeIds(prev => [...new Set([...prev, ...newIds])]);
          }
        }
      } catch (sseErr) {
        if (!fastShown) setError(sseErr.message || 'Bir hata oluştu');
      }
    } catch (err) {
      setError(err.message || 'Bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickMood = async (moodMix) => {
    setLoading(true);
    setError(null);
    setResult(null);
    setEarlyIntent(null);
    try {
      const data = await quickMoodMix(moodMix, {
        limit: 6,
        minVote: 5.0,
        excludeIds: sessionExcludeIds,
      });
      setResult(data);
      if (data.movies) {
        const newIds = data.movies.map(m => m.id).filter(Boolean);
        setSessionExcludeIds(prev => [...new Set([...prev, ...newIds])]);
      }
    } catch (err) {
      setError(err.message || 'Bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  const handleFeedback = (feedbackText) => {
    analyze(feedbackText, true);
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
                  <Shuffle size={14} /> Sürpriz Film
                </button>
              </div>
              <p className="text-[10px] font-serif italic text-[#f5f2eb]/40">Hiç düşünme, perde açılsın.</p>
            </div>

            {/* Quick mood pills — rule-based, premium layout */}
            <div className="max-w-3xl mx-auto">
              <p className="quick-mood-title">Ya da hızlı öneri</p>
              <div className="quick-mood-grid">
                {QUICK_MOODS.map((qm) => (
                  <button
                    key={qm.id}
                    onClick={() => handleQuickMood(qm.mood_mix)}
                    className="quick-mood-chip"
                  >
                    {qm.label}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* Loading */}
        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-20 gap-8"
          >
            <div className="relative w-20 h-20">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
                className="absolute inset-0 rounded-full border-2 border-amber/20 border-t-[#ffbf00] shadow-[0_0_30px_rgba(255,191,0,0.15)]"
              />
              <motion.div
                animate={{ rotate: -360 }}
                transition={{ duration: 1.8, repeat: Infinity, ease: 'linear' }}
                className="absolute inset-3 rounded-full border border-amber/10 border-b-amber/50"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <Brain size={20} className="text-amber/40" />
              </div>
            </div>
            <AnimatePresence mode="wait">
              <motion.p
                key={earlyIntent ? 'intent' : phraseIdx}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.35 }}
                className="text-lg font-serif italic text-amber-200/70 font-medium text-center max-w-sm"
              >
                {earlyIntent?.ustad_line || LOADING_PHRASES[phraseIdx]}
              </motion.p>
            </AnimatePresence>
            {/* Early mood_mix badges while movies load */}
            {earlyIntent?.mood_mix?.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.15 }}
                className="flex flex-wrap justify-center gap-2 mt-3"
              >
                {earlyIntent.mood_mix.slice(0, 3).map((m, i) => (
                  <span key={m.mood_id || i}
                    className="px-3 py-1 rounded-full bg-amber/10 border border-amber/20 text-amber-200/80 text-[10px] font-sans font-medium uppercase tracking-wider">
                    {m.title} {m.percentage}%
                  </span>
                ))}
              </motion.div>
            )}
          </motion.div>
        )}

        {/* Error */}
        {error && !loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-16 gap-6 text-center"
          >
            <p className="text-rose-400 text-xl font-serif italic">{error}</p>
            <button
              onClick={() => { setError(null); setResult(null); }}
              className="px-8 py-4 border border-amber/40 text-[#ffbf00] rounded-full text-[10px] font-bold uppercase tracking-widest hover:bg-amber/5 transition-all"
            >
              Tekrar Dene
            </button>
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
              {/* Query Understanding — "Seni şöyle anladım" */}
              {result.query_understanding && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-start gap-3 p-5 rounded-2xl bg-amber-500/[0.06] border border-amber/15"
                >
                  <Sparkles size={16} className="text-amber/50 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-[0.4em] text-amber/40 mb-1">SENİ ŞÖYLE ANLADIM</p>
                    <p className="text-sm font-serif text-amber-100/80 leading-relaxed">{result.query_understanding}</p>
                  </div>
                </motion.div>
              )}

              {/* Typo correction banner */}
              {result.correction_detected && result.corrected_text && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-start gap-3 p-4 rounded-2xl bg-violet-900/20 border border-violet-500/30"
                >
                  <AlertCircle size={15} className="text-violet-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-[0.4em] text-violet-400/70 mb-1">YAZIM DÜZELTMESİ</p>
                    <p className="text-sm font-serif text-violet-200/80 leading-relaxed italic">{result.corrected_text}</p>
                  </div>
                </motion.div>
              )}

              {/* Context dimensions (atmosphere / companion) */}
              {result.context_dimensions && (result.context_dimensions.atmosphere || result.context_dimensions.companion) && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-wrap gap-2"
                >
                  {result.context_dimensions.atmosphere && (
                    <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-900/20 border border-blue-500/20 text-[10px] font-bold uppercase tracking-wider text-blue-300/70">
                      <Cloud size={10} /> {result.context_dimensions.atmosphere}
                    </span>
                  )}
                  {result.context_dimensions.companion && (
                    <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-900/20 border border-rose-500/20 text-[10px] font-bold uppercase tracking-wider text-rose-300/70">
                      <Users size={10} /> {result.context_dimensions.companion}
                    </span>
                  )}
                </motion.div>
              )}

              {/* Ustad quote */}
              {quote && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-8 md:p-12 rounded-[2.5rem] bg-gradient-to-br from-amber-500/[0.05] to-amber-900/[0.08] border border-white/10"
                >
                  {result.mode && (
                    <p className="text-[9px] font-bold uppercase tracking-[0.5em] text-amber/50 mb-4 text-center">
                      {result.mode === 'claude_reranked' ? 'Claude Analizi' : result.mode === 'smart_search' ? 'Akıllı Arama' : 'Kural Tabanlı'}
                    </p>
                  )}
                  <p className="text-2xl md:text-3xl font-serif italic font-medium leading-relaxed text-amber-100/85 text-center drop-shadow-[0_1px_2px_rgba(0,0,0,0.2)]">
                    &ldquo;{quote}&rdquo;
                  </p>
                </motion.div>
              )}

              {/* Mood mix chips — only show for mood-based results */}
              {result.mood_mix && result.mood_mix.length > 0 && (
                <div className="space-y-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-amber/70">RUH HALİN</p>
                  <div className="flex flex-wrap gap-4">
                    {result.mood_mix.map((m) => (
                      <button
                        key={m.mood_id}
                        onClick={() => goToMood(m.mood_id)}
                        className="group flex items-center gap-3 px-5 py-3 rounded-full bg-white/8 border border-white/15 hover:border-amber/40 transition-all"
                      >
                        <Brain size={16} className="text-amber/60" />
                        <span className="text-sm font-bold uppercase tracking-wider text-amber-100/70 group-hover:text-[#ffbf00] transition-colors">
                          {m.title}
                        </span>
                        <span className="text-xs font-bold text-amber/70">{m.percentage}%</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Movie cards */}
              {result.movies && result.movies.length > 0 && (
                <div className="space-y-6">
                  <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-amber/70">
                    {result.intent === 'exact_movie_search' ? 'ARADIĞIN FİLM VE BENZERLERİ'
                      : result.intent === 'similar_to_movie' ? 'BENZER FİLMLER'
                      : result.intent === 'actor_recommendation' || result.intent === 'director_recommendation' ? 'FİLMOGRAFİ'
                      : 'BUNLARI ÖNERİYORUM'}
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
                                {movie.vote_average?.toFixed(1)}
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

                          {/* Quick action buttons */}
                          <div className="absolute top-3 left-3 z-10 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-300">
                            <button
                              onClick={(e) => handleQuickSave(e, movie)}
                              title="Deftere Ekle"
                              className={`w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-md border transition-all ${
                                quickSavedIds.has(movie.id)
                                  ? 'bg-amber/90 border-amber/60 text-black'
                                  : 'bg-black/60 border-white/20 text-white/80 hover:bg-amber/80 hover:text-black'
                              }`}
                            >
                              {quickSavedIds.has(movie.id) ? <Check size={12} /> : <BookmarkPlus size={12} />}
                            </button>
                            <button
                              onClick={(e) => handleQuickWatched(e, movie)}
                              title="İzledim"
                              className={`w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-md border transition-all ${
                                quickWatchedIds.has(movie.id)
                                  ? 'bg-emerald-500/90 border-emerald-400/60 text-white'
                                  : 'bg-black/60 border-white/20 text-white/80 hover:bg-emerald-500/80 hover:text-white'
                              }`}
                            >
                              {quickWatchedIds.has(movie.id) ? <Check size={12} /> : <Eye size={12} />}
                            </button>
                          </div>
                        </div>

                        {/* Reason — "Neden sana uygun?" */}
                        {movie.reason && (
                          <div className="p-5 space-y-1.5">
                            <p className="text-[9px] font-bold uppercase tracking-[0.35em] text-amber/50">
                              {movie.is_primary_match ? 'EŞLEŞME' : 'GURME NOTU'}
                            </p>
                            <p className="text-xs font-serif font-semibold text-amber-100/70 leading-relaxed">
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
                <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-amber/50">BEĞENMEDİN Mİ? AYARLA</p>
                <div className="flex flex-wrap gap-2">
                  {FEEDBACK_BUTTONS.map(({ label, text: fbText, icon: Icon }) => (
                    <button
                      key={label}
                      onClick={() => handleFeedback(fbText)}
                      className="flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 hover:border-amber/30 transition-all text-[11px] font-bold uppercase tracking-wider text-[#f5f2eb]/50 hover:text-amber-100"
                    >
                      <Icon size={12} />
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
