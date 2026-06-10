import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Quote, Heart, MoreHorizontal, Flag, Trash2, PenLine } from 'lucide-react';
import { getMovieReviews, deleteMovieReview, likeReview, isLoggedIn } from '../../services/api';
import { resolveAvatarUrl } from '../../utils/apiConfig';
import ReviewComposerSheet from './ReviewComposerSheet';
import ReportSheet from './ReportSheet';

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const d = new Date(String(dateStr).replace(' ', 'T'));
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 3600) return 'az önce';
  if (diff < 86400) return `${Math.floor(diff / 3600)}sa`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}g`;
  return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' }).format(d);
}

/**
 * "Topluluk Sözleri" — filmin herkese açık mini yorumları.
 * FilmDetailModal içine gömülür. Login'siz okunur; yazmak giriş ister.
 */
export default function FilmReviews({ movie }) {
  const movieId = movie?.id || movie?.tmdb_id;
  const loggedIn = isLoggedIn();
  const [reviews, setReviews] = useState(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState(null);
  const [menuFor, setMenuFor] = useState(null);
  const [revealed, setRevealed] = useState(new Set());

  const load = useCallback(async () => {
    if (!movieId) return;
    const data = await getMovieReviews(movieId);
    setReviews(data.reviews || []);
  }, [movieId]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!movieId) return;
      const data = await getMovieReviews(movieId);
      if (alive) setReviews(data.reviews || []);
    })();
    return () => { alive = false; };
  }, [movieId]);

  if (!movieId) return null;

  const mine = reviews?.find((r) => r.is_mine);

  const toggleLike = async (review) => {
    if (!loggedIn) return;
    // Optimistic update
    setReviews((rs) => rs.map((r) => r.id === review.id
      ? { ...r, liked_by_me: !r.liked_by_me, like_count: r.like_count + (r.liked_by_me ? -1 : 1) }
      : r));
    await likeReview(review.id, !review.liked_by_me);
  };

  const handleDelete = async () => {
    try { await deleteMovieReview(movieId); await load(); } catch { /* sessiz */ }
    setMenuFor(null);
  };

  const onBlocked = (blockedUserId) => {
    setReviews((rs) => rs.filter((r) => r.user_id !== blockedUserId));
    setReportTarget(null);
  };

  return (
    <section className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Quote size={14} className="text-amber/60" />
          <p className="font-sans text-[11px] font-bold uppercase tracking-[0.25em] text-amber/50">
            Topluluk Sözleri{reviews?.length > 0 ? ` · ${reviews.length}` : ''}
          </p>
        </div>
        {loggedIn && (
          <button onClick={() => setComposerOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber/12 border border-amber/25 text-amber
                       text-[10px] font-bold uppercase tracking-wider hover:bg-amber/20 transition-all">
            <PenLine size={11} /> {mine ? 'Sözünü Düzenle' : 'Söz Bırak'}
          </button>
        )}
      </div>

      {reviews === null ? (
        <div className="space-y-2">
          {[0, 1].map((i) => <div key={i} className="h-16 rounded-2xl bg-white/5 animate-pulse" />)}
        </div>
      ) : reviews.length === 0 ? (
        <p className="text-[13px] font-serif italic text-white/35 py-2">
          Bu film için henüz söz söylenmemiş. {loggedIn ? 'İlk sözü sen bırak.' : 'Giriş yap, ilk sözü sen bırak.'}
        </p>
      ) : (
        <div className="space-y-2.5">
          {reviews.map((r, i) => {
            const spoilerHidden = r.has_spoiler && !revealed.has(r.id) && !r.is_mine;
            return (
              <motion.div key={r.id}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="relative p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
                <div className="flex items-start gap-2.5">
                  <span className="w-8 h-8 rounded-full overflow-hidden bg-white/10 shrink-0 ring-1 ring-amber/15">
                    {r.avatar
                      ? <img src={resolveAvatarUrl(r.avatar)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      : <span className="w-full h-full flex items-center justify-center text-[12px] font-serif font-bold text-amber/70">{(r.username || '?')[0].toUpperCase()}</span>}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-[12px] font-semibold text-amber/75 truncate">@{r.username}</p>
                      <span className="text-[10px] text-white/25">{timeAgo(r.created_at)}</span>
                    </div>
                    {spoilerHidden ? (
                      <button onClick={() => setRevealed((s) => new Set(s).add(r.id))}
                        className="mt-1 text-left w-full">
                        <p className="text-[13px] font-serif text-white/90 blur-[6px] select-none" aria-hidden>{r.content}</p>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400/70">
                          Spoiler — görmek için dokun
                        </span>
                      </button>
                    ) : (
                      <p className="mt-0.5 text-[13.5px] font-serif text-ivory/90 leading-snug break-words">{r.content}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {/* ... menü: kendi Söz'ünde sil; başkalarında bildir/engelle (store şartı) */}
                    <div className="relative">
                      <button onClick={() => setMenuFor(menuFor === r.id ? null : r.id)}
                        aria-label="Seçenekler"
                        className="p-1 rounded-full hover:bg-white/10 transition-all">
                        <MoreHorizontal size={15} className="text-white/40" />
                      </button>
                      {menuFor === r.id && (
                        <div className="absolute right-0 top-7 z-20 min-w-[140px] py-1 rounded-xl bg-[#221a16] border border-white/10 shadow-xl">
                          {r.is_mine ? (
                            <button onClick={handleDelete}
                              className="w-full flex items-center gap-2 px-3.5 py-2.5 text-[12px] text-rose-400/90 hover:bg-white/5 transition-all">
                              <Trash2 size={13} /> Sözü Sil
                            </button>
                          ) : (
                            <button onClick={() => { setMenuFor(null); setReportTarget(r); }}
                              className="w-full flex items-center gap-2 px-3.5 py-2.5 text-[12px] text-ivory/80 hover:bg-white/5 transition-all">
                              <Flag size={13} /> Bildir / Engelle
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <button onClick={() => toggleLike(r)} disabled={!loggedIn}
                      aria-label={r.liked_by_me ? 'Beğenmekten vazgeç' : 'Beğen'}
                      className={`flex items-center gap-1 px-2 py-1 rounded-full transition-all ${
                        r.liked_by_me ? 'text-rose-400' : 'text-white/35 hover:text-rose-300/70'
                      } ${!loggedIn ? 'opacity-40' : ''}`}>
                      <Heart size={13} fill={r.liked_by_me ? 'currentColor' : 'none'} />
                      {r.like_count > 0 && <span className="text-[11px] font-bold">{r.like_count}</span>}
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {composerOpen && (
        <ReviewComposerSheet
          movie={movie}
          initialContent={mine?.content || ''}
          initialSpoiler={mine?.has_spoiler || false}
          onClose={() => setComposerOpen(false)}
          onSaved={load}
        />
      )}

      {reportTarget && (
        <ReportSheet
          contentType="review"
          contentId={reportTarget.id}
          author={{ id: reportTarget.user_id, username: reportTarget.username }}
          onClose={() => setReportTarget(null)}
          onBlocked={onBlocked}
        />
      )}
    </section>
  );
}
