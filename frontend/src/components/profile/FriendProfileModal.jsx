import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Eye, Bookmark, Film, Star, Heart, CalendarDays } from 'lucide-react';
import { getFriendProfile, proxyImageUrl } from '../../services/api';
import { resolveAvatarUrl } from '../../utils/apiConfig';
import ProfileStats from './ProfileStats';
import ProfileTasteMap from './ProfileTasteMap';

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const now = Date.now();
  const d = new Date(dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T') + 'Z');
  const diff = now - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'şimdi';
  if (mins < 60) return `${mins}d`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}s`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}g`;
  return `${Math.floor(days / 7)}h`;
}

const formatDate = (iso) => {
  if (!iso) return null;
  try {
    const d = new Date(String(iso).trim().replace(' ', 'T'));
    if (isNaN(d.getTime())) return null;
    return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
  } catch { return null; }
};

export default function FriendProfileModal({ friend, onClose, onDetailMovie }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [avatarZoom, setAvatarZoom] = useState(false);

  useEffect(() => {
    if (!friend?.id) return;
    setLoading(true);
    setError(null);
    getFriendProfile(friend.id)
      .then(setProfile)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [friend?.id]);

  useEffect(() => {
    document.documentElement.style.overflow = 'hidden';
    const handler = (e) => { if (e.key === 'Escape') { avatarZoom ? setAvatarZoom(false) : onClose(); } };
    window.addEventListener('keydown', handler);
    return () => {
      document.documentElement.style.overflow = '';
      window.removeEventListener('keydown', handler);
    };
  }, [onClose, avatarZoom]);

  const avatarUrl = profile?.picture ? resolveAvatarUrl(profile.picture) : null;
  const joinDate = formatDate(profile?.created_at);

  return (
    <>
      {/* Avatar Lightbox */}
      <AnimatePresence>
        {avatarZoom && avatarUrl && (
          <motion.div
            className="fixed inset-0 z-[1200] flex items-center justify-center"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <div className="fixed inset-0 bg-black/90 backdrop-blur-lg" onClick={() => setAvatarZoom(false)} />
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="relative z-10"
            >
              <div className="w-64 h-64 sm:w-80 sm:h-80 rounded-full overflow-hidden border-4 border-amber/30 shadow-2xl">
                <img src={avatarUrl} alt={profile?.name || ''} className="w-full h-full object-cover" />
              </div>
              <button onClick={() => setAvatarZoom(false)}
                className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-black/60 backdrop-blur-sm
                  flex items-center justify-center text-ivory/80 hover:text-ivory transition-all">
                <X size={14} />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal */}
      <motion.div
        className="fixed inset-0 z-[1101] flex items-end sm:items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md" onClick={onClose} />

        <motion.div
          initial={{ scale: 0.97, y: 60, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.97, y: 60, opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full sm:max-w-lg sm:mx-4 rounded-t-2xl sm:rounded-2xl bg-[#1a1210]
            border-t sm:border border-white/[0.06] shadow-2xl overflow-hidden max-h-[92vh] sm:max-h-[85vh]"
        >
          {/* Mobile drag handle */}
          <div className="sm:hidden flex justify-center pt-2.5 pb-1">
            <div className="w-10 h-1 rounded-full bg-white/20" />
          </div>

          {/* Close */}
          <button onClick={onClose}
            className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/30 backdrop-blur-sm
              flex items-center justify-center text-ivory/60 hover:text-ivory hover:bg-black/50 transition-all">
            <X size={14} />
          </button>

          {loading && (
            <div className="flex items-center justify-center py-24">
              <div className="flex gap-2">
                {[0, 1, 2].map(i => (
                  <motion.div key={i} className="w-2.5 h-2.5 rounded-full bg-amber"
                    animate={{ opacity: [0.2, 1, 0.2] }}
                    transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.25 }} />
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center space-y-3">
              <p className="font-serif text-[15px] italic text-rose-400/60">{error}</p>
              <button onClick={onClose}
                className="px-5 py-2 rounded-full bg-amber/15 border border-amber/20 text-amber text-[11px] font-bold uppercase tracking-[0.2em] hover:bg-amber/25 transition-all">
                Kapat
              </button>
            </div>
          )}

          {!loading && !error && profile && (
            <div className="max-h-[88vh] sm:max-h-[80vh] overflow-y-auto overscroll-contain
              [&::-webkit-scrollbar]:w-1.5
              [&::-webkit-scrollbar-track]:bg-transparent
              [&::-webkit-scrollbar-thumb]:bg-white/10
              [&::-webkit-scrollbar-thumb]:rounded-full
              hover:[&::-webkit-scrollbar-thumb]:bg-white/20">
              <div className="p-5 sm:p-6 space-y-6">

                {/* Header: Avatar (clickable) + Name + Join Date */}
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => avatarUrl && setAvatarZoom(true)}
                    className="relative group shrink-0"
                    title="Fotoğrafı büyüt"
                  >
                    <div className="w-16 h-16 rounded-full overflow-hidden bg-[#1c1512] border-2 border-amber/20
                      group-hover:border-amber/50 transition-all group-hover:shadow-[0_0_20px_rgba(255,191,0,0.15)]">
                      {avatarUrl ? (
                        <img src={avatarUrl} alt={profile.name || profile.username}
                          className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-ivory/40 font-bold text-xl">
                          {(profile.name || profile.username || 'S')[0].toUpperCase()}
                        </div>
                      )}
                    </div>
                    {/* Zoom hint */}
                    {avatarUrl && (
                      <div className="absolute inset-0 rounded-full bg-black/30 opacity-0 group-hover:opacity-100
                        transition-opacity flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                          fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                          className="text-white/80">
                          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                          <line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
                        </svg>
                      </div>
                    )}
                  </button>
                  <div className="min-w-0">
                    <p className="font-semibold text-[16px] text-ivory truncate leading-tight">
                      {profile.name || profile.username || 'Sinemasever'}
                    </p>
                    <p className="text-[12px] text-white/40">@{profile.username}</p>
                    {joinDate && (
                      <p className="flex items-center gap-1 text-[11px] text-ivory/35 mt-1">
                        <CalendarDays size={10} className="text-amber/40" />
                        {joinDate} tarihinde katıldı
                      </p>
                    )}
                  </div>
                </div>

                {/* Stats */}
                <ProfileStats
                  watchedCount={profile.watched_count || 0}
                  savedCount={profile.saved_count || 0}
                  thisMonthCount={profile.this_month_count || 0}
                />

                {/* Taste Map — Üstad analizi gizli, sadece DNA + türler + dönem + imza */}
                {profile.taste_map && (
                  <ProfileTasteMap
                    tasteMap={profile.taste_map}
                    username={profile.name || profile.username}
                    hideAnalysis
                  />
                )}

                {/* Top Moods */}
                {profile.top_moods?.length > 0 && (
                  <div className="space-y-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-amber/50">
                      Sinema Ruhu
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {profile.top_moods.slice(0, 4).map(mood => (
                        <span key={mood.mood_id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full
                            bg-[#1c1512]/90 border border-white/[0.06] text-[11px] font-semibold text-ivory/70">
                          <span className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: mood.color || '#d4af37' }} />
                          {mood.title}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Watchlist Preview */}
                {profile.watchlist_preview?.length > 0 && (
                  <div className="space-y-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-amber/50">
                      Defterim
                    </p>
                    <div className="grid grid-cols-5 gap-1.5">
                      {profile.watchlist_preview.map(item => (
                        <motion.button key={item.tmdb_id}
                          onClick={() => onDetailMovie?.(item)}
                          whileHover={{ scale: 1.05, y: -2 }}
                          className="aspect-[2/3] rounded-lg overflow-hidden bg-[#1c1512] border border-white/[0.06]
                            hover:border-amber/30 transition-all group relative"
                        >
                          {item.poster_url ? (
                            <img src={proxyImageUrl(item.poster_url)} alt={item.title}
                              className="w-full h-full object-cover" loading="lazy" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Film size={14} className="text-ivory/20" />
                            </div>
                          )}
                          {item.watched && (
                            <div className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-emerald-500/80
                              flex items-center justify-center">
                              <Eye size={7} className="text-black" />
                            </div>
                          )}
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent
                            rounded-b-lg p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <p className="text-[7px] font-semibold text-ivory/90 truncate leading-tight">
                              {item.title}
                            </p>
                          </div>
                        </motion.button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Community Recs */}
                {profile.community_recs?.length > 0 && (
                  <div className="space-y-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-amber/50 flex items-center gap-1.5">
                      <Heart size={10} className="text-amber/50" />
                      Topluluğa Önerdi
                    </p>
                    <div className="grid grid-cols-4 gap-1.5">
                      {profile.community_recs.map(film => (
                        <motion.button key={film.tmdb_id}
                          onClick={() => onDetailMovie?.(film)}
                          whileHover={{ scale: 1.05 }}
                          className="aspect-[2/3] rounded-lg overflow-hidden bg-[#1c1512] border border-white/[0.06]
                            hover:border-amber/30 transition-all group relative"
                        >
                          {film.poster_url ? (
                            <img src={film.poster_url} alt={film.title}
                              className="w-full h-full object-cover" loading="lazy" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Star size={12} className="text-ivory/20" />
                            </div>
                          )}
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent
                            rounded-b-lg p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <p className="text-[7px] font-semibold text-ivory/90 truncate">{film.title}</p>
                          </div>
                        </motion.button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Activity */}
                {profile.activity?.length > 0 && (
                  <div className="space-y-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-amber/50">
                      Son Hareketler
                    </p>
                    <div className="space-y-1">
                      {profile.activity.map((a, i) => (
                        <motion.div key={`${a.tmdb_id}-${i}`}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.02 }}
                          className="flex items-center gap-2.5 py-1.5 px-2 rounded-xl hover:bg-white/[0.02] transition-colors"
                        >
                          {a.poster_url ? (
                            <div className="w-5 h-7 rounded-md overflow-hidden shrink-0 bg-white/[0.03]">
                              <img src={proxyImageUrl(a.poster_url)} alt="" className="w-full h-full object-cover" loading="lazy" />
                            </div>
                          ) : (
                            <div className="w-5 h-7 rounded-md shrink-0 bg-white/[0.03] flex items-center justify-center">
                              <Film size={8} className="text-ivory/15" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] text-ivory/70 truncate">
                              <span className="italic text-ivory/60">{a.title}</span>
                              {' '}
                              <span className="text-ivory/30">
                                {a.action_type === 'watched' ? 'izledi' : 'ekledi'}
                              </span>
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {a.action_type === 'watched'
                              ? <Eye size={10} className="text-emerald-400/50" />
                              : <Bookmark size={10} className="text-amber/40" />
                            }
                            <span className="text-[8px] text-ivory/25">{timeAgo(a.action_at)}</span>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </>
  );
}
