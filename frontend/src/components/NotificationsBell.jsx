import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Bell, X, Play, Star, UserPlus, Check, UserX, BellRing } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  getRecommendationHistory, getUnreadShareCount, markSharesRead, markShareRead, dismissShare,
  getFriendRequests, respondFriendRequest, proxyImageUrl,
} from '../services/api';
import FilmDetailModal from './FilmDetailModal';
import LottieAnimation from './LottieAnimation';
import { resolveAvatarUrl } from '../utils/apiConfig';
import { pushSupported, isPushSubscribed, isPushEnabledOnServer, enablePush, disablePush } from '../utils/push';
import { track, EVENTS } from '../utils/analytics';

const POLL_MS = 30000;

/**
 * Global bildirim zili — arkadaşlık istekleri + film önerileri.
 *  - Zil ikonunda okunmamış varsa altın (#d4af37) nokta
 *  - Panel açılınca: önce arkadaşlık istekleri, sonra film önerileri
 *  - Yalnızca Google ile giriş yapan kullanıcıya görünür
 */
export default function NotificationsBell({ open: externalOpen, onOpenChange }) {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [count, setCount] = useState(0);
  const [internalOpen, setInternalOpen] = useState(false);
  const open = externalOpen !== undefined ? externalOpen : internalOpen;
  const setOpen = onOpenChange || setInternalOpen;
  const [shares, setShares] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [detailMovie, setDetailMovie] = useState(null);
  const [pushAvail, setPushAvail] = useState(false);
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMsg, setPushMsg] = useState('');
  const [respondLoading, setRespondLoading] = useState(null); // request_id yüklemede
  const [failedAvatars, setFailedAvatars] = useState(new Set());
  const onAvatarError = useCallback((id) => {
    setFailedAvatars((prev) => { const n = new Set(prev); n.add(id); return n; });
  }, []);

  const refreshCount = useCallback(async () => {
    if (!token) return;
    try {
      const data = await getUnreadShareCount();
      setCount(data.unread_count || 0);
    } catch { /* sessiz */ }
  }, [token]);

  // Sayım yoklaması (mount + interval + tab visibility)
  useEffect(() => {
    if (!token) { setCount(0); return; }
    refreshCount();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshCount();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') refreshCount();
    }, POLL_MS);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [token, refreshCount]);

  // Push uygunluğu + mevcut abonelik durumu (token varsa, bir kez)
  useEffect(() => {
    if (!token || !pushSupported()) { setPushAvail(false); return; }
    let alive = true;
    (async () => {
      const enabled = await isPushEnabledOnServer();
      if (!alive) return;
      setPushAvail(enabled);
      if (enabled) setPushOn(await isPushSubscribed());
    })();
    return () => { alive = false; };
  }, [token]);

  const togglePush = async () => {
    if (pushBusy) return;
    setPushBusy(true);
    setPushMsg('');
    try {
      if (pushOn) {
        await disablePush();
        setPushOn(false);
        track(EVENTS.SHARE_CLICK, { network: 'push', kind: 'disable' });
      } else {
        const r = await enablePush();
        if (r.ok) {
          setPushOn(true);
          track(EVENTS.NOTIF_ENABLED, { source: 'bell' });
        } else {
          // Başarısızsa sebebi kullanıcıya açıkça göster (özellikle iOS).
          const reasons = {
            unsupported: 'Bu cihaz/tarayıcı anlık bildirimi desteklemiyor. iPhone\'da uygulamayı "Ana Ekrana Ekle" ile kurup ikondan aç (iOS 16.4+).',
            disabled: 'Bildirim servisi şu an kapalı. Birazdan tekrar dene.',
            denied: 'Bildirim izni reddedilmiş. iPhone Ayarlar → Bildirimler → Sinemood\'dan izin verebilirsin.',
            'no-sw': 'Servis çalışanı hazır değil; uygulamayı kapatıp tekrar aç.',
          };
          setPushMsg(reasons[r.reason] || 'Bildirim açılamadı, tekrar dene.');
        }
      }
    } catch {
      setPushMsg('Beklenmeyen bir hata oluştu.');
    } finally {
      setPushBusy(false);
    }
  };

  const openPanel = async () => {
    setOpen(true);
    setLoading(true);
    try {
      // GELEN öneriler (okunmuş DAHİL) → panel push sonrası asla yanlışlıkla boş
      // kalmaz. Badge için unread sayımı ayrı (getUnreadShareCount).
      const [recsData, requestsData] = await Promise.all([
        getRecommendationHistory().catch(() => ({ received: [] })),
        getFriendRequests().catch(() => ({ requests: [] })),
      ]);
      setShares(recsData.received || []);
      setRequests(requestsData.requests || []);
      // Paneli görüntüleyince okundu işaretle → rozet sıfırlanır ama kartlar görünür kalır.
      if ((recsData.received || []).some((s) => !s.is_read)) {
        await markSharesRead().catch(() => {});
      }
      refreshCount();
    } catch {
      setShares([]);
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRespond = async (requestId, action) => {
    if (respondLoading === requestId) return;
    setRespondLoading(requestId);
    try {
      await respondFriendRequest(requestId, action);
      setRequests(prev => prev.filter(r => r.request_id !== requestId));
      refreshCount();
    } catch { /* sessiz */ }
    finally { setRespondLoading(null); }
  };

  const watchNow = async (s) => {
    setOpen(false);
    setDetailMovie({
      id: s.movie_id,
      title: s.movie_title,
      poster_url: s.poster_url,
      vote_average: s.vote_average,
      release_date: s.release_date,
    });
    // Sadece bu share'i okundu işaretle, diğerleri kalsın
    await markShareRead(s.id).catch(() => {});
    refreshCount();
  };

  if (!token) return null;

  const hasContent = shares.length > 0 || requests.length > 0;

  return (
    <>
      {/* Zil butonu — profil header icinde inline. Okunmamış varsa Lottie zili
          çalar (loop); yoksa sade lucide Bell ikonu gösterilir. */}
      <button
        onClick={openPanel}
        aria-label="Bildirimler"
        className="relative w-10 h-10 shrink-0 flex items-center justify-center hover:bg-white/5 rounded-full border border-white/10 transition-all"
      >
        {count > 0 ? (
          <LottieAnimation
            key="bell-ring"
            path="/lottie/notification-bell.json"
            loop
            autoplay
            className="w-6 h-6"
          />
        ) : (
          <Bell size={17} className="text-[#f5f2eb]/80" />
        )}
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

      {/* Panel — body'ye portal: Profil header'indaki backdrop-filter, fixed paneli
          68px header'a hapsediyordu (panel açılınca "kayboluyor" görünüyordu). */}
      {open && createPortal(
        <>
          <motion.div
            className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            onClick={() => setOpen(false)}
          />
          <motion.div
            className="fixed top-0 right-0 bottom-0 z-[1001] w-full max-w-md flex flex-col
                       bg-[#161010] border-l border-amber/15 shadow-2xl pt-safe pb-safe"
            initial={{ x: '100%' }} animate={{ x: 0 }}
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
                {/* ─── Push bildirim aç/kapa — her zaman görünür; desteklenmiyorsa rehber ─── */}
                {(() => {
                  const supported = pushSupported();
                  return (
                    <div className="flex items-center gap-3 p-3.5 mb-4 rounded-2xl bg-amber/[0.06] border border-amber/15">
                      <div className="w-10 h-10 rounded-full bg-amber/12 flex items-center justify-center shrink-0 overflow-hidden">
                        {pushOn
                          ? <LottieAnimation path="/lottie/success-check.json" loop={false} className="w-9 h-9" />
                          : <BellRing size={17} className="text-amber" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-[#f5f2eb]">Anlık bildirimler</p>
                        <p className="text-[11px] text-white/45 leading-snug">
                          {supported
                            ? 'Öneri, arkadaşlık isteği ve günün filmi telefonuna gelsin.'
                            : 'iPhone’da: Paylaş → “Ana Ekrana Ekle”, sonra uygulamayı ikondan aç (iOS 16.4+).'}
                        </p>
                        {pushMsg && (
                          <p className="text-[11px] text-rose-300/90 leading-snug mt-1">{pushMsg}</p>
                        )}
                      </div>
                      {supported ? (
                        <button
                          onClick={togglePush}
                          disabled={pushBusy}
                          aria-pressed={pushOn}
                          aria-label={pushOn ? 'Bildirimleri kapat' : 'Bildirimleri aç'}
                          className={`shrink-0 inline-flex items-center justify-center gap-1.5 h-9 min-w-[64px] px-4 rounded-full text-[11px] font-bold uppercase tracking-[0.12em] transition-all active:scale-95 disabled:opacity-60 ${
                            pushOn
                              ? 'bg-amber/15 text-amber border border-amber/45'
                              : 'bg-amber text-bg shadow-[0_10px_26px_-10px_rgba(255,191,0,0.6)] hover:brightness-105'
                          }`}
                        >
                          {pushBusy ? '…' : pushOn ? (<><Check size={13} /> Açık</>) : 'Aç'}
                        </button>
                      ) : (
                        <span className="shrink-0 max-w-[80px] text-right text-[9px] font-bold uppercase tracking-wider text-amber/70 leading-tight">
                          Kurulum gerekli
                        </span>
                      )}
                    </div>
                  );
                })()}
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
                    <LottieAnimation
                      path="/lottie/empty-state.json"
                      className="w-24 h-24 opacity-50"
                      speed={0.5}
                    />
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
                              {r.avatar && !failedAvatars.has(r.request_id)
                                ? <img src={resolveAvatarUrl(r.avatar)} alt={r.name} className="w-full h-full object-cover" referrerPolicy="no-referrer"
                                    onError={() => onAvatarError(r.request_id)} />
                                : <span className="font-bold text-[11px] text-amber/60">{(r.username || r.name || '?')[0].toUpperCase()}</span>}
                            </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-[13px] text-[#f5f2eb] truncate">{r.username || r.name}</p>
                              <p className="text-[11px] text-white/45 truncate">@{r.username}</p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button onClick={() => handleRespond(r.request_id, 'ACCEPT')} disabled={respondLoading === r.request_id}
                                className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/20
                                  flex items-center justify-center hover:bg-emerald-500/20 transition-all disabled:opacity-30 disabled:pointer-events-none"
                                title="Onayla" aria-label={`${r.username || r.name} isteğini onayla`}>
                                <Check size={14} className="text-emerald-400" />
                              </button>
                              <button onClick={() => handleRespond(r.request_id, 'DECLINE')} disabled={respondLoading === r.request_id}
                                className="w-8 h-8 rounded-full bg-rose-500/10 border border-rose-500/20
                                  flex items-center justify-center hover:bg-rose-500/20 transition-all disabled:opacity-30 disabled:pointer-events-none"
                                title="Reddet" aria-label={`${r.username || r.name} isteğini reddet`}>
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
                            className="relative flex gap-3.5 p-4 rounded-2xl bg-white/[0.04] border border-white/8"
                          >
                            <div className="w-20 shrink-0 aspect-[2/3] rounded-lg overflow-hidden bg-white/10">
                              {s.poster_url ? (
                                <img src={proxyImageUrl(s.poster_url)} alt={s.movie_title} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-2xl opacity-30">🎬</div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                              <div className="flex items-center gap-2 mb-0.5">
                                {s.sender?.avatar && !failedAvatars.has(`share-${s.id}`) && (
                                  <img src={resolveAvatarUrl(s.sender.avatar)} alt="" className="w-5 h-5 rounded-full object-cover" referrerPolicy="no-referrer"
                                    onError={() => onAvatarError(`share-${s.id}`)} />
                                )}
                                <span className="text-[12px] text-amber/80 font-semibold truncate">
                                  {s.sender?.username || s.sender?.name}
                                </span>
                                {!s.is_read && (
                                  <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-amber text-[#120d0b] text-[9px] font-bold uppercase tracking-wider">
                                    Yeni
                                  </span>
                                )}
                              </div>
                              <h4 className="text-[15px] font-serif font-bold text-[#f5f2eb] line-clamp-1">
                                {s.movie_title || `Film #${s.movie_id}`}
                              </h4>
                              {s.vote_average > 0 && (
                                  <span className="flex items-center gap-1 text-[11px] text-amber font-bold mt-0.5">
                                    <Star size={10} className="fill-amber" />{s.vote_average.toFixed(1)}
                                </span>
                              )}
                              {s.user_note && (
                                <p className="text-[13px] font-serif italic text-white/70 line-clamp-3 mt-1 leading-relaxed">
                                  &ldquo;{s.user_note}&rdquo;
                                </p>
                              )}
                              <div className="mt-auto self-stretch flex items-end gap-2">
                                <button
                                  onClick={() => watchNow(s)}
                                  className="flex items-center gap-1.5 px-5 py-1.5 rounded-full
                                             bg-amber text-[#120d0b] text-[10px] font-bold uppercase tracking-wider
                                             hover:bg-amber-400 transition-all active:scale-95"
                                >
                                  <Play size={11} className="fill-[#120d0b]" /> Hemen İzle
                                </button>
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    // Kalıcı gizle: tekrar açıldığında geri gelmesin.
                                    setShares(prev => prev.filter(x => x.id !== s.id));
                                    await dismissShare(s.id).catch(() => {});
                                    refreshCount();
                                  }}
                                  className="flex items-center gap-1 px-4 py-1.5 rounded-full
                                             bg-white/5 border border-white/10 text-white/50 text-[10px] font-bold uppercase tracking-wider
                                             hover:bg-white/10 hover:text-white/70 transition-all active:scale-95"
                                >
                                  Okundu
                                </button>
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
        </>,
        document.body
      )}

      {detailMovie && createPortal(
        <FilmDetailModal
          movieId={detailMovie.id}
          initialMovie={detailMovie}
          onClose={() => setDetailMovie(null)}
        />,
        document.body
      )}
    </>
  );
}
