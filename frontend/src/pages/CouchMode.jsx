import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Copy, Check, Users, Sofa, Crown, UserPlus, Sparkles, Star, Eye, BookmarkPlus, LogOut, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { MOODS } from '../context/MoodContext';
import { couchCreate, couchJoin, couchStatus, couchSelectMood, couchMovies, couchLeave, addToWatchlist, toggleWatched } from '../services/api';
import OptimizedImage from '../components/OptimizedImage';
import FilmDetailModal from '../components/FilmDetailModal';

// ── Phase state machine ──
// entry → lobby → mood_select → results
const PHASES = { ENTRY: 'entry', LOBBY: 'lobby', MOOD_SELECT: 'mood_select', RESULTS: 'results' };

const moodList = Object.values(MOODS);

export default function CouchMode() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Core state
  const [phase, setPhase] = useState(PHASES.ENTRY);
  const [roomCode, setRoomCode] = useState('');
  const [roomData, setRoomData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // Join form
  const [joinCode, setJoinCode] = useState('');

  // Copy feedback
  const [copied, setCopied] = useState(false);

  // Results
  const [movies, setMovies] = useState([]);
  const [ustadNote, setUstadNote] = useState('');
  const [moodName, setMoodName] = useState('');

  // Film detail modal
  const [detailMovieId, setDetailMovieId] = useState(null);
  const [detailInitialMovie, setDetailInitialMovie] = useState(null);

  // Quick card actions
  const [quickSavedIds, setQuickSavedIds] = useState(new Set());
  const [quickWatchedIds, setQuickWatchedIds] = useState(new Set());

  // Polling ref
  const pollRef = useRef(null);

  // ── Auth guard ──
  if (!user) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center gap-6 px-4">
        <Sofa size={48} className="text-amber-400/60" />
        <p className="text-lg font-serif text-amber-100/80 text-center">
          Birlikte izlemek için giriş yapman gerekiyor.
        </p>
        <button
          onClick={() => navigate('/profil')}
          className="px-8 py-3 bg-amber-500 hover:bg-amber-400 text-black rounded-full text-xs font-bold uppercase tracking-widest transition-all"
        >
          Giriş Yap
        </button>
      </div>
    );
  }

  // ── Handlers ──

  const handleCreateRoom = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await couchCreate();
      setRoomCode(data.room_code);
      setPhase(PHASES.LOBBY);
      startPolling(data.room_code);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = async () => {
    if (!joinCode.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await couchJoin(joinCode.trim().toUpperCase());
      setRoomCode(data.room_code);
      setPhase(PHASES.LOBBY);
      startPolling(data.room_code);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectMood = async (moodId) => {
    setLoading(true);
    setError(null);
    try {
      await couchSelectMood(roomCode, moodId);
      // Fetch movies
      const result = await couchMovies(roomCode);
      setMovies(result.movies || []);
      setUstadNote(result.ustad_notu || '');
      setMoodName(result.mood_name || '');
      setPhase(PHASES.RESULTS);
      stopPolling();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLeaveRoom = async () => {
    try {
      await couchLeave(roomCode);
    } catch {}
    stopPolling();
    setPhase(PHASES.ENTRY);
    setRoomCode('');
    setRoomData(null);
    setMovies([]);
  };

  const handleCopyCode = () => {
    navigator.clipboard?.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleQuickSave = async (e, movie) => {
    e.stopPropagation();
    if (quickSavedIds.has(movie.id)) return;
    setQuickSavedIds(prev => new Set([...prev, movie.id]));
    try { await addToWatchlist(movie); } catch {}
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
    try { await toggleWatched(movie.id); } catch {}
  };

  // ── Polling for lobby updates ──

  const startPolling = useCallback((code) => {
    stopPolling();
    const poll = async () => {
      try {
        const data = await couchStatus(code);
        setRoomData(data);

        // If mood was selected by the other person, auto-transition
        if (data.selected_mood && phase !== PHASES.RESULTS) {
          const result = await couchMovies(code);
          setMovies(result.movies || []);
          setUstadNote(result.ustad_notu || '');
          setMoodName(result.mood_name || '');
          setPhase(PHASES.RESULTS);
          stopPolling();
          return;
        }

        // If both are in, move to mood select
        if (data.members && data.members.length >= 2 && phase === PHASES.LOBBY) {
          setPhase(PHASES.MOOD_SELECT);
        }
      } catch {}
    };
    poll();
    pollRef.current = setInterval(poll, 3000);
  }, [phase]);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => {
    return () => stopPolling();
  }, []);

  // Keep polling phase-aware
  useEffect(() => {
    if (roomCode && (phase === PHASES.LOBBY || phase === PHASES.MOOD_SELECT)) {
      startPolling(roomCode);
    }
  }, [phase, roomCode, startPolling]);

  // ── Renders ──

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#f5f2eb] font-sans relative overflow-hidden">
      {/* Ambient gold glow */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-amber-500/[0.04] blur-[120px] couch-glow-pulse" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#0a0a0a]/95 backdrop-blur-sm border-b border-amber-500/10 pt-safe">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => phase === PHASES.ENTRY ? navigate('/') : handleLeaveRoom()} className="p-2 -ml-1 hover:bg-white/5 rounded-full transition-all">
              <ChevronLeft size={22} className="text-amber-400/70" />
            </button>
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.5em] text-amber-500/50">GRUP SEANSI</p>
              <h1 className="font-serif text-xl sm:text-2xl font-bold tracking-tight text-amber-100">Birlikte İzle</h1>
            </div>
          </div>
          {roomCode && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-amber-500/50">ODA</span>
              <span className="font-mono text-sm font-bold text-amber-400">{roomCode}</span>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 relative z-10 pb-32">
        <AnimatePresence mode="wait">

          {/* ═══ PHASE: ENTRY ═══ */}
          {phase === PHASES.ENTRY && (
            <motion.div
              key="entry"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-10"
            >
              {/* Hero */}
              <div className="text-center space-y-4 pt-4">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-amber-500/10 border border-amber-500/20 mb-4 couch-glow-pulse">
                  <Sofa size={36} className="text-amber-400" />
                </div>
                <h2 className="font-serif text-3xl sm:text-4xl font-bold text-amber-100">
                  Sinema Seansı Kuralım
                </h2>
                <p className="text-sm font-serif text-amber-100/50 max-w-md mx-auto leading-relaxed">
                  Arkadaşınla aynı ruh halini paylaş, birlikte film seç. Üstad ikiniz için özenle seçecek.
                </p>
              </div>

              {/* Two tiles */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-2xl mx-auto">
                {/* Create */}
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleCreateRoom}
                  disabled={loading}
                  className="couch-tile group relative p-8 rounded-3xl border border-amber-500/20 bg-amber-500/[0.04] hover:bg-amber-500/[0.08] hover:border-amber-500/40 transition-all text-left space-y-4 disabled:opacity-50"
                >
                  <div className="w-14 h-14 rounded-2xl bg-amber-500/15 flex items-center justify-center group-hover:bg-amber-500/25 transition-colors">
                    <Crown size={24} className="text-amber-400" />
                  </div>
                  <div>
                    <h3 className="font-serif text-xl font-bold text-amber-100">Oda Kur</h3>
                    <p className="text-xs text-amber-100/40 mt-1 font-serif">Kod oluştur, arkadaşınla paylaş</p>
                  </div>
                </motion.button>

                {/* Join */}
                <div className="couch-tile relative p-8 rounded-3xl border border-white/10 bg-white/[0.02] hover:border-amber-500/30 transition-all space-y-4">
                  <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center">
                    <UserPlus size={24} className="text-amber-100/60" />
                  </div>
                  <div>
                    <h3 className="font-serif text-xl font-bold text-amber-100">Odaya Katıl</h3>
                    <p className="text-xs text-amber-100/40 mt-1 font-serif">Arkadaşının kodunu gir</p>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <input
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                      placeholder="SM-XXXX"
                      maxLength={7}
                      className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-center font-mono text-lg font-bold text-amber-100 placeholder:text-amber-100/20 focus:outline-none focus:border-amber-500/50 transition-colors tracking-widest"
                      onKeyDown={(e) => e.key === 'Enter' && handleJoinRoom()}
                    />
                    <button
                      onClick={handleJoinRoom}
                      disabled={!joinCode.trim() || loading}
                      className="px-5 py-3 bg-amber-500 hover:bg-amber-400 disabled:opacity-30 text-black rounded-xl text-xs font-bold uppercase tracking-wider transition-all disabled:cursor-not-allowed"
                    >
                      Katıl
                    </button>
                  </div>
                </div>
              </div>

              {/* Error */}
              {error && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center text-rose-400 text-sm font-serif">
                  {error}
                </motion.p>
              )}
            </motion.div>
          )}

          {/* ═══ PHASE: LOBBY ═══ */}
          {phase === PHASES.LOBBY && (
            <motion.div
              key="lobby"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-10"
            >
              {/* Room code display */}
              <div className="text-center space-y-6">
                <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-amber-500/50">ODA KODU</p>
                <div className="inline-flex items-center gap-3 px-8 py-5 rounded-2xl bg-amber-500/[0.06] border border-amber-500/20">
                  <span className="font-mono text-4xl sm:text-5xl font-black text-amber-400 tracking-[0.15em] couch-code-glow">
                    {roomCode}
                  </span>
                  <button
                    onClick={handleCopyCode}
                    className="p-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 transition-colors"
                    title="Kodu kopyala"
                  >
                    {copied ? <Check size={18} className="text-emerald-400" /> : <Copy size={18} className="text-amber-400" />}
                  </button>
                </div>
                <p className="text-xs font-serif text-amber-100/40">Bu kodu arkadaşınla paylaş</p>

                {/* Share buttons */}
                <div className="flex justify-center gap-3">
                  <button
                    onClick={() => {
                      const text = `Sinemod'da seninle film seçmek istiyorum! Oda kodum: ${roomCode}`;
                      const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
                      window.open(url, '_blank');
                    }}
                    className="px-5 py-2.5 rounded-full bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 text-[11px] font-bold uppercase tracking-wider hover:bg-emerald-600/30 transition-all"
                  >
                    WhatsApp ile Paylaş
                  </button>
                  <button
                    onClick={handleCopyCode}
                    className="px-5 py-2.5 rounded-full bg-white/5 border border-white/10 text-amber-100/60 text-[11px] font-bold uppercase tracking-wider hover:bg-white/10 transition-all"
                  >
                    {copied ? 'Kopyalandı!' : 'Kodu Kopyala'}
                  </button>
                </div>
              </div>

              {/* Members */}
              <div className="max-w-sm mx-auto space-y-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-amber-500/50 text-center">ODADAKILER</p>
                <div className="space-y-3">
                  {(roomData?.members || []).map((member) => (
                    <div key={member.user_id} className="flex items-center gap-4 p-4 rounded-2xl bg-white/[0.03] border border-white/10">
                      {member.picture ? (
                        <img src={member.picture} alt="" className="w-10 h-10 rounded-full border-2 border-amber-500/40 object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-amber-500/15 flex items-center justify-center border-2 border-amber-500/30">
                          <Users size={16} className="text-amber-400" />
                        </div>
                      )}
                      <div className="flex-1">
                        <p className="font-serif font-bold text-amber-100 text-sm">{member.name || 'Sinemasever'}</p>
                        <p className="text-[10px] uppercase tracking-wider text-amber-500/50 font-bold">
                          {member.role === 'host' ? 'Ev Sahibi' : 'Misafir'}
                        </p>
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400/80">Hazır</span>
                    </div>
                  ))}

                  {/* Waiting slot */}
                  {(!roomData?.members || roomData.members.length < 2) && (
                    <div className="flex items-center gap-4 p-4 rounded-2xl border border-dashed border-white/10">
                      <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center border-2 border-white/10 couch-glow-pulse">
                        <UserPlus size={16} className="text-amber-100/30" />
                      </div>
                      <div className="flex-1">
                        <p className="font-serif text-amber-100/30 text-sm">Arkadaşın bekleniyor...</p>
                      </div>
                      <span className="couch-waiting-dots text-amber-500/40 text-xs font-bold">...</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Leave button */}
              <div className="text-center">
                <button onClick={handleLeaveRoom} className="text-[10px] font-bold uppercase tracking-widest text-amber-100/30 hover:text-rose-400 transition-colors">
                  <LogOut size={12} className="inline mr-1" /> Odadan Ayrıl
                </button>
              </div>
            </motion.div>
          )}

          {/* ═══ PHASE: MOOD SELECT ═══ */}
          {phase === PHASES.MOOD_SELECT && (
            <motion.div
              key="mood-select"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="text-center space-y-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-amber-500/50">HERKES HAZIR</p>
                <h2 className="font-serif text-2xl sm:text-3xl font-bold text-amber-100">
                  Bu Gece Ne Mood'dasınız?
                </h2>
                <p className="text-xs font-serif text-amber-100/40">
                  {roomData?.is_host ? 'Mood seçimi sende — bilgece seç.' : 'Ev sahibi mood seçecek...'}
                </p>

                {/* Members strip */}
                <div className="flex justify-center gap-2 mt-4">
                  {(roomData?.members || []).map((m) => (
                    <div key={m.user_id} className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-amber-500/20">
                      {m.picture && <img src={m.picture} alt="" className="w-5 h-5 rounded-full" />}
                      <span className="text-[10px] font-bold text-amber-100/70">{m.name?.split(' ')[0] || 'Sinemasever'}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Mood grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 max-w-3xl mx-auto">
                {moodList.map((mood, i) => {
                  const Icon = mood.icon;
                  const canSelect = roomData?.is_host;
                  return (
                    <motion.button
                      key={mood.id}
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                      onClick={() => canSelect && handleSelectMood(mood.id)}
                      disabled={!canSelect || loading}
                      className={`relative p-5 rounded-2xl border text-left transition-all group ${
                        canSelect
                          ? 'border-white/10 bg-white/[0.02] hover:border-amber-500/40 hover:bg-amber-500/[0.06] cursor-pointer'
                          : 'border-white/5 bg-white/[0.01] opacity-60 cursor-not-allowed'
                      }`}
                    >
                      <Icon size={20} className="text-amber-400/60 group-hover:text-amber-400 transition-colors mb-3" />
                      <h3 className="font-serif text-sm font-bold text-amber-100 group-hover:text-amber-50 transition-colors">{mood.title}</h3>
                      <p className="text-[9px] text-amber-100/30 mt-1 font-serif line-clamp-2">{mood.subtitle}</p>
                    </motion.button>
                  );
                })}
              </div>

              {error && (
                <p className="text-center text-rose-400 text-sm font-serif">{error}</p>
              )}
            </motion.div>
          )}

          {/* ═══ PHASE: RESULTS ═══ */}
          {phase === PHASES.RESULTS && (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-10"
            >
              {/* Ustad note */}
              {ustadNote && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="p-8 md:p-10 rounded-[2rem] bg-gradient-to-br from-amber-500/[0.06] to-amber-900/[0.04] border border-amber-500/15"
                >
                  <p className="text-[9px] font-bold uppercase tracking-[0.5em] text-amber-500/40 mb-3 text-center">ÜSTAD'DAN GRUP NOTU</p>
                  <p className="text-xl md:text-2xl font-serif italic font-medium leading-relaxed text-amber-100/80 text-center">
                    &ldquo;{ustadNote}&rdquo;
                  </p>
                </motion.div>
              )}

              {/* Mood + members badge */}
              <div className="flex flex-wrap items-center justify-center gap-3">
                <span className="px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[11px] font-bold uppercase tracking-wider">
                  {moodName}
                </span>
                {(roomData?.members || []).map((m) => (
                  <span key={m.user_id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[10px] font-bold text-amber-100/60">
                    {m.picture && <img src={m.picture} alt="" className="w-4 h-4 rounded-full" />}
                    {m.name?.split(' ')[0]}
                  </span>
                ))}
              </div>

              {/* Movie grid */}
              {movies.length > 0 && (
                <div className="space-y-6">
                  <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-amber-500/50">
                    BU GECE İÇİN SEÇTİKLERİMİZ
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {movies.map((movie, i) => (
                      <motion.div
                        key={movie.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 + i * 0.08 }}
                        className="rounded-[2rem] border border-white/10 bg-white/[0.03] overflow-hidden group transition-all cursor-pointer hover:border-amber-500/30"
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
                          <div className="absolute bottom-4 left-4 right-4">
                            <h3 className="text-lg font-serif font-bold text-white drop-shadow-lg line-clamp-2">
                              {movie.title}
                            </h3>
                            <div className="flex items-center gap-3 mt-1.5">
                              <span className="flex items-center gap-1 text-[11px] text-amber-400 font-bold">
                                <Star size={11} className="fill-amber-400" />
                                {movie.vote_average?.toFixed(1)}
                              </span>
                              {movie.release_date && (
                                <span className="text-[10px] text-amber-100/40">
                                  {movie.release_date?.split('-')[0]}
                                </span>
                              )}
                            </div>
                          </div>
                          {/* Quick actions */}
                          <div className="absolute top-3 left-3 z-10 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-all">
                            <button
                              onClick={(e) => handleQuickSave(e, movie)}
                              title="Deftere Ekle"
                              className={`w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-md border transition-all ${
                                quickSavedIds.has(movie.id)
                                  ? 'bg-amber-500/90 border-amber-400/60 text-black'
                                  : 'bg-black/60 border-white/20 text-white/80 hover:bg-amber-500/80 hover:text-black'
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

                        {movie.reason && (
                          <div className="p-4 space-y-1">
                            <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-amber-500/40">GURME NOTU</p>
                            <p className="text-xs font-serif text-amber-100/60 leading-relaxed">&ldquo;{movie.reason}&rdquo;</p>
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              {/* Bottom actions */}
              <div className="flex flex-wrap gap-4 justify-center pb-8">
                <button
                  onClick={() => { setPhase(PHASES.MOOD_SELECT); setMovies([]); }}
                  className="flex items-center gap-2 px-8 py-4 bg-amber-500 hover:bg-amber-400 text-black rounded-full text-[10px] font-bold uppercase tracking-widest transition-all shadow-[0_0_20px_rgba(245,158,11,0.2)]"
                >
                  <Sparkles size={14} /> Farklı Mood Dene
                </button>
                <button
                  onClick={handleLeaveRoom}
                  className="px-8 py-4 border border-white/10 text-amber-100/50 hover:text-amber-100 rounded-full text-[10px] font-bold uppercase tracking-widest hover:bg-white/5 transition-all"
                >
                  Seansı Bitir
                </button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* Film Detail Modal */}
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
