import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, UserPlus, Bell, Check, X, Search, Trash2, Play, Star as StarIcon, Send, RotateCcw,
} from 'lucide-react';
import { resolveAvatarUrl } from '../../utils/apiConfig';
import LottieAnimation from '../LottieAnimation';

const sanitize = (str) =>
  String(str ?? '').replace(/[<>{}$]/g, '').replace(/javascript:/gi, '').trim();

/**
 * Tabbed social panel — Arkadaşlar / İstekler / Öneriler
 */
export default function ProfileSocial({
  friends = [],
  requests = [],
  shares = [],
  sent = [],
  socialLoading = false,
  socialError = '',
  onRespondRequest,
  onRemoveFriend,
  onAddFriend,
  onRetractSent,
  onDetailMovie,
}) {
  const [activeTab, setActiveTab] = useState('friends');
  const [shareDir, setShareDir] = useState('received'); // received | sent
  const [addUsername, setAddUsername] = useState('');
  const [addMsg, setAddMsg] = useState(null);
  const [addBusy, setAddBusy] = useState(false);
  const [friendSearch, setFriendSearch] = useState('');
  const [failedAvatars, setFailedAvatars] = useState(new Set());

  const onAvatarError = useCallback((id) => {
    setFailedAvatars(prev => { const n = new Set(prev); n.add(id); return n; });
  }, []);

  const filteredFriends = useMemo(() =>
    friendSearch.trim()
      ? friends.filter(f =>
          (f.name || '').toLowerCase().includes(friendSearch.toLowerCase()) ||
          (f.username || '').toLowerCase().includes(friendSearch.toLowerCase()))
      : friends,
    [friends, friendSearch]);

  const handleAdd = useCallback(async () => {
    const u = addUsername.trim();
    if (!u || addBusy) return;
    setAddMsg(null);
    setAddBusy(true);
    try {
      const result = await onAddFriend(u);
      setAddMsg({ ok: true, text: result === 'ACCEPTED' ? 'Arkadaş eklendi!' : 'İstek gönderildi, onay bekliyor.' });
      setAddUsername('');
    } catch (err) {
      setAddMsg({ ok: false, text: err.message || 'Gönderilemedi' });
    } finally {
      setAddBusy(false);
    }
  }, [addUsername, addBusy, onAddFriend]);

  const tabs = [
    { id: 'friends', label: 'Arkadaşlar', icon: Users, count: friends.length },
    { id: 'requests', label: 'İstekler', icon: UserPlus, count: requests.length },
    { id: 'shares', label: 'Öneriler', icon: Bell, count: shares.length + sent.length },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.30, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-4">

      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-full bg-[#1c1512]/90 border border-white/[0.06]">
        {tabs.map(tab => (
          <button key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-full text-[11px] font-bold uppercase tracking-[0.15em] transition-all ${
              activeTab === tab.id
                ? 'bg-amber/15 text-amber border border-amber/20'
                : 'text-ivory/40 hover:text-ivory/60'
            }`}>
            <tab.icon size={13} />
            <span className="hidden sm:inline">{tab.label}</span>
            {tab.count > 0 && (
              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${
                activeTab === tab.id ? 'bg-amber/25 text-amber' : 'bg-white/10 text-ivory/40'
              }`}>{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {socialError && (
        <p className="px-1 text-[12px] font-serif italic text-rose-400">{socialError}</p>
      )}

      {socialLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="flex gap-2">
            {[0, 1, 2].map(i => (
              <motion.div key={i} className="w-2 h-2 rounded-full" style={{ backgroundColor: '#d4af37' }}
                animate={{ opacity: [0.2, 1, 0.2] }}
                transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.25 }} />
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* ─── FRIENDS TAB ─── */}
          {activeTab === 'friends' && (
            <div className="space-y-3">
              {/* Search + Add */}
              <div className="flex gap-2">
                {friends.length > 0 && (
                  <div className="relative flex-1">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                    <input value={friendSearch} onChange={e => setFriendSearch(e.target.value)}
                      placeholder="Arkadaş Ara..."
                      className="w-full pl-8 pr-3 py-2.5 bg-white/5 border border-white/[0.08] rounded-full
                        text-sm text-ivory placeholder:text-white/45 focus:outline-none focus:border-amber/30 transition-all" />
                  </div>
                )}
                <div className="flex gap-1.5">
                  <input value={addUsername}
                    onChange={e => { setAddUsername(e.target.value); setAddMsg(null); }}
                    onKeyDown={e => e.key === 'Enter' && handleAdd()}
                    placeholder="kullanıcı_adı"
                    className="w-28 sm:w-36 px-3 py-2.5 bg-white/5 border border-white/[0.08] rounded-full
                      text-sm text-ivory placeholder:text-white/45 focus:outline-none focus:border-amber/30 transition-all font-mono" />
                  <button onClick={handleAdd} disabled={addBusy}
                    className="flex items-center gap-1 px-3 py-2.5 bg-amber text-[#120d0b] rounded-full text-[11px] font-bold
                      hover:bg-amber-400 transition-all disabled:opacity-40 shrink-0" title="Ekle">
                    <UserPlus size={13} />
                  </button>
                </div>
              </div>
              {addMsg && (
                <p className={`text-xs font-serif px-1 ${addMsg.ok ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {addMsg.text}
                </p>
              )}

              {friends.length === 0 ? (
                <div className="p-6 rounded-2xl bg-[#1c1512]/90 border border-white/[0.06] text-center space-y-3">
                  <LottieAnimation path="/lottie/empty-state.json" className="w-16 h-16 mx-auto opacity-40" speed={0.6} />
                  <p className="font-serif text-sm italic text-ivory/70 leading-relaxed">
                    Henüz sinema arkadaşın yok. Üstad'ın dünyasına arkadaşlarını davet et!
                  </p>
                </div>
              ) : (
                <AnimatePresence>
                  {filteredFriends.length === 0 ? (
                    <p className="text-center text-sm font-serif italic text-white/60 py-4">
                      &ldquo;{friendSearch}&rdquo; ile eşleşen arkadaş yok.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {filteredFriends.map(f => (
                        <motion.div key={f.id} layout exit={{ opacity: 0, x: -40 }}
                          transition={{ duration: 0.3 }}
                          className="flex items-center gap-3 p-3 rounded-xl bg-[#1c1512]/90 border border-white/[0.06] hover:border-white/10 transition-all">
                          <div className="w-9 h-9 rounded-full overflow-hidden bg-amber/10 shrink-0 flex items-center justify-center">
                            {f.avatar && !failedAvatars.has(f.id)
                              ? <img src={resolveAvatarUrl(f.avatar)} alt={f.name} className="w-full h-full object-cover" referrerPolicy="no-referrer"
                                  onError={() => onAvatarError(f.id)} />
                              : <span className="font-bold text-[11px] text-amber/60">{(f.username || f.name || '?')[0].toUpperCase()}</span>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-[13px] text-ivory truncate">{f.username || f.name}</p>
                            <p className="text-[12px] text-white/45 truncate">@{f.username}</p>
                          </div>
                          <button onClick={() => onRemoveFriend(f.id)}
                            className="w-7 h-7 rounded-full flex items-center justify-center
                              text-white/30 hover:text-rose-400 hover:bg-rose-500/10 transition-all" title="Kaldır">
                            <Trash2 size={13} />
                          </button>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </AnimatePresence>
              )}
            </div>
          )}

          {/* ─── REQUESTS TAB ─── */}
          {activeTab === 'requests' && (
            <div className="space-y-1.5">
              {requests.length === 0 ? (
                <div className="p-6 rounded-2xl bg-[#1c1512]/90 border border-white/[0.06] text-center">
                  <p className="font-serif text-sm italic text-ivory/65">Bekleyen istek yok.</p>
                </div>
              ) : (
                requests.map(r => (
                  <motion.div key={r.request_id} layout exit={{ opacity: 0, x: -40 }}
                    transition={{ duration: 0.3 }}
                    className="flex items-center gap-3 p-3 rounded-xl bg-[#1c1512]/90 border border-white/[0.06]">
                    <div className="w-9 h-9 rounded-full overflow-hidden bg-amber/10 shrink-0 flex items-center justify-center">
                      {r.avatar && !failedAvatars.has(r.request_id)
                        ? <img src={resolveAvatarUrl(r.avatar)} alt={r.name} className="w-full h-full object-cover" referrerPolicy="no-referrer"
                            onError={() => onAvatarError(r.request_id)} />
                        : <span className="font-bold text-[11px] text-amber/60">{(r.username || r.name || '?')[0].toUpperCase()}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[13px] text-ivory truncate">{r.username || r.name}</p>
                      <p className="text-[11px] text-white/45 truncate">@{r.username}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button onClick={() => onRespondRequest(r.request_id, 'ACCEPT')}
                        className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/20
                          flex items-center justify-center hover:bg-emerald-500/20 transition-all" title="Onayla">
                        <Check size={14} className="text-emerald-400" />
                      </button>
                      <button onClick={() => onRespondRequest(r.request_id, 'DECLINE')}
                        className="w-8 h-8 rounded-full bg-rose-500/10 border border-rose-500/20
                          flex items-center justify-center hover:bg-rose-500/20 transition-all" title="Reddet">
                        <X size={14} className="text-rose-400" />
                      </button>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          )}

          {/* ─── SHARES TAB ─── */}
          {activeTab === 'shares' && (
            <div className="space-y-2.5">
              {/* Gelen / Gönderdiğim alt-toggle */}
              <div className="flex gap-1 p-1 rounded-full bg-[#221913]/80 border border-white/[0.05] w-full max-w-[280px] mx-auto">
                {[
                  { id: 'received', label: 'Gelen', n: shares.length },
                  { id: 'sent', label: 'Gönderdiğim', n: sent.length },
                ].map(d => (
                  <button key={d.id} onClick={() => setShareDir(d.id)}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-full text-[11px] font-bold uppercase tracking-[0.12em] transition-all ${
                      shareDir === d.id ? 'bg-amber/15 text-amber border border-amber/20' : 'text-ivory/40 hover:text-ivory/60'
                    }`}>
                    {d.label}
                    {d.n > 0 && <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] ${shareDir === d.id ? 'bg-amber/25 text-amber' : 'bg-white/10 text-ivory/40'}`}>{d.n}</span>}
                  </button>
                ))}
              </div>

              {/* ── GÖNDERDİĞİM ── */}
              {shareDir === 'sent' ? (
                sent.length === 0 ? (
                  <div className="p-6 rounded-2xl bg-[#1c1512]/90 border border-white/[0.06] text-center space-y-2">
                    <LottieAnimation path="/lottie/film-reel.json" className="w-14 h-14 mx-auto opacity-50" speed={0.7} />
                    <p className="font-serif text-sm italic text-ivory/65">Henüz arkadaşına film önermedin.</p>
                  </div>
                ) : (
                  <AnimatePresence initial={false}>
                  {sent.map(s => (
                    <motion.div key={`sent-${s.id}`} layout
                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -40, height: 0, marginBottom: 0, transition: { duration: 0.3 } }}
                      className="flex gap-3.5 p-4 rounded-xl bg-[#1c1512]/90 border border-white/[0.06] overflow-hidden">
                      <div className="w-16 sm:w-20 shrink-0 aspect-[2/3] rounded-lg overflow-hidden bg-white/5">
                        {s.poster_url
                          ? <img src={s.poster_url} alt={s.movie_title} className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center text-2xl opacity-30">🎬</div>}
                      </div>
                      <div className="flex-1 min-w-0 flex flex-col gap-1">
                        <div className="flex items-center gap-1.5 text-[12px]">
                          <Send size={11} className="text-amber/70 shrink-0" />
                          <span className="text-ivory/45">Önerdiğin:</span>
                          {s.receiver?.avatar && (
                            <img src={resolveAvatarUrl(s.receiver.avatar)} alt="" className="w-4 h-4 rounded-full object-cover" referrerPolicy="no-referrer" />
                          )}
                          <span className="text-amber/75 font-semibold truncate">@{s.receiver?.username || s.receiver?.name || 'arkadaş'}</span>
                        </div>
                        <h4 className="text-[15px] font-serif font-bold text-ivory line-clamp-1">
                          {s.movie_title || `Film #${s.movie_id}`}
                        </h4>
                        {s.user_note && (
                          <p className="text-[13px] font-serif italic text-white/65 line-clamp-3 leading-relaxed">
                            &ldquo;{sanitize(s.user_note)}&rdquo;
                          </p>
                        )}
                        <div className="mt-auto flex items-center gap-2 pt-1">
                          <button
                            onClick={() => onDetailMovie({
                              id: s.movie_id, title: s.movie_title, poster_url: s.poster_url,
                              vote_average: s.vote_average, release_date: s.release_date,
                            })}
                            className="flex items-center gap-1.5 px-4 py-1.5 rounded-full
                              bg-white/5 border border-amber/20 text-amber text-[10px] font-bold uppercase tracking-wider
                              hover:bg-amber/10 transition-all active:scale-95">
                            <Play size={10} /> Filme Bak
                          </button>
                          <button
                            onClick={() => onRetractSent?.(s.id)}
                            title="Bu öneriyi geri al"
                            className="flex items-center gap-1.5 px-4 py-1.5 rounded-full
                              bg-white/5 border border-rose-400/25 text-rose-300/80 text-[10px] font-bold uppercase tracking-wider
                              hover:bg-rose-500/10 hover:text-rose-300 transition-all active:scale-95">
                            <RotateCcw size={10} /> Geri Al
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                  </AnimatePresence>
                )
              ) : shares.length === 0 ? (
                <div className="p-6 rounded-2xl bg-[#1c1512]/90 border border-white/[0.06] text-center">
                  <p className="font-serif text-sm italic text-ivory/65">Henüz gelen öneri yok.</p>
                </div>
              ) : (
                shares.map(s => (
                  <motion.div key={s.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    className="flex gap-3.5 p-4 rounded-xl bg-[#1c1512]/90 border border-white/[0.06]">
                    <div className="w-16 sm:w-20 shrink-0 aspect-[2/3] rounded-lg overflow-hidden bg-white/5">
                      {s.poster_url
                        ? <img src={s.poster_url} alt={s.movie_title} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-2xl opacity-30">🎬</div>}
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        {s.sender?.avatar && (
                          <img src={resolveAvatarUrl(s.sender.avatar)} alt="" className="w-5 h-5 rounded-full object-cover" referrerPolicy="no-referrer" />
                        )}
                        <span className="text-[12px] text-amber/75 font-semibold truncate">
                          {s.sender?.username || s.sender?.name || 'Arkadaş'}
                        </span>
                      </div>
                      <h4 className="text-[15px] font-serif font-bold text-ivory line-clamp-1">
                        {s.movie_title || `Film #${s.movie_id}`}
                      </h4>
                      {s.vote_average > 0 && (
                        <span className="flex items-center gap-1 text-[11px] text-amber font-bold">
                          <StarIcon size={9} className="fill-amber" /> {s.vote_average.toFixed(1)}
                        </span>
                      )}
                      {s.user_note && (
                        <p className="text-[13px] font-serif italic text-white/65 line-clamp-3 leading-relaxed">
                          &ldquo;{sanitize(s.user_note)}&rdquo;
                        </p>
                      )}
                      <button
                        onClick={() => onDetailMovie({
                          id: s.movie_id, title: s.movie_title, poster_url: s.poster_url,
                          vote_average: s.vote_average, release_date: s.release_date,
                        })}
                        className="mt-auto self-start flex items-center gap-1.5 px-5 py-1.5 rounded-full
                          bg-amber text-[#120d0b] text-[10px] font-bold uppercase tracking-wider
                          hover:bg-amber-400 transition-all active:scale-95">
                        <Play size={10} className="fill-[#120d0b]" /> Hemen İzle
                      </button>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}
