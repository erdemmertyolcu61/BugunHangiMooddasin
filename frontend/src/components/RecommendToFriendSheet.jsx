import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Send, Check, X, Users, UserPlus, Sparkles } from 'lucide-react';
import { getFriends, recommendMovieToFriend, sendFriendRequest } from '../services/api';
import { resolveAvatarUrl } from '../utils/apiConfig';
import OptimizedImage from './OptimizedImage';

/**
 * Arkadaşına Öner — aşağıdan yukarı süzülen Bottom Sheet.
 *  - Üstte anlık filtreleyen "Arkadaş Ara..." çubuğu
 *  - Altında kaydırılabilir aktif arkadaş listesi (checkbox seçim)
 *  - En altta not alanı + "Gönder" → toast "Üstadın Güverciniyle Gönderildi! ✨"
 */
export default function RecommendToFriendSheet({ movie, onClose }) {
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [failedAvatars, setFailedAvatars] = useState(new Set());
  const onAvatarError = useCallback((id) => {
    setFailedAvatars((prev) => { const n = new Set(prev); n.add(id); return n; });
  }, []);
  const [error, setError] = useState(null);

  // Arkadaş ekleme (boş liste için kısa yol)
  const [addUsername, setAddUsername] = useState('');
  const [addMsg, setAddMsg] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await getFriends();
        if (alive) setFriends(data.friends || []);
      } catch {
        if (alive) setFriends([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return friends;
    return friends.filter(
      (f) => (f.name || '').toLowerCase().includes(q) || (f.username || '').toLowerCase().includes(q)
    );
  }, [friends, query]);

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSend = async () => {
    if (selected.size === 0 || sending) return;
    setSending(true);
    setError(null);
    try {
      await Promise.all(
        [...selected].map((rid) => recommendMovieToFriend(rid, movie.id, note.trim()))
      );
      setSent(true);
      setTimeout(() => onClose?.(), 1600);
    } catch (err) {
      setError(err.message || 'Gönderilemedi');
    } finally {
      setSending(false);
    }
  };

  const handleAddFriend = async () => {
    const u = addUsername.trim();
    if (!u) return;
    setAddMsg(null);
    try {
      const res = await sendFriendRequest(u);
      if (res.status === 'ACCEPTED') {
        setAddMsg({ ok: true, text: 'Arkadaş eklendi! 🕊️' });
        const data = await getFriends();
        setFriends(data.friends || []);
      } else {
        setAddMsg({ ok: true, text: 'İstek gönderildi, onay bekliyor.' });
      }
      setAddUsername('');
    } catch (err) {
      setAddMsg({ ok: false, text: err.message });
    }
  };

  return (
    <AnimatePresence>
      {/* Arka plan karartma */}
      <motion.div
        className="fixed inset-0 z-[1000] bg-black/70 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      {/* Bottom Sheet */}
      <motion.div
        className="fixed bottom-0 left-0 right-0 z-[1001] max-h-[85vh] flex flex-col
                   bg-[#161010] border-t border-amber/20 rounded-t-[2rem]
                   shadow-[0_-20px_60px_rgba(0,0,0,0.6)] pb-safe"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 32, stiffness: 320 }}
      >
        {/* Tutamaç */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-12 h-1.5 rounded-full bg-white/15" />
        </div>

        {/* Başlık */}
        <div className="flex items-center justify-between px-6 pt-2 pb-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <Users size={18} className="text-[#d4af37]" />
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.35em] text-amber/50">ARKADAŞINA ÖNER</p>
              <h3 className="font-serif text-lg font-bold text-[#f5f2eb] line-clamp-1">{movie?.title}</h3>
            </div>
          </div>
          <button onClick={onClose} className="p-2 -mr-2 rounded-full hover:bg-white/5 transition-all">
            <X size={20} className="text-white/60" />
          </button>
        </div>

        {/* Gönderildi durumu */}
        {sent ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center gap-4 py-16 px-6 text-center"
          >
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
              className="text-5xl"
            >
              🕊️
            </motion.div>
            <p className="text-xl font-serif italic text-[#d4af37]">
              Öneri Üstadın Güverciniyle Gönderildi! ✨
            </p>
          </motion.div>
        ) : (
          <>
            {/* Arama çubuğu */}
            <div className="px-6 pb-3 shrink-0">
              <div className="relative">
                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Arkadaş Ara..."
                  className="w-full pl-11 pr-4 py-3 bg-white/5 border border-white/10 rounded-full
                             text-sm text-[#f5f2eb] placeholder:text-white/30
                             focus:outline-none focus:border-amber/40 transition-all"
                />
              </div>
            </div>

            {/* Arkadaş listesi (kaydırılabilir) */}
            <div className="flex-1 overflow-y-auto px-6 min-h-[120px] no-scrollbar">
              {loading ? (
                <div className="flex justify-center py-10">
                  <div className="flex gap-2">
                    {[0, 1, 2].map((i) => (
                      <motion.div
                        key={i}
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: '#d4af37' }}
                        animate={{ opacity: [0.2, 1, 0.2] }}
                        transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.25 }}
                      />
                    ))}
                  </div>
                </div>
              ) : friends.length === 0 ? (
                /* Boş liste → arkadaş ekleme kısa yolu */
                <div className="py-6 space-y-4 text-center">
                  <p className="text-sm font-serif italic text-white/50">
                    Henüz arkadaşın yok. Kullanıcı adıyla birini ekle:
                  </p>
                  <div className="flex gap-2">
                    <input
                      value={addUsername}
                      onChange={(e) => setAddUsername(e.target.value)}
                      placeholder="kullanıcı_adı"
                      className="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 rounded-full
                                 text-sm text-[#f5f2eb] placeholder:text-white/30 focus:outline-none focus:border-amber/40"
                      onKeyDown={(e) => e.key === 'Enter' && handleAddFriend()}
                    />
                    <button
                      onClick={handleAddFriend}
                      className="flex items-center gap-1.5 px-4 py-2.5 bg-amber/90 text-black rounded-full text-xs font-bold uppercase tracking-wider hover:bg-amber transition-all"
                    >
                      <UserPlus size={14} /> Ekle
                    </button>
                  </div>
                  {addMsg && (
                    <p className={`text-xs font-serif ${addMsg.ok ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {addMsg.text}
                    </p>
                  )}
                </div>
              ) : filtered.length === 0 ? (
                <p className="text-center text-sm font-serif italic text-white/40 py-10">
                  &ldquo;{query}&rdquo; ile eşleşen arkadaş yok.
                </p>
              ) : (
                <div className="space-y-1.5 py-1">
                  {filtered.map((f) => {
                    const isSel = selected.has(f.id);
                    return (
                      <button
                        key={f.id}
                        onClick={() => toggle(f.id)}
                        className={`w-full flex items-center gap-3 p-2.5 rounded-2xl border transition-all text-left
                          ${isSel ? 'bg-amber/10 border-amber/40' : 'bg-white/[0.03] border-white/8 hover:border-white/20'}`}
                      >
                        <div className="w-10 h-10 rounded-full overflow-hidden bg-white/10 shrink-0">
                          {f.avatar && !failedAvatars.has(f.id) ? (
                            <img src={resolveAvatarUrl(f.avatar)} alt={f.name} className="w-full h-full object-cover"
                              onError={() => onAvatarError(f.id)} />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-amber/60 font-bold">
                              {(f.username || f.name || '?')[0].toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-[#f5f2eb] truncate">{f.username || f.name}</p>
                          <p className="text-[11px] text-white/40 truncate">@{f.username}</p>
                        </div>
                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all
                          ${isSel ? 'bg-[#d4af37] border-[#d4af37]' : 'border-white/25'}`}>
                          {isSel && <Check size={14} className="text-black" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Not + Gönder */}
            {friends.length > 0 && (
              <div className="px-6 pt-3 pb-5 space-y-3 shrink-0 border-t border-white/5">
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value.slice(0, 250))}
                  placeholder="Üstad'dan sana mesaj var..."
                  rows={2}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-2xl resize-none
                             text-sm text-[#f5f2eb] placeholder:text-white/30 focus:outline-none focus:border-amber/40 no-scrollbar"
                />
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-white/30">{note.length}/250</span>
                  {error && <span className="text-[11px] text-rose-400 font-serif">{error}</span>}
                  <button
                    onClick={handleSend}
                    disabled={selected.size === 0 || sending}
                    className="flex items-center gap-2 px-7 py-3 rounded-full text-xs font-bold uppercase tracking-wider
                               bg-[#ffbf00] text-[#120d0b] shadow-[0_0_20px_rgba(255,191,0,0.25)]
                               disabled:opacity-30 disabled:cursor-not-allowed hover:bg-amber-400 transition-all"
                  >
                    {sending ? <Sparkles size={14} className="animate-spin" /> : <Send size={14} />}
                    Gönder{selected.size > 0 ? ` (${selected.size})` : ''}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
