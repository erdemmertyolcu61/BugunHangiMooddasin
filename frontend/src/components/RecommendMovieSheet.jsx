import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Send, X, Film, Loader2 } from 'lucide-react';
import { searchMovies, recommendMovieToFriend } from '../services/api';
import { resolveAvatarUrl } from '../utils/apiConfig';
import { proxyImageUrl } from '../services/api';
import LottieAnimation from './LottieAnimation';

const IMG_SM = 'https://image.tmdb.org/t/p/w185';

/**
 * Bana Film Oner — belirli bir arkadasa film aramak & gondermek icin bottom sheet.
 * RecommendToFriendSheet'in tersi: O film icin arkadas secer, bu arkadas icin film secer.
 */
export default function RecommendMovieSheet({ targetUser, onClose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const debounceRef = useRef(null);
  const abortRef = useRef(null);

  // Debounced film arama
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setSearching(true);
      try {
        const data = await searchMovies(q, { signal: ctrl.signal });
        if (!ctrl.signal.aborted) setResults((data.results || []).slice(0, 12));
      } catch (e) {
        if (e.name !== 'AbortError') setResults([]);
      } finally {
        if (!ctrl.signal.aborted) setSearching(false);
      }
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const handleSend = async () => {
    if (!selectedMovie || sending) return;
    setSending(true);
    setError(null);
    try {
      await recommendMovieToFriend(targetUser.id, selectedMovie.id || selectedMovie.tmdb_id, note.trim());
      setSent(true);
      setTimeout(() => onClose?.(), 1600);
    } catch (err) {
      setError(err.message || 'Gonderilemedi');
    } finally {
      setSending(false);
    }
  };

  const avatarUrl = targetUser?.avatar ? resolveAvatarUrl(targetUser.avatar) : null;
  const initial = ((targetUser?.username || targetUser?.name || '?')[0] || '?').toUpperCase();

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[1000] bg-black/70 backdrop-blur-sm"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        className="fixed bottom-0 left-0 right-0 z-[1001] max-h-[85vh] flex flex-col
                   bg-[#161010] border-t border-amber/20 rounded-t-[2rem]
                   shadow-[0_-20px_60px_rgba(0,0,0,0.6)] pb-safe"
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 32, stiffness: 320 }}
      >
        {/* Tutamac */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-12 h-1.5 rounded-full bg-white/15" />
        </div>

        {/* Baslik */}
        <div className="flex items-center justify-between px-6 pt-2 pb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full overflow-hidden bg-white/10 shrink-0">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-amber/60 font-bold">{initial}</div>
              )}
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.35em] text-amber/50">FILM ONER</p>
              <h3 className="font-serif text-lg font-bold text-[#f5f2eb] line-clamp-1">
                {targetUser?.name || targetUser?.username}
              </h3>
            </div>
          </div>
          <button onClick={onClose} className="p-2 -mr-2 rounded-full hover:bg-white/5 transition-all">
            <X size={20} className="text-white/60" />
          </button>
        </div>

        {sent ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }}
            className="relative flex flex-col items-center justify-center gap-3 py-14 px-6 text-center overflow-hidden"
          >
            <div className="pointer-events-none absolute inset-0 opacity-60"
              style={{ background: 'radial-gradient(circle at 50% 38%, rgba(255,191,0,0.16), transparent 60%)' }} />
            <LottieAnimation path="/lottie/success-check.json" loop={false} className="w-28 h-28" />
            <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
              className="text-[19px] font-serif font-bold text-[#f5f2eb]">
              Oneri yola cikti
            </motion.p>
            <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
              className="text-[13px] text-ivory/55 max-w-[260px] leading-relaxed">
              <span className="text-amber/90 font-semibold">{selectedMovie?.title}</span>{' '}
              <span className="text-white/40">{targetUser?.name || targetUser?.username}</span> icin yola cikti.
            </motion.p>
          </motion.div>
        ) : selectedMovie ? (
          /* Film secildi — not + gonder */
          <div className="px-6 pb-5 space-y-4">
            <div className="flex items-center gap-3 p-3 bg-white/[0.04] border border-white/8 rounded-2xl">
              {selectedMovie.poster_path ? (
                <img src={proxyImageUrl(`${IMG_SM}${selectedMovie.poster_path}`)}
                  alt="" className="w-12 h-[72px] rounded-xl object-cover bg-white/5" />
              ) : (
                <div className="w-12 h-[72px] rounded-xl bg-white/5 flex items-center justify-center">
                  <Film size={18} className="text-white/20" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#f5f2eb] line-clamp-1">{selectedMovie.title}</p>
                <p className="text-[11px] text-white/40">{selectedMovie.release_date?.split('-')[0]}</p>
              </div>
              <button onClick={() => setSelectedMovie(null)}
                className="p-2 rounded-full hover:bg-white/5 text-white/40 hover:text-white/70 transition-all">
                <X size={16} />
              </button>
            </div>
            <textarea
              value={note} onChange={(e) => setNote(e.target.value.slice(0, 250))}
              placeholder="Ustad'dan sana mesaj var..."
              rows={2}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-2xl resize-none
                         text-sm text-[#f5f2eb] placeholder:text-white/30 focus:outline-none focus:border-amber/40 no-scrollbar"
            />
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-white/30">{note.length}/250</span>
              {error && <span className="text-[11px] text-rose-400 font-serif">{error}</span>}
              <button onClick={handleSend} disabled={sending}
                className="flex items-center gap-2 px-7 py-3 rounded-full text-xs font-bold uppercase tracking-wider
                           bg-[#ffbf00] text-[#120d0b] shadow-[0_0_20px_rgba(255,191,0,0.25)]
                           disabled:opacity-30 disabled:cursor-not-allowed hover:bg-amber-400 transition-all">
                {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Gonder
              </button>
            </div>
          </div>
        ) : (
          /* Film arama */
          <>
            <div className="px-6 pb-3 shrink-0">
              <div className="relative">
                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
                <input
                  value={query} onChange={(e) => setQuery(e.target.value)}
                  placeholder="Film ara..."
                  autoFocus
                  className="w-full pl-11 pr-4 py-3 bg-white/5 border border-white/10 rounded-full
                             text-sm text-[#f5f2eb] placeholder:text-white/30
                             focus:outline-none focus:border-amber/40 transition-all"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-6 min-h-[120px] no-scrollbar">
              {searching ? (
                <div className="flex justify-center py-10">
                  <div className="flex gap-2">
                    {[0, 1, 2].map((i) => (
                      <motion.div key={i} className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#d4af37' }}
                        animate={{ opacity: [0.2, 1, 0.2] }}
                        transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.25 }} />
                    ))}
                  </div>
                </div>
              ) : results.length === 0 && query.trim().length >= 2 ? (
                <p className="text-center text-sm font-serif italic text-white/40 py-10">
                  &ldquo;{query}&rdquo; ile eslesen film bulunamadi.
                </p>
              ) : results.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Film size={32} className="text-white/15 mb-3" />
                  <p className="text-sm font-serif italic text-white/40">
                    Onerecek filmi aramaya basla
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5 py-1">
                  {results.map((m) => (
                    <button key={m.id} onClick={() => setSelectedMovie(m)}
                      className="w-full flex items-center gap-3 p-2.5 rounded-2xl border
                                 bg-white/[0.03] border-white/8 hover:border-amber/30 hover:bg-amber/5 transition-all text-left">
                      {m.poster_path ? (
                        <img src={proxyImageUrl(`${IMG_SM}${m.poster_path}`)}
                          alt="" className="w-10 h-[60px] rounded-xl object-cover bg-white/5 shrink-0" />
                      ) : (
                        <div className="w-10 h-[60px] rounded-xl bg-white/5 flex items-center justify-center shrink-0">
                          <Film size={14} className="text-white/20" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[#f5f2eb] line-clamp-1">{m.title}</p>
                        <p className="text-[11px] text-white/40">{m.release_date?.split('-')[0]}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
