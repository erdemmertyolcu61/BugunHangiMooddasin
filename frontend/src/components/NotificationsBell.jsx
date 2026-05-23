import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X, Play, Star } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getShares, getUnreadShareCount, markSharesRead } from '../services/api';
import FilmDetailModal from './FilmDetailModal';

const POLL_MS = 120000; // 2 dk — backend'i yormayan hafif yoklama

/**
 * Global bildirim zili — arkadaşlardan gelen doğrudan film önerileri.
 *  - Zil ikonunda okunmamış varsa altın (#d4af37) nokta
 *  - Panel açılınca ENİNE YAYVAN kartlar: solda afiş, sağda gönderen + not + "Hemen İzle"
 *  - Yalnızca Google ile giriş yapan kullanıcıya görünür
 */
export default function NotificationsBell() {
  const { token } = useAuth();
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [shares, setShares] = useState([]);
  const [loading, setLoading] = useState(false);
  const [detailMovie, setDetailMovie] = useState(null);

  const refreshCount = useCallback(async () => {
    if (!token) return;
    try {
      const { unread_count } = await getUnreadShareCount();
      setCount(unread_count || 0);
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
      const data = await getShares();
      setShares(data.shares || []);
      // Görüldü → rozeti sıfırla
      if ((data.shares || []).length > 0) {
        await markSharesRead();
        setCount(0);
      }
    } catch {
      setShares([]);
    } finally {
      setLoading(false);
    }
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

  return (
    <>
      {/* Zil butonu — sağ üst, güvenli alan */}
      <button
        onClick={openPanel}
        aria-label="Bildirimler"
        className="fixed top-4 right-4 z-[80] w-11 h-11 rounded-full bg-[#161010]/90 border border-white/10
                   backdrop-blur-md flex items-center justify-center shadow-lg hover:border-amber/40 transition-all
                   mt-safe"
      >
        <Bell size={19} className="text-[#f5f2eb]/80" />
        {count > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full
                       flex items-center justify-center text-[10px] font-bold text-black"
            style={{ backgroundColor: '#d4af37', boxShadow: '0 0 8px rgba(212,175,55,0.7)' }}
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
                  <Bell size={18} className="text-[#d4af37]" />
                  <h3 className="font-serif text-lg font-bold text-[#f5f2eb]">Gelen Öneriler</h3>
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
                ) : shares.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-4 text-center px-6">
                    <span className="text-4xl opacity-40">🕊️</span>
                    <p className="text-sm font-serif italic text-white/40">
                      Henüz arkadaşlarından bir öneri uçup gelmedi.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {shares.map((s) => (
                      <motion.div
                        key={s.id}
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                        /* ENİNE YAYVAN kart: solda afiş, sağda içerik */
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
                              <img src={s.sender.avatar} alt="" className="w-4 h-4 rounded-full object-cover" />
                            )}
                            <span className="text-[11px] text-amber/70 font-semibold truncate">
                              {s.sender?.name || s.sender?.username}
                            </span>
                          </div>
                          <h4 className="text-sm font-serif font-bold text-[#f5f2eb] line-clamp-1">
                            {s.movie_title || `Film #${s.movie_id}`}
                          </h4>
                          {s.vote_average > 0 && (
                            <span className="flex items-center gap-1 text-[10px] text-[#ffbf00] font-bold mt-0.5">
                              <Star size={9} className="fill-[#ffbf00]" />{s.vote_average.toFixed(1)}
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
                                       bg-[#ffbf00] text-[#120d0b] text-[10px] font-bold uppercase tracking-wider
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
