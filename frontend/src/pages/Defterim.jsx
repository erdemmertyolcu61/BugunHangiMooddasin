import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Trash2, Edit3, Save, X, Book, Star, MessageCircle, Check, Brain, Heart, RefreshCw, Eye, EyeOff, Share2, Copy, Film, ListPlus, Users, RotateCcw, Mic, MicOff, BookOpen } from 'lucide-react';
import useSpeechRecognition from '../hooks/useSpeechRecognition';
import { motion, AnimatePresence } from 'framer-motion';
import { getWatchlist, removeFromWatchlist, saveNote, getNote, getTasteMap, proxyImageUrl, toggleWatched, saveRating, recommendToCommunity, unrecommendFromCommunity, getCommunityRecommendations } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { getApiUrl, getShareUrl, resolveAvatarUrl } from '../utils/apiConfig';
import TasteMapCard from '../components/TasteMapCard';
import RatingControl from '../components/RatingControl';
import CustomListsPanel from '../components/CustomListsPanel';
import FilmDetailModal from '../components/FilmDetailModal';
import { useAchievements } from '../components/AchievementCelebration';
import { ListelerAnasayfa } from './Listeler';

const IMG_BASE = 'https://image.tmdb.org/t/p/w1280';

/** ISO → clean Turkish date: "20 Mayıs 2026" */
const formatDefterDate = (iso) => {
  if (!iso) return '';
  try {
    const d = new Date(String(iso).trim().replace(' ', 'T'));
    if (isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
  } catch { return ''; }
};

export default function Defterim() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { check: checkMilestones } = useAchievements();
  const [savedMovies, setSavedMovies] = useState([]);
  const [watchedIds, setWatchedIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [noteDraft, setNoteDraft] = useState('');

  // Speech Recognition Hook
  const { isSupported, isListening, startListening, stopListening } = useSpeechRecognition({
    onResult: (transcript) => {
      setNoteDraft(prev => (prev ? prev + ' ' : '') + transcript);
    },
    onError: (err) => {
      console.error('Speech recognition error in Defterim:', err);
    }
  });

  const handleMicClick = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  useEffect(() => {
    if (editingId === null) {
      stopListening();
    }
  }, [editingId, stopListening]);
  const [tasteMap, setTasteMap] = useState(null);
  const [tasteLoading, setTasteLoading] = useState(true);
  const [defterTab, setDefterTab] = useState('movies'); // 'movies' | 'lists'
  const [detailMovie, setDetailMovie] = useState(null);
  const [recommenders, setRecommenders] = useState([]);
  const [recommending, setRecommending] = useState(false);

  const handleCardReaction = (id, next) => {
    setSavedMovies(prev => prev.map(m => m.tmdb_id === id ? { ...m, reaction: next.reaction } : m));
    saveRating(id, { reaction: next.reaction });
  };

  // ── Başarımlar: tespit burada (izledim/not aksiyonları), kutlama global ──
  // Rozet arayüzü Profil > Başarımlar sekmesinde. Buradaki etki yeni açılan
  // başarımı yakalar → global "Başarım Kazanıldı" animasyonu tetiklenir.
  const milestoneStats = useMemo(() => ({
    saved: savedMovies.length,
    watched: watchedIds.size,
    notes: savedMovies.filter((m) => (m.personal_note || '').trim()).length,
  }), [savedMovies, watchedIds]);

  useEffect(() => {
    if (loading) return;
    checkMilestones(milestoneStats);
  }, [milestoneStats, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchWatchlist = async () => {
    setLoading(true);
    try {
      const data = await getWatchlist();
      setSavedMovies(data.movies || []);
      const watched = new Set((data.movies || []).filter(m => m.watched).map(m => m.tmdb_id));
      setWatchedIds(watched);
    } catch (err) {
      console.error('Liste yüklenemedi:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTasteMap = async () => {
    setTasteLoading(true);
    try {
      const data = await getTasteMap();
      setTasteMap(data);
    } catch (err) {
      console.error('Zevk haritası alınamadı:', err);
      setTasteMap({
        dynamic_title: 'Sinema Ruhu',
        top_moods: [], mood_pct: {}, mood_full: {},
        top_genres: [], summary: [],
        signals: { total_movies: 0 },
        confidence: 'low', _error: true,
      });
    } finally {
      setTasteLoading(false);
    }
  };

  useEffect(() => {
    fetchWatchlist();
    fetchTasteMap();
  }, []);

  const handleRemove = async (id) => {
    try {
        await removeFromWatchlist(id);
        setSavedMovies(prev => prev.filter(m => m.tmdb_id !== id));
        setWatchedIds(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
    } catch (err) {
        console.error('Silme hatası:', err);
    }
  };

  const startEditing = async (movie) => {
    setEditingId(movie.tmdb_id);
    try {
        const data = await getNote(movie.tmdb_id);
        setNoteDraft(data.note || '');
    } catch {
        setNoteDraft('');
    }
  };

  const handleSaveNote = async (id) => {
    try {
        await saveNote(id, noteDraft);
        setSavedMovies(prev => prev.map(m =>
            m.tmdb_id === id ? { ...m, personal_note: noteDraft } : m
        ));
        setEditingId(null);
    } catch (err) {
        console.error('Not kaydedilemedi:', err);
    }
  };

  const [shareCopiedId, setShareCopiedId] = useState(null);
  const handleShare = async (movie) => {
    const shareUrl = getShareUrl(`/share/${movie.tmdb_id}`);
    const note = (movie.personal_note || '').trim();
    const shareData = {
      title: `${movie.title} | Sinemood`,
      text: note ? `"${note.slice(0, 140)}"` : `${movie.title} | Sinemood defterimden.`,
      url: shareUrl,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(shareUrl);
        setShareCopiedId(movie.tmdb_id);
        setTimeout(() => setShareCopiedId(null), 2000);
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        await navigator.clipboard.writeText(shareUrl).catch(() => {});
        setShareCopiedId(movie.tmdb_id);
        setTimeout(() => setShareCopiedId(null), 2000);
      }
    }
  };

  const handleToggleWatched = async (tmdbId) => {
    try {
        const result = await toggleWatched(tmdbId);
        setWatchedIds(prev => {
            const next = new Set(prev);
            if (result.watched) next.add(tmdbId);
            else next.delete(tmdbId);
            return next;
        });
    } catch (err) {
        console.error('İzlendi hatası:', err);
    }
  };

  // Normalize mood_pct to always sum to 100
  const rawMoodPct = tasteMap?.mood_pct || {};
  const rawTotal = Object.values(rawMoodPct).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0);
  const normalizedMoodPct = rawTotal > 0
    ? Object.fromEntries(Object.entries(rawMoodPct).map(([k, v]) => [k, (v / rawTotal) * 100]))
    : rawMoodPct;

  useEffect(() => {
    if (!detailMovie?.id) { setRecommenders([]); return; }
    let active = true;
    setRecommenders([]);
    getCommunityRecommendations(detailMovie.id).then((d) => {
      if (active) setRecommenders(d.recommenders || []);
    });
    return () => { active = false; };
  }, [detailMovie?.id]);

  const alreadyRecommended = recommenders.some((r) => user && r.uid === user.id);

  const handleRecommendFromDetail = async () => {
    if (!detailMovie || recommending) return;
    setRecommending(true);
    try {
      if (alreadyRecommended) {
        await unrecommendFromCommunity(detailMovie.id);
        setRecommenders((prev) => prev.filter((r) => !(user && r.uid === user.id)));
      } else {
        const res = await recommendToCommunity(detailMovie.id);
        setRecommenders((prev) => {
          const without = prev.filter((r) => r.uid !== res.shared_by.uid);
          return [res.shared_by, ...without];
        });
      }
    } catch (err) {
      console.error('Topluluk önerisi güncellenemedi:', err);
    } finally {
      setRecommending(false);
    }
  };

  const openMovieDetail = async (movie) => {
    const m = { id: movie.tmdb_id, ...movie };
    setDetailMovie(m);
    try {
      const res = await fetch(getApiUrl(`/api/movies/${movie.tmdb_id}/analyze`));
      if (res.ok) {
        const data = await res.json();
        setDetailMovie((prev) => ({ ...prev, ...data }));
      }
    } catch {}
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="min-h-screen bg-[#120d0b] text-ivory font-sans relative overflow-hidden">
      <div className="vignette vignette-active" style={{"--vignette-color": "#1c1512"}} />
      <div className="fixed inset-0 pointer-events-none z-[999] opacity-[0.03] mix-blend-overlay" 
           style={{ backgroundImage: "url('https://www.transparenttextures.com/patterns/natural-paper.png')" }} />

      <header className="sticky top-0 z-50 bg-[#120d0b]/98 border-b border-white/5 pt-safe">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 sm:py-10 flex items-center justify-between flex-wrap gap-4 sm:gap-6">
          <div className="flex items-center gap-3 sm:gap-8">
            <button onClick={() => navigate('/')} className="w-12 h-12 sm:w-14 sm:h-14 shrink-0 flex items-center justify-center hover:bg-white/5 rounded-full border border-white/10 transition-all">
              <ChevronLeft size={22} />
            </button>
            <div>
              <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.5em] sm:tracking-[0.8em] text-amber/40 mb-1">KİŞİSEL ARŞİV</p>
              <h1 className="font-serif text-3xl sm:text-6xl font-bold tracking-tighter">Defterim<span className="text-amber">.</span></h1>
            </div>
          </div>
          <div className="flex items-center gap-3 sm:gap-4 text-[10px] font-bold uppercase tracking-[0.3em] sm:tracking-[0.4em] opacity-40">
            <Book size={16} className="text-amber" /> {savedMovies.length} KAYITLI
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-16 pb-nav">
        {loading ? (
          <div className="space-y-4 py-4">
            <div className="flex gap-1 p-1 mb-8 rounded-full bg-white/5 border border-white/5 max-w-sm animate-pulse">
              <div className="h-9 flex-1 rounded-full bg-white/8" />
              <div className="h-9 flex-1 rounded-full bg-white/4" />
            </div>
            {[...Array(5)].map((_, i) => (
              <div key={i} className="animate-pulse flex gap-4 p-4 rounded-2xl bg-white/[0.02] border border-white/5">
                <div className="w-16 h-24 rounded-xl bg-white/8 shrink-0" />
                <div className="flex-1 space-y-2.5 py-1">
                  <div className="h-4 bg-white/8 rounded w-3/5" />
                  <div className="h-3 bg-white/6 rounded w-2/5" />
                  <div className="h-3 bg-white/6 rounded w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* Sekme şeridi: Filmler / Listelerim / Platform Listeleri */}
            <div className="flex gap-1 p-1 mb-8 sm:mb-10 rounded-full bg-white/5 border border-white/10 max-w-md">
              {[
                { id: 'movies', label: 'Filmler', icon: Film },
                { id: 'lists', label: 'Listelerim', icon: ListPlus },
                { id: 'platform_lists', label: 'Platform Listeleri', icon: BookOpen },
              ].map(t => (
                <button key={t.id} onClick={() => setDefterTab(t.id)}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-full text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.05em] sm:tracking-[0.1em] transition-all ${
                    defterTab === t.id ? 'bg-amber/15 text-amber border border-amber/20' : 'text-ivory/40 hover:text-ivory/60'
                  }`}>
                  <t.icon size={13} className="shrink-0" /> {t.label}
                </button>
              ))}
            </div>

            {defterTab === 'lists' ? (
              <CustomListsPanel user={user} />
            ) : defterTab === 'platform_lists' ? (
              <ListelerAnasayfa embed={true} />
            ) : savedMovies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 sm:py-40 space-y-8 sm:space-y-10 px-4">
             <div className="w-28 h-28 sm:w-40 sm:h-40 rounded-full border border-white/5 flex items-center justify-center opacity-10 bg-white/5"><Book size={48} /></div>
             <div className="text-center space-y-6">
                <h2 className="text-3xl sm:text-5xl font-serif italic text-ivory/20 tracking-tight">Henüz bir not düşülmemiş...</h2>
                <button onClick={() => navigate('/')} className="px-10 sm:px-12 py-5 bg-amber text-bg font-bold uppercase text-[10px] tracking-[0.3em] rounded-full hover:scale-105 transition-transform shadow-xl shadow-amber/10">Keşfe Çık →</button>
             </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-8 sm:gap-16">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="p-5 sm:p-16 rounded-2xl sm:rounded-[4rem] bg-white/5 border border-white/5 relative overflow-hidden gurme-border">
                <div className="absolute inset-0 bg-gradient-to-r from-amber/5 to-transparent opacity-40" />
                <p className="text-sm sm:text-3xl font-serif italic leading-relaxed relative z-10 max-w-4xl text-ivory/60">
                    "Bu sayfalarda sadece filmler değil, o filmlerin ruhunda bıraktığı izler saklı. Her bir kare, bir anı; her bir not, bir duygu..."
                </p>
            </motion.div>

            {/* ═══ Zevk Haritası — Sinematik Analiz Kartı ═══ */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <div className="rounded-[2rem] sm:rounded-[3rem] border border-white/[0.08] relative overflow-hidden">
                {/* Atmospheric background layers */}
                <div className="absolute inset-0 bg-gradient-to-br from-amber-500/[0.04] via-transparent to-purple-600/[0.03]" />
                <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-amber-500/[0.06] to-transparent blur-[120px] rounded-full pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-gradient-to-tr from-purple-600/[0.04] to-transparent blur-[80px] rounded-full pointer-events-none" />

                {/* Header band */}
                <div className="relative z-10 px-8 sm:px-12 pt-8 sm:pt-10 pb-6 border-b border-white/[0.05]">
                  <div className="flex items-center gap-4 sm:gap-5">
                    <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shadow-[0_4px_24px_rgba(245,158,11,0.25)]">
                      <Brain size={24} className="text-[#120d0b]" />
                    </div>
                    <div className="flex-1">
                      <h2 className="text-xl sm:text-2xl font-serif font-bold tracking-tight text-[#f5f2eb]">Zevk Haritam</h2>
                      <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.25em] text-amber/50 mt-0.5">Kişisel Sinema Profilin</p>
                    </div>
                    <button onClick={fetchTasteMap} className="w-9 h-9 rounded-full border border-white/10 flex items-center justify-center text-amber/40 hover:text-amber hover:border-amber/30 transition-all" title="Yenile">
                      <RefreshCw size={14} className={tasteLoading ? 'animate-spin' : ''} />
                    </button>
                  </div>
                </div>

                {/* Content */}
                <div className="relative z-10 px-8 sm:px-12 py-8 sm:py-10">
                  {tasteLoading ? (
                    <div className="flex items-center justify-center gap-3 py-12">
                      <div className="flex gap-2">
                        {[0, 1, 2].map(i => (
                          <motion.div key={i} className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#d4af37' }}
                            animate={{ opacity: [0.2, 1, 0.2] }}
                            transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.25 }} />
                        ))}
                      </div>
                      <span className="text-sm font-serif italic text-[#f5f2eb]/40">Zevk haritan hazırlanıyor...</span>
                    </div>
                  ) : tasteMap && tasteMap.confidence !== "low" ? (
                    <div className="space-y-8">
                      {/* Dynamic title — hero typography */}
                      {tasteMap.dynamic_title && (
                        <div>
                          <p className="text-2xl sm:text-3xl font-serif font-bold text-amber tracking-tight leading-snug">
                            {tasteMap.dynamic_title}
                          </p>
                          <div className="w-16 h-[2px] bg-gradient-to-r from-amber/60 to-transparent mt-3 rounded-full" />
                        </div>
                      )}

                      {/* Mood chips — renkli sinema DNA'n */}
                      {tasteMap.top_moods && tasteMap.top_moods.length > 0 && (
                        <div className="space-y-3">
                          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#f5f2eb]/30">Sinema DNA'n</p>
                          <div className="flex flex-wrap gap-2.5">
                            {tasteMap.top_moods.slice(0, 5).map(m => {
                              const MOOD_COLORS = {
                                battaniye: '#f59e0b', gece: '#94a3b8', gozyasi: '#ec4899',
                                askbahcesi: '#f43f5e', kahkaha: '#10b981', adrenalin: '#ef4444',
                                yolculuk: '#10b981', zamanyolcusu: '#f59e0b', sessiz: '#a8a29e',
                                zihin: '#8b5cf6', kalp: '#ec4899', karmakar: '#f97316',
                                sipsak: '#d4af37', 'deep-chills': '#3b82f6',
                                'kadraj-estetigi': '#a855f7', 'geceyarisi-itirafi': '#6366f1',
                              };
                              const dotColor = MOOD_COLORS[m.mood_id] || '#d4af37';
                              const pct = normalizedMoodPct[m.mood_id];
                              return (
                                <span key={m.mood_id}
                                  className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full
                                    bg-white/[0.06] border border-white/[0.08] backdrop-blur-sm
                                    text-[13px] font-semibold text-[#f5f2eb]/80 transition-all hover:border-white/15">
                                  <span className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
                                    style={{ backgroundColor: dotColor, boxShadow: `0 0 8px ${dotColor}40` }} />
                                  {m.title}
                                  {pct != null && (
                                    <span className="text-[11px] font-bold text-[#f5f2eb]/40 ml-0.5">%{Math.round(pct)}</span>
                                  )}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Mood distribution bars */}
                      {Object.keys(normalizedMoodPct).length > 0 && (
                        <div className="space-y-2.5">
                          {(() => {
                            const topMoodSet = new Set((tasteMap.top_moods || []).map(m => m.mood_id));
                            return Object.entries(normalizedMoodPct).slice(0, 4).map(([mid, pct]) => {
                              const MOOD_COLORS = {
                                battaniye: '#f59e0b', gece: '#94a3b8', gozyasi: '#ec4899',
                                askbahcesi: '#f43f5e', kahkaha: '#10b981', adrenalin: '#ef4444',
                                yolculuk: '#10b981', zamanyolcusu: '#f59e0b', sessiz: '#a8a29e',
                                zihin: '#8b5cf6', kalp: '#ec4899', karmakar: '#f97316',
                                sipsak: '#d4af37', 'deep-chills': '#3b82f6',
                                'kadraj-estetigi': '#a855f7', 'geceyarisi-itirafi': '#6366f1',
                              };
                              const moodObj = tasteMap.top_moods?.find(m => m.mood_id === mid);
                              const label = moodObj?.title || mid.replace('-', ' ');
                              const barColor = MOOD_COLORS[mid] || '#d4af37';
                              const isTop = topMoodSet.has(mid);
                              return (
                                <div key={mid} className="flex items-center gap-3">
                                  <span className="text-[12px] font-semibold text-[#f5f2eb]/60 w-24 sm:w-32 min-w-0 capitalize">
                                    {label}
                                  </span>
                                  <div className="flex-1 h-2 rounded-full bg-white/[0.06] overflow-hidden">
                                    <motion.div
                                      initial={{ width: 0 }}
                                      animate={{ width: `${Math.min(pct, 100)}%` }}
                                      transition={{ duration: 1, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
                                      className="h-full rounded-full"
                                      style={{ backgroundColor: barColor, opacity: 0.75 }}
                                    />
                                  </div>
                                  <span className="text-[12px] font-bold text-[#f5f2eb]/50 w-10 text-right tabular-nums">
                                    %{Math.round(pct)}
                                  </span>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      )}

                      {/* Divider */}
                      {tasteMap.summary && tasteMap.summary.length > 0 && (
                        <div className="h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
                      )}

                      {/* Üstad'ın Detaylı Analizi */}
                      {tasteMap.summary && tasteMap.summary.length > 0 && (
                        <div className="space-y-4">
                          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-amber/40 flex items-center gap-2">
                            Üstad'ın Analizi
                          </p>
                          <div className="space-y-4 pl-4 border-l-2 border-amber/15">
                            {tasteMap.summary.slice(0, 5).map((s, i) => (
                              <motion.p
                                key={i}
                                initial={{ opacity: 0, x: -8 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.3 + i * 0.1 }}
                                className="text-[15px] sm:text-[16px] font-serif italic text-[#f5f2eb]/80 leading-[1.75] tracking-wide"
                              >
                                &ldquo;{s}&rdquo;
                              </motion.p>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Footer: Confidence + Signals */}
                      <div className="flex items-center gap-3 sm:gap-4 flex-wrap pt-2">
                        <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-[11px] font-bold uppercase tracking-[0.15em] ${
                          tasteMap.confidence === 'high'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : tasteMap.confidence === 'medium'
                            ? 'bg-amber/10 text-amber border border-amber/20'
                            : 'bg-white/5 text-[#f5f2eb]/30 border border-white/[0.06]'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            tasteMap.confidence === 'high' ? 'bg-emerald-400' :
                            tasteMap.confidence === 'medium' ? 'bg-amber' : 'bg-white/30'
                          }`} />
                          {tasteMap.confidence === 'high' ? 'Oluştu' :
                           tasteMap.confidence === 'medium' ? 'Oluşuyor' : 'Başlangıç'}
                        </span>
                        <span className="text-[11px] font-bold text-[#f5f2eb]/25 uppercase tracking-wider">
                          {tasteMap.signals?.total_movies || 0} film sinyali
                        </span>
                      </div>

                      {/* Zevk Haritamı Paylaş */}
                      <div className="pt-4">
                        <TasteMapCard
                          tasteMap={tasteMap}
                          username={user?.name || ''}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-5 py-4">
                      <p className="text-[16px] font-serif italic text-[#f5f2eb]/60 leading-relaxed max-w-lg">
                        &ldquo;Zevk haritan henüz oluşuyor. Birkaç filmi defterine ekledikçe, not yazdıkça seni daha iyi tanıyacağız.&rdquo;
                      </p>
                      <div className="flex flex-wrap gap-4 text-[11px] font-bold uppercase tracking-[0.2em]">
                        <span className="text-amber/50 flex items-center gap-2"><Book size={13} /> Film ekle</span>
                        <span className="text-[#f5f2eb]/15">·</span>
                        <span className="text-amber/50 flex items-center gap-2"><MessageCircle size={13} /> Not yaz</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>

            {savedMovies.map((movie, i) => (
              <motion.div 
                layout 
                key={movie.tmdb_id} 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="bg-surface rounded-2xl sm:rounded-[4rem] border border-white/5 overflow-hidden flex flex-col md:flex-row shadow-2xl group relative"
              >
                <div className="noise-overlay" />
                <button onClick={() => openMovieDetail(movie)} className="w-full md:w-80 lg:w-96 aspect-[16/10] sm:aspect-[2/3] md:aspect-auto relative overflow-hidden text-left">
                    <img 
                        src={proxyImageUrl(movie.poster_url) || 'https://via.placeholder.com/500x750'}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover transition-transform duration-700 md:group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent to-surface/40" />
                </button>
                
                <div className="flex-1 p-5 sm:p-12 lg:p-20 flex flex-col justify-between space-y-6 sm:space-y-12">
                  <div className="space-y-4 sm:space-y-8">
                    <div className="flex justify-between items-start gap-3 sm:gap-4">
                        <div className="space-y-1.5 sm:space-y-2 min-w-0">
                            <h3 className="text-2xl sm:text-5xl lg:text-6xl font-serif font-bold tracking-tighter leading-snug sm:leading-none group-hover:text-amber transition-colors duration-500 break-words">{movie.title}</h3>
                            <div className="flex items-center gap-4 opacity-30">
                                <span className="text-[9px] sm:text-xs font-bold uppercase tracking-widest">
                                  {watchedIds.has(movie.tmdb_id) && movie.watched_at
                                    ? `${formatDefterDate(movie.watched_at)} tarihinde izlendi`
                                    : `${formatDefterDate(movie.added_at)} tarihinde eklendi`}
                                </span>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                          <button
                              onClick={() => handleShare(movie)}
                              title="Paylaş"
                              className="w-9 h-9 sm:w-14 sm:h-14 flex items-center justify-center rounded-full border border-white/10 text-ivory/30 hover:text-amber hover:border-amber/40 transition-all duration-500"
                          >
                              {shareCopiedId === movie.tmdb_id ? <Copy size={16} className="sm:w-5 sm:h-5" /> : <Share2 size={16} className="sm:w-5 sm:h-5" />}
                          </button>
                          <button
                              onClick={() => handleRemove(movie.tmdb_id)}
                              className="w-9 h-9 sm:w-14 sm:h-14 flex items-center justify-center rounded-full border border-white/10 text-ivory/20 hover:text-red-500 hover:border-red-500/30 transition-all duration-500"
                          >
                              <Trash2 size={16} className="sm:w-5 sm:h-5" />
                          </button>
                        </div>
                    </div>
                    
                    <div className="h-px bg-white/5 w-full" />
                    
                    <div className="space-y-4 sm:space-y-6">
                        <div className="flex items-center justify-between">
                            <p className="text-[9px] sm:text-[11px] font-bold uppercase tracking-[0.3em] sm:tracking-[0.4em] text-amber/40 flex items-center gap-2 sm:gap-3">
                                <MessageCircle size={12} className="sm:w-[14px] sm:h-[14px]" /> GURME NOTU
                            </p>
                            {editingId !== movie.tmdb_id && (
                                <button onClick={() => startEditing(movie)} className="flex items-center gap-1.5 sm:gap-2 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-ivory/20 hover:text-amber transition-all">
                                    <Edit3 size={12} className="sm:w-[14px] sm:h-[14px]" /> Düzenle
                                </button>
                            )}
                        </div>
                        
                        <AnimatePresence mode="wait">
                            {editingId === movie.tmdb_id ? (
                                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4 sm:space-y-6">
                                    <textarea
                                        autoFocus
                                        value={noteDraft}
                                        onChange={(e) => setNoteDraft(e.target.value)}
                                        placeholder="Bu başyapıt sende nasıl bir iz bıraktı?"
                                        className="w-full h-28 sm:h-40 bg-black/40 border border-white/10 rounded-xl sm:rounded-[2rem] p-4 sm:p-8 text-sm sm:text-2xl font-playfair italic text-ivory focus:outline-none focus:border-amber/40 no-scrollbar transition-all"
                                    />
                                    <div className="flex gap-3 sm:gap-4 items-center flex-wrap">
                                        <button onClick={() => handleSaveNote(movie.tmdb_id)} className="px-6 sm:px-10 py-3 sm:py-4 bg-amber text-bg font-bold uppercase text-[9px] sm:text-[10px] tracking-[0.2em] rounded-full flex items-center gap-2 sm:gap-3">
                                            <Save size={12} className="sm:w-[14px] sm:h-[14px]" /> Kaydet
                                        </button>
                                        <button onClick={() => setEditingId(null)} className="px-6 sm:px-10 py-3 sm:py-4 bg-white/5 text-ivory/40 font-bold uppercase text-[9px] sm:text-[10px] tracking-[0.2em] rounded-full">
                                            İptal
                                        </button>
                                        {isSupported && (
                                            <button
                                                type="button"
                                                onClick={handleMicClick}
                                                className={`w-9 h-9 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-all ${
                                                    isListening
                                                        ? 'bg-red-600 text-white shadow-[0_0_20px_rgba(220,38,38,0.5)] animate-pulse'
                                                        : 'bg-white/5 hover:bg-white/10 text-ivory/40 hover:text-ivory border border-white/10'
                                                }`}
                                                title={isListening ? 'Dinlemeyi Durdur' : 'Sesle Yaz'}
                                            >
                                                {isListening ? <MicOff size={16} className="animate-bounce" /> : <Mic size={16} />}
                                            </button>
                                        )}
                                        {isListening && (
                                            <span className="text-[10px] text-red-500 font-serif italic animate-pulse">
                                                Dinleniyor... Konuşun
                                            </span>
                                        )}
                                    </div>
                                </motion.div>
                            ) : (
                                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`text-base sm:text-4xl font-playfair italic leading-snug tracking-tight ${movie.personal_note ? 'text-ivory' : 'text-ivory/10'}`}>
                                    {movie.personal_note || "Henüz bir not düşülmemiş..." }
                                </motion.p>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Senin değerlendirmen — beğeni (giriş zorunlu) */}
                    {user && (
                      <div className="space-y-2.5 pt-2">
                        <p className="text-[9px] sm:text-[11px] font-bold uppercase tracking-[0.3em] sm:tracking-[0.4em] text-amber/40 flex items-center gap-2 sm:gap-3">
                          <Heart size={12} className="sm:w-[14px] sm:h-[14px]" /> BEĞEN
                        </p>
                        <RatingControl
                          reaction={movie.reaction ?? null}
                          onChange={(next) => handleCardReaction(movie.tmdb_id, next)}
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-3 sm:gap-4 flex-wrap pt-4 sm:pt-8 border-t border-white/5">
                     <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
                        <div className="flex items-center gap-1.5 sm:gap-3 text-[8px] sm:text-[10px] font-bold uppercase tracking-widest text-amber/60">
                           <Check size={12} className="sm:w-[14px] sm:h-[14px]" /> Arşivlendi
                        </div>
                        <button
                            onClick={() => handleToggleWatched(movie.tmdb_id)}
                            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-1.5 sm:py-2.5 rounded-full text-[8px] sm:text-[10px] font-bold uppercase tracking-wider sm:tracking-widest transition-all duration-500 ${
                              watchedIds.has(movie.tmdb_id)
                                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                : 'bg-white/5 text-ivory/30 border border-white/10 hover:border-emerald-500/30 hover:text-emerald-400'
                            }`}
                        >
                            {watchedIds.has(movie.tmdb_id) ? <><Eye size={12} className="sm:w-[14px] sm:h-[14px]" /> İzledim</> : <><EyeOff size={12} className="sm:w-[14px] sm:h-[14px]" /> İzlemedim</>}
                        </button>
                     </div>
                     <p className="hidden sm:block text-[9px] font-bold uppercase tracking-[0.5em] opacity-20">GURME SİNEMA KULÜBÜ</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
            )}
          </>
        )}
      </main>

      {detailMovie && (
        <FilmDetailModal
          movieId={detailMovie.id || detailMovie.tmdb_id}
          initialMovie={detailMovie}
          onClose={() => setDetailMovie(null)}
          headerBadge={recommenders.length > 0 ? (
            <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-slate-900/80 border border-white/5">
              <div className="flex -space-x-2">
                {recommenders.slice(0, 3).map((r) => (
                  <span key={r.uid} className="w-7 h-7 rounded-full overflow-hidden border-2 border-slate-900">
                    {r.avatar
                      ? <img src={resolveAvatarUrl(r.avatar)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      : <span className="w-full h-full flex items-center justify-center font-serif text-[11px] font-bold text-amber bg-slate-800">{r.username?.[0]}</span>}
                  </span>
                ))}
              </div>
              <p className="text-[11px] text-ivory/60">
                <span className="font-bold text-amber">Gurme {recommenders[0].username}</span>
                {recommenders.length > 1 && <span> ve {recommenders.length - 1} kişi daha</span>} önerdi
              </p>
            </div>
          ) : null}
          extraActions={user ? (
            <button onClick={handleRecommendFromDetail}
              disabled={recommending}
              title={alreadyRecommended ? 'Öneriyi geri al' : 'Topluluğa öner'}
              className={`flex items-center gap-2 px-4 py-2 rounded-full border transition-all text-[11px] font-bold uppercase tracking-[0.12em] whitespace-nowrap ${alreadyRecommended ? 'bg-rose-500/15 border-rose-500/30 text-rose-300 hover:bg-rose-500/25' : 'bg-amber/12 border-amber/25 text-amber hover:bg-amber/25'}`}>
              {alreadyRecommended ? <><RotateCcw size={14} /> Öneriyi Geri Al</> : <><Users size={14} /> Topluluğa Öner</>}
            </button>
          ) : null}
        />
      )}
    </motion.div>
  );
}
