import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Copy, Check, Users, Sofa, Crown, UserPlus, Sparkles, Star, Eye, BookmarkPlus, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { MOODS } from '../context/MoodContext';
import { couchCreate, couchJoin, couchStatus, couchSelectMood, couchMovies, couchLeave, addToWatchlist, toggleWatched } from '../services/api';
import OptimizedImage from '../components/OptimizedImage';
import FilmDetailModal from '../components/FilmDetailModal';

const PHASES = { ENTRY: 'entry', LOBBY: 'lobby', MOOD_SELECT: 'mood_select', RESULTS: 'results' };
const moodList = Object.values(MOODS);

export default function CouchMode() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    connected: socketConnected,
    roomPresence,
    activeMoodId,
    joinRoom:          socketJoinRoom,
    selectMood:        socketSelectMood,
    leaveRoom:         socketLeaveRoom,
    syncRoomMoodView,
    startSharedSession,
    systemNotification,
    mirroredAction,
    sendHostInteraction,
    sendHostNavigation,
    // Global session state (persists across navigation)
    roomId:       globalRoomId,
    isHost:       globalIsHost,
    isLive:       globalIsLive,
    participants: globalParticipants,
  } = useSocket();

  // ── Local UI state ──
  // Phase recovers from global state on re-mount
  const [phase, setPhase] = useState(() => {
    if (globalRoomId && globalIsLive) return PHASES.MOOD_SELECT;
    if (globalRoomId) return PHASES.LOBBY;
    return PHASES.ENTRY;
  });
  const [roomCode, setRoomCode] = useState(globalRoomId || '');
  const [isHost, setIsHost] = useState(globalIsHost);
  const [roomData, setRoomData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [movies, setMovies] = useState([]);
  const [ustadNote, setUstadNote] = useState('');
  const [moodName, setMoodName] = useState('');
  const [detailMovieId, setDetailMovieId] = useState(null);
  const [detailInitialMovie, setDetailInitialMovie] = useState(null);
  const [quickSavedIds, setQuickSavedIds] = useState(new Set());
  const [quickWatchedIds, setQuickWatchedIds] = useState(new Set());

  // ── Recover session on re-mount (navigated away and came back) ──
  useEffect(() => {
    if (globalRoomId && !roomCode) {
      setRoomCode(globalRoomId);
      setIsHost(globalIsHost);
      if (globalIsLive) {
        setPhase(PHASES.MOOD_SELECT);
      } else {
        setPhase(PHASES.LOBBY);
      }
    }
  }, [globalRoomId, globalIsHost, globalIsLive]);

  // ── Sync global participants into local roomData for rendering ──
  useEffect(() => {
    if (globalParticipants.length > 0) {
      setRoomData(prev => {
        const members = globalParticipants.map((p) => ({
          user_id: p.userId,
          name: p.name,
          picture: prev?.members?.find(m => String(m.user_id) === String(p.userId))?.picture || null,
          role: (p.role || 'GUEST').toLowerCase(),
        }));
        return { ...(prev || {}), members };
      });
    }
  }, [globalParticipants]);

  // ── Also merge legacy roomPresence (fallback) ──
  useEffect(() => {
    if (!roomPresence || !roomCode) return;
    if (globalParticipants.length > 0) return; // prefer global
    setRoomData(prev => {
      if (!prev) return prev;
      const members = (roomPresence.connectedUsers || []).map((su, i) => {
        const existing = (prev.members || []).find(m => String(m.user_id) === String(su.id));
        return {
          user_id: su.id,
          name: su.name,
          picture: existing?.picture || null,
          role: existing?.role || (i === 0 ? 'host' : 'guest'),
        };
      });
      return { ...prev, members };
    });
  }, [roomPresence, roomCode, globalParticipants.length]);

  // ── Socket-driven phase transitions ──
  useEffect(() => {
    if (!activeMoodId || !roomCode) return;
    if (phase === PHASES.LOBBY || phase === PHASES.MOOD_SELECT) {
      fetchMoviesForMood(activeMoodId);
    }
  }, [activeMoodId, roomCode]);

  // ── When globalIsLive flips to true, advance to MOOD_SELECT ──
  useEffect(() => {
    if (globalIsLive && roomCode && (phase === PHASES.LOBBY || phase === PHASES.ENTRY)) {
      setPhase(PHASES.MOOD_SELECT);
    }
  }, [globalIsLive, roomCode]);

  // Use maximum of socket presence OR REST API member count
  const connectedUserCount = Math.max(
    globalParticipants.length,
    roomPresence?.connectedUsers?.length || 0,
    (roomData?.members || []).length,
  );

  // ── Auth guard (tüm hook'lardan sonra, render'dan önce) ──
  if (!user) {
    return (
      <div className="couch-page min-h-screen flex flex-col items-center justify-center gap-6 px-4">
        <Sofa size={48} style={{ color: 'var(--couch-accent)' }} className="opacity-60" />
        <p className="text-lg font-serif" style={{ color: 'var(--couch-text-muted)' }}>
          Birlikte izlemek için giriş yapman gerekiyor.
        </p>
        <button onClick={() => navigate('/profil')} className="couch-btn-accent px-8 py-3 rounded-full text-xs uppercase tracking-widest">
          Giriş Yap
        </button>
      </div>
    );
  }

  // ── Helpers ──
  const fetchMoviesForMood = async (moodId) => {
    try {
      const result = await couchMovies(roomCode);
      setMovies(result.movies || []);
      setUstadNote(result.ustad_notu || '');
      setMoodName(result.mood_name || '');
      setPhase(PHASES.RESULTS);
    } catch (err) {
      setError(err.message);
    }
  };

  // ── Handlers ──
  const handleCreateRoom = async () => {
    setLoading(true); setError(null);
    try {
      const data = await couchCreate();
      setRoomCode(data.room_code);
      const roomInfo = await couchStatus(data.room_code);
      setRoomData(roomInfo);
      setIsHost(true);
      // Pass hostFlag=true so global context persists it
      socketJoinRoom(data.room_code, String(user.id), user?.name || 'Sinemasever', true);
      setPhase(PHASES.LOBBY);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleJoinRoom = async () => {
    if (!joinCode.trim()) return;
    setLoading(true); setError(null);
    try {
      const data = await couchJoin(joinCode.trim().toUpperCase());
      setRoomCode(data.room_code);
      const roomInfo = await couchStatus(data.room_code);
      setRoomData(roomInfo);
      setIsHost(false);
      // Pass hostFlag=false
      socketJoinRoom(data.room_code, String(user.id), user?.name || 'Sinemasever', false);
      setPhase(PHASES.LOBBY);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleSelectMood = async (moodId) => {
    setLoading(true); setError(null);
    try {
      await couchSelectMood(roomCode, moodId);
      socketSelectMood(roomCode, moodId);
      // If host, sync navigation to guests
      if (isHost) {
        sendHostNavigation(roomCode, '/discover', { moodId });
      }
      const result = await couchMovies(roomCode);
      setMovies(result.movies || []);
      setUstadNote(result.ustad_notu || '');
      setMoodName(result.mood_name || '');
      setPhase(PHASES.RESULTS);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleLeaveRoom = async () => {
    try { await couchLeave(roomCode); } catch {}
    if (roomCode && user?.id) {
      socketLeaveRoom(roomCode, String(user.id));
    }
    setIsHost(false);
    setPhase(PHASES.ENTRY);
    setRoomCode(''); setRoomData(null); setMovies([]);
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
      nowWatched ? next.add(movie.id) : next.delete(movie.id);
      return next;
    });
    if (!quickSavedIds.has(movie.id)) {
      setQuickSavedIds(prev => new Set([...prev, movie.id]));
      try { await addToWatchlist(movie); } catch {}
    }
    try { await toggleWatched(movie.id); } catch {}
  };

  // ── Render ──
  return (
    <div className="couch-page min-h-screen font-sans relative overflow-hidden">
      {/* [TODO 3] Presence chime notification banner */}
      <AnimatePresence>
        {systemNotification && (
          <motion.div
            key="presence-toast"
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.28 }}
            className="fixed top-[72px] left-1/2 -translate-x-1/2 z-[60] pointer-events-none"
          >
            <div className="flex items-center gap-2.5 px-5 py-3 rounded-full text-xs font-bold uppercase tracking-[0.12em]"
              style={{
                background: 'rgba(245,158,11,0.13)',
                border: '1px solid rgba(245,158,11,0.30)',
                color: 'rgba(245,200,100,0.95)',
                backdropFilter: 'blur(12px)',
                boxShadow: '0 4px 20px rgba(245,158,11,0.15)',
              }}>
              <span style={{ fontSize: 14 }}>🎬</span>
              {systemNotification}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ambient orb */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="couch-ambient-orb absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full blur-[120px] couch-glow-pulse" />
      </div>

      {/* Header */}
      <header className="couch-header sticky top-0 z-50 pt-safe">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => phase === PHASES.ENTRY ? navigate('/') : handleLeaveRoom()} className="p-2 -ml-1 rounded-full transition-all hover:opacity-70">
              <ChevronLeft size={22} style={{ color: 'var(--couch-accent)' }} className="opacity-70" />
            </button>
            <div>
              <p className="couch-subtitle text-[9px] font-bold uppercase tracking-[0.5em]">GRUP SEANSI</p>
              <h1 className="font-serif text-xl sm:text-2xl font-bold tracking-tight" style={{ color: 'var(--couch-text)', letterSpacing: '0.03em' }}>Birlikte İzle</h1>
            </div>
          </div>
          {roomCode && (
            <div className="flex items-center gap-2">
              <span className="couch-subtitle text-[10px] font-bold uppercase tracking-widest">ODA</span>
              <span className="font-mono text-sm font-bold couch-accent-text">{roomCode}</span>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 relative z-10 pb-32">
        <AnimatePresence mode="wait">

          {/* ═══ ENTRY ═══ */}
          {phase === PHASES.ENTRY && (
            <motion.div key="entry" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-10">
              <div className="text-center space-y-4 pt-4">
                <div className="couch-badge inline-flex items-center justify-center w-20 h-20 rounded-full mb-4 couch-glow-pulse">
                  <Sofa size={36} style={{ color: 'var(--couch-accent)' }} />
                </div>
                <h2 className="font-serif text-3xl sm:text-4xl font-bold" style={{ color: 'var(--couch-text)', letterSpacing: '0.05em' }}>
                  Sinema Seansı Kuralım
                </h2>
                <p className="couch-muted text-sm font-serif font-light max-w-md mx-auto leading-relaxed">
                  Arkadaşınla aynı ruh halini paylaş, birlikte film seç. Üstad ikiniz için özenle seçecek.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-2xl mx-auto">
                {/* Create */}
                <motion.button
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  onClick={handleCreateRoom} disabled={loading}
                  className="couch-tile group relative p-8 rounded-3xl text-left space-y-4 disabled:opacity-50"
                >
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center transition-colors" style={{ background: 'var(--couch-accent-soft)' }}>
                    <Crown size={24} style={{ color: 'var(--couch-accent)' }} />
                  </div>
                  <div>
                    <h3 className="font-serif text-xl font-bold" style={{ color: 'var(--couch-text)', letterSpacing: '0.03em' }}>Oda Kur</h3>
                    <p className="couch-subtitle text-xs mt-1 font-serif font-light">Kod oluştur, arkadaşınla paylaş</p>
                  </div>
                </motion.button>

                {/* Join */}
                <div className="couch-tile relative p-8 rounded-3xl space-y-4">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'var(--couch-input-bg)' }}>
                    <UserPlus size={24} className="couch-muted" />
                  </div>
                  <div>
                    <h3 className="font-serif text-xl font-bold" style={{ color: 'var(--couch-text)', letterSpacing: '0.03em' }}>Odaya Katıl</h3>
                    <p className="couch-subtitle text-xs mt-1 font-serif font-light">Arkadaşının kodunu gir</p>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <input
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                      placeholder="SM-XXXX"
                      maxLength={7}
                      autoComplete="off"
                      autoCapitalize="characters"
                      autoCorrect="off"
                      spellCheck="false"
                      enterKeyHint="go"
                      className="couch-input flex-1 px-4 py-3 rounded-xl text-center font-mono text-lg font-bold tracking-widest"
                      onKeyDown={(e) => e.key === 'Enter' && handleJoinRoom()}
                    />
                    <button onClick={handleJoinRoom} disabled={!joinCode.trim() || loading}
                      className="couch-btn-accent px-5 py-3 rounded-xl text-xs uppercase tracking-wider">
                      Katıl
                    </button>
                  </div>
                </div>
              </div>

              {error && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center text-rose-400 text-sm font-serif">{error}</motion.p>
              )}
            </motion.div>
          )}

          {/* ═══ LOBBY ═══ */}
          {phase === PHASES.LOBBY && (
            <motion.div key="lobby" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-10">
              <div className="text-center space-y-6">
                <p className="couch-subtitle text-[10px] font-bold uppercase tracking-[0.4em]">ODA KODU</p>
                <div className="couch-badge inline-flex items-center gap-3 px-8 py-5 rounded-2xl">
                  <span className="font-mono text-4xl sm:text-5xl font-black tracking-[0.15em] couch-code-glow">
                    {roomCode}
                  </span>
                  <button onClick={handleCopyCode} className="p-2 rounded-lg transition-colors" style={{ background: 'var(--couch-accent-soft)' }} title="Kodu kopyala">
                    {copied ? <Check size={18} className="text-emerald-400" /> : <Copy size={18} style={{ color: 'var(--couch-accent)' }} />}
                  </button>
                </div>
                <p className="couch-subtitle text-xs font-serif font-light">Bu kodu arkadaşınla paylaş</p>

                <div className="flex justify-center gap-3">
                  <button onClick={() => {
                    const text = `Sinemood'da seninle film seçmek istiyorum! Oda kodum: ${roomCode}`;
                    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
                  }} className="px-5 py-2.5 rounded-full bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 text-[11px] font-bold uppercase tracking-wider hover:bg-emerald-600/30 transition-all">
                    WhatsApp ile Paylaş
                  </button>
                  <button onClick={handleCopyCode} className="couch-btn-ghost px-5 py-2.5 rounded-full text-[11px] font-bold uppercase tracking-wider">
                    {copied ? 'Kopyalandı!' : 'Kodu Kopyala'}
                  </button>
                </div>
              </div>

              <div className="max-w-sm mx-auto space-y-4">
                <p className="couch-subtitle text-[10px] font-bold uppercase tracking-[0.4em] text-center">ODADAKILER</p>
                <div className="space-y-3">
                  {(roomData?.members || []).map((member) => (
                    <div key={member.user_id} className="couch-member flex items-center gap-4 p-4 rounded-2xl">
                      {member.picture ? (
                        <img src={member.picture} alt="" className="w-10 h-10 rounded-full couch-avatar-ring object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-full couch-avatar-ring flex items-center justify-center" style={{ background: 'var(--couch-accent-soft)' }}>
                          <Users size={16} style={{ color: 'var(--couch-accent)' }} />
                        </div>
                      )}
                      <div className="flex-1">
                        <p className="font-serif font-bold text-sm" style={{ color: 'var(--couch-text)' }}>{member.name || 'Sinemasever'}</p>
                        <p className="couch-subtitle text-[10px] uppercase tracking-wider font-bold">
                          {member.role === 'host' ? 'Ev Sahibi' : 'Misafir'}
                        </p>
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-500">Hazır</span>
                    </div>
                  ))}

                  {(roomData?.members || []).length < 2 && (
                    <div className="flex items-center gap-4 p-4 rounded-2xl border border-dashed" style={{ borderColor: 'var(--couch-member-border)' }}>
                      <div className="w-10 h-10 rounded-full flex items-center justify-center couch-avatar-ring couch-glow-pulse" style={{ background: 'var(--couch-input-bg)' }}>
                        <UserPlus size={16} className="couch-subtitle" />
                      </div>
                      <div className="flex-1">
                        <p className="couch-subtitle font-serif text-sm">Arkadaşın bekleniyor...</p>
                      </div>
                      <span className="couch-waiting-dots couch-subtitle text-xs font-bold">...</span>
                    </div>
                  )}
                </div>
              </div>

              {connectedUserCount >= 2 && (
                (isHost || roomData?.is_host) ? (
                  <div className="text-center mt-6 max-w-sm mx-auto">
                    <button
                      onClick={() => {
                        startSharedSession(roomCode);
                        setTimeout(() => setPhase(PHASES.MOOD_SELECT), 1500);
                      }}
                      className="couch-btn-accent w-full py-4 rounded-2xl text-xs font-bold uppercase tracking-widest shadow-[0_0_20px_rgba(245,158,11,0.25)] hover:scale-[1.02] transition-all"
                    >
                      Seansı Başlat & Mood Seçimine Geç
                    </button>
                  </div>
                ) : (
                  <div className="text-center mt-6 p-4 rounded-2xl bg-amber-500/5 border border-amber-500/10 animate-pulse max-w-sm mx-auto">
                    <p className="font-serif italic text-sm text-amber-200/80">Ev sahibinin seansı başlatması bekleniyor...</p>
                  </div>
                )
              )}

              <div className="text-center mt-8">
                <button onClick={handleLeaveRoom} className="couch-subtitle text-[10px] font-bold uppercase tracking-widest hover:text-rose-400 transition-colors">
                  <LogOut size={12} className="inline mr-1" /> Odadan Ayrıl
                </button>
              </div>
            </motion.div>
          )}

          {/* ═══ MOOD SELECT ═══ */}
          {phase === PHASES.MOOD_SELECT && (
            <motion.div key="mood-select" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-8">
              <div className="text-center space-y-3">
                <p className="couch-subtitle text-[10px] font-bold uppercase tracking-[0.4em]">HERKES HAZIR</p>
                <h2 className="font-serif text-2xl sm:text-3xl font-bold" style={{ color: 'var(--couch-text)', letterSpacing: '0.05em' }}>
                  Bu Gece Ne Mood'dasınız?
                </h2>
                <p className="couch-muted text-xs font-serif font-light">
                  {(isHost || roomData?.is_host) ? 'Mood seçimi sende — bilgece seç.' : 'Ev sahibi mood seçecek...'}
                </p>
                <div className="flex justify-center gap-2 mt-4">
                  {(roomData?.members || []).map((m) => (
                    <div key={m.user_id} className="couch-badge flex items-center gap-2 px-3 py-1.5 rounded-full">
                      {m.picture && <img src={m.picture} alt="" className="w-5 h-5 rounded-full" />}
                      <span className="text-[10px] font-bold">{m.name?.split(' ')[0] || 'Sinemasever'}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 max-w-3xl mx-auto">
                {moodList.map((mood, i) => {
                  const Icon = mood.icon;
                  const canSelect = isHost || roomData?.is_host;
                  const isMirrored = mirroredAction?.actionType === 'mood_hover'
                    && mirroredAction?.payload?.moodId === mood.id;
                  return (
                    <motion.button
                      key={mood.id}
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                      onClick={() => canSelect && handleSelectMood(mood.id)}
                      onMouseEnter={() => {
                        if (canSelect) sendHostInteraction(roomCode, 'mood_hover', { moodId: mood.id });
                      }}
                      onMouseLeave={() => {
                        if (canSelect) sendHostInteraction(roomCode, 'mood_hover', { moodId: null });
                      }}
                      disabled={!canSelect || loading}
                      className={`couch-mood-card relative p-5 rounded-2xl text-left group transition-all ${
                        isMirrored
                          ? 'ring-2 ring-amber-400/70 scale-[1.04] shadow-[0_0_18px_rgba(245,158,11,0.35)]'
                          : ''
                      }`}
                    >
                      {isMirrored && (
                        <span className="absolute top-2 right-2 text-[9px] font-bold uppercase tracking-wider text-amber-400/80">
                          seçiyor...
                        </span>
                      )}
                      <Icon size={20} className="couch-accent-text opacity-60 group-hover:opacity-100 transition-opacity mb-3" />
                      <h3 className="font-serif text-sm font-bold" style={{ color: 'var(--couch-text)' }}>{mood.title}</h3>
                      <p className="couch-subtitle text-[9px] mt-1 font-serif font-light line-clamp-2">{mood.subtitle}</p>
                    </motion.button>
                  );
                })}
              </div>

              {error && <p className="text-center text-rose-400 text-sm font-serif">{error}</p>}
            </motion.div>
          )}

          {/* ═══ RESULTS ═══ */}
          {phase === PHASES.RESULTS && (
            <motion.div key="results" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-10">
              {ustadNote && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                  className="couch-ustad-note p-8 md:p-10 rounded-[2rem]">
                  <p className="couch-subtitle text-[9px] font-bold uppercase tracking-[0.5em] mb-3 text-center">ÜSTAD'DAN GRUP NOTU</p>
                  <p className="text-xl md:text-2xl font-serif italic font-medium leading-relaxed text-center" style={{ color: 'var(--couch-text)', opacity: 0.85 }}>
                    &ldquo;{ustadNote}&rdquo;
                  </p>
                </motion.div>
              )}

              <div className="flex flex-wrap items-center justify-center gap-3">
                <span className="couch-badge px-4 py-2 rounded-full text-[11px] font-bold uppercase tracking-wider">
                  {moodName}
                </span>
                {(roomData?.members || []).map((m) => (
                  <span key={m.user_id} className="couch-member flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold" style={{ color: 'var(--couch-text-muted)' }}>
                    {m.picture && <img src={m.picture} alt="" className="w-4 h-4 rounded-full" />}
                    {m.name?.split(' ')[0]}
                  </span>
                ))}
              </div>

              {movies.length > 0 && (
                <div className="space-y-6">
                  <p className="couch-subtitle text-[10px] font-bold uppercase tracking-[0.4em]">BU GECE İÇİN SEÇTİKLERİMİZ</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {movies.map((movie, i) => (
                      <motion.div
                        key={movie.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 + i * 0.08 }}
                        className="couch-movie-card rounded-[2rem] overflow-hidden group cursor-pointer"
                        onClick={() => { setDetailInitialMovie(movie); setDetailMovieId(movie.id); }}
                      >
                        <div className="aspect-[2/3] relative overflow-hidden">
                          <OptimizedImage src={movie.poster_url} alt={movie.title} fallbackTitle={movie.title} aspect="poster" size="md" className="w-full h-full" />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                          <div className="absolute bottom-4 left-4 right-4">
                            <h3 className="text-lg font-serif font-bold text-white drop-shadow-lg line-clamp-2">{movie.title}</h3>
                            <div className="flex items-center gap-3 mt-1.5">
                              <span className="flex items-center gap-1 text-[11px] font-bold" style={{ color: 'var(--couch-accent)' }}>
                                <Star size={11} fill="currentColor" />{movie.vote_average?.toFixed(1)}
                              </span>
                              {movie.release_date && <span className="text-[10px] text-white/40">{movie.release_date?.split('-')[0]}</span>}
                            </div>
                          </div>
                          {/* Quick actions */}
                          <div className="absolute top-3 left-3 z-10 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-all">
                            <button onClick={(e) => handleQuickSave(e, movie)} title="Deftere Ekle"
                              className={`w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-md border transition-all ${
                                quickSavedIds.has(movie.id) ? 'bg-amber-500/90 border-amber-400/60 text-black' : 'bg-black/60 border-white/20 text-white/80 hover:bg-amber-500/80 hover:text-black'
                              }`}>
                              {quickSavedIds.has(movie.id) ? <Check size={12} /> : <BookmarkPlus size={12} />}
                            </button>
                            <button onClick={(e) => handleQuickWatched(e, movie)} title="İzledim"
                              className={`w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-md border transition-all ${
                                quickWatchedIds.has(movie.id) ? 'bg-emerald-500/90 border-emerald-400/60 text-white' : 'bg-black/60 border-white/20 text-white/80 hover:bg-emerald-500/80 hover:text-white'
                              }`}>
                              {quickWatchedIds.has(movie.id) ? <Check size={12} /> : <Eye size={12} />}
                            </button>
                          </div>
                        </div>
                        {movie.reason && (
                          <div className="p-4 space-y-1">
                            <p className="couch-subtitle text-[9px] font-bold uppercase tracking-[0.3em]">GURME NOTU</p>
                            <p className="couch-muted text-xs font-serif font-light leading-relaxed">&ldquo;{movie.reason}&rdquo;</p>
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-4 justify-center pb-8">
                <button onClick={() => { setPhase(PHASES.MOOD_SELECT); setMovies([]); }}
                  className="couch-btn-accent flex items-center gap-2 px-8 py-4 rounded-full text-[10px] uppercase tracking-widest">
                  <Sparkles size={14} /> Farklı Mood Dene
                </button>
                <button onClick={handleLeaveRoom}
                  className="couch-btn-ghost px-8 py-4 rounded-full text-[10px] uppercase tracking-widest font-bold">
                  Seansı Bitir
                </button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {detailMovieId && (
        <FilmDetailModal movieId={detailMovieId} initialMovie={detailInitialMovie}
          onClose={() => { setDetailMovieId(null); setDetailInitialMovie(null); }} />
      )}
    </div>
  );
}
