import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X, Play, Star, UserPlus, Check, UserX } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  getShares, getUnreadShareCount, markSharesRead,
  getFriendRequests, respondFriendRequest,
} from '../services/api';
import FilmDetailModal from './FilmDetailModal';

const POLL_MS = 120000; // 2 dk

/**
 * Global bildirim zili — arkadaşlık istekleri + film önerileri.
 *  - Zil ikonunda okunmamış varsa altın (#d4af37) nokta
 *  - Panel açılınca: önce arkadaşlık istekleri, sonra film önerileri
 *  - Yalnızca Google ile giriş yapan kullanıcıya görünür
 */
export default function NotificationsBell() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [shares, setShares] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [detailMovie, setDetailMovie] = useState(null);

  const refreshCount = useCallback(async () => {
    if (!token) return;
    try {
      const data = await getUnreadShareCount();
      setCount(data.unread_count || 0);
    } catch { /* sessiz */ }
  }, [token]);

  // Sayım yoklaması (mount + interval, sadece sekme görünürken)
  useEffect(() => {
    if (!token) { setCount(0); return; }
    refreshCount();
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') refreshCount();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [token, refreshCount]);

  const openPanel = async () => {
    setOpen(true);
    setLoading(true);
    try {
      const [sharesData, requestsData] = await Promise.all([
        getShares().catch(() => ({ shares: [] })),
        getFriendRequests().catch(() => ({ requests: [] })),
      ]);
      setShares(sharesData.shares || []);
      setRequests(requestsData.requests || []);
      // Film önerilerini okundu işaretle
      if ((sharesData.shares || []).length > 0) {
        await markSharesRead();
      }
      // Count'u güncelle (requests hâlâ kalabilir)
      refreshCount();
    } catch {
      setShares([]);
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRespond = async (requestId, action) => {
    try {
      await respondFriendRequest(requestId, action);
      setRequests(prev => prev.filter(r => r.request_id !== requestId));
      refreshCount();
    } catch { /* sessiz */ }
  };

  const watchNow = (s) => {
    setOpen(false);
    setDetailMovie({
      id: s.movie_id,
      title: s.movie_title,
      poster_url: s.poster_url,
      vote_average: s.vote_average,
      release_date: s.release_date,
    });
  };

  if (!token) return null;

  const hasContent = shares.length > 0 || requests.length > 0;

  return (
    <>
      {/* Zil butonu — profil header icinde inline */}
      <button
        onClick={openPanel}
        aria-label="Bildirimler"
        className="relative w-10 h-10 shrink-0 flex items-center justify-center hover:bg-white/5 rounded-full border border-white/10 transition-all"
      >
        <Bell size={17} className="text-[#f5f2eb]/80" />
        {count > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full
                       flex items-center justify-center text-[10px] font-bold text-black bg-amber"
            style={{ boxShadow: '0 0 8px rgba(212,175,55,0.7)' }}
          >
            {count > 9 ? '9+' : count}
          </motion.span>
        )}
      </button>

      {/* Panel */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.div
              className="fixed top-0 right-0 bottom-0 z-[1001] w-full max-w-md flex flex-col
                         bg-[#161010] border-l border-amber/15 shadow-2xl pt-safe pb-safe"
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 32, stiffness: 320 }}
            >
              <div className="flex items-center justify-between px-6 py-5 border-b border-white/8 shrink-0">
                <div className="flex items-center gap-2.5">
                  <Bell size={18} className="text-amber" />
                  <h3 className="font-serif text-lg font-bold text-[#f5f2eb]">Bildirimler</h3>
                </div>
                <button onClick={() => setOpen(false)} className="p-2 -mr-2 rounded-full hover:bg-white/5">
                  <X size={20} className="text-white/60" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 no-scrollbar">
                {loading ? (
                  <div className="flex justify-center py-12">
                    <div className="flex gap-2">
                      {[0, 1, 2].map((i) => (
                        <motion.div key={i} className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#d4af37' }}
                          animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.25 }} />
                      ))}
                    </div>
                  </div>
                ) : !hasContent ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-4 text-center px-6">
                    <span className="text-4xl opacity-40">🕊️</span>
                    <p className="text-sm font-serif italic text-white/40">
                      Henüz yeni bir bildirim yok.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-5">
                    {/* ─── Arkadaşlık İstekleri ─── */}
                    {requests.length > 0 && (
                      <div className="space-y-2.5">
                        <div className="flex items-center gap-2 px-1">
                          <UserPlus size={13} className="text-amber/60" />
                          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber/60">
                            Arkadaşlık İstekleri
                          </p>
                          <span className="ml-auto inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber/15 text-amber text-[10px] font-bold">
                            {requests.length}
                          </span>
                        </div>
                        {requests.map((r) => (
                          <motion.div key={r.request_id}
                            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                            className="flex items-center gap-3 p-3 rounded-2xl bg-white/[0.04] border border-white/8"
                          >
                            <div className="w-9 h-9 rounded-full overflow-hidden bg-amber/10 shrink-0 flex items-center justify-center">
                              {r.avatar
                                ? <img src={r.avatar} alt={r.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                : <span className="font-bold text-[11px] text-amber/60">{(r.name || r.username || '?')[0].toUpperCase()}</span>}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-[13px] text-[#f5f2eb] truncate">{r.name || r.username}</p>
                              <p className="text-[11px] text-white/45 truncate">@{r.username}</p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button onClick={() => handleRespond(r.request_id, 'ACCEPT')}
                                className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/20
                                  flex items-center justify-center hover:bg-emerald-500/20 transition-all"
                                title="Onayla" aria-label={`${r.name || r.username} isteğini onayla`}>
                                <Check size={14} className="text-emerald-400" />
                              </button>
                              <button onClick={() => handleRespond(r.request_id, 'DECLINE')}
                                className="w-8 h-8 rounded-full bg-rose-500/10 border border-rose-500/20
                                  flex items-center justify-center hover:bg-rose-500/20 transition-all"
                                title="Reddet" aria-label={`${r.name || r.username} isteğini reddet`}>
                                <X size={14} className="text-rose-400" />
                              </button>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    )}

                    {/* ─── Film Önerileri ─── */}
                    {shares.length > 0 && (
                      <div className="space-y-2.5">
                        <div className="flex items-center gap-2 px-1">
                          <Play size={13} className="text-amber/60 fill-amber/60" />
                          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber/60">
                            Gelen Öneriler
                          </p>
                          <span className="ml-auto inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber/15 text-amber text-[10px] font-bold">
                            {shares.length}
                          </span>
                        </div>
                        {shares.map((s) => (
                          <motion.div
                            key={s.id}
                            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                            className="flex gap-3 p-3 rounded-2xl bg-white/[0.04] border border-white/8"
                          >
                            <div className="w-16 shrink-0 aspect-[2/3] rounded-lg overflow-hidden bg-white/10">
                              {s.poster_url ? (
                                <img src={s.poster_url} alt={s.movie_title} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-2xl opacity-30">🎬</div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0 flex flex-col">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                {s.sender?.avatar && (
                                  <img src={s.sender.avatar} alt="" className="w-4 h-4 rounded-full object-cover" referrerPolicy="no-referrer" />
                                )}
                                <span className="text-[11px] text-amber/70 font-semibold truncate">
                                  {s.sender?.name || s.sender?.username}
                                </span>
                              </div>
                              <h4 className="text-sm font-serif font-bold text-[#f5f2eb] line-clamp-1">
                                {s.movie_title || `Film #${s.movie_id}`}
                              </h4>
                              {s.vote_average > 0 && (
                                  <span className="flex items-center gap-1 text-[10px] text-amber font-bold mt-0.5">
                                    <Star size={9} className="fill-amber" />{s.vote_average.toFixed(1)}
                                </span>
                              )}
                              {s.user_note && (
                                <p className="text-[11px] font-serif italic text-white/50 line-clamp-2 mt-1">
                                  &ldquo;{s.user_note}&rdquo;
                                </p>
                              )}
                              <button
                                onClick={() => watchNow(s)}
                                className="mt-auto self-start flex items-center gap-1.5 px-5 py-1.5 rounded-full
                                           bg-amber text-[#120d0b] text-[10px] font-bold uppercase tracking-wider
                                           hover:bg-amber-400 transition-all active:scale-95"
                              >
                                <Play size={11} className="fill-[#120d0b]" /> Hemen İzle
                              </button>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {detailMovie && (
        <FilmDetailModal
          movieId={detailMovie.id}
          initialMovie={detailMovie}
          onClose={() => setDetailMovie(null)}
        />
      )}
    </>
  );
}
