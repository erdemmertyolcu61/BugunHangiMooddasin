/**
 * FilmDetailModal — Listeler ve diğer sayfalarda kullanılan, kendi içinde
 * çalışan tam film detay pop-up'ı. Mood'a yönlendirmez, yerinde açılır.
 * İçerik: poster, özet, Üstad notu, Nerede İzlenir, Benzer Filmler.
 */
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Check, Eye, ExternalLink, Users, RotateCcw, ListPlus, Share2 } from 'lucide-react';
import { getApiUrl } from '../utils/apiConfig';
import {
  proxyImageUrl, getSimilarMovies, getMovieVideos,
  addToWatchlist, removeFromWatchlist, toggleWatched,
  getRecommendationHistory, retractRecommendation,
  getRating, saveRating, isLoggedIn,
} from '../services/api';
import { buildWatchUrl, getPlatformInfo } from '../utils/streamingMemory';
import SimilarFilmsStrip from './SimilarFilmsStrip';
import TrailerPlayer from './TrailerPlayer';
import ReactionControl from './ReactionControl';
import UstadLoader from './UstadLoader';
import UstadinNotu from './UstadinNotu';
import RecommendToFriendSheet from './RecommendToFriendSheet';
import AddToListSheet from './AddToListSheet';
import FilmReviews from './social/FilmReviews';
import FilmShareCard from './FilmShareCard';
import { useAuth } from '../context/AuthContext';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useToast } from '../context/ToastContext';
import { track, EVENTS } from '../utils/analytics';

const IMG_LG = 'https://image.tmdb.org/t/p/original';

// "Üstad düşünüyor" kahve animasyonunun garanti minimum süresi (kahve döngüsü
// ve loader mesaj temposuyla uyumlu). MAX = ağ hatasında sonsuz spinner valfi.
const MIN_THINK_MS = 1500;
const MAX_THINK_MS = 9000;

// Marka rengi çok koyuysa (Apple #000, MUBI #001E3C) koyu temada görünmez —
// okunur bir altın tona düşür. İki temada da canlı kalsın.
const safeBrandColor = (hex) => {
  const fallback = '#d6a84f';
  if (!hex || typeof hex !== 'string' || hex[0] !== '#' || hex.length < 7) return fallback;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lum = 0.299 * r + 0.587 * g + 0.114 * b; // 0–255
  return lum < 60 ? fallback : hex;
};

const reliableRating = (m) => {
  if (m?.imdb_rating) {
    const n = parseFloat(m.imdb_rating);
    if (!isNaN(n) && n > 0) return n.toFixed(1);
  }
  const avg = m?.vote_average;
  if (avg == null || avg <= 0) return null;
  const c = m?.vote_count;
  if (c != null) return c >= 50 ? avg.toFixed(1) : null;
  return avg <= 9.0 ? avg.toFixed(1) : null;
};

export default function FilmDetailModal({ movieId, onClose, headerBadge = null, extraActions = null, initialMovie = null, onActiveChange = null, hideWatchProviders = false }) {
  // Fragman durumu — handleEsc'ten ÖNCE tanımlı olmalı (TDZ).
  const [trailerKey, setTrailerKey] = useState(null);
  const [trailerPlaying, setTrailerPlaying] = useState(false);
  const [trailerLoading, setTrailerLoading] = useState(false);

  // Escape tuşuyla kapat (fragman oynarken önce fragmanı kapatır)
  const handleEsc = useCallback((e) => {
    if (e.key !== 'Escape') return;
    if (trailerPlaying) { setTrailerPlaying(false); setTrailerLoading(false); return; }
    onClose();
  }, [onClose, trailerPlaying]);
  useEffect(() => { document.addEventListener('keydown', handleEsc); return () => document.removeEventListener('keydown', handleEsc); }, [handleEsc]);

  // Focus trap + odak geri yükleme (a11y)
  const trapRef = useFocusTrap(true);
  const toast = useToast();

  // initialMovie verilmişse modal ANINDA dolu açılır; /analyze arka planda
  // sadece eksikleri (ai_analysis, watch_providers vb.) tamamlar.
  const [movie, setMovie] = useState(initialMovie ? { id: movieId, ...initialMovie } : null);
  const [similar, setSimilar] = useState([]);
  const [saved, setSaved] = useState(false);
  const [watched, setWatched] = useState(false);
  const [activeId, setActiveId] = useState(movieId);
  const [showFriendSheet, setShowFriendSheet] = useState(false);
  const [showListSheet, setShowListSheet] = useState(false);
  const [showShareCard, setShowShareCard] = useState(false);
  const [sentRecIds, setSentRecIds] = useState([]); // bu filmi önerdiğin kayıt id'leri
  const [myReaction, setMyReaction] = useState(null);
  // Niyetli "Üstad düşünüyor" anı: not anında hazır olsa bile kahve animasyonunu
  // garanti MIN_THINK_MS gösterir. giveUp = ağ hatası gibi durumda sonsuz
  // spinner'ı önleyen güvenlik valfi.
  const [thinkingDone, setThinkingDone] = useState(false);
  const [giveUp, setGiveUp] = useState(false);
  const { token } = useAuth();

  const handleReactionChange = useCallback((next) => {
    setMyReaction(next.reaction);          // optimistik
    saveRating(activeId, { reaction: next.reaction }); // backend (token yoksa no-op)
  }, [activeId]);

  // Bu film için gönderilmiş önerileri yükle (giriş yapılmışsa) → "Geri Al" için.
  const loadSentForMovie = useCallback(async (mid) => {
    if (!token || !mid) { setSentRecIds([]); return; }
    try {
      const hist = await getRecommendationHistory();
      const ids = (hist.sent || [])
        .filter((s) => String(s.movie_id) === String(mid))
        .map((s) => s.id);
      setSentRecIds(ids);
    } catch { setSentRecIds([]); }
  }, [token]);

  const handleRetractFromModal = useCallback(async () => {
    if (sentRecIds.length === 0) return;
    const ids = [...sentRecIds];
    setSentRecIds([]); // optimistik
    try {
      await Promise.all(ids.map((id) => retractRecommendation(id)));
      toast.success('Öneri geri alındı.');
    } catch {
      toast.error('Geri alınamadı. Tekrar dene.');
      loadSentForMovie(activeId); // gerçek durumu geri yükle
    }
  }, [sentRecIds, activeId, toast, loadSentForMovie]);

  useEffect(() => { setActiveId(movieId); }, [movieId]);

  // Modal açıkken arka plan kaymasını kilitle (html + body + scroll zinciri)
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;
    const prevOB = body.style.overscrollBehavior;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'none';
    return () => {
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
      body.style.overscrollBehavior = prevOB;
    };
  }, []);

  useEffect(() => {
    if (!activeId) return;
    track(EVENTS.FILM_INSPECT, { id: activeId }); // aktivasyon sinyali (inspect)
    let active = true;
    // Her yeni filmde niyetli düşünme penceresini sıfırla + zamanlayıcıları kur.
    setThinkingDone(false);
    setGiveUp(false);
    const thinkTimer = setTimeout(() => { if (active) setThinkingDone(true); }, MIN_THINK_MS);
    const giveUpTimer = setTimeout(() => { if (active) setGiveUp(true); }, MAX_THINK_MS);
    setSimilar([]);
    setTrailerKey(null);
    setTrailerPlaying(false);
    setTrailerLoading(false);
    // Yeni filme geçince (Bunları da Sevebilirsin) önceki filmin durumu sızmasın:
    // saved/watched sıfırlanır, /analyze in_watchlist ile saved'i tekrar set eder.
    setSaved(false);
    setWatched(false);
    (async () => {
      try {
        const res = await fetch(getApiUrl(`/api/movies/${activeId}/analyze`));
        if (res.ok && active) {
          const data = await res.json();
          // Mevcut (initial) veriyi koru, /analyze ile zenginleştir
          setMovie(prev => ({ ...(prev || {}), id: activeId, ...data }));
          setSaved(!!data.in_watchlist);
        }
      } catch {}
    })();
    getSimilarMovies(activeId).then((d) => { if (active) setSimilar(d.movies || []); });
    getMovieVideos(activeId).then((d) => { if (active && d && d.key) setTrailerKey(d.key); });
    setSentRecIds([]);
    loadSentForMovie(activeId);
    setMyReaction(null);
    if (isLoggedIn()) getRating(activeId).then((r) => { if (active && r) setMyReaction(r.reaction ?? null); });
    return () => { active = false; clearTimeout(thinkTimer); clearTimeout(giveUpTimer); };
  }, [activeId, loadSentForMovie]);

  const handleSave = async () => {
    if (!movie) return;
    if (saved) {
      setSaved(false); setWatched(false);
      try {
        await removeFromWatchlist(movie.id);
      } catch {
        setSaved(true); // optimistik değişikliği geri al
        toast.error('Listeden çıkarılamadı. Tekrar dene.');
      }
    } else {
      setSaved(true);
      try {
        await addToWatchlist(movie);
        track(EVENTS.SAVE_MOVIE, { id: movie.id });
      } catch {
        setSaved(false);
        toast.error('Listeye eklenemedi. Tekrar dene.');
      }
    }
  };

  const handleWatched = async () => {
    if (!movie) return;
    const now = !watched;
    setWatched(now);
    if (now) track(EVENTS.WATCHED_MOVIE, { id: movie.id });
    if (now && !saved) {
      setSaved(true);
      try { await addToWatchlist(movie); } catch { setSaved(false); }
    }
    try {
      await toggleWatched(movie.id);
    } catch {
      setWatched(!now); // geri al
      toast.error('İzlendi durumu güncellenemedi.');
    }
  };

  const poster = movie && proxyImageUrl(
    movie.poster_url || (movie.poster_path ? `${IMG_LG}${movie.poster_path}` : null)
  );
  // Yatay banner için backdrop tercih edilir; yoksa poster'a düşer.
  const banner = movie && proxyImageUrl(
    movie.backdrop_url ||
    (movie.backdrop_path ? `${IMG_LG}${movie.backdrop_path}` : null) ||
    movie.poster_url ||
    (movie.poster_path ? `${IMG_LG}${movie.poster_path}` : null)
  );

  return (
    <>
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        role="dialog" aria-modal="true" aria-label="Film detayları"
        className="fixed inset-0 z-[120] flex items-start sm:items-center justify-center overflow-y-auto p-0 sm:p-6 md:p-12"
      >
        {/* fixed: kaydırınca blur kaybolmasın — tüm ekranı sabit kaplar */}
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md" onClick={onClose} />
        <motion.div
          ref={trapRef}
          initial={{ scale: 0.94, y: 24, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.94, y: 24, opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-4xl my-auto bg-[#1a1a1a]/95 backdrop-blur-md border border-white/10 rounded-none sm:rounded-[2.5rem] overflow-hidden pt-safe pb-24 sm:pb-12 shadow-2xl"
        >
          {/* Tek çarpı: fragman oynarken önce fragmanı kapatır (afişe döner),
              sonraki basışta modalı kapatır. */}
          <button onClick={() => { if (trailerPlaying) setTrailerPlaying(false); else onClose(); }}
            aria-label={trailerPlaying ? 'Fragmanı kapat' : 'Kapat'}
            className="absolute right-4 z-20 w-11 h-11 flex items-center justify-center rounded-full bg-black/60 backdrop-blur-md text-ivory/80 hover:text-amber hover:bg-black/80 transition-colors"
            style={{ top: 'calc(env(safe-area-inset-top, 0px) + 44px)' }}>
            <X size={24} />
          </button>

          {movie ? (
            <div className="relative z-[1]">
              {/* ─── HERO: Landscape backdrop on ALL viewports ─── */}
              <div className="relative w-full overflow-hidden"
                   style={{ height: 'clamp(220px, 45vw, 440px)' }}>
                {trailerKey ? (
                  <TrailerPlayer
                    youtubeKey={trailerKey}
                    posterSrc={banner || poster || 'https://via.placeholder.com/1280x720'}
                    title={movie.title}
                    playing={trailerPlaying}
                    onStart={() => { setTrailerPlaying(true); setTrailerLoading(true); }}
                    onLoad={() => setTrailerLoading(false)}
                    onError={() => setTrailerLoading(false)}
                  />
                ) : (
                  <img
                    src={banner || poster || 'https://via.placeholder.com/1280x720'}
                    alt={movie.title}
                    className="w-full h-full object-cover object-[center_20%]"
                    loading="eager"
                  />
                )}
                {/* Fragman oynarken dekoratif kaplamalar gizlenir — YouTube
                    kontrollerinin önüne UI binmesin (YouTube ToS). */}
                {(!trailerPlaying || trailerLoading) && (
                  <>
                    {/* Cinematic gradient fade — smooth dissolve into content area */}
                    <div
                      className="absolute inset-0 pointer-events-none"
                      style={{ background: 'linear-gradient(to bottom, transparent 40%, rgba(26,26,26,0.6) 65%, rgba(26,26,26,0.98) 100%)' }}
                    />
                    {/* Top vignette for close button readability */}
                    <div
                      className="absolute inset-x-0 top-0 h-24 pointer-events-none"
                      style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, transparent 100%)' }}
                    />
                    {/* Title overlay — sits at bottom of landscape banner */}
                    <div className="absolute inset-x-0 bottom-0 px-5 sm:px-12 md:px-14 pb-5 sm:pb-8 pointer-events-none">
                      <p
                        className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.4em] mb-2 sm:mb-3"
                        style={{ color: '#e8b94a' }}
                      >
                        Film Özeti
                      </p>
                      <h2
                        className="text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-serif font-bold tracking-tight leading-[1.05] break-words"
                        style={{ color: '#faf7f0', textShadow: '0 2px 16px rgba(0,0,0,0.95)' }}
                      >
                        {movie.title}
                      </h2>
                    </div>
                  </>
                )}
              </div>

              {/* ─── İÇERİK ─── */}
              <div className="px-5 sm:px-12 md:px-14 pt-5 sm:pt-7 md:pt-9 space-y-7 sm:space-y-10">
                {/* Meta satırı — tüm ekranlarda */}
                <header className="space-y-4">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:gap-5 text-sm sm:text-lg font-serif italic text-ivory/45">
                    <span>{movie.release_date?.split('-')[0]}</span>
                    <span className="w-1 h-1 bg-white/20 rounded-full" />
                    <span>{movie.runtime || '90+'} Dakika</span>
                    <span className="w-1 h-1 bg-white/20 rounded-full" />
                    <span>{movie.genres?.join(', ') || 'Sinema'}</span>
                  </div>
                </header>

                {/* Opsiyonel rozet (örn. topluluk önerisi) */}
                {headerBadge}

                <p className="text-base sm:text-xl font-serif leading-relaxed text-ivory/80 italic">
                  {movie.overview || 'Bu yapıt hakkında henüz bir özet bulunmuyor...'}
                </p>

                {/* Senin Değerlendirmen — beğeni (giriş zorunlu) */}
                <div className="border-t border-white/10 pt-6 space-y-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-amber/70">Beğen</p>
                  {token ? (
                    <ReactionControl reaction={myReaction} onChange={handleReactionChange} />
                  ) : (
                    <p className="text-sm font-serif italic text-ivory/45">
                      Filmleri beğenmek için <span className="text-amber/80">giriş yap</span>.
                    </p>
                  )}
                </div>

                {movie.ai_analysis && thinkingDone ? (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                  >
                    <UstadinNotu
                      noteText={movie.ai_analysis
                        .replace(/^Üstadın Notu:?\s*/i, '')
                        .trim()}
                      movieName={movie.title}
                    />
                  </motion.div>
                ) : (giveUp && thinkingDone) ? (
                  <UstadinNotu
                    noteText="Üstad bu film için kısa bir kahve molası verdi, birazdan tekrar dene."
                    movieName={movie.title}
                  />
                ) : (
                  <UstadLoader duration={1500} onComplete={() => setThinkingDone(true)} />
                )}

                <div className="grid grid-cols-2 lg:grid-cols-3 gap-6 border-t border-white/5 pt-7">
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-ivory/20">Üstat</p>
                    <p className="text-base sm:text-xl font-serif text-ivory/80">{movie.director || 'Gizli'}</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-ivory/20">Zamanın Ruhu</p>
                    <p className="text-base sm:text-xl font-serif text-ivory/80">{movie.genres?.slice(0, 2).join(', ')}</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-ivory/20">Küresel Yankı</p>
                    <p className="text-2xl sm:text-3xl font-serif font-bold text-amber">★ {reliableRating(movie) ?? '-'}</p>
                  </div>
                </div>

                {/* Nerede İzlenir — her platform tıklanabilir (chat akışında gizli) */}
                {!hideWatchProviders && movie.watch_providers && (() => {
                  const wp = movie.watch_providers;
                  const all = [
                    ...(wp.flatrate || []).map(p => ({ ...p, tag: 'Abonelik' })),
                    ...(wp.rent || []).map(p => ({ ...p, tag: 'Kiralık' })),
                    ...(wp.buy || []).map(p => ({ ...p, tag: 'Satın Al' })),
                    ...(wp.free || []).map(p => ({ ...p, tag: 'Ücretsiz' })),
                    ...(wp.ads || []).map(p => ({ ...p, tag: 'Reklamlı' })),
                  ];
                  const seen = new Set();
                  const uniq = all.filter(p => !seen.has(p.provider_id) && seen.add(p.provider_id));
                  if (uniq.length === 0 && !wp.link) return null;

                  const openProvider = (provider) => {
                    const url = buildWatchUrl(provider.provider_id, movie.title, wp.link);
                    if (url && url !== '#') {
                      window.location.href = url;
                    } else if (wp.link) {
                      window.location.href = wp.link;
                    }
                  };

                  return (
                    <div className="border-t border-white/10 pt-7 space-y-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-amber/70">Nerede İzlenir?</p>
                      <div className="flex flex-wrap gap-3">
                        {uniq.length === 0 ? (
                          <a href={wp.link} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-2 px-5 py-3 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all hover:brightness-110"
                            style={{ background: '#d6a84f', color: '#1a1410' }}>
                            <ExternalLink size={13} /> İzleme Seçenekleri
                          </a>
                        ) : uniq.slice(0, 8).map(p => {
                          // Platformun marka rengi — hem Espresso hem Latte'de canlı/okunur.
                          const brand = safeBrandColor(getPlatformInfo(p.provider_id)?.color);
                          return (
                            <button
                              key={p.provider_id}
                              onClick={() => openProvider(p)}
                              title={`${p.provider_name} (${p.tag}), açmak için tıkla`}
                              className="flex items-center gap-2 px-4 py-2.5 rounded-full transition-all group active:scale-95 cursor-pointer hover:brightness-110"
                              style={{
                                background: `${brand}22`,
                                border: `1.5px solid ${brand}`,
                                boxShadow: `0 2px 10px ${brand}26`,
                              }}
                            >
                              {p.logo_url && <img src={proxyImageUrl(p.logo_url)} alt={p.provider_name} className="w-6 h-6 rounded object-contain" />}
                              <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: brand }}>{p.provider_name}</span>
                              <span className="text-[8px] uppercase tracking-widest text-ivory/45">{p.tag}</span>
                              <ExternalLink size={11} style={{ color: brand }} />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* Topluluk Sözleri — herkese açık mini yorumlar */}
                <FilmReviews movie={movie} />

                {/* Benzer Filmler */}
                <SimilarFilmsStrip movies={similar} onSelect={(m) => { setActiveId(m.id); onActiveChange?.(m); }} />

                {/* Tek tip pill aksiyon satırı — eşit yükseklik, sarmalanmaz */}
                <div className="flex flex-wrap justify-center gap-2.5 sm:gap-3 pt-4">
                  <button onClick={handleSave}
                    className={`inline-flex items-center justify-center gap-2 h-12 px-7 rounded-full text-[11px] font-bold uppercase tracking-[0.12em] whitespace-nowrap transition-all active:scale-95 ${
                      saved
                        ? 'bg-amber/15 text-amber border border-amber/40'
                        : 'bg-amber text-bg hover:brightness-105 shadow-[0_14px_36px_-12px_rgba(255,191,0,0.45)]'
                    }`}>
                    {saved ? <><Check size={15} /> Deftere Eklendi</> : <><Plus size={15} /> Deftere Kaydet</>}
                  </button>
                  <button onClick={handleWatched}
                    className={`inline-flex items-center justify-center gap-2 h-12 px-6 rounded-full text-[11px] font-bold uppercase tracking-[0.12em] whitespace-nowrap transition-all active:scale-95 ${
                      watched
                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/40'
                        : 'bg-white/5 border border-white/15 text-ivory/70 hover:bg-white/10 hover:text-ivory'
                    }`}>
                    {watched ? <><Check size={14} /> İzledim</> : <><Eye size={14} /> İzledim</>}
                  </button>
                  {/* Arkadaşına Öner — yalnızca Google ile giriş yapanlara */}
                  {token && (
                    <button onClick={() => setShowFriendSheet(true)}
                      className="inline-flex items-center justify-center gap-2 h-12 px-6 rounded-full text-[11px] font-bold uppercase tracking-[0.12em] whitespace-nowrap bg-white/5 border border-amber/30 text-amber/80 hover:bg-amber/10 hover:text-amber transition-all active:scale-95">
                      <Users size={14} /> Arkadaşına Öner
                    </button>
                  )}
                  {/* Listeye Ekle — giriş zorunlu */}
                  {token && (
                    <button onClick={() => setShowListSheet(true)}
                      className="inline-flex items-center justify-center gap-2 h-12 px-6 rounded-full text-[11px] font-bold uppercase tracking-[0.12em] whitespace-nowrap bg-white/5 border border-amber/30 text-amber/80 hover:bg-amber/10 hover:text-amber transition-all active:scale-95">
                      <ListPlus size={14} /> Listeye Ekle
                    </button>
                  )}
                  {/* Paylaş — herkese açık (görsel kart) */}
                  <button onClick={() => setShowShareCard(true)}
                    className="inline-flex items-center justify-center gap-2 h-12 px-6 rounded-full text-[11px] font-bold uppercase tracking-[0.12em] whitespace-nowrap bg-white/5 border border-white/15 text-ivory/70 hover:bg-white/10 hover:text-ivory transition-all active:scale-95">
                    <Share2 size={14} /> Paylaş
                  </button>
                  {/* Bu filmi önerdiyse → doğrudan modaldan geri al */}
                  {token && sentRecIds.length > 0 && (
                    <button onClick={handleRetractFromModal}
                      title="Bu filmin önerisini geri al"
                      className="inline-flex items-center justify-center gap-2 h-12 px-6 rounded-full text-[11px] font-bold uppercase tracking-[0.12em] whitespace-nowrap bg-white/5 border border-rose-400/30 text-rose-300/80 hover:bg-rose-500/10 hover:text-rose-300 transition-all active:scale-95">
                      <RotateCcw size={14} /> Öneriyi Geri Al{sentRecIds.length > 1 ? ` (${sentRecIds.length})` : ''}
                    </button>
                  )}
                  {/* Opsiyonel ek aksiyonlar (örn. Paylaş, Topluluğa Öner) */}
                  {extraActions}
                  <button onClick={onClose}
                    className="inline-flex items-center justify-center h-12 px-6 rounded-full text-[11px] font-bold uppercase tracking-[0.12em] whitespace-nowrap bg-white/5 border border-white/15 text-ivory/60 hover:bg-white/10 hover:text-ivory transition-all active:scale-95">
                    Kapat
                  </button>
                </div>
              </div>
            </div>
          ) : (
            // initialMovie verilmeyen (yalnız id) durumda kısa, sessiz iskelet —
            // "Üstad hazırlanıyor" bloğu YOK, modal yine de hemen açılır.
            <div className="px-5 sm:px-12 md:px-14 py-16 space-y-6 animate-pulse">
              <div className="h-8 w-1/2 rounded-lg bg-white/10" />
              <div className="h-3 w-full rounded bg-white/5" />
              <div className="h-3 w-5/6 rounded bg-white/5" />
              <div className="h-40 w-full rounded-2xl bg-white/5" />
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>

    {/* Arkadaşına Öner Bottom Sheet */}
    {showFriendSheet && movie && (
      <RecommendToFriendSheet
        movie={{ id: activeId, title: movie.title }}
        onClose={() => { setShowFriendSheet(false); loadSentForMovie(activeId); }}
      />
    )}

    {/* Listeye Ekle Bottom Sheet */}
    {showListSheet && movie && (
      <AddToListSheet
        movie={{ id: activeId, title: movie.title, poster_url: movie.poster_url, poster_path: movie.poster_path }}
        onClose={() => setShowListSheet(false)}
      />
    )}

    {/* Paylaş — film görsel kartı overlay */}
    {showShareCard && movie && (
      <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4" role="dialog" aria-modal="true">
        <div className="fixed inset-0 backdrop-blur-sm" onClick={() => setShowShareCard(false)} style={{ backgroundColor: 'rgba(0,0,0,0.8)' }} />
        <div className="relative z-10 w-full max-w-sm">
          <button onClick={() => setShowShareCard(false)} aria-label="Kapat"
            className="absolute -top-12 right-0 w-10 h-10 flex items-center justify-center rounded-full transition-colors"
            style={{ backgroundColor: 'rgba(0,0,0,0.6)', color: 'rgba(245,242,235,0.8)' }}>
            <X size={22} />
          </button>
          <FilmShareCard movie={{ id: activeId, ...movie }} />
        </div>
      </div>
    )}
    </>
  );
}


