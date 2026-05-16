import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMood } from '../context/MoodContext';
import { ChevronLeft, Sparkles, Send, RefreshCw, Star, Brain, Shuffle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { postConfusedRecommendation, proxyImageUrl } from '../services/api';
import { playMoodAudio } from '../utils/moodAudioManager';

const SUGGESTIONS = [
  "Yorgunum ama boş film izlemek istemiyorum",
  "Biraz gülmek istiyorum",
  "Karanlık ama kaliteli bir şey olsun",
  "Romantik ama klişe olmasın",
  "Düşündüren bir film istiyorum",
];

const LOADING_PHRASES = [
  "Üstad arşivi tarıyor...",
  "Ruh halin analiz ediliyor...",
  "Bu geceye özel seçiliyor...",
  "Binlerce film arasında...",
  "Üstad karar veriyor...",
  "Neredeyse hazır...",
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

  const analyze = async (inputText) => {
    const txt = inputText || text;
    if (!txt.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await postConfusedRecommendation(txt, 6, 5.0);
      setResult(data);
    } catch (err) {
      setError(err.message || 'Bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  const handleChip = (suggestion) => {
    setText(suggestion);
    analyze(suggestion);
  };

  const goToMood = (moodId) => {
    try { playMoodAudio(moodId); } catch (e) {}
    selectMood(moodId);
    navigate('/discover');
  };

  // Prefer ustad_line, fall back to message
  const quote = result?.ustad_line || result?.message;

  return (
    <div className="min-h-screen bg-[#120d0b] text-[#f5f2eb] font-sans relative overflow-hidden">
      <div
        className="fixed inset-0 pointer-events-none z-[999] opacity-[0.03] mix-blend-overlay"
        style={{ backgroundImage: "url('https://www.transparenttextures.com/patterns/natural-paper.png')" }}
      />

      <header className="sticky top-0 z-50 bg-[#120d0b]/80 backdrop-blur-3xl border-b border-white/5 pt-safe">
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
              Bugünkü ruh halini birkaç kelimeyle anlat. Sana uygun atmosferi ve filmleri birlikte bulalım.
            </p>

            <div className="relative max-w-2xl mx-auto">
              <textarea
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Örn: Bugün yorgunum ama çok da boş bir film izlemek istemiyorum."
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
                {/* Bana Film Seç — solid amber */}
                <button
                  onClick={() => analyze()}
                  disabled={!text.trim()}
                  className="px-8 py-4 bg-[#ffbf00] hover:bg-amber-400 disabled:opacity-30 text-[#120d0b] rounded-full text-[10px] font-bold uppercase tracking-[0.2em] transition-all shadow-[0_0_20px_rgba(255,191,0,0.2)] disabled:cursor-not-allowed"
                >
                  Bana Film Seç
                </button>

                {/* Sürpriz Film — same gradient as Kafan mı Karışık butonu */}
                <button
                  onClick={() => navigate('/surprise')}
                  className="flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-purple-600 to-amber-500 hover:from-purple-500 hover:to-amber-400 text-white rounded-full text-[10px] font-bold uppercase tracking-[0.2em] transition-all shadow-[0_0_20px_rgba(168,85,247,0.3)]"
                >
                  <Shuffle size={14} /> Sürpriz Film
                </button>
              </div>
              <p className="text-[10px] font-serif italic text-[#f5f2eb]/40">Hiç düşünme, perde açılsın.</p>
            </div>

            {/* Quick chips */}
            <div className="max-w-2xl mx-auto">
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-amber/60 mb-4">YA DA HIZLI ÖNERİ</p>
              <div className="flex flex-wrap gap-2.5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleChip(s)}
                    className="px-4 py-2.5 rounded-full bg-white/8 border border-white/15 hover:bg-white/15 hover:border-amber/40 transition-all text-[12px] font-medium font-serif text-amber-100/70 hover:text-amber-100"
                  >
                    {s}
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
                key={phraseIdx}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.35 }}
                className="text-lg font-serif italic text-amber-200/70 font-medium text-center"
              >
                {LOADING_PHRASES[phraseIdx]}
              </motion.p>
            </AnimatePresence>
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

        {/* Results — AI mode */}
        <AnimatePresence>
          {result && !loading && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-12"
            >
              {/* Ustad quote — ustad_line preferred, fallback to message */}
              {quote && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-8 md:p-12 rounded-[2.5rem] bg-gradient-to-br from-amber-500/[0.05] to-amber-900/[0.08] border border-white/10"
                >
                  {result.mode && (
                    <p className="text-[9px] font-bold uppercase tracking-[0.5em] text-amber/50 mb-4 text-center">
                      {result.mode === 'claude_reranked' ? 'Claude Analizi' : 'Kural Tabanlı'}
                    </p>
                  )}
                  <p className="text-2xl md:text-3xl font-serif italic font-medium leading-relaxed text-amber-100/85 text-center drop-shadow-[0_1px_2px_rgba(0,0,0,0.2)]">
                    &ldquo;{quote}&rdquo;
                  </p>
                </motion.div>
              )}

              {/* Mood mix chips */}
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
                  <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-amber/70">BUNLARI ÖNERİYORUM</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {result.movies.map((movie) => (
                      <motion.div
                        key={movie.id}
                        layout
                        className="bg-white/8 rounded-[2rem] border border-white/10 overflow-hidden group hover:border-amber/35 transition-all cursor-pointer"
                        onClick={() => navigate(`/discover?analyze=${movie.id}`)}
                      >
                        <div className="aspect-[2/3] relative overflow-hidden">
                          <img
                            src={proxyImageUrl(movie.poster_url)}
                            alt={movie.title}
                            className="w-full h-full object-cover grayscale-[0.2] group-hover:grayscale-0 group-hover:scale-105 transition-all duration-700"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                          <div className="absolute bottom-4 left-4 right-4">
                            <h3 className="text-xl font-serif font-bold text-white drop-shadow-lg line-clamp-2">
                              {movie.title}
                            </h3>
                            <div className="flex items-center gap-3 mt-2 flex-wrap">
                              <span className="flex items-center gap-1 text-[11px] text-[#ffbf00] font-bold">
                                <Star size={11} className="fill-[#ffbf00]" />
                                {movie.vote_average?.toFixed(1)}
                              </span>
                              {movie.mood_score && (
                                <span className="text-[10px] text-amber-100/50">
                                  Uyum: %{Math.round(movie.mood_score)}
                                </span>
                              )}
                              {/* matched_moods badges */}
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
                        </div>

                        {/* Reason — "Neden sana uygun?" */}
                        {movie.reason && (
                          <div className="p-5 space-y-1.5">
                            <p className="text-[9px] font-bold uppercase tracking-[0.35em] text-amber/50">
                              Neden sana uygun?
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

              {/* Bottom actions */}
              <div className="flex flex-wrap gap-4 justify-center pb-12">
                <button
                  onClick={() => { setResult(null); setText(''); }}
                  className="flex items-center gap-2 px-8 py-4 bg-[#ffbf00] hover:bg-amber-400 text-[#120d0b] rounded-full text-[10px] font-bold uppercase tracking-widest transition-all shadow-[0_0_20px_rgba(255,191,0,0.25)]"
                >
                  <RefreshCw size={14} /> Yeni Öneri Al
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
    </div>
  );
}
