import React, { useState, useEffect, useCallback } from 'react';
import { useMood, MOODS } from '../context/MoodContext';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Book, ChevronRight, Brain, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

import { playMoodAudio, preloadMoodAudio } from '../utils/moodAudioManager';
import QuizModal from '../components/QuizModal';

const moodList = Object.values(MOODS);

export default function MoodSelector() {
  const navigate = useNavigate();
  const { selectMood, prefetchMood } = useMood();
  const { user } = useAuth();

  const [hoveredMood, setHoveredMood] = useState(null);

  const [quizOpen, setQuizOpen] = useState(false);

  // Skip prefetch/preload on touch devices to avoid spurious API calls
  const isTouchDevice = typeof window !== 'undefined' && 'ontouchstart' in window;

  const handleHover = useCallback((mood) => {
    setHoveredMood(mood.id);
    if (isTouchDevice) return;
    const runner = window.requestIdleCallback || ((cb) => setTimeout(cb, 300));
    runner(() => { prefetchMood(mood.id); });
    runner(() => { preloadMoodAudio(mood.id); });
  }, [prefetchMood]);

  const handleHoverEnd = useCallback(() => {
    setHoveredMood(null);
  }, []);

  const handleMoodClick = useCallback(async (mood) => {
    try { playMoodAudio(mood.id); } catch(e) {}
    selectMood(mood.id);
    navigate('/discover');
  }, [selectMood, navigate]);

  const handleQuizComplete = (moodId) => {
    try { playMoodAudio(moodId); } catch(e) {}
    selectMood(moodId);
    setQuizOpen(false);
    navigate('/discover');
  };

  // Mobil alt bardaki "Ruh Halim" butonundan quiz açılması:
  // BottomNav sessionStorage bayrağı bırakır / event yollar.
  useEffect(() => {
    const tryFlag = () => {
      if (sessionStorage.getItem('open_mood_quiz') === '1') {
        sessionStorage.removeItem('open_mood_quiz');
        setQuizOpen(true);
      }
    };
    tryFlag();
    window.addEventListener('open-mood-quiz', tryFlag);
    return () => window.removeEventListener('open-mood-quiz', tryFlag);
  }, []);

  const activeMood = hoveredMood ? MOODS[hoveredMood] : null;

  return (
    <div className="min-h-screen bg-bg text-ivory relative overflow-hidden font-sans">

      {/* Dinamik Aura — single GPU-friendly gradient */}
      {activeMood && (
        <div key={`aura-${activeMood.id}`}
          className="fixed inset-0 pointer-events-none z-[5] transition-opacity duration-700"
          style={{
            opacity: 1,
            background: `radial-gradient(ellipse at 30% 20%, ${activeMood.accentHex}30 0%, ${activeMood.vignette}20 40%, transparent 70%)`,
          }}
        />
      )}

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
            <span className="text-[8px] sm:text-[9px] font-bold uppercase tracking-[0.4em] sm:tracking-[0.6em] text-rose/50 text-center">Sinemood</span>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-5 flex-1">
            {moodList.map((mood, i) => {
              const isHovered = hoveredMood === mood.id;
              return (
                <motion.div key={mood.id}
                  initial={{ opacity: 0, y: 25 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: i * 0.02, ease: [0.16, 1, 0.3, 1] }}
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

                    <div className="relative p-4 sm:p-7 flex flex-col min-h-[240px] sm:min-h-[310px] md:min-h-[340px]">

                      {/* Icon box */}
                      <div className="mb-3 sm:mb-6">
                        <motion.div
                          className="w-9 h-9 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl flex items-center justify-center transition-colors duration-500"
                          style={{ background: isHovered ? `${mood.accentHex}22` : 'rgba(255,255,255,0.05)', border: `1px solid ${isHovered ? mood.accentHex + '40' : 'rgba(255,255,255,0.07)'}` }}
                          animate={isHovered ? { scale: 1.08 } : { scale: 1 }}
                          transition={{ duration: 0.4 }}
                        >
                          <span
                            className="icon-hover"
                            style={{ color: isHovered ? mood.accentHex : '#52525b' }}
                          >
                            {mood.icon && <mood.icon size={18} strokeWidth={1.5} />}
                          </span>
                        </motion.div>
                      </div>

                      {/* Title */}
                      <h3 className="font-serif text-lg sm:text-2xl font-bold tracking-tight leading-tight text-ivory group-hover:text-amber transition-colors duration-400 mb-1 sm:mb-3">
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
                        <p className="font-sans text-[13px] sm:text-[13px] leading-relaxed text-ivory/75 group-hover:text-ivory transition-colors duration-500 flex-1">
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
            <button onClick={() => setQuizOpen(true)}
              className="flex items-center gap-2 px-5 sm:px-6 py-2.5 sm:py-3 bg-amber/90 hover:bg-amber text-bg rounded-full hover:scale-105 transition-all shadow-[0_0_15px_rgba(245,158,11,0.2)]">
              <Brain size={14} className="text-bg/80 sm:w-4 sm:h-4" />
              <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.2em]">Ruh Halim</span>
            </button>
            <button onClick={() => navigate('/defterim')}
              className="hidden md:flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.3em] text-rose/40 hover:text-amber/70 transition-colors duration-500">
              <Book size={14} /> Defterim
            </button>
          </div>
          <p className="text-[8px] uppercase tracking-[0.5em] text-rose/30 font-medium">sinema bir atmosferdir</p>
        </motion.footer>
      </div>

      <QuizModal isOpen={quizOpen} onClose={() => setQuizOpen(false)} onComplete={handleQuizComplete} />
    </div>
  );
}
