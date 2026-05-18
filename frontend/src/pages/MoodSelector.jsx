import React, { useState, useEffect, useCallback } from 'react';
import { useMood, MOODS } from '../context/MoodContext';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Book, Sparkles, X, ChevronRight, ChevronLeft, Brain, Heart, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { moodSynth } from '../services/music';
import { playMoodAudio, preloadMoodAudio } from '../utils/moodAudioManager';
import { QUESTIONS, MOOD_NAMES, calculateQuizResult, getResultMessage } from '../utils/moodQuiz';

const moodList = Object.values(MOODS);

export default function MoodSelector() {
  const navigate = useNavigate();
  const { selectMood, prefetchMood } = useMood();
  const { user } = useAuth();
  const [hoveredMood, setHoveredMood] = useState(null);

  // Quiz state
  const [quizOpen, setQuizOpen] = useState(false);
  const [quizStep, setQuizStep] = useState(0); // 0 = not started, 1-N = questions, N+1 = results
  const [answers, setAnswers] = useState([]);
  const [quizResult, setQuizResult] = useState(null);

  const handleHover = useCallback((mood) => {
    setHoveredMood(mood.id);
    prefetchMood(mood.id);
    preloadMoodAudio(mood.id);
  }, [prefetchMood]);

  const handleHoverEnd = useCallback(() => {
    setHoveredMood(null);
  }, []);

  const handleMoodClick = useCallback(async (mood) => {
    try { playMoodAudio(mood.id); } catch(e) {}
    selectMood(mood.id);
    navigate('/discover');
  }, [selectMood, navigate]);

  // Quiz handlers
  const openQuiz = () => {
    setQuizOpen(true);
    setQuizStep(1);
    setAnswers([]);
    setQuizResult(null);
  };

  const closeQuiz = () => {
    setQuizOpen(false);
    setQuizStep(0);
    setAnswers([]);
    setQuizResult(null);
  };

  const selectAnswer = (ansIdx) => {
    const newAnswers = [...answers];
    newAnswers[quizStep - 1] = ansIdx;
    setAnswers(newAnswers);

    if (quizStep < QUESTIONS.length) {
      setQuizStep(quizStep + 1);
    } else {
      // Calculate result
      const result = calculateQuizResult(newAnswers);
      setQuizResult(result);
      setQuizStep(QUESTIONS.length + 1);
    }
  };

  const goToPrevStep = () => {
    if (quizStep > 1) setQuizStep(quizStep - 1);
  };

  const navigateToMood = (moodId) => {
    try { playMoodAudio(moodId); } catch(e) {}
    selectMood(moodId);
    setQuizOpen(false);
    navigate('/discover', { state: { quizResult } });
  };

  const activeMood = hoveredMood ? MOODS[hoveredMood] : null;

  return (
    <div className="min-h-screen bg-bg text-ivory relative overflow-hidden font-sans">

      {/* Film grain */}
      <div className="fixed inset-0 pointer-events-none z-[999] opacity-[0.04] mix-blend-overlay"
           style={{ backgroundImage: "url('https://www.transparenttextures.com/patterns/natural-paper.png')" }} />

      {/* Scanline */}
      <div className="fixed inset-0 pointer-events-none z-[998] opacity-[0.02]"
           style={{
             backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.015) 2px, rgba(255,255,255,0.015) 4px)',
           }} />

      {/* Dinamik Aura */}
      <AnimatePresence>
        {activeMood && (
          <motion.div key={`aura-${activeMood.id}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 1.2 }} className="fixed inset-0 pointer-events-none z-[5]">
            <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full blur-[180px] opacity-25" style={{ background: activeMood.accentHex }} />
            <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full blur-[150px] opacity-20" style={{ background: activeMood.vignette }} />
            <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at center, transparent 30%, ${activeMood.vignette}80 150%)`, opacity: 0.3 }} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Profil butonu — sağ üst */}
      <button
        onClick={() => navigate('/profil')}
        title={user ? 'Profilim' : 'Giriş Yap'}
        className="fixed top-4 right-4 z-50 flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-full bg-black/40 backdrop-blur-md border border-white/10 hover:border-amber/40 transition-all"
      >
        <span className="w-7 h-7 rounded-full overflow-hidden bg-amber/10 flex items-center justify-center shrink-0">
          {user?.picture
            ? <img src={user.picture} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            : <User size={14} className="text-amber/60" />}
        </span>
        <span className="font-sans text-[10px] font-semibold text-ivory/50 hidden sm:inline">
          {user?.name || 'Giriş Yap'}
        </span>
      </button>

      {/* ═══ İçerik ═══ */}
      <div className="relative z-20 container mx-auto px-4 sm:px-6 py-8 sm:py-10 flex flex-col items-center min-h-screen pb-nav">

        {/* Header */}
        <motion.header
          initial={{ filter: 'blur(10px)', opacity: 0, y: -20 }}
          animate={{ filter: 'blur(0px)', opacity: 1, y: 0 }}
          transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
          className="text-center mb-10 sm:mb-14 max-w-3xl"
        >
          <div className="flex items-center justify-center gap-3 sm:gap-4 mb-5 sm:mb-6">
            <div className="h-px w-10 sm:w-20 bg-gradient-to-r from-transparent to-amber/30" />
            <span className="text-[8px] sm:text-[9px] font-bold uppercase tracking-[0.4em] sm:tracking-[0.6em] text-rose/50 text-center">Film Eleştirmeni — Üstad'ın Arşivi</span>
            <div className="h-px w-10 sm:w-20 bg-gradient-to-l from-transparent to-amber/30" />
          </div>
          <h1 className="text-[2.6rem] sm:text-6xl md:text-8xl font-serif font-normal tracking-tight mb-4 leading-[0.95] sm:leading-[0.9]">
            Bugün Hangi<br />
            <span className="italic text-amber font-semibold">Mooddasın?</span>
          </h1>
          <p className="text-sm sm:text-base md:text-lg text-rose/60 font-serif italic leading-relaxed max-w-xl mx-auto px-2">
            Ruh halini seç ve bizimle yolculuğa çıkmaya hazırlan.
          </p>
        </motion.header>

        {/* ═══ Grid: Mood Kartları + Quiz Widget ═══ */}
        <div className="flex flex-col lg:flex-row gap-6 max-w-7xl w-full mb-10">
          {/* Mood kartları grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-5 flex-1">
            {moodList.map((mood, i) => {
              const isHovered = hoveredMood === mood.id;
              return (
                <motion.div key={mood.id} layout
                  initial={{ opacity: 0, y: 25 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.1 + i * 0.05, ease: [0.16, 1, 0.3, 1] }}
                  whileHover={{ y: -5 }} whileTap={{ scale: 0.98 }}
                  onClick={() => handleMoodClick(mood)}
                  onMouseEnter={() => handleHover(mood)} onMouseLeave={handleHoverEnd}
                  className="relative group cursor-pointer"
                >
                  <div
                    className="relative overflow-hidden rounded-[1.75rem] bg-[#0d0b0a] border transition-all duration-500"
                    style={{
                      borderColor: isHovered ? `${mood.accentHex}35` : 'rgba(255,255,255,0.05)',
                      boxShadow: isHovered ? `0 16px 60px -12px ${mood.accentHex}50, inset 0 1px 0 ${mood.accentHex}15` : '0 2px 20px rgba(0,0,0,0.4)',
                    }}
                  >
                    {/* Gradient fill */}
                    <div className={`absolute inset-0 bg-gradient-to-br ${mood.color} transition-opacity duration-700`}
                      style={{ opacity: isHovered ? 0.22 : 0.05 }} />

                    {/* Radial glow top-left */}
                    <div className="absolute -top-10 -left-10 w-48 h-48 rounded-full blur-3xl transition-opacity duration-700 pointer-events-none"
                      style={{ background: mood.accentHex, opacity: isHovered ? 0.18 : 0.04 }} />

                    {/* Noise texture */}
                    <div className="absolute inset-0 opacity-[0.025] mix-blend-overlay pointer-events-none"
                      style={{ backgroundImage: "url('https://www.transparenttextures.com/patterns/natural-paper.png')" }} />

                    <div className="relative p-4 sm:p-7 flex flex-col min-h-[200px] sm:min-h-[310px] md:min-h-[340px]">

                      {/* Icon box */}
                      <div className="mb-3 sm:mb-6">
                        <motion.div
                          className="w-9 h-9 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl flex items-center justify-center transition-colors duration-500"
                          style={{ background: isHovered ? `${mood.accentHex}22` : 'rgba(255,255,255,0.05)', border: `1px solid ${isHovered ? mood.accentHex + '40' : 'rgba(255,255,255,0.07)'}` }}
                          animate={isHovered ? { scale: 1.08 } : { scale: 1 }}
                          transition={{ duration: 0.4 }}
                        >
                          <motion.span
                            style={{ color: isHovered ? mood.accentHex : '#52525b' }}
                            animate={isHovered
                              ? mood.iconType === 'coffee' ? { rotate: [-8, 8, -8, 8, 0] }
                              : mood.iconType === 'zap' ? { scale: [1, 1.25, 1] }
                              : mood.iconType === 'smile' ? { y: [-3, 0, -3, 0] }
                              : mood.iconType === 'moon' ? { rotate: [0, 12, 0] }
                              : mood.iconType === 'droplets' ? { y: [0, 4, 0], opacity: [1, 0.6, 1] }
                              : { scale: 1.12 }
                              : { scale: 1, x: 0, y: 0, rotate: 0 }
                            }
                            transition={{ duration: 0.6, repeat: isHovered ? Infinity : 0 }}
                          >
                            {mood.icon && <mood.icon size={18} strokeWidth={1.5} />}
                          </motion.span>
                        </motion.div>
                      </div>

                      {/* Title */}
                      <h3 className="font-serif text-[15px] sm:text-2xl font-bold tracking-tight leading-tight text-ivory group-hover:text-amber transition-colors duration-400 mb-1 sm:mb-3">
                        {mood.title}
                      </h3>

                      {/* Accent separator */}
                      <motion.div
                        className="h-px mb-2 sm:mb-4 rounded-full"
                        animate={{ width: isHovered ? 36 : 20, opacity: isHovered ? 0.9 : 0.2 }}
                        transition={{ duration: 0.4 }}
                        style={{ background: mood.accentHex }}
                      />

                      {/* Intro */}
                      <p className="font-sans text-[11px] sm:text-[13px] leading-relaxed text-ivory/75 group-hover:text-ivory transition-colors duration-500 line-clamp-3 flex-1">
                        {mood.intro}
                      </p>

                      {/* Footer row */}
                      <div className="mt-3 sm:mt-5 flex items-center justify-between">
                        <span
                          className="font-sans text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.35em] transition-colors duration-400 text-ivory/55 group-hover:text-amber"
                          style={isHovered ? { color: mood.accentHex } : undefined}
                        >
                          Keşfet
                        </span>
                        <motion.span
                          animate={{ x: isHovered ? 3 : 0, opacity: isHovered ? 1 : 0.25 }}
                          transition={{ duration: 0.3 }}
                          style={{ color: mood.accentHex }}
                        >
                          <ChevronRight size={14} />
                        </motion.span>
                      </div>
                    </div>

                    {/* Bottom shimmer line */}
                    <div className="absolute bottom-0 left-0 right-0 h-px transition-opacity duration-500"
                      style={{ background: `linear-gradient(90deg, transparent, ${mood.accentHex}90, transparent)`, opacity: isHovered ? 1 : 0 }} />
                  </div>
                </motion.div>
              );
            })}
          </div>

        </div>

        {/* Footer */}
        <motion.footer
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.8 }}
          className="flex flex-col items-center gap-5 mt-auto pb-4"
        >
          <div className="flex items-center gap-6 flex-wrap justify-center">
            <button onClick={() => navigate('/kafan-mi-karisik')}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-amber-500 to-purple-600 rounded-full hover:scale-105 transition-all shadow-[0_0_20px_rgba(245,158,11,0.3)] animate-pulse">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-bg">Kafan mı Karışık?</span>
            </button>
            <button onClick={openQuiz}
              className="flex items-center gap-2 px-6 py-3 bg-amber/90 hover:bg-amber text-bg rounded-full hover:scale-105 transition-all shadow-[0_0_15px_rgba(245,158,11,0.2)]">
              <Brain size={16} className="text-bg/80" />
              <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Bugünkü Ruh Halim</span>
            </button>
            <button onClick={() => navigate('/defterim')}
              className="hidden md:flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.3em] text-rose/40 hover:text-amber/70 transition-colors duration-500">
              <Book size={14} /> Defterim
            </button>
          </div>
          <p className="text-[8px] uppercase tracking-[0.5em] text-rose/30 font-medium">sinema bir atmosferdir</p>
        </motion.footer>
      </div>

      {/* ═══ QUIZ MODAL ═══ */}
      <AnimatePresence>
        {quizOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-8"
          >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={closeQuiz} />

            {/* Modal */}
            <motion.div
              initial={{ scale: 0.92, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.92, y: 20, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto bg-[#1a1816]/95 backdrop-blur-md border border-white/10 rounded-[2.5rem] p-8 md:p-10 shadow-2xl"
            >
              {/* Close button */}
              <button onClick={closeQuiz} className="absolute top-6 right-6 text-ivory/20 hover:text-amber transition-colors z-10">
                <X size={22} />
              </button>

              {quizStep === 0 ? null : quizStep <= QUESTIONS.length ? (
                /* ── SORU EKRANI ── */
                <div className="space-y-8">
                  {/* Progress */}
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-[0.4em] text-amber/50">
                      {quizStep} / {QUESTIONS.length}
                    </span>
                    <div className="flex gap-1.5">
                      {QUESTIONS.map((_, i) => (
                        <div key={i} className={`w-6 h-1 rounded-full transition-colors ${
                          i < quizStep ? 'bg-amber/60' : 'bg-white/10'
                        }`} />
                      ))}
                    </div>
                  </div>

                  {/* Soru */}
                  <div>
                    <h3 className="text-2xl md:text-3xl font-serif font-semibold tracking-tight text-ivory/90 leading-snug">
                      {QUESTIONS[quizStep - 1]?.text}
                    </h3>
                  </div>

                  {/* Cevaplar */}
                  <div className="space-y-3">
                    {QUESTIONS[quizStep - 1]?.answers.map((ans, i) => (
                      <button key={i} onClick={() => selectAnswer(i)}
                        className="w-full text-left p-4 md:p-5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-amber/30 transition-all duration-300 group"
                      >
                        <span className="text-sm md:text-base font-serif text-ivory/70 group-hover:text-ivory transition-colors leading-relaxed">
                          {ans.text}
                        </span>
                      </button>
                    ))}
                  </div>

                  {/* Geri butonu */}
                  {quizStep > 1 && (
                    <button onClick={goToPrevStep}
                      className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-ivory/30 hover:text-amber/70 transition-colors">
                      <ChevronLeft size={14} /> Geri
                    </button>
                  )}
                </div>
              ) : (
                /* ── SONUÇ EKRANI ── */
                <div className="space-y-8 text-center">
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-amber-500 to-purple-600 flex items-center justify-center mx-auto shadow-[0_0_30px_rgba(245,158,11,0.3)]">
                    <Heart size={24} className="text-bg" />
                  </div>

                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-amber/50 mb-3">Bu Geceki Ruh Halin</p>
                    <h3 className="text-2xl md:text-3xl font-serif font-bold tracking-tight text-ivory">
                      {quizResult && MOOD_NAMES[quizResult[0]?.moodId]}
                      {quizResult && quizResult[0]?.percentage < 50 ? " ağırlıklı" : ""}
                    </h3>
                  </div>

                  {/* Yüzdeler */}
                  {quizResult && (
                    <div className="space-y-3 max-w-xs mx-auto">
                      {quizResult.map((r) => (
                        <div key={r.moodId} className="flex items-center gap-4">
                          <span className="text-sm font-serif text-ivory/70 w-32 text-right">{MOOD_NAMES[r.moodId]}</span>
                          <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${r.percentage}%` }}
                              transition={{ duration: 1, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
                              className="h-full rounded-full bg-gradient-to-r from-amber-500 to-purple-500"
                            />
                          </div>
                          <span className="text-xs font-bold text-amber/70 w-8">{r.percentage}%</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Yorum */}
                  {quizResult && (
                    <p className="text-sm md:text-base font-serif italic text-ivory/60 leading-relaxed max-w-sm mx-auto">
                      "{getResultMessage(quizResult)}"
                    </p>
                  )}

                  {/* Butonlar */}
                  <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                    <button onClick={() => quizResult && navigateToMood(quizResult[0].moodId)}
                      className="px-8 py-4 bg-amber text-bg rounded-full text-[10px] font-bold uppercase tracking-[0.25em] hover:scale-105 transition-all shadow-[0_0_20px_rgba(245,158,11,0.3)]">
                      {quizResult ? `${MOOD_NAMES[quizResult[0]?.moodId]}'a Git` : 'Film Öner'}
                    </button>
                    <button onClick={openQuiz}
                      className="px-8 py-4 border border-white/10 text-ivory/60 rounded-full text-[10px] font-bold uppercase tracking-[0.25em] hover:border-amber/30 hover:text-amber transition-all">
                      Tekrar Çöz
                    </button>
                    <button onClick={closeQuiz}
                      className="px-8 py-4 text-[10px] font-bold uppercase tracking-[0.25em] text-ivory/30 hover:text-ivory/70 transition-all">
                      Kapat
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
