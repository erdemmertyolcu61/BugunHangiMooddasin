import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Check, ListPlus, Loader2 } from 'lucide-react';
import { getCustomLists, createCustomList, addToCustomList, proxyImageUrl } from '../services/api';

const EMOJIS = ['🎬', '🍿', '🚀', '🌌', '🕵️', '💔', '😂', '👻', '🎭', '🏆', '🌙', '🔥'];

/**
 * "Listeye Ekle" — alttan açılan sheet (RecommendToFriendSheet deseni).
 * Kullanıcının listelerini gösterir; seçilenlere filmi ekler; satır içi yeni liste oluşturur.
 */
export default function AddToListSheet({ movie, onClose }) {
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addedIds, setAddedIds] = useState(new Set()); // bu açılışta eklenenler
  const [busyId, setBusyId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmoji, setNewEmoji] = useState('🎬');
  const [createBusy, setCreateBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const d = await getCustomLists(); setLists(d.lists || []); }
    catch { setLists([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async (list) => {
    if (busyId) return;
    setBusyId(list.id);
    try {
      await addToCustomList(list.id, movie);
      setAddedIds(prev => new Set(prev).add(list.id));
    } catch {} finally { setBusyId(null); }
  };

  const handleCreateAndAdd = async () => {
    const name = newName.trim();
    if (!name || createBusy) return;
    setCreateBusy(true);
    try {
      const created = await createCustomList(name, newEmoji);
      await addToCustomList(created.id, movie);
      setNewName(''); setNewEmoji('🎬'); setCreating(false);
      setAddedIds(prev => new Set(prev).add(created.id));
      await load();
    } catch {} finally { setCreateBusy(false); }
  };

  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-[1000] bg-black/70 backdrop-blur-sm"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.div
        className="fixed bottom-0 left-0 right-0 z-[1001] max-h-[85vh] flex flex-col
                   bg-[#161010] border-t border-amber/20 rounded-t-[2rem] shadow-[0_-20px_60px_rgba(0,0,0,0.6)] pb-safe"
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 32, stiffness: 320 }}>
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-12 h-1.5 rounded-full bg-white/15" />
        </div>

        <div className="flex items-center justify-between px-6 pt-2 pb-4 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <ListPlus size={18} className="text-amber shrink-0" />
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-[0.35em] text-amber/50">LİSTEYE EKLE</p>
              <h3 className="font-serif text-lg font-bold text-ivory line-clamp-1">{movie?.title}</h3>
            </div>
          </div>
          <button onClick={onClose} className="p-2 -mr-2 rounded-full hover:bg-white/5 transition-all">
            <X size={20} className="text-white/60" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-6 min-h-[140px] no-scrollbar space-y-2.5">
          {/* Yeni liste */}
          {creating ? (
            <div className="p-4 rounded-2xl bg-white/5 border border-amber/20 space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {EMOJIS.map(e => (
                  <button key={e} onClick={() => setNewEmoji(e)}
                    className={`w-8 h-8 rounded-full text-base transition-all ${newEmoji === e ? 'bg-amber/20 border border-amber/40 scale-110' : 'bg-white/5 border border-white/10'}`}>{e}</button>
                ))}
              </div>
              <div className="flex gap-2">
                <input autoFocus value={newName} onChange={e => setNewName(e.target.value.slice(0, 60))}
                  onKeyDown={e => e.key === 'Enter' && handleCreateAndAdd()}
                  placeholder="Liste adı"
                  className="flex-1 px-4 py-2.5 bg-black/30 border border-white/10 rounded-full text-sm text-ivory placeholder:text-ivory/30 focus:outline-none focus:border-amber/40" />
                <button onClick={handleCreateAndAdd} disabled={createBusy || !newName.trim()}
                  className="px-5 py-2.5 rounded-full bg-amber text-bg text-[11px] font-bold uppercase tracking-wider disabled:opacity-40">
                  {createBusy ? <Loader2 size={14} className="animate-spin" /> : 'Oluştur + Ekle'}
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setCreating(true)}
              className="w-full flex items-center gap-2 px-4 py-3 rounded-2xl bg-amber/10 border border-amber/25 text-amber text-[12px] font-bold uppercase tracking-wider hover:bg-amber/20 transition-all">
              <Plus size={15} /> Yeni Liste Oluştur
            </button>
          )}

          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="animate-spin text-amber/60" size={26} /></div>
          ) : lists.length === 0 ? (
            <p className="text-center text-sm font-serif italic text-white/40 py-8">Henüz listen yok. Yukarıdan oluştur.</p>
          ) : (
            lists.map(list => {
              const added = addedIds.has(list.id);
              return (
                <button key={list.id} onClick={() => !added && handleAdd(list)} disabled={added || busyId === list.id}
                  className={`w-full flex items-center gap-3 p-3 rounded-2xl border transition-all text-left ${
                    added ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-white/[0.03] border-white/8 hover:border-amber/30'
                  }`}>
                  <span className="text-2xl shrink-0">{list.emoji || '🎬'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-ivory truncate">{list.name}</p>
                    <p className="text-[11px] text-white/40">{list.count} film</p>
                  </div>
                  <span className={`w-7 h-7 rounded-full border flex items-center justify-center shrink-0 ${
                    added ? 'bg-emerald-500 border-emerald-500' : 'border-white/25'
                  }`}>
                    {busyId === list.id ? <Loader2 size={14} className="animate-spin text-amber" />
                      : added ? <Check size={15} className="text-black" /> : <Plus size={15} className="text-white/50" />}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
