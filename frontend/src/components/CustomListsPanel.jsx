import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, ChevronLeft, ListPlus, X, Loader2 } from 'lucide-react';
import {
  getCustomLists, createCustomList, deleteCustomList,
  getCustomList, removeFromCustomList, proxyImageUrl,
} from '../services/api';
import FilmDetailModal from './FilmDetailModal';

const EMOJIS = ['🎬', '🍿', '🚀', '🌌', '🕵️', '💔', '😂', '👻', '🎭', '🏆', '🌙', '🔥'];

/**
 * Defterim "Listelerim" sekmesi — kullanıcının özel tematik listeleri.
 * Giriş zorunlu (backend). Anonim kullanıcıya giriş ipucu.
 */
export default function CustomListsPanel({ user }) {
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmoji, setNewEmoji] = useState('🎬');
  const [busy, setBusy] = useState(false);

  const [openList, setOpenList] = useState(null);     // {id, name, emoji, movies}
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailMovie, setDetailMovie] = useState(null);

  const loadLists = useCallback(async () => {
    setLoading(true);
    try { const d = await getCustomLists(); setLists(d.lists || []); }
    catch { setLists([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (user) loadLists(); else setLoading(false); }, [user, loadLists]);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      await createCustomList(name, newEmoji);
      setNewName(''); setNewEmoji('🎬'); setCreating(false);
      await loadLists();
    } catch {} finally { setBusy(false); }
  };

  const handleDeleteList = async (id) => {
    setLists(prev => prev.filter(l => l.id !== id)); // optimistik
    try { await deleteCustomList(id); } catch { loadLists(); }
  };

  const openListDetail = async (list) => {
    setDetailLoading(true);
    setOpenList({ ...list, movies: [] });
    try { const d = await getCustomList(list.id); setOpenList(d); }
    catch { setOpenList(null); }
    finally { setDetailLoading(false); }
  };

  const handleRemoveItem = async (tmdbId) => {
    if (!openList) return;
    setOpenList(prev => ({ ...prev, movies: prev.movies.filter(m => m.tmdb_id !== tmdbId) }));
    try { await removeFromCustomList(openList.id, tmdbId); } catch {}
    loadLists(); // sayım/kapak güncellensin
  };

  // ── Giriş yok ──
  if (!user) {
    return (
      <div className="p-8 sm:p-12 rounded-[2rem] bg-white/5 border border-white/10 text-center space-y-4">
        <ListPlus size={40} className="mx-auto text-amber/40" />
        <p className="font-serif text-lg italic text-ivory/60 max-w-md mx-auto">
          Kendi tematik listelerini ("Bilim kurgu maratonu", "Nolan filmleri") oluşturmak için giriş yap.
        </p>
      </div>
    );
  }

  // ── Liste detayı ──
  if (openList) {
    return (
      <div className="space-y-8">
        <div className="flex items-center justify-between gap-4">
          <button onClick={() => setOpenList(null)}
            className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-ivory/50 hover:text-amber transition-all">
            <ChevronLeft size={16} /> Listelerim
          </button>
          <button onClick={() => { handleDeleteList(openList.id); setOpenList(null); }}
            className="flex items-center gap-2 px-4 py-2 rounded-full border border-rose-400/25 text-rose-300/80 text-[10px] font-bold uppercase tracking-wider hover:bg-rose-500/10 transition-all">
            <Trash2 size={13} /> Listeyi Sil
          </button>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-3xl">{openList.emoji || '🎬'}</span>
          <h2 className="text-2xl sm:text-4xl font-serif font-bold tracking-tight">{openList.name}</h2>
          <span className="text-sm text-ivory/40">{openList.movies?.length || 0} film</span>
        </div>

        {detailLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin text-amber/60" size={28} /></div>
        ) : (openList.movies || []).length === 0 ? (
          <p className="font-serif italic text-ivory/40 py-12 text-center">
            Bu liste boş. Bir filmin detayında "Listeye Ekle" ile film ekleyebilirsin.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 sm:gap-6">
            {openList.movies.map(m => (
              <motion.div key={m.tmdb_id} layout exit={{ opacity: 0, scale: 0.9 }}
                className="group relative rounded-2xl overflow-hidden bg-white/5 border border-white/8">
                <button onClick={() => setDetailMovie({ id: m.tmdb_id, title: m.title, poster_url: m.poster_url })}
                  className="block w-full aspect-[2/3]">
                  <img src={proxyImageUrl(m.poster_url) || 'https://via.placeholder.com/300x450'}
                    alt={m.title} loading="lazy" className="w-full h-full object-cover" />
                </button>
                <button onClick={() => handleRemoveItem(m.tmdb_id)} title="Listeden çıkar"
                  className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center rounded-full bg-black/70 backdrop-blur text-ivory/80 hover:text-rose-300 opacity-0 group-hover:opacity-100 transition-all">
                  <X size={15} />
                </button>
                <p className="px-2 py-2 text-[11px] font-semibold text-ivory/80 line-clamp-1">{m.title}</p>
              </motion.div>
            ))}
          </div>
        )}

        {detailMovie && (
          <FilmDetailModal
            movieId={detailMovie.id}
            initialMovie={detailMovie}
            onClose={() => setDetailMovie(null)}
          />
        )}
      </div>
    );
  }

  // ── Liste listesi ──
  return (
    <div className="space-y-6">
      {/* Yeni liste oluştur */}
      <AnimatePresence mode="wait">
        {creating ? (
          <motion.div key="form" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="p-5 rounded-2xl bg-white/5 border border-amber/20 space-y-4">
            <div className="flex flex-wrap gap-1.5">
              {EMOJIS.map(e => (
                <button key={e} onClick={() => setNewEmoji(e)}
                  className={`w-9 h-9 rounded-full text-lg transition-all ${newEmoji === e ? 'bg-amber/20 border border-amber/40 scale-110' : 'bg-white/5 border border-white/10'}`}>
                  {e}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input autoFocus value={newName} onChange={e => setNewName(e.target.value.slice(0, 60))}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                placeholder="Liste adı (örn. Nolan filmleri)"
                className="flex-1 px-4 py-3 bg-black/30 border border-white/10 rounded-full text-sm text-ivory placeholder:text-ivory/30 focus:outline-none focus:border-amber/40" />
              <button onClick={handleCreate} disabled={busy || !newName.trim()}
                className="px-6 py-3 rounded-full bg-amber text-bg text-[11px] font-bold uppercase tracking-wider disabled:opacity-40 transition-all">
                {busy ? <Loader2 size={14} className="animate-spin" /> : 'Oluştur'}
              </button>
              <button onClick={() => { setCreating(false); setNewName(''); }}
                className="px-4 py-3 rounded-full bg-white/5 border border-white/10 text-ivory/50 text-[11px] font-bold uppercase tracking-wider">İptal</button>
            </div>
          </motion.div>
        ) : (
          <motion.button key="new" onClick={() => setCreating(true)}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex items-center gap-2 px-5 py-3 rounded-full bg-amber/10 border border-amber/30 text-amber text-[11px] font-bold uppercase tracking-wider hover:bg-amber/20 transition-all">
            <Plus size={15} /> Yeni Liste
          </motion.button>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-amber/60" size={28} /></div>
      ) : lists.length === 0 ? (
        <p className="font-serif italic text-ivory/40 py-12 text-center">
          Henüz listen yok. "Yeni Liste" ile ilk tematik listeni oluştur.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {lists.map(list => (
            <motion.div key={list.id} layout
              className="group relative rounded-[1.75rem] overflow-hidden bg-white/5 border border-white/8 hover:border-amber/30 transition-all">
              <button onClick={() => openListDetail(list)} className="block w-full text-left">
                {/* Kapak kolajı */}
                <div className="grid grid-cols-4 h-28 sm:h-32 bg-black/30">
                  {(list.covers && list.covers.length > 0 ? list.covers : [null, null, null, null]).slice(0, 4).map((c, i) => (
                    <div key={i} className="overflow-hidden">
                      {c ? <img src={proxyImageUrl(c)} alt="" className="w-full h-full object-cover" loading="lazy" />
                        : <div className="w-full h-full bg-white/[0.03]" />}
                    </div>
                  ))}
                </div>
                <div className="p-4 flex items-center gap-3">
                  <span className="text-2xl">{list.emoji || '🎬'}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-serif font-bold text-lg text-ivory truncate">{list.name}</p>
                    <p className="text-[11px] text-ivory/40">{list.count} film</p>
                  </div>
                </div>
              </button>
              <button onClick={() => handleDeleteList(list.id)} title="Listeyi sil"
                className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center rounded-full bg-black/70 backdrop-blur text-ivory/70 hover:text-rose-300 opacity-0 group-hover:opacity-100 transition-all">
                <Trash2 size={14} />
              </button>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
