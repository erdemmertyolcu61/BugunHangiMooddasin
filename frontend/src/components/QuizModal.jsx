import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, Heart, ArrowRight } from 'lucide-react';
import { QUESTIONS, MOOD_NAMES, calculateQuizResult, getResultMessage } from '../utils/moodQuiz';

export default function QuizModal({ isOpen, onClose, onComplete }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [result, setResult] = useState(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // Quiz açıldığında direkt ilk soruya başla
      setStep(1);
      setAnswers([]);
      setResult(null);
      setLeaving(false);
    } else {
      setStep(0);
      setAnswers([]);
      setResult(null);
      setLeaving(false);
    }
  }, [isOpen]);

  const selectAnswer = useCallback((ansIdx) => {
    const newAnswers = [...answers];
    newAnswers[step - 1] = ansIdx;
    setAnswers(newAnswers);

    if (step < QUESTIONS.length) {
      setLeaving(true);
      setTimeout(() => {
        setStep(step + 1);
        setLeaving(false);
      }, 200);
    } else {
      const calcResult = calculateQuizResult(newAnswers);
      setResult(calcResult);
      setStep(QUESTIONS.length + 1);
    }
  }, [step, answers]);

  const goBack = useCallback(() => {
    if (step > 1) {
      setLeaving(true);
      setTimeout(() => {
        setStep(step - 1);
        setLeaving(false);
      }, 200);
    }
  }, [step]);

  const resetQuiz = useCallback(() => {
    setLeaving(true);
    setTimeout(() => {
      setStep(1);
      setAnswers([]);
      setResult(null);
      setLeaving(false);
    }, 200);
  }, []);

  const currentQuestion = step >= 1 && step <= QUESTIONS.length ? QUESTIONS[step - 1] : null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-8"
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

          <motion.div
            initial={{ scale: 0.92, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.92, y: 20, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto bg-[#111111] border border-zinc-800 rounded-[1.5rem] sm:rounded-[2rem] p-4 sm:p-8 md:p-10 shadow-2xl"
          >
            <button onClick={onClose} className="absolute top-5 right-5 text-zinc-500 hover:text-amber transition-colors z-10">
              <X size={20} />
            </button>

            {step === 0 ? null : step <= QUESTIONS.length ? (
              /* ── QUESTION STEP ── */
              <div className="space-y-8" key={step}>
                {/* Progress */}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-[0.4em] text-amber/50">
                    {step} / {QUESTIONS.length}
                  </span>
                  <div className="flex gap-1.5">
                    {QUESTIONS.map((_, i) => (
                      <div key={i} className={`w-6 h-1 rounded-full transition-colors ${
                        i < step ? 'bg-amber/60' : 'bg-zinc-700'
                      }`} />
                    ))}
                  </div>
                </div>

                {/* Question text */}
                <AnimatePresence mode="wait">
                  <motion.div
                    key={step}
                    initial={{ opacity: 0, y: leaving ? -20 : 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.2 }}
                  >
                    <h3 className="text-base sm:text-xl md:text-2xl font-bold text-[#d4af37] text-center tracking-wide mb-4 sm:mb-6 px-1 sm:px-2 leading-snug">
                      {currentQuestion?.text}
                    </h3>

                    {/* Options */}
                    <div className="grid grid-cols-1 gap-2.5 sm:gap-4 w-full max-w-2xl mx-auto px-0 sm:px-4">
                      {currentQuestion?.answers.map((ans, i) => (
                        <motion.button
                          key={i}
                          onClick={() => selectAnswer(i)}
                          initial={{ opacity: 0, y: 16 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.25, delay: i * 0.06 }}
                          className="w-full text-left p-3 sm:p-4 rounded-xl bg-[#111111] hover:bg-[#1a1a1a] border border-zinc-800 hover:border-[#d4af37] active:border-[#d4af37] transition-all duration-300 group flex items-center justify-between"
                        >
                          <span className="text-xs sm:text-sm md:text-base text-zinc-300 group-hover:text-white font-medium pr-2 sm:pr-3 leading-relaxed break-words max-w-[90%]">
                            {ans.text}
                          </span>
                          <span className="text-[#d4af37] opacity-0 group-hover:opacity-100 transition-opacity text-lg hidden sm:inline shrink-0">
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
                    className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400 hover:text-amber transition-colors mx-auto">
                    <ChevronLeft size={14} /> Geri
                  </button>
                )}
              </div>
            ) : (
              /* ── RESULT STEP ── */
              <div className="space-y-8 text-center" key="result">
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
                    {result && MOOD_NAMES[result[0]?.moodId]}
                    {result && result[0]?.percentage < 50 ? " ağırlıklı" : ""}
                  </h3>
                </motion.div>

                {/* Percentages */}
                {result && (
                  <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="space-y-3 max-w-xs mx-auto"
                  >
                    {result.map((r, i) => (
                      <div key={r.moodId} className="flex items-center gap-4">
                        <span className="text-sm font-serif text-ivory/70 w-28 sm:w-32 text-right shrink-0">{MOOD_NAMES[r.moodId] || r.moodId}</span>
                        <div className="flex-1 h-2 bg-zinc-700 rounded-full overflow-hidden">
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
                {result && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.6 }}
                    className="text-sm md:text-base font-serif italic text-ivory/60 leading-relaxed max-w-sm mx-auto"
                  >
                    &ldquo;{getResultMessage(result)}&rdquo;
                  </motion.p>
                )}

                {/* Actions */}
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.7 }}
                  className="flex flex-col sm:flex-row gap-3 justify-center pt-2"
                >
                  <button
                    onClick={() => result && onComplete(result[0].moodId)}
                    className="px-6 sm:px-8 py-3 sm:py-4 bg-amber text-black rounded-full text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.25em] hover:scale-105 transition-all shadow-[0_0_20px_rgba(245,158,11,0.3)]"
                  >
                    {result ? `${MOOD_NAMES[result[0]?.moodId] || ''}'a Git` : 'Film Öner'}
                  </button>
                  <button onClick={resetQuiz}
                    className="px-6 sm:px-8 py-3 sm:py-4 border border-zinc-700 text-zinc-400 rounded-full text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.25em] hover:border-amber/40 hover:text-amber transition-all">
                    Tekrar Çöz
                  </button>
                  <button onClick={onClose}
                    className="px-6 sm:px-8 py-3 sm:py-4 text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-500 hover:text-ivory/70 transition-all">
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
