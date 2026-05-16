import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Trash2, Edit3, Save, X, Book, Star, Sparkles, MessageCircle, Check, Brain, Heart, RefreshCw, Eye, EyeOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getWatchlist, removeFromWatchlist, saveNote, getNote, getTasteMap, proxyImageUrl, toggleWatched } from '../services/api';

const IMG_BASE = 'https://image.tmdb.org/t/p/w1280';

export default function Defterim() {
  const navigate = useNavigate();
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

      <header className="sticky top-0 z-50 bg-[#120d0b]/80 backdrop-blur-3xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 py-10 flex items-center justify-between flex-wrap gap-6">
          <div className="flex items-center gap-8">
            <button onClick={() => navigate('/')} className="w-14 h-14 flex items-center justify-center hover:bg-white/5 rounded-full border border-white/10 transition-all">
              <ChevronLeft size={24} />
            </button>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.8em] text-amber/40 mb-1">KİŞİSEL ARŞİV</p>
              <h1 className="font-serif text-6xl font-bold tracking-tighter">Defterim<span className="text-amber">.</span></h1>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <button 
              onClick={() => navigate('/kafan-mi-karisik')} 
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-amber-500 to-purple-600 rounded-full hover:scale-105 transition-all shadow-[0_0_20px_rgba(245,158,11,0.3)] animate-pulse"
            >
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-bg">Kafan mı Karışık?</span>
            </button>
            <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-[0.4em] opacity-40">
              <Book size={16} className="text-amber" /> {savedMovies.length} KAYITLI YAPIT
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-16">
        {loading ? (
            <div className="flex flex-col items-center justify-center py-40 gap-6">
                <Book className="text-amber animate-pulse" size={48} />
                <p className="text-xl font-serif italic text-ivory/20">Defterin sayfaları çevriliyor...</p>
            </div>
        ) : savedMovies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-40 space-y-10">
             <div className="w-40 h-40 rounded-full border border-white/5 flex items-center justify-center opacity-10 bg-white/5"><Book size={60} /></div>
             <div className="text-center space-y-6">
                <h2 className="text-5xl font-serif italic text-ivory/20 tracking-tight">Henüz bir not düşülmemiş...</h2>
                <button onClick={() => navigate('/')} className="px-12 py-5 bg-amber text-bg font-bold uppercase text-[10px] tracking-[0.3em] rounded-full hover:scale-105 transition-transform shadow-xl shadow-amber/10">Keşfe Çık →</button>
             </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-16">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="p-16 rounded-[4rem] bg-white/5 border border-white/5 relative overflow-hidden gurme-border">
                <div className="absolute inset-0 bg-gradient-to-r from-amber/5 to-transparent opacity-40" />
                <p className="text-3xl font-serif italic leading-relaxed relative z-10 max-w-4xl text-ivory/60">
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
                        {/* Summary cumleleri */}
                        {tasteMap.summary && tasteMap.summary.length > 0 && (
                          <div className="space-y-2">
                            {tasteMap.summary.slice(0, 3).map((s, i) => (
                              <p key={i} className="text-sm md:text-base font-serif italic text-ivory/70 leading-relaxed">"{s}"</p>
                            ))}
                          </div>
                        )}

                        {/* Top mood bars */}
                        {tasteMap.top_moods && tasteMap.top_moods.length > 0 && (
                          <div className="flex flex-wrap gap-6">
                            {tasteMap.top_moods.slice(0, 3).map((m) => (
                              <div key={m.mood_id} className="flex items-center gap-3">
                                <div className="w-2 h-2 rounded-full bg-amber/60" />
                                <span className="text-xs font-bold uppercase tracking-wider text-ivory/50">{m.title}</span>
                                <span className="text-[10px] font-bold text-amber/60">{m.score}p</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Confidence badge */}
                        <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest">
                          <span className={`px-3 py-1.5 rounded-full ${
                            tasteMap.confidence === 'high' ? 'bg-amber/10 text-amber' :
                            tasteMap.confidence === 'medium' ? 'bg-amber/5 text-amber/70' :
                            'bg-white/5 text-ivory/30'
                          }`}>
                            {tasteMap.confidence === 'high' ? 'Güçlü profil' :
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
                className="bg-surface rounded-[4rem] border border-white/5 overflow-hidden flex flex-col md:flex-row shadow-2xl group relative"
              >
                <div className="noise-overlay" />
                <div className="w-full md:w-96 aspect-[2/3] md:aspect-auto relative overflow-hidden">
                    <img 
                        src={proxyImageUrl(movie.poster_url) || 'https://via.placeholder.com/500x750'}
                        className="w-full h-full object-cover grayscale-[0.4] group-hover:grayscale-0 group-hover:scale-110 transition-all duration-[2s]" 
                    />
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent to-surface/40" />
                </div>
                
                <div className="flex-1 p-16 lg:p-20 flex flex-col justify-between space-y-12">
                  <div className="space-y-8">
                    <div className="flex justify-between items-start">
                        <div className="space-y-2">
                            <h3 className="text-6xl font-serif font-bold tracking-tighter leading-none group-hover:text-amber transition-colors duration-500">{movie.title}</h3>
                            <div className="flex items-center gap-4 opacity-30">
                                <span className="text-xs font-bold uppercase tracking-widest">{movie.added_at?.split(' ')[0]} Tarihinde eklendi</span>
                            </div>
                        </div>
                        <button 
                            onClick={() => handleRemove(movie.tmdb_id)} 
                            className="w-14 h-14 flex items-center justify-center rounded-full border border-white/10 text-ivory/20 hover:text-red-500 hover:border-red-500/30 transition-all duration-500"
                        >
                            <Trash2 size={20} />
                        </button>
                    </div>
                    
                    <div className="h-px bg-white/5 w-full" />
                    
                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <p className="text-[11px] font-bold uppercase tracking-[0.4em] text-amber/40 flex items-center gap-3">
                                <MessageCircle size={14} /> GURME NOTU
                            </p>
                            {editingId !== movie.tmdb_id && (
                                <button onClick={() => startEditing(movie)} className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-ivory/20 hover:text-amber transition-all">
                                    <Edit3 size={14} /> Düzenle
                                </button>
                            )}
                        </div>
                        
                        <AnimatePresence mode="wait">
                            {editingId === movie.tmdb_id ? (
                                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
                                    <textarea 
                                        autoFocus
                                        value={noteDraft} 
                                        onChange={(e) => setNoteDraft(e.target.value)} 
                                        placeholder="Bu başyapıt sende nasıl bir iz bıraktı?" 
                                        className="w-full h-40 bg-black/40 border border-white/10 rounded-[2rem] p-8 text-2xl font-serif italic text-ivory focus:outline-none focus:border-amber/40 no-scrollbar transition-all" 
                                    />
                                    <div className="flex gap-4">
                                        <button onClick={() => handleSaveNote(movie.tmdb_id)} className="px-10 py-4 bg-amber text-bg font-bold uppercase text-[10px] tracking-[0.2em] rounded-full flex items-center gap-3">
                                            <Save size={14} /> Kaydet
                                        </button>
                                        <button onClick={() => setEditingId(null)} className="px-10 py-4 bg-white/5 text-ivory/40 font-bold uppercase text-[10px] tracking-[0.2em] rounded-full">
                                            İptal
                                        </button>
                                    </div>
                                </motion.div>
                            ) : (
                                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`text-4xl font-serif italic leading-snug tracking-tight ${movie.personal_note ? 'text-ivory' : 'text-ivory/10'}`}>
                                    {movie.personal_note || "Henüz bir not düşülmemiş..." }
                                </motion.p>
                            )}
                        </AnimatePresence>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between pt-8 border-t border-white/5">
                     <div className="flex items-center gap-4">
                        <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest text-amber/60">
                           <Check size={14} /> Arşivlendi
                        </div>
                        <button
                            onClick={() => handleToggleWatched(movie.tmdb_id)}
                            className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all duration-500 ${
                              watchedIds.has(movie.tmdb_id)
                                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                : 'bg-white/5 text-ivory/30 border border-white/10 hover:border-emerald-500/30 hover:text-emerald-400'
                            }`}
                        >
                            {watchedIds.has(movie.tmdb_id) ? <><Eye size={14} /> İzledim</> : <><EyeOff size={14} /> İzlemedim</>}
                        </button>
                     </div>
                     <p className="text-[9px] font-bold uppercase tracking-[0.5em] opacity-20">GURME SİNEMA KULÜBÜ</p>
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
