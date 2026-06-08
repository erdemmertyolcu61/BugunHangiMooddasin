import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, UserPlus, Bell, Check, X, Search, Trash2, Star as StarIcon,
  Send, RotateCcw, MessageCircle, ChevronRight, Info, UsersRound,
} from 'lucide-react';
import { resolveAvatarUrl } from '../../utils/apiConfig';
import { proxyImageUrl, unrecommendFromCommunity } from '../../services/api';

const sanitize = (str) =>
  String(str ?? '').replace(/[<>{}$]/g, '').replace(/javascript:/gi, '').trim();

const IMG_BASE = 'https://image.tmdb.org/t/p/w200';

/* ── Zaman etiketleri ────────────────────────────────────────── */
function timeAgo(dateStr) {
  if (!dateStr) return '';
  const d = new Date(String(dateStr).replace(' ', 'T'));
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'Az önce';
  if (diff < 3600) return `${Math.floor(diff / 60)}dk`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}sa`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}g`;
  return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' }).format(d);
}

/* ── Avatar bileşeni ─────────────────────────────────────────── */
function Avatar({ src, name, size = 40, ring = false, failedAvatars, onError, id }) {
  const s = `${size}px`;
  const hasSrc = src && !failedAvatars?.has(id);
  return (
      <div
        className={`rounded-full overflow-hidden shrink-0 flex items-center justify-center ${ring ? 'avatar-ring-conic' : ''}`}
        style={{
          width: s, height: s,
          ...(ring ? {} : { background: 'rgba(255,191,0,0.08)' }),
          padding: ring ? '2px' : 0,
        }}
      >
      <div className="w-full h-full rounded-full overflow-hidden bg-[#1c1512] flex items-center justify-center">
        {hasSrc ? (
          <img
            src={resolveAvatarUrl(src)}
            alt={name || ''}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
            onError={() => onError?.(id)}
          />
        ) : (
          <span className="font-bold text-amber/60" style={{ fontSize: `${size * 0.32}px` }}>
            {(name || '?')[0].toUpperCase()}
          </span>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   ProfileSocial — Modern mobil-app tasarımı
   Sekmeler: Arkadaşlar / İstekler / Öneriler / Topluluğa Önerilerim
   ══════════════════════════════════════════════════════════════════ */
export default function ProfileSocial({
  friends = [],
  requests = [],
  shares = [],
  sent = [],
  communityRecs = [],
  setCommunityRecs,
  socialLoading = false,
  socialError = '',
  respondLoading = null,
  onRespondRequest,
  onRemoveFriend,
  onAddFriend,
  onRetractSent,
  onDetailMovie,
}) {
  const [activeTab, setActiveTab] = useState('friends');
  const [shareDir, setShareDir] = useState('received');
  const [addUsername, setAddUsername] = useState('');
  const [addMsg, setAddMsg] = useState(null);
  const [addBusy, setAddBusy] = useState(false);
  const [friendSearch, setFriendSearch] = useState('');
  const [failedAvatars, setFailedAvatars] = useState(new Set());

  const onAvatarError = useCallback((id) => {
    setFailedAvatars(prev => { const n = new Set(prev); n.add(id); return n; });
  }, []);

  const handleRemoveCommunityRec = useCallback(async (tmdbId) => {
    setCommunityRecs(prev => prev.filter(r => r.tmdb_id !== tmdbId));
    unrecommendFromCommunity(tmdbId).catch(() => {});
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
      setAddMsg({ ok: true, text: result === 'ACCEPTED' ? 'Arkadaş eklendi!' : 'İstek gönderildi!' });
      setAddUsername('');
    } catch (err) {
      setAddMsg({ ok: false, text: err.message || 'Gönderilemedi' });
    } finally {
      setAddBusy(false);
    }
  }, [addUsername, addBusy, onAddFriend]);

  const tabs = [
    { id: 'friends', icon: Users, count: friends.length },
    { id: 'requests', icon: UserPlus, count: requests.length, pulse: requests.length > 0 },
    { id: 'shares', icon: Bell, count: shares.length + sent.length },
    { id: 'community', icon: UsersRound, count: communityRecs.length },
  ];

  const tabLabels = {
    friends: 'Arkadaşlar',
    requests: 'İstekler',
    shares: 'Öneriler',
    community: 'Topluluğa',
  };

  return (
    <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.30, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-5">

      {/* ── Tab bar — iOS segment control style ── */}
      <div className="flex gap-0.5 p-[3px] rounded-2xl bg-[#1a1310] border border-white/[0.05] overflow-hidden">
        {tabs.map(tab => {
          const active = activeTab === tab.id;
          return (
            <button key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex-1 min-w-0 relative flex flex-col items-center gap-1 py-2.5 rounded-[13px] transition-all duration-300"
              style={{
                background: active ? 'rgba(255,191,0,0.1)' : 'transparent',
                boxShadow: active ? 'inset 0 0 0 1px rgba(255,191,0,0.18)' : 'none',
              }}
            >
              <div className="relative">
                <tab.icon size={16} className={active ? 'text-amber' : 'text-ivory/30'} style={{ transition: 'color 0.3s' }} />
                {tab.pulse && (
                  <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-rose-400 animate-pulse" />
                )}
              </div>
              <span className={`text-[9px] font-bold uppercase tracking-[0.08em] transition-colors duration-300 ${
                active ? 'text-amber' : 'text-ivory/30'
              }`}>
                {tabLabels[tab.id]}
              </span>
              {tab.count > 0 && active && (
                <motion.span
                  initial={{ scale: 0 }} animate={{ scale: 1 }}
                  className="absolute top-1 right-1.5 min-w-[16px] h-[16px] px-1 rounded-full
                    flex items-center justify-center text-[8px] font-bold bg-amber/20 text-amber"
                >
                  {tab.count}
                </motion.span>
              )}
            </button>
          );
        })}
      </div>

      {socialError && (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="px-3 py-2 text-[12px] font-serif italic text-rose-300 bg-rose-500/5 rounded-xl border border-rose-500/10">
          {socialError}
        </motion.p>
      )}

      {socialLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="flex gap-1.5">
            {[0, 1, 2].map(i => (
              <motion.div key={i}
                className="w-1.5 h-1.5 rounded-full bg-amber"
                animate={{ y: [0, -6, 0], opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
              />
            ))}
          </div>
        </div>
      ) : (
        <AnimatePresence mode="wait">
          {/* ═══════════════ FRIENDS ═══════════════ */}
          {activeTab === 'friends' && (
            <motion.div key="friends"
              initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }}
              transition={{ duration: 0.25 }}
              className="space-y-3"
            >
              {/* Add friend input — floating card */}
              <div className="p-3.5 rounded-2xl bg-gradient-to-r from-amber/[0.06] to-transparent border border-amber/10">
                <div className="flex gap-2">
                  <input value={addUsername}
                    onChange={e => { setAddUsername(e.target.value); setAddMsg(null); }}
                    onKeyDown={e => e.key === 'Enter' && handleAdd()}
                    placeholder="Kullanıcı adı ile ekle..."
                    className="flex-1 px-4 py-2.5 bg-black/20 border border-white/[0.06] rounded-xl
                      text-[13px] text-ivory placeholder:text-white/30 focus:outline-none focus:border-amber/30
                      transition-all font-mono"
                  />
                  <button onClick={handleAdd} disabled={addBusy || !addUsername.trim()}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-amber text-[#120d0b] rounded-xl text-[11px] font-bold
                      uppercase tracking-wider hover:brightness-110 transition-all disabled:opacity-30
                      active:scale-[0.96] shrink-0"
                  >
                    <UserPlus size={13} />
                    <span className="hidden sm:inline">Ekle</span>
                  </button>
                </div>
                {addMsg && (
                  <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                    className={`mt-2 text-[11px] font-medium px-1 ${addMsg.ok ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {addMsg.text}
                  </motion.p>
                )}
              </div>

              {/* Search (if friends exist) */}
              {friends.length > 3 && (
                <div className="relative">
                  <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25" />
                  <input value={friendSearch} onChange={e => setFriendSearch(e.target.value)}
                    placeholder="Arkadaşlarında ara..."
                    className="w-full pl-10 pr-4 py-2.5 bg-[#1a1310] border border-white/[0.05] rounded-xl
                      text-[13px] text-ivory placeholder:text-white/30 focus:outline-none focus:border-amber/20 transition-all" />
                </div>
              )}

              {/* Friends list */}
              {friends.length === 0 ? (
                <div className="py-10 rounded-2xl bg-[#1a1310]/80 border border-white/[0.04] text-center space-y-4">
                  <div className="w-16 h-16 mx-auto rounded-full bg-amber/[0.06] flex items-center justify-center">
                    <Users size={24} className="text-amber/30" />
                  </div>
                  <div className="space-y-1.5">
                    <p className="font-serif text-[15px] font-semibold text-ivory/60">Henüz arkadaşın yok</p>
                    <p className="text-[12px] text-ivory/35 max-w-[220px] mx-auto leading-relaxed">
                      Kullanıcı adı ile arkadaş ekle, birlikte film keşfedin.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <AnimatePresence>
                    {filteredFriends.map((f, i) => (
                      <motion.div key={f.id}
                        layout
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -60, transition: { duration: 0.25 } }}
                        transition={{ delay: i * 0.03 }}
                        className="group flex items-center gap-3 p-3 rounded-xl
                          hover:bg-white/[0.03] transition-all duration-200 cursor-default"
                      >
                        <Avatar
                          src={f.avatar} name={f.username || f.name} size={42} ring
                          failedAvatars={failedAvatars} onError={onAvatarError} id={f.id}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-[14px] text-ivory truncate leading-tight">
                            {f.username || f.name}
                          </p>
                          <p className="text-[11px] text-white/35 truncate">@{f.username}</p>
                        </div>
                        <button onClick={() => onRemoveFriend(f.id)}
                          className="w-8 h-8 rounded-full flex items-center justify-center
                            text-white/15 hover:text-rose-400 hover:bg-rose-500/8
                            opacity-0 group-hover:opacity-100 sm:opacity-100 transition-all" title="Kaldır">
                          <X size={14} />
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  {friendSearch && filteredFriends.length === 0 && (
                    <p className="text-center text-[13px] font-serif italic text-white/40 py-6">
                      "{friendSearch}" ile eşleşen yok.
                    </p>
                  )}
                </div>
              )}
            </motion.div>
          )}

          {/* ═══════════════ REQUESTS ═══════════════ */}
          {activeTab === 'requests' && (
            <motion.div key="requests"
              initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }}
              transition={{ duration: 0.25 }}
              className="space-y-2"
            >
              {requests.length === 0 ? (
                <div className="py-10 rounded-2xl bg-[#1a1310]/80 border border-white/[0.04] text-center space-y-4">
                  <div className="w-16 h-16 mx-auto rounded-full bg-amber/[0.06] flex items-center justify-center">
                    <UserPlus size={24} className="text-amber/30" />
                  </div>
                  <p className="font-serif text-[15px] text-ivory/50">Bekleyen istek yok</p>
                </div>
              ) : (
                <AnimatePresence>
                  {requests.map((r, i) => (
                    <motion.div key={r.request_id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, height: 0, marginBottom: 0, transition: { duration: 0.3 } }}
                      transition={{ delay: i * 0.05 }}
                      className="flex items-center gap-3 p-4 rounded-2xl bg-[#1a1310] border border-white/[0.05]
                        hover:border-amber/10 transition-all"
                    >
                      <Avatar
                        src={r.avatar} name={r.username || r.name} size={44}
                        failedAvatars={failedAvatars} onError={onAvatarError} id={r.request_id}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-[14px] text-ivory truncate">{r.username || r.name}</p>
                        <p className="text-[11px] text-white/35">Arkadaşlık isteği gönderdi</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => onRespondRequest(r.request_id, 'ACCEPT')}
                          disabled={!!respondLoading}
                          className="h-9 px-4 rounded-xl bg-emerald-500/15 border border-emerald-500/25
                            flex items-center gap-1.5 text-emerald-400 text-[11px] font-bold uppercase tracking-wider
                            hover:bg-emerald-500/25 transition-all disabled:opacity-30 active:scale-[0.96]">
                          <Check size={13} /> Kabul
                        </button>
                        <button onClick={() => onRespondRequest(r.request_id, 'DECLINE')}
                          disabled={!!respondLoading}
                          className="w-9 h-9 rounded-xl bg-white/[0.03] border border-white/[0.06]
                            flex items-center justify-center text-white/30 hover:text-rose-400
                            hover:border-rose-400/20 transition-all disabled:opacity-30">
                          <X size={14} />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </motion.div>
          )}

          {/* ═══════════════ SHARES (Öneriler) ═══════════════ */}
          {activeTab === 'shares' && (
            <motion.div key="shares"
              initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }}
              transition={{ duration: 0.25 }}
              className="space-y-3"
            >
              {/* Gelen / Gönderdiğim toggle */}
              <div className="flex gap-0.5 p-[3px] rounded-xl bg-[#1a1310] border border-white/[0.04] max-w-[260px] mx-auto">
                {[
                  { id: 'received', label: 'Gelen', n: shares.length },
                  { id: 'sent', label: 'Gönderdiğim', n: sent.length },
                ].map(d => (
                  <button key={d.id} onClick={() => setShareDir(d.id)}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg
                      text-[11px] font-bold uppercase tracking-[0.1em] transition-all duration-200 ${
                      shareDir === d.id
                        ? 'bg-amber/12 text-amber shadow-[inset_0_0_0_1px_rgba(255,191,0,0.15)]'
                        : 'text-ivory/30 hover:text-ivory/50'
                    }`}>
                    {d.label}
                    {d.n > 0 && (
                      <span className={`min-w-[16px] h-[16px] px-1 rounded-full flex items-center justify-center text-[8px] font-bold ${
                        shareDir === d.id ? 'bg-amber/20 text-amber' : 'bg-white/[0.06] text-ivory/30'
                      }`}>{d.n}</span>
                    )}
                  </button>
                ))}
              </div>

              {/* Gönderdiğim */}
              {shareDir === 'sent' ? (
                sent.length === 0 ? (
                  <EmptyState icon={Send} text="Henüz film önermedin" sub="Filmleri arkadaşlarınla paylaş." />
                ) : (
                  <AnimatePresence initial={false}>
                    {sent.map(s => (
                      <ShareCard key={`sent-${s.id}`} share={s} direction="sent"
                        onDetail={onDetailMovie} onRetract={onRetractSent}
                        failedAvatars={failedAvatars} onAvatarError={onAvatarError}
                      />
                    ))}
                  </AnimatePresence>
                )
              ) : shares.length === 0 ? (
                <EmptyState icon={Bell} text="Gelen öneri yok" sub="Arkadaşlarının film önerileri burada görünecek." />
              ) : (
                <AnimatePresence initial={false}>
                  {shares.map(s => (
                    <ShareCard key={`recv-${s.id}`} share={s} direction="received"
                      onDetail={onDetailMovie}
                      failedAvatars={failedAvatars} onAvatarError={onAvatarError}
                    />
                  ))}
                </AnimatePresence>
              )}
            </motion.div>
          )}

          {/* ═══════════════ COMMUNITY (Topluluğa Önerilerim) ═══════════════ */}
          {activeTab === 'community' && (
            <motion.div key="community"
              initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }}
              transition={{ duration: 0.25 }}
              className="space-y-3"
            >
              <div className="flex items-center gap-2 px-1">
                <UsersRound size={13} className="text-ivory/40" />
                <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-ivory/40">
                  Topluluğa önerdiğin filmler
                </p>
              </div>

              {socialLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="flex gap-1.5">
                    {[0, 1, 2].map(i => (
                      <motion.div key={i}
                        className="w-1.5 h-1.5 rounded-full bg-amber"
                        animate={{ y: [0, -6, 0], opacity: [0.3, 1, 0.3] }}
                        transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
                      />
                    ))}
                  </div>
                </div>
              ) : communityRecs.length === 0 ? (
                <EmptyState
                  icon={UsersRound}
                  text="Henüz topluluk önerin yok"
                  sub="Bir filmi beğendiğinde 'Topluluğa Öner' ile herkese tavsiye et."
                />
              ) : (
                <AnimatePresence initial={false}>
                  <div className="space-y-2 sm:grid sm:grid-cols-3 sm:gap-2.5 sm:space-y-0">
                    {communityRecs.map((rec, i) => (
                      <motion.div key={rec.tmdb_id}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -50, height: 0, marginBottom: 0, transition: { duration: 0.3 } }}
                        transition={{ delay: i * 0.04 }}
                        className="flex gap-3 p-3.5 rounded-2xl bg-[#1a1310] border border-white/[0.05]
                          hover:border-white/[0.08] sm:hover:border-amber/15 transition-all overflow-hidden cursor-pointer"
                        onClick={() => onDetailMovie?.({
                          id: rec.tmdb_id, title: rec.title, poster_url: rec.poster_url,
                          vote_average: rec.vote_average, release_date: rec.release_date,
                        })}
                      >
                        <div className="w-[50px] shrink-0 aspect-[2/3] rounded-xl overflow-hidden bg-white/[0.03] relative">
                          {rec.poster_url ? (
                            <img src={proxyImageUrl(rec.poster_url)} alt={rec.title}
                              className="w-full h-full object-cover" loading="lazy" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-lg opacity-20">🎬</div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0 flex flex-col gap-1 justify-center">
                          <h4 className="text-[13px] font-serif font-bold text-ivory line-clamp-1 sm:line-clamp-2 leading-tight">
                            {rec.title}
                          </h4>
                          <div className="flex items-center gap-2 text-[10px] text-ivory/40">
                            {rec.vote_average > 0 && (
                              <span className="flex items-center gap-1 text-amber/80 font-bold">
                                <StarIcon size={8} className="fill-amber/80" /> {Number(rec.vote_average).toFixed(1)}
                              </span>
                            )}
                            <span>{timeAgo(rec.recommended_at)}</span>
                            {rec.release_date && (
                              <><span className="text-white/10">·</span><span>{String(rec.release_date).slice(0, 4)}</span></>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRemoveCommunityRec(rec.tmdb_id); }}
                          className="self-center w-8 h-8 rounded-full flex items-center justify-center
                            text-white/30 hover:text-rose-400 hover:bg-rose-500/8 transition-all shrink-0"
                        >
                          <X size={14} />
                        </button>
                      </motion.div>
                    ))}
                  </div>
                </AnimatePresence>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </motion.div>
  );
}

/* ── Boş durum bileşeni ──────────────────────────────────────── */
function EmptyState({ icon: Icon, text, sub }) {
  return (
    <div className="py-10 rounded-2xl bg-[#1a1310]/80 border border-white/[0.04] text-center space-y-4">
      <div className="w-16 h-16 mx-auto rounded-full bg-amber/[0.06] flex items-center justify-center">
        <Icon size={24} className="text-amber/30" />
      </div>
      <div className="space-y-1.5">
        <p className="font-serif text-[15px] font-semibold text-ivory/60">{text}</p>
        {sub && <p className="text-[12px] text-ivory/35 max-w-[240px] mx-auto leading-relaxed">{sub}</p>}
      </div>
    </div>
  );
}

/* ── Paylaşım kartı (gelen/gönderilen) ───────────────────────── */
function ShareCard({ share: s, direction, onDetail, onRetract, failedAvatars, onAvatarError }) {
  const isSent = direction === 'sent';
  const person = isSent ? s.receiver : s.sender;
  const personLabel = person?.username || person?.name || 'Arkadaş';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -50, height: 0, marginBottom: 0, transition: { duration: 0.3 } }}
      className="flex gap-3 p-3.5 rounded-2xl bg-[#1a1310] border border-white/[0.05]
        hover:border-white/[0.08] transition-all overflow-hidden"
    >
      {/* Poster thumbnail */}
      <div className="w-[60px] sm:w-[72px] shrink-0 aspect-[2/3] rounded-xl overflow-hidden bg-white/[0.03] relative cursor-pointer"
        onClick={() => onDetail?.({
          id: s.movie_id, title: s.movie_title, poster_url: s.poster_url,
          vote_average: s.vote_average, release_date: s.release_date,
        })}
      >
        {s.poster_url ? (
          <img src={proxyImageUrl(s.poster_url)} alt={s.movie_title} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xl opacity-20">🎬</div>
        )}
        {!s.is_read && !isSent && (
          <div className="absolute top-1.5 left-1.5 w-2 h-2 rounded-full bg-amber shadow-[0_0_6px_rgba(255,191,0,0.6)]" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        {/* Person line */}
        <div className="flex items-center gap-2">
          {person?.avatar && (
            <img src={resolveAvatarUrl(person.avatar)} alt=""
              className="w-5 h-5 rounded-full object-cover border border-white/10" referrerPolicy="no-referrer" />
          )}
          <span className="text-[11px] text-ivory/45">
            {isSent ? 'Önerdiğin →' : ''} <span className="text-amber/70 font-semibold">@{personLabel}</span>
          </span>
        </div>

        {/* Title */}
        <h4 className="text-[14px] font-serif font-bold text-ivory line-clamp-1 leading-tight">
          {s.movie_title || `Film #${s.movie_id}`}
        </h4>

        {/* Rating */}
        {s.vote_average > 0 && (
          <span className="flex items-center gap-1 text-[10px] text-amber/80 font-bold">
            <StarIcon size={9} className="fill-amber/80" /> {Number(s.vote_average).toFixed(1)}
          </span>
        )}

        {/* Note */}
        {s.user_note && (
          <p className="text-[13px] sm:text-[12px] font-serif not-italic sm:italic text-white/70 sm:text-white/50 line-clamp-3 sm:line-clamp-2 leading-relaxed">
            {sanitize(s.user_note)}
          </p>
        )}

        {/* Actions */}
        <div className="mt-auto flex items-center gap-2 pt-1.5">
          <button
            onClick={() => onDetail?.({
              id: s.movie_id, title: s.movie_title, poster_url: s.poster_url,
              vote_average: s.vote_average, release_date: s.release_date,
            })}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg
              bg-amber/12 border border-amber/20 text-amber text-[10px] font-bold uppercase tracking-wider
              hover:bg-amber/20 transition-all active:scale-[0.96]"
          >
            <Info size={10} /> Detaylar
          </button>
          {isSent && onRetract && (
            <button
              onClick={() => onRetract(s.id)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg
                bg-white/[0.03] border border-white/[0.06] text-white/40 text-[10px] font-bold uppercase tracking-wider
                hover:text-rose-400 hover:border-rose-400/20 transition-all active:scale-[0.96]"
            >
              <RotateCcw size={10} /> Geri Al
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
