import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, Heart, ArrowRight, Star, Eye, BookmarkPlus, Check, Brain } from 'lucide-react';
import { QUESTIONS, MOOD_NAMES, calculateQuizResult, getResultMessage } from '../utils/moodQuiz';
import { moodQuizSearch } from '../services/api';
import OptimizedImage from './OptimizedImage';
import QuizShareCard from './QuizShareCard';

export default function QuizModal({ isOpen, onClose, onComplete }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [result, setResult] = useState(null);
  const [quizResult, setQuizResult] = useState(null);
  const [searchResult, setSearchResult] = useState(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [showShare, setShowShare] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setAnswers([]);
      setResult(null);
      setQuizResult(null);
      setSearchResult(null);
      setSearching(false);
      setSearchError(null);
    } else {
      setStep(0);
      setAnswers([]);
      setResult(null);
      setQuizResult(null);
      setSearchResult(null);
      setSearching(false);
      setSearchError(null);
      setShowShare(false);
    }
  }, [isOpen]);

  const selectAnswer = useCallback((ansIdx) => {
    const newAnswers = [...answers];
    newAnswers[step - 1] = ansIdx;
    setAnswers(newAnswers);

    if (step < QUESTIONS.length) {
      // AnimatePresence mode="wait" (key=step) geçişi tek başına yönetir.
      setStep(step + 1);
    } else {
      // All 6 steps answered → calculate + search
      const calc = calculateQuizResult(newAnswers);
      setQuizResult(calc);
      setResult(calc.topMoods);
      setStep(QUESTIONS.length + 1);
      // Fire backend search
      setSearching(true);
      setSearchError(null);
      moodQuizSearch(calc.targets, { limit: 6, minVote: 5.0 })
        .then((data) => {
          setSearchResult(data);
          setSearching(false);
        })
        .catch((err) => {
          setSearchError(err.message || 'Arama başarısız');
          setSearching(false);
        });
    }
  }, [step, answers]);

  const goBack = useCallback(() => {
    if (step > 1) setStep(step - 1);
  }, [step]);

  const resetQuiz = useCallback(() => {
    setStep(1);
    setAnswers([]);
    setResult(null);
    setQuizResult(null);
    setSearchResult(null);
    setSearching(false);
    setSearchError(null);
    setShowShare(false);
  }, []);

  const currentQuestion = step >= 1 && step <= QUESTIONS.length ? QUESTIONS[step - 1] : null;

  const movies = searchResult?.movies || [];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-8"
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-md" onClick={onClose} />

          <motion.div
            initial={{ scale: 0.92, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.92, y: 20, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto bg-surface border border-white/[0.06] rounded-[1.75rem] sm:rounded-[2.25rem] p-4 sm:p-8 md:p-10 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.55)]"
          >
            {step === 0 ? null : step <= QUESTIONS.length ? (
              /* ── QUESTION STEP ── */
              <div className="space-y-6 sm:space-y-8" key={step}>
                {/* Progress + kapatma */}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-[0.4em] text-amber/50">
                    {step} / {QUESTIONS.length}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {QUESTIONS.map((_, i) => (
                      <div key={i} className={`w-4 sm:w-6 h-1 rounded-full transition-colors ${
                        i < step ? 'bg-amber/60' : 'bg-fg-subtle/30'
                      }`} />
                    ))}
                    <button onClick={onClose} className="ml-2 p-0.5 text-fg-subtle/40 hover:text-amber transition-colors active:scale-90">
                      <X size={16} />
                    </button>
                  </div>
                </div>

                {/* Question text */}
                <AnimatePresence mode="wait">
                  <motion.div
                    key={step}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.2 }}
                  >
                    <h3 className="text-base sm:text-xl md:text-2xl font-bold text-[#d4af37] text-center tracking-wide mb-4 sm:mb-6 px-1 sm:px-2 leading-snug">
                      {currentQuestion?.text}
                    </h3>

                    {/* Options */}
                    <div className="flex flex-col w-full max-w-2xl mx-auto px-0 gap-2.5 sm:gap-4">
                      {currentQuestion?.answers.map((ans, i) => (
                        <motion.button
                          key={i}
                          onClick={() => selectAnswer(i)}
                          initial={{ opacity: 0, y: 16 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.25, delay: i * 0.06 }}
                          className="w-full text-left p-4 min-h-[70px] rounded-2xl bg-fg/[0.04] hover:bg-amber/10 ring-1 ring-transparent hover:ring-amber/30 transition-all duration-300 flex items-center justify-between group"
                        >
                          <span className="text-sm md:text-base text-fg-muted group-hover:text-fg font-medium pr-2 leading-relaxed break-words">
                            {ans.text}
                          </span>
                          <span className="text-[#d4af37] opacity-0 group-hover:opacity-100 transition-opacity pl-2 hidden sm:inline shrink-0">
                            <ArrowRight size={18} />
                          </span>
                        </motion.button>
                      ))}
                    </div>
                  </motion.div>
                </AnimatePresence>

                {/* Back button */}
                {step > 1 && (
                  <button onClick={goBack}
                    className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-fg-subtle hover:text-amber transition-colors mx-auto">
                    <ChevronLeft size={14} /> Geri
                  </button>
                )}
              </div>
            ) : (
              /* ── RESULT STEP ── */
              <div className="space-y-5 sm:space-y-8 text-center" key="result">
                {/* Searching state */}
                {searching && (
                  <div className="flex flex-col items-center gap-6 py-8">
                    <div className="relative w-16 h-16">
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                        className="absolute inset-0 rounded-full border-2 border-amber/20 border-t-[#ffbf00]"
                      />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Brain size={20} className="text-amber/40" />
                      </div>
                    </div>
                    <p className="text-sm font-serif italic text-amber-200/70">Filmlerin seçiyorum...</p>
                  </div>
                )}

                {/* Search error */}
                {searchError && !searching && (
                  <div className="py-4">
                    <p className="text-rose-400 text-sm">{searchError}</p>
                  </div>
                )}

                {/* Result header — only show when not searching */}
                {!searching && (
                  <>
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 200, damping: 15 }}
                      className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-500 to-purple-600 flex items-center justify-center mx-auto shadow-[0_0_40px_rgba(245,158,11,0.3)]"
                    >
                      <Heart size={28} className="text-black" />
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                    >
                      <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-amber/50 mb-3">Bu Geceki Ruh Halin</p>
                      <h3 className="text-2xl md:text-3xl font-bold tracking-tight text-ivory">
                        {quizResult && MOOD_NAMES[quizResult.topMoods?.[0]?.moodId]}
                        {quizResult && quizResult.topMoods?.[0]?.percentage < 50 ? " ağırlıklı" : ""}
                      </h3>
                    </motion.div>

                    {/* Percentage bars */}
                    {quizResult?.topMoods && (
                      <motion.div
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="space-y-3 max-w-xs mx-auto"
                      >
                        {quizResult.topMoods.map((r, i) => (
                          <div key={r.moodId} className="flex items-center gap-4">
                            <span className="text-sm font-serif text-ivory/70 w-28 sm:w-32 text-right shrink-0">{MOOD_NAMES[r.moodId] || r.moodId}</span>
                            <div className="flex-1 h-2 bg-fg-subtle/30 rounded-full overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${r.percentage}%` }}
                                transition={{ duration: 1, delay: 0.4 + i * 0.15, ease: [0.16, 1, 0.3, 1] }}
                                className="h-full rounded-full bg-gradient-to-r from-amber-500 to-purple-500"
                              />
                            </div>
                            <span className="text-xs font-bold text-amber/70 w-8 shrink-0">{r.percentage}%</span>
                          </div>
                        ))}
                      </motion.div>
                    )}

                    {/* Message */}
                    {quizResult && (
                      <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.6 }}
                        className="text-sm md:text-base font-serif italic text-ivory/60 leading-relaxed max-w-sm mx-auto"
                      >
                        &ldquo;{getResultMessage(quizResult.topMoods)}&rdquo;
                      </motion.p>
                    )}
                  </>
                )}

                {/* Movie results */}
                {!searching && movies.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.7 }}
                    className="space-y-4 text-left"
                  >
                    <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-amber/60 text-center">SANA ÖZEL SEÇKİ</p>
                    <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar -mx-2 px-2">
                      {movies.slice(0, 4).map((movie) => (
                        <div key={movie.id} className="shrink-0 w-[130px] sm:w-[150px]">
                          <div className="aspect-[2/3] rounded-xl overflow-hidden bg-surface-2 mb-2">
                            <OptimizedImage
                              src={movie.poster_url}
                              alt={movie.title}
                              fallbackTitle={movie.title}
                              aspect="poster"
                              size="sm"
                              className="w-full h-full"
                            />
                          </div>
                          <h4 className="text-[11px] font-semibold text-ivory/80 leading-tight line-clamp-2 mb-1">{movie.title}</h4>
                          <div className="flex items-center gap-2">
                            <span className="flex items-center gap-0.5 text-[9px] text-amber">
                              <Star size={8} className="fill-amber" />
                              {movie.vote_average > 0 ? movie.vote_average.toFixed(1) : '—'}
                            </span>
                            <span className="text-[9px] text-ivory/40">%{movie.mood_score}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* Share Card — varsayılan gizli (mobilde tekrar/uzun blok olmasın).
                    "Sonucu Paylaş" ile açılır; kart kendi paylaş/indir butonlarını taşır. */}
                {!searching && quizResult?.topMoods && (
                  !showShare ? (
                    <button
                      onClick={() => setShowShare(true)}
                      className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-amber/10 hover:bg-amber/15 border border-amber/20 text-amber/80 hover:text-amber text-[10px] font-bold uppercase tracking-[0.2em] transition-all mx-auto"
                    >
                      Sonucu Paylaş
                    </button>
                  ) : (
                    <motion.div
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex justify-center"
                    >
                      <QuizShareCard
                        topMoods={quizResult.topMoods}
                        resultMessage={getResultMessage(quizResult.topMoods)}
                      />
                    </motion.div>
                  )
                )}

                {/* Actions */}
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1.0 }}
                  className="flex flex-col sm:flex-row gap-3 justify-center pt-2"
                >
                  <button
                    onClick={() => result && onComplete(result[0]?.moodId)}
                    className="px-6 sm:px-8 py-3 sm:py-4 bg-amber text-black rounded-full text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.25em] hover:scale-105 transition-all shadow-[0_0_20px_rgba(245,158,11,0.3)]"
                  >
                    {result ? `${MOOD_NAMES[result[0]?.moodId] || ''}'a Git` : 'Film Öner'}
                  </button>
                  <button onClick={resetQuiz}
                    className="px-6 sm:px-8 py-3 sm:py-4 border border-default text-fg-subtle rounded-full text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.25em] hover:border-amber/40 hover:text-amber transition-all">
                    Tekrar Çöz
                  </button>
                  <button onClick={onClose}
                    className="px-6 sm:px-8 py-3 sm:py-4 text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.25em] text-fg-subtle hover:text-fg transition-all">
                    Kapat
                  </button>
                </motion.div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
