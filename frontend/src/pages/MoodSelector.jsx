import React, { useState, useEffect, useCallback } from 'react';
import { useMood, MOODS } from '../context/MoodContext';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Book, ChevronRight, Brain, User, Gem } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getApiUrl, resolveAvatarUrl } from '../utils/apiConfig';
import { getTasteMap } from '../services/api';
import { track, EVENTS } from '../utils/analytics';
import useDocumentMeta from '../utils/useDocumentMeta';

import { playMoodAudio, preloadMoodAudio } from '../utils/moodAudioManager';
import QuizModal from '../components/QuizModal';
import StreakBadge from '../components/StreakBadge';

const moodList = Object.values(MOODS);

export default function MoodSelector() {
  const navigate = useNavigate();
  const { selectMood, prefetchMood } = useMood();
  const { user } = useAuth();

  useDocumentMeta({
    title: 'Sinemood — Ruh Haline Göre Film Öner',
    description: 'Bugün hangi mooddasın? Ruh haline göre film keşfet, Üstad’ın seçkilerini ve sürpriz filmleri dene. Yapay zeka destekli sinematik öneri.',
  });

  const [hoveredMood, setHoveredMood] = useState(null);
  const [suggestedMood, setSuggestedMood] = useState(null); // taste map'ten önerilen baskın mood

  const [quizOpen, setQuizOpen] = useState(false);

  // Skip prefetch/preload on touch devices to avoid spurious API calls
  const isTouchDevice = typeof window !== 'undefined' && 'ontouchstart' in window;

  const handleHover = useCallback((mood) => {
    if (isTouchDevice) return; // touch cihazlarda hover state yok → re-render sıfır
    setHoveredMood(mood.id);
    const runner = window.requestIdleCallback || ((cb) => setTimeout(cb, 300));
    runner(() => { prefetchMood(mood.id); });
    runner(() => { preloadMoodAudio(mood.id); });
    runner(() => { import('../pages/Discover').catch(() => {}); });
  }, [prefetchMood]);

  const handleHoverEnd = useCallback(() => {
    setHoveredMood(null);
  }, []);

  const handleMoodClick = useCallback(async (mood) => {
    track(EVENTS.MOOD_SELECT, { mood: mood.id });
    try { playMoodAudio(mood.id); } catch(e) {}
    selectMood(mood.id);
    import('../pages/Discover').catch(() => {});
    navigate('/discover');
  }, [selectMood, navigate]);

  const handleQuizComplete = (moodId) => {
    try { playMoodAudio(moodId); } catch(e) {}
    selectMood(moodId);
    setQuizOpen(false);
    navigate('/discover');
  };

  // Zevk haritasından baskın mood'u öner (giriş yapıldıysa, yeterli sinyalde).
  useEffect(() => {
    if (!user) { setSuggestedMood(null); return; }
    let alive = true;
    getTasteMap()
      .then((tm) => {
        if (!alive || !tm || tm.confidence === 'low') return;
        const topId = tm.top_moods?.[0]?.mood_id;
        if (topId && MOODS[topId]) setSuggestedMood(MOODS[topId]);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [user]);

  // Preload common route chunks as soon as page loads (idle callback)
  useEffect(() => {
    const runner = window.requestIdleCallback || ((cb) => setTimeout(cb, 1000));
    runner(() => { import('../pages/Discover').catch(() => {}); });
    runner(() => { import('../pages/Defterim').catch(() => {}); });
  }, []);

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

      {/* Bildirim zili + Profil — sağ üst. mt-safe → çentik/status bar altına kaçmaz, mobilde rahat tıklanır. */}
      <div className="fixed top-4 right-4 z-50 mt-safe flex items-center gap-2">
        <StreakBadge />
        <button
          onClick={() => navigate('/profil')}
          title={user ? 'Profilim' : 'Giriş Yap'}
          className="flex items-center gap-2 pl-2 pr-3 py-1.5 min-h-[40px] rounded-full bg-black/40 backdrop-blur-md border border-white/10 hover:border-amber/40 transition-all"
        >
          <span className="w-7 h-7 rounded-full overflow-hidden bg-amber/10 flex items-center justify-center shrink-0">
            {user?.picture
              ? <img src={resolveAvatarUrl(user.picture)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              : <User size={14} className="text-amber/60" />}
          </span>
          <span className="font-sans text-[10px] font-semibold text-ivory/50 hidden sm:inline">
            {user?.username || user?.name || 'Giriş Yap'}
          </span>
        </button>
      </div>

      {/* ═══ İçerik ═══ */}
      <div className="relative z-20 container mx-auto px-4 sm:px-6 pt-[calc(3.25rem+env(safe-area-inset-top))] pb-8 sm:pt-10 sm:pb-10 flex flex-col items-center min-h-screen pb-nav">

        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: -15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6, ease: [0.16, 1, 0.3, 1] }}
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

        {/* Zevk haritasına göre kişisel öneri — tıklayınca o mood'a gider */}
        {suggestedMood && (
          <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            onClick={() => handleMoodClick(suggestedMood)}
            className="group mb-8 sm:mb-10 inline-flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-amber/10 border border-amber/30 hover:bg-amber/15 hover:border-amber/50 transition-all active:scale-95"
          >
            <Gem size={13} className="text-amber/70" />
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.18em] text-amber/85">
              Sana göre bugün: {suggestedMood.title}
            </span>
            <ChevronRight size={14} className="text-amber/60 group-hover:translate-x-0.5 transition-transform" />
          </motion.button>
        )}

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
                  transition={{ duration: 0.35, delay: isTouchDevice ? 0 : 0.65 + i * 0.015, ease: [0.16, 1, 0.3, 1] }}
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

                    {/* Radial glow top-left — masaüstünde hover efekti, mobilde gizli */}
                    <div className="absolute -top-10 -left-10 w-48 h-48 rounded-full blur-3xl transition-opacity duration-700 pointer-events-none hidden sm:block"
                      style={{ background: mood.accentHex, opacity: isHovered ? 0.18 : 0.04 }} />

                    <div className="relative p-4 sm:p-7 flex flex-col min-h-[215px] sm:min-h-[290px] md:min-h-[320px]">

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
          transition={{ duration: 0.6, delay: isTouchDevice ? 0.15 : 1.0 }}
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
            {/* Defterim — her iki temada da espresso pill (Latte'de override sheet'e
                takılmaması için renkler inline). */}
            <button onClick={() => navigate('/defterim')}
              style={{ backgroundColor: '#241b16', borderColor: 'rgba(255,191,0,0.22)', color: '#d6a84f' }}
              className="hidden md:flex items-center gap-2 px-5 py-2.5 rounded-full border text-[10px] font-bold uppercase tracking-[0.3em] hover:scale-105 transition-transform duration-300">
              <Book size={14} /> Defterim
            </button>
          </div>
          {/* Gizli keşif: küçük kâhini ikonu — "aa bu neymiş?" */}
          <button
            onClick={() => { track(EVENTS.SURPRISE_VIEW, { kind: 'game_discover' }); navigate('/oyun'); }}
            title="?"
            aria-label="Gizli mini oyun"
            className="group relative w-8 h-8 flex items-center justify-center rounded-full
                       text-rose/25 hover:text-amber/80 transition-all duration-500 hover:scale-110"
          >
            <span className="pointer-events-none absolute inset-0 rounded-full border border-amber/15 animate-ping opacity-20 group-hover:opacity-0" />
            <Gem size={15} strokeWidth={1.5} />
          </button>
          <p className="text-[8px] uppercase tracking-[0.5em] text-rose/30 font-medium">sinema bir atmosferdir</p>
          <button onClick={() => navigate('/gizlilik')}
            className="text-[9px] uppercase tracking-[0.3em] text-rose/30 hover:text-amber/70 transition-colors duration-500">
            Gizlilik & KVKK
          </button>
          {/* TMDB atıfı — TMDB API kullanım şartları gereği zorunlu */}
          <p className="text-[8px] leading-relaxed text-rose/25 max-w-xs text-center mt-1">
            Bu ürün TMDB API'sini kullanır ancak TMDB tarafından onaylanmamıştır.
            <br className="hidden sm:block" />
            This product uses the TMDB API but is not endorsed or certified by TMDB.
          </p>
        </motion.footer>
      </div>

      <QuizModal isOpen={quizOpen} onClose={() => setQuizOpen(false)} onComplete={handleQuizComplete} />
    </div>
  );
}
