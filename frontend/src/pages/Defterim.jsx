import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Trash2, Edit3, Save, X, Book, Star, Sparkles, MessageCircle, Check, Brain, Heart, RefreshCw, Eye, EyeOff, Share2, Copy } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getWatchlist, removeFromWatchlist, saveNote, getNote, getTasteMap, proxyImageUrl, toggleWatched } from '../services/api';
import { useAuth } from '../context/AuthContext';

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
  const [savedMovies, setSavedMovies] = useState([]);
  const [watchedIds, setWatchedIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [tasteMap, setTasteMap] = useState(null);
  const [tasteLoading, setTasteLoading] = useState(true);

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
    const shareUrl = `${window.location.origin}/discover?film=${movie.tmdb_id}`;
    const note = (movie.personal_note || '').trim();
    const shareData = {
      title: `${movie.title} — Film Eleştirmeni`,
      text: note ? `"${note.slice(0, 140)}"` : `${movie.title} — Film Eleştirmeni defterimden.`,
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

  return (
    <div className="min-h-screen bg-[#120d0b] text-ivory font-sans relative overflow-hidden">
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
          <div className="flex items-center gap-4 sm:gap-6">
            <button
              onClick={() => navigate('/kafan-mi-karisik')}
              className="hidden md:flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-amber-500 to-purple-600 rounded-full hover:scale-105 transition-all shadow-[0_0_20px_rgba(245,158,11,0.3)] animate-pulse"
            >
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-bg">Kafan mı Karışık?</span>
            </button>
            <div className="flex items-center gap-3 sm:gap-4 text-[10px] font-bold uppercase tracking-[0.3em] sm:tracking-[0.4em] opacity-40">
              <Book size={16} className="text-amber" /> {savedMovies.length} KAYITLI
            </div>
            <button
              onClick={() => navigate('/profil')}
              title="Profilim"
              className="flex items-center gap-2 pl-2 pr-4 py-1.5 rounded-full bg-slate-900/80 backdrop-blur-md border border-white/10 hover:border-amber/40 transition-all"
            >
              <span className="w-8 h-8 rounded-full overflow-hidden bg-amber/10 flex items-center justify-center shrink-0">
                {user?.picture
                  ? <img src={user.picture} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  : <span className="font-serif text-sm font-bold text-amber">{user ? (user.name || user.email || '?').slice(0, 1).toUpperCase() : '?'}</span>}
              </span>
              <span className="hidden sm:inline font-sans text-[11px] font-semibold text-ivory/70 max-w-[120px] truncate">
                {user?.name || (user ? 'Profilim' : 'Giriş Yap')}
              </span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-16 pb-nav">
        {loading ? (
            <div className="flex flex-col items-center justify-center py-40 gap-6">
                <Book className="text-amber animate-pulse" size={48} />
                <p className="text-xl font-serif italic text-ivory/20">Defterin sayfaları çevriliyor...</p>
            </div>
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

            {/* ═══ Zevk Haritasi ═══ */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <div className="p-10 md:p-14 rounded-[3rem] bg-gradient-to-br from-amber-500/[0.03] to-purple-600/[0.03] border border-white/[0.06] relative overflow-hidden">
                <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-br from-amber-500/5 to-purple-600/5 blur-[100px] rounded-full pointer-events-none" />
                
                <div className="relative z-10 flex flex-col lg:flex-row gap-10 items-start">
                  {/* Sol: Icon + Baslik */}
                  <div className="flex items-start gap-5 lg:w-64 shrink-0">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500 to-purple-600 flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.2)]">
                      <Brain size={26} className="text-bg" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-serif font-bold tracking-tight text-ivory">Zevk Haritam</h2>
                      <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-amber/50 mt-1">Kişisel Sinema Profilin</p>
                    </div>
                  </div>

                  {/* Sag: Icerek */}
                  <div className="flex-1 w-full">
                    {tasteLoading ? (
                      <div className="flex items-center gap-4 text-ivory/30 font-serif italic text-sm">
                        <RefreshCw size={14} className="animate-spin" /> Zevk haritan hazırlanıyor...
                      </div>
                    ) : tasteMap && tasteMap.confidence !== "low" ? (
                      <div className="space-y-6">
                        {/* Dynamic title */}
                        {tasteMap.dynamic_title && (
                          <p className="text-lg font-bold font-serif text-amber/80 tracking-tight">
                            {tasteMap.dynamic_title}
                          </p>
                        )}

                        {/* Summary cumleleri */}
                        {tasteMap.summary && tasteMap.summary.length > 0 && (
                          <div className="space-y-2">
                            {tasteMap.summary.slice(0, 3).map((s, i) => (
                              <p key={i} className="text-sm md:text-base font-serif italic text-ivory/70 leading-relaxed">"{s}"</p>
                            ))}
                          </div>
                        )}

                        {/* Mood bars with percentages */}
                        {tasteMap.mood_pct && Object.keys(tasteMap.mood_pct).length > 0 && (
                          <div className="space-y-2">
                            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-ivory/40">Ruh Hali Dağılımı</p>
                            {Object.entries(tasteMap.mood_pct).slice(0, 5).map(([mid, pct]) => {
                              const moodObj = (tasteMap.top_moods || []).find(m => m.mood_id === mid);
                              const label = moodObj?.title || mid.replace('-', ' ');
                              return (
                                <div key={mid} className="flex items-center gap-3">
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-ivory/50 w-24 truncate">{label}</span>
                                  <div className="flex-1 h-2.5 rounded-full bg-white/5 overflow-hidden">
                                    <div
                                      className="h-full rounded-full bg-gradient-to-r from-amber-600 via-amber-500 to-amber-300 shadow-[0_0_6px_rgba(212,175,55,0.25)]"
                                      style={{ width: `${Math.min(pct, 100)}%` }}
                                    />
                                  </div>
                                  <span className="text-[10px] font-bold text-amber/60 w-8 text-right">%{Math.round(pct)}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Confidence badge */}
                        <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest">
                          <span className={`px-3 py-1.5 rounded-full ${
                            tasteMap.confidence === 'high' ? 'bg-emerald/10 text-emerald' :
                            tasteMap.confidence === 'medium' ? 'bg-amber/10 text-amber' :
                            'bg-white/5 text-ivory/30'
                          }`}>
                            {tasteMap.confidence === 'high' ? 'Oluştu ✨' :
                             tasteMap.confidence === 'medium' ? 'Oluşuyor' : 'Başlangıç'}
                          </span>
                          <span className="text-ivory/20">{tasteMap.signals?.total_movies || 0} film sinyali</span>
                          <button onClick={fetchTasteMap} className="text-amber/40 hover:text-amber transition-colors">
                            <RefreshCw size={12} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <p className="text-sm md:text-base font-serif italic text-ivory/50 leading-relaxed">
                          "Zevk haritan henüz oluşuyor. Birkaç filmi defterine ekledikçe, not yazdıkça ve gelecek programına aldıkça seni daha iyi tanıyacağız."
                        </p>
                        <div className="flex flex-wrap gap-3 text-[10px] font-bold uppercase tracking-widest">
                          <span className="text-amber/40 flex items-center gap-2"><Book size={12} /> Film ekle</span>
                          <span className="text-ivory/20">·</span>
                          <span className="text-amber/40 flex items-center gap-2"><MessageCircle size={12} /> Not yaz</span>
                        </div>
                      </div>
                    )}
                  </div>
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
                <div className="w-full md:w-80 lg:w-96 aspect-[16/10] sm:aspect-[2/3] md:aspect-auto relative overflow-hidden">
                    <img 
                        src={proxyImageUrl(movie.poster_url) || 'https://via.placeholder.com/500x750'}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover transition-transform duration-700 md:group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent to-surface/40" />
                </div>
                
                <div className="flex-1 p-5 sm:p-12 lg:p-20 flex flex-col justify-between space-y-6 sm:space-y-12">
                  <div className="space-y-4 sm:space-y-8">
                    <div className="flex justify-between items-start gap-3 sm:gap-4">
                        <div className="space-y-1.5 sm:space-y-2 min-w-0">
                            <h3 className="text-2xl sm:text-5xl lg:text-6xl font-serif font-bold tracking-tighter leading-snug sm:leading-none group-hover:text-amber transition-colors duration-500 break-words">{movie.title}</h3>
                            <div className="flex items-center gap-4 opacity-30">
                                <span className="text-[9px] sm:text-xs font-bold uppercase tracking-widest">{formatDefterDate(movie.added_at)} tarihinde eklendi</span>
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
                                        className="w-full h-28 sm:h-40 bg-black/40 border border-white/10 rounded-xl sm:rounded-[2rem] p-4 sm:p-8 text-sm sm:text-2xl font-serif italic text-ivory focus:outline-none focus:border-amber/40 no-scrollbar transition-all"
                                    />
                                    <div className="flex gap-3 sm:gap-4">
                                        <button onClick={() => handleSaveNote(movie.tmdb_id)} className="px-6 sm:px-10 py-3 sm:py-4 bg-amber text-bg font-bold uppercase text-[9px] sm:text-[10px] tracking-[0.2em] rounded-full flex items-center gap-2 sm:gap-3">
                                            <Save size={12} className="sm:w-[14px] sm:h-[14px]" /> Kaydet
                                        </button>
                                        <button onClick={() => setEditingId(null)} className="px-6 sm:px-10 py-3 sm:py-4 bg-white/5 text-ivory/40 font-bold uppercase text-[9px] sm:text-[10px] tracking-[0.2em] rounded-full">
                                            İptal
                                        </button>
                                    </div>
                                </motion.div>
                            ) : (
                                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`text-base sm:text-4xl font-serif italic leading-snug tracking-tight ${movie.personal_note ? 'text-ivory' : 'text-ivory/10'}`}>
                                    {movie.personal_note || "Henüz bir not düşülmemiş..." }
                                </motion.p>
                            )}
                        </AnimatePresence>
                    </div>
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
      </main>
    </div>
  );
}
