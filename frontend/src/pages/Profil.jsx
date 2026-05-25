/**
 * Profil Sayfası — Sinemood marka diliyle yeniden tasarlandı.
 *
 * Sticky header: /sinemod-mark.png + amber-glow tracking text
 * Identity hero: 28×28 avatar + amber conic-gradient halka + 30px Cormorant serif ad
 * 4-stat plate grid (izlendi/kayıtlı/bu ay/sinyal)
 * Üstad'ın Okuması kartı: mood çipleri (mood-renkli dot, logo YOK) + serif italic alıntılar
 * Zaman çizgisi: mood renkli dikey ışık şeridi + film başlığı — watched_at sıralı son 4 film
 * Arkadaş paneli: gelen istekler şeridi · arama · ekle · sil
 * Ayarlar kısayolları: 4 satır (bildirim/görünüm/veri/sil)
 *
 * Backend kontratları: sıfır değişiklik.
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LogOut, Eye, Bookmark, CalendarDays, User, Users,
  Check, X, UserPlus, Search, Trash2, AtSign, Bell, Play,
  Star as StarIcon, Settings, Palette, Database, AlertTriangle,
  Film, ChevronRight, ChevronLeft,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import {
  getWatchlist, getTasteMap, getFriends, getFriendRequests,
  respondFriendRequest, removeFriend, sendFriendRequest,
  getShares, markSharesRead, getMe,
} from '../services/api';
import { getApiUrl } from '../utils/apiConfig';
import GoogleSignInButton from '../components/GoogleSignInButton';
import NotificationsBell from '../components/NotificationsBell';
import FilmDetailModal from '../components/FilmDetailModal';
import EditProfileModal from '../components/EditProfileModal';
import LottieAnimation from '../components/LottieAnimation';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

/* ─── Utilities ──────────────────────────────────────────────────── */

const sanitize = (str) =>
  String(str ?? '').replace(/[<>{}$]/g, '').replace(/javascript:/gi, '').trim();

const formatDate = (iso) => {
  if (!iso) return 'Bilinmiyor';
  try {
    const normalized = String(iso).trim().replace(' ', 'T');
    const d = new Date(normalized);
    if (isNaN(d.getTime())) return 'Bilinmiyor';
    return new Intl.DateTimeFormat('tr-TR', {
      day: 'numeric', month: 'long', year: 'numeric',
    }).format(d);
  } catch { return 'Bilinmiyor'; }
};

/* ─── Mood renk haritası (dot renkler) ───────────────────────────── */
const MOOD_DOT_COLORS = {
  battaniye: '#f59e0b',
  gece: '#94a3b8',
  gozyasi: '#ec4899',
  askbahcesi: '#f43f5e',
  kahkaha: '#10b981',
  adrenalin: '#ef4444',
  yolculuk: '#10b981',
  zamanyolcusu: '#f59e0b',
  sessiz: '#a8a29e',
  zihin: '#8b5cf6',
  kalp: '#ec4899',
  karmakar: '#f97316',
  sipsak: '#d4af37',
  'deep-chills': '#3b82f6',
  'kadraj-estetigi': '#a855f7',
  'geceyarisi-itirafi': '#6366f1',
};


/* ═══════════════════════════════════════════════════════════════════
   PROFIL
   ═══════════════════════════════════════════════════════════════════ */

export default function Profil() {
  const navigate = useNavigate();
  const { user, logout, login, updateUser } = useAuth();
  const { theme, toggleTheme } = useTheme();

  /* ─── Auth ─────────────────────────────────────────────────────── */
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [notifOpen, setNotifOpen] = useState(false);
  const handleCredential = useCallback(async (cred) => {
    if (!cred) return;
    setAuthBusy(true);
    setAuthError('');
    const r = await login(cred);
    setAuthBusy(false);
    if (!r?.ok) setAuthError(r?.error || 'Giriş başarısız oldu.');
  }, [login]);

  /* ─── Stats + Taste ────────────────────────────────────────────── */
  const [savedMovies, setSavedMovies] = useState([]);
  const [savedCount, setSavedCount] = useState(0);
  const [watchedCount, setWatchedCount] = useState(0);
  const [thisMonthCount, setThisMonthCount] = useState(0);
  const [topMoods, setTopMoods] = useState([]);
  const [loading, setLoading] = useState(true);

  /* ─── Social ───────────────────────────────────────────────────── */
  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState([]);
  const [socialLoading, setSocialLoading] = useState(true);
  const [addUsername, setAddUsername] = useState('');
  const [addMsg, setAddMsg] = useState(null);
  const [addBusy, setAddBusy] = useState(false);
  const [friendSearch, setFriendSearch] = useState('');
  const [socialError, setSocialError] = useState('');

  /* ─── Shares ───────────────────────────────────────────────────── */
  const [shares, setShares] = useState([]);
  const [sharesLoading, setSharesLoading] = useState(true);
  const [detailMovie, setDetailMovie] = useState(null);
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [failedAvatars, setFailedAvatars] = useState(new Set());
  const onAvatarError = useCallback((id) => {
    setFailedAvatars((prev) => { const n = new Set(prev); n.add(id); return n; });
  }, []);
  const pollRef = useRef(null);

  /* ─── Fetch social data on mount ───────────────────────────────── */
  useEffect(() => {
    if (!user) { setSocialLoading(false); setSharesLoading(false); return; }
    let alive = true;
    (async () => {
      try {
        setSocialError('');
        const [fr, rq, sh] = await Promise.all([
          getFriends().catch(() => ({ friends: [] })),
          getFriendRequests().catch(() => ({ requests: [] })),
          getShares().catch(() => ({ shares: [] })),
        ]);
        if (alive) {
          setFriends(fr.friends || []);
          setRequests(rq.requests || []);
          setShares(sh.shares || []);
          if ((sh.shares || []).length > 0) markSharesRead().catch(() => {});
        }
      } finally {
        if (alive) { setSocialLoading(false); setSharesLoading(false); }
      }
    })();
    return () => { alive = false; };
  }, [user]);

  /* ─── 30s polling + visibility-change immediate refetch ────────── */
  useEffect(() => {
    if (!user) return;
    const poll = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        setSocialError('');
        const [fr, rq, sh] = await Promise.all([
          getFriends().catch(() => ({ friends: [] })),
          getFriendRequests().catch(() => ({ requests: [] })),
          getShares().catch(() => ({ shares: [] })),
        ]);
        setFriends(fr.friends || []);
        setRequests(rq.requests || []);
        if ((sh.shares || []).length > 0) {
          setShares(sh.shares || []);
          markSharesRead().catch(() => {});
        }
      } catch {}
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') poll();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    pollRef.current = setInterval(poll, 30000);
    return () => {
      clearInterval(pollRef.current);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [user]);

  /* ─── Social handlers ──────────────────────────────────────────── */
  const handleRespondRequest = useCallback(async (requestId, action) => {
    try {
      setSocialError('');
      await respondFriendRequest(requestId, action);
      setRequests(prev => prev.filter(r => r.request_id !== requestId));
      if (action === 'ACCEPT') {
        const data = await getFriends().catch(() => ({ friends: [] }));
        setFriends(data.friends || []);
      }
    } catch (err) {
      setSocialError(err?.message || 'İstek işlenemedi.');
    }
  }, []);

  const handleRemoveFriend = useCallback(async (friendId) => {
    try {
      setSocialError('');
      await removeFriend(friendId);
      setFriends(prev => prev.filter(f => f.id !== friendId));
    } catch (err) {
      setSocialError(err?.message || 'Arkadaş silinemedi.');
    }
  }, []);

  const handleAddFriend = useCallback(async () => {
    const u = addUsername.trim();
    if (!u || addBusy) return;
    setAddMsg(null);
    setAddBusy(true);
    try {
      const res = await sendFriendRequest(u);
      if (res.status === 'ACCEPTED') {
        setAddMsg({ ok: true, text: 'Arkadaş eklendi!' });
        const data = await getFriends().catch(() => ({ friends: [] }));
        setFriends(data.friends || []);
      } else {
        setAddMsg({ ok: true, text: 'İstek gönderildi, onay bekliyor.' });
        // 5 saniye sonra güncel veriyi çek (karşı taraf hızlı kabul ederse)
        setTimeout(async () => {
          try {
            const [fr, rq] = await Promise.all([
              getFriends().catch(() => ({ friends: [] })),
              getFriendRequests().catch(() => ({ requests: [] })),
            ]);
            setFriends(fr.friends || []);
            setRequests(rq.requests || []);
          } catch {}
        }, 5000);
      }
      setAddUsername('');
    } catch (err) {
      setAddMsg({ ok: false, text: err.message || 'Gönderilemedi' });
    } finally { setAddBusy(false); }
  }, [addUsername, addBusy]);

  const filteredFriends = useMemo(() =>
    friendSearch.trim()
      ? friends.filter(f =>
          (f.name || '').toLowerCase().includes(friendSearch.toLowerCase()) ||
          (f.username || '').toLowerCase().includes(friendSearch.toLowerCase()))
      : friends,
    [friends, friendSearch]);

  /* ─── Fetch stats + taste ──────────────────────────────────────── */
  useEffect(() => {
    if (!user) { setLoading(false); return; }
    (async () => {
      try {
        const [wl, tm] = await Promise.all([
          getWatchlist().catch(() => ({ movies: [] })),
          getTasteMap().catch(() => null),
        ]);
        const movies = wl.movies || [];
        setSavedMovies(movies);
        setSavedCount(movies.length);
        const watched = movies.filter(m => m.watched);
        setWatchedCount(watched.length);

        // Bu ay eklenen
        const now = new Date();
        const thisMonth = movies.filter(m => {
          if (!m.added_at) return false;
          const d = new Date(String(m.added_at).replace(' ', 'T'));
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        });
        setThisMonthCount(thisMonth.length);

        // Top moods for timeline
        if (tm?.top_moods?.length > 0) {
          setTopMoods(tm.top_moods.slice(0, 5));
        } else {
          setTopMoods([]);
        }
      } finally { setLoading(false); }
    })();
  }, [user]);

  /* ─── Derived ──────────────────────────────────────────────────── */
  const displayName = user ? (sanitize(user.name) || sanitize(user.email) || 'Sinemasever') : '';
  const rawAvatar = user?.picture || '';
  const avatarT = Date.now();
  const avatar = rawAvatar.startsWith('/uploads') ? `${getApiUrl(rawAvatar)}?t=${avatarT}` : rawAvatar;
  const initials = displayName.slice(0, 1).toUpperCase();

  // Son izlenen 4 film (timeline için)
  const recentWatched = useMemo(() => {
    return savedMovies
      .filter(m => m.watched)
      .slice(0, 4); // zaten added_at DESC sıralı
  }, [savedMovies]);

  /* ═══ Giriş yapılmamış ═══════════════════════════════════════════ */
  if (!user) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="min-h-screen bg-[#120d0b] text-ivory font-sans relative flex flex-col">

        {/* Header */}
        <header className="sticky top-0 z-50 bg-[#120d0b]/98 border-b border-white/5 pt-safe">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
            <button onClick={() => navigate(-1)}
              className="w-10 h-10 shrink-0 flex items-center justify-center hover:bg-white/5 rounded-full border border-white/10 transition-all">
              <ChevronLeft size={20} />
            </button>
            <span className="font-sans text-[13px] font-bold uppercase tracking-[0.35em] text-amber/70"
              style={{ textShadow: '0 0 20px rgba(255,191,0,0.15)' }}>
              Profil
            </span>
          </div>
        </header>

        <div className="flex-1 flex flex-col items-center justify-center px-6 pb-nav">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-sm text-center space-y-8">

            <div className="w-20 h-20 rounded-full bg-amber/10 border border-amber/20 flex items-center justify-center mx-auto">
              <User size={30} className="text-amber/50" />
            </div>

            <div className="space-y-3">
              <h2 className="font-serif text-3xl font-bold text-ivory tracking-tight">
                Kimsin sen, evlat?
              </h2>
              <p className="font-sans text-sm text-ivory/45 leading-relaxed">
                Giriş yaparsan izleme geçmişin, notların ve kayıtların
                her cihazda seni bekler. Veriler yalnızca sana aittir.
              </p>
            </div>

            {GOOGLE_CLIENT_ID ? (
              <div className="space-y-3">
                <div className={`flex justify-center transition-opacity ${authBusy ? 'opacity-40 pointer-events-none' : ''}`}>
                  <GoogleSignInButton clientId={GOOGLE_CLIENT_ID} onCredential={handleCredential} width={280} />
                </div>
                {authBusy && (
                  <p className="font-sans text-xs text-amber/70 flex items-center justify-center gap-2">
                    <span className="w-3 h-3 rounded-full border-2 border-amber/30 border-t-amber animate-spin" />
                    Giriş yapılıyor...
                  </p>
                )}
                {authError && (
                  <p className="font-sans text-xs text-rose-400 leading-relaxed max-w-xs mx-auto">{authError}</p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="font-sans text-xs text-ivory/40">Google girişi henüz yapılandırılmamış.</p>
                <button onClick={() => setGuestView(false)}
                  className="font-sans text-xs text-ivory/35 hover:text-ivory/60 transition-colors underline underline-offset-4 cursor-pointer bg-transparent border-none">
                  Şimdi değil
                </button>
              </div>
            )}
          </motion.div>
        </div>
      </motion.div>
    );
  }

  /* ═══ Giriş yapılmış ═════════════════════════════════════════════ */
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen bg-[#120d0b] text-ivory font-sans relative">

      {/* Film grain texture overlay */}
      <div className="fixed inset-0 pointer-events-none z-[999] opacity-[0.03] mix-blend-overlay"
        style={{ backgroundImage: "url('https://www.transparenttextures.com/patterns/natural-paper.png')" }} />

      {/* ═══ STICKY HEADER ═══ */}
      <header className="sticky top-0 z-50 bg-[#120d0b]/98 backdrop-blur-sm border-b border-white/5 pt-safe">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <button onClick={() => navigate(-1)}
              className="w-10 h-10 shrink-0 flex items-center justify-center hover:bg-white/5 rounded-full border border-white/10 transition-all">
              <ChevronLeft size={20} />
            </button>
            <span className="font-sans text-[13px] font-bold uppercase tracking-[0.35em] text-amber/70"
              style={{ textShadow: '0 0 20px rgba(255,191,0,0.15)' }}>
              Profil
            </span>
          </div>
          <div className="flex items-center gap-1">
            <NotificationsBell open={notifOpen} onOpenChange={setNotifOpen} />
            <button onClick={() => { logout(); navigate('/'); }}
              title="Çıkış Yap"
              className="w-10 h-10 flex items-center justify-center hover:bg-white/5 rounded-full
                         text-ivory/45 hover:text-red-400 transition-all">
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8 pb-nav">

        {/* ═══ IDENTITY HERO ═══ */}
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col items-center text-center gap-5 pt-2">

          {/* Avatar with conic-gradient ring */}
          <div className="relative">
            <div className="w-28 h-28 rounded-full p-[3px]"
              style={{ background: 'conic-gradient(from 0deg, #ffbf00, #f59e0b, #d97706, #f59e0b, #ffbf00)' }}>
              <div className="w-full h-full rounded-full overflow-hidden bg-[#120d0b] flex items-center justify-center">
                {avatar
                  ? <img src={avatar} alt={displayName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  : <span className="font-serif text-4xl font-bold text-amber">{initials}</span>}
              </div>
            </div>
            {/* Subtle glow behind avatar */}
            <div className="absolute inset-0 rounded-full opacity-20 blur-xl -z-10"
              style={{ background: 'radial-gradient(circle, #ffbf00 0%, transparent 70%)' }} />
          </div>

          {/* Name + username */}
          <div className="space-y-1.5">
            <h1 className="font-serif text-[30px] sm:text-4xl font-bold tracking-tight text-ivory leading-tight">
              {displayName}
            </h1>
            {user.username && (
                <p className="flex items-center justify-center gap-1.5 font-mono text-sm text-amber/60">
                <AtSign size={13} />{sanitize(user.username)}
              </p>
            )}
            <p className="font-sans text-[13px] text-ivory/50 flex items-center justify-center gap-1.5">
              <CalendarDays size={11} className="text-amber/50" />
              {formatDate(user.created_at)} tarihinde katıldı
            </p>
            <button
              onClick={() => setEditProfileOpen(true)}
              className="mt-2 px-5 py-2 rounded-full bg-white/5 border border-white/10
                       text-[12px] font-semibold text-ivory/70 hover:text-amber hover:border-amber/30
                       transition-all active:scale-95"
            >
              Profili Düzenle
            </button>
          </div>
        </motion.div>

        {/* ═══ 4-STAT PLATE GRID ═══ */}
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}>
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="sinemood-spinner" />
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { icon: Eye, label: 'İzlendi', value: watchedCount, color: '#34d399' },
                { icon: Bookmark, label: 'Kayıtlı', value: savedCount, color: '#fbbf24' },
                { icon: CalendarDays, label: 'Bu Ay', value: thisMonthCount, color: '#60a5fa' },
              ].map(({ icon: Icon, label, value, color }) => (
                <div key={label}
                  className="p-5 rounded-2xl bg-[#1c1512]/90 border border-white/[0.06] flex flex-col gap-2">
                  <Icon size={16} style={{ color }} className="opacity-70" />
                  <p className="font-sans text-2xl sm:text-3xl font-bold text-ivory tracking-tight leading-none">
                    {value}
                  </p>
                  <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.15em] text-ivory/50">
                    {label}
                  </p>
                </div>
              ))}
            </div>
          )}
        </motion.div>


        {/* ═══ ZAMAN ÇİZGİSİ ═══ */}
        {!loading && recentWatched.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-4">

            <p className="font-sans text-[13px] font-bold uppercase tracking-[0.2em] text-amber/50 px-1">
              Son İzlenenler
            </p>

            <div className="relative pl-6">
              {/* Vertical light strip */}
              <div className="absolute left-[11px] top-0 bottom-0 w-[2px] rounded-full"
                style={{
                  background: 'linear-gradient(to bottom, rgba(255,191,0,0.3), rgba(255,191,0,0.05))',
                }} />

              <div className="space-y-1">
                {recentWatched.map((movie, i) => {
                  // Film için mood rengi (basit heuristik)
                  const moodColor = (topMoods.length > 0 && MOOD_DOT_COLORS[topMoods[0]?.mood_id]) || '#d4af37';
                  return (
                    <div key={movie.tmdb_id} className="relative flex items-center gap-3 py-2.5">
                      {/* Timeline dot */}
                      <div className="absolute -left-6 w-[6px] h-[6px] rounded-full"
                        style={{
                          backgroundColor: moodColor,
                          boxShadow: `0 0 8px ${moodColor}40`,
                        }} />

                      {/* Poster thumbnail */}
                      {movie.poster_url && (
                        <div className="w-8 h-12 rounded-lg overflow-hidden shrink-0 bg-white/5">
                          <img src={movie.poster_url} alt="" className="w-full h-full object-cover" />
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <p className="font-serif text-sm font-semibold text-ivory/85 truncate">
                          {sanitize(movie.title)}
                        </p>
                        <p className="font-sans text-[11px] text-ivory/45">
                          {formatDate(movie.added_at)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}

        {/* ═══ BİLDİRİMLER BOŞ DURUM ═══ */}
        {!socialLoading && !sharesLoading && requests.length === 0 && shares.length === 0 && (
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.26, ease: [0.16, 1, 0.3, 1] }}
            className="p-6 rounded-2xl bg-[#1c1512]/90 border border-white/[0.06] text-center flex flex-col items-center gap-3">
            <LottieAnimation
              path="/lottie/empty-state.json"
              className="w-20 h-20 opacity-50"
              speed={0.5}
            />
            <p className="font-serif text-sm italic text-ivory/65 leading-relaxed">
              Henüz yeni bir bildirim yok.
              Arkadaşlarından gelen istekler ve film önerileri burada görünecek.
            </p>
          </motion.div>
        )}

        {/* ═══ GELEN ARKADAŞLIK İSTEKLERİ ═══ */}
        <AnimatePresence>
          {requests.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.28, ease: [0.16, 1, 0.3, 1] }}
              className="space-y-3">

              <div className="flex items-center gap-2.5 px-1">
                <UserPlus size={14} className="text-amber/60" />
                <p className="font-sans text-[11px] font-bold uppercase tracking-[0.3em] text-amber/60">
                  Gelen İstekler
                </p>
                <span className="ml-auto inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber/15 text-amber text-[11px] font-bold">
                  {requests.length}
                </span>
              </div>

              {socialError && (
                <p className="px-1 text-[12px] font-serif italic text-rose-400">{socialError}</p>
              )}

              <div className="space-y-1.5">
                {requests.map(r => (
                  <motion.div key={r.request_id} layout exit={{ opacity: 0, x: -40 }}
                    transition={{ duration: 0.3 }}
                    className="flex items-center gap-3 p-3 rounded-xl bg-[#1c1512]/90 border border-white/[0.06]">

                    <div className="w-9 h-9 rounded-full overflow-hidden bg-amber/10 shrink-0 flex items-center justify-center">
                      {r.avatar && !failedAvatars.has(r.request_id)
                        ? <img src={r.avatar} alt={r.name} className="w-full h-full object-cover" referrerPolicy="no-referrer"
                            onError={() => onAvatarError(r.request_id)} />
                        : <span className="font-bold text-[11px] text-amber/60">{(r.username || r.name || '?')[0].toUpperCase()}</span>}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[13px] text-[#f5f2eb] truncate">{r.username || r.name}</p>
                      <p className="text-[11px] text-white/45 truncate">@{r.username}</p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button onClick={() => handleRespondRequest(r.request_id, 'ACCEPT')}
                        className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/20
                          flex items-center justify-center hover:bg-emerald-500/20 transition-all" title="Onayla">
                        <Check size={14} className="text-emerald-400" />
                      </button>
                      <button onClick={() => handleRespondRequest(r.request_id, 'DECLINE')}
                        className="w-8 h-8 rounded-full bg-rose-500/10 border border-rose-500/20
                          flex items-center justify-center hover:bg-rose-500/20 transition-all" title="Reddet">
                        <X size={14} className="text-rose-400" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ═══ GELEN FİLM ÖNERİLERİ ═══ */}
        <AnimatePresence>
          {shares.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.30, ease: [0.16, 1, 0.3, 1] }}
              className="space-y-3">

              <div className="flex items-center gap-2.5 px-1">
                <Bell size={14} className="text-amber/60" />
                <p className="font-sans text-[11px] font-bold uppercase tracking-[0.3em] text-amber/60">
                  Gelen Öneriler
                </p>
                <span className="ml-auto inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber/15 text-amber text-[11px] font-bold">
                  {shares.length}
                </span>
              </div>

              <div className="space-y-2.5">
                {shares.map(s => (
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
                          <img src={s.sender.avatar} alt="" className="w-5 h-5 rounded-full object-cover" referrerPolicy="no-referrer" />
                        )}
                        <span className="text-[12px] text-amber/75 font-semibold truncate">
                          {s.sender?.username || s.sender?.name || 'Arkadaş'}
                        </span>
                      </div>
                      <h4 className="text-[15px] font-serif font-bold text-[#f5f2eb] line-clamp-1">
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
                        onClick={() => setDetailMovie({
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
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ═══ SİNEMA ARKADAŞLARIM ═══ */}
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.34, ease: [0.16, 1, 0.3, 1] }}
          className="space-y-4">

          <div className="flex items-center gap-2.5 px-1">
            <Users size={14} className="text-amber/60" />
            <p className="font-sans text-[13px] font-bold uppercase tracking-[0.25em] text-amber/60">
              Sinema Arkadaşlarım
            </p>
          </div>

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
          ) : friends.length === 0 ? (
            <div className="p-6 rounded-2xl bg-[#1c1512]/90 border border-white/[0.06] text-center space-y-4">
              <LottieAnimation
                path="/lottie/empty-state.json"
                className="w-16 h-16 mx-auto opacity-40"
                speed={0.6}
              />
              <p className="font-serif text-sm italic text-ivory/70 leading-relaxed">
                Henüz sinema arkadaşın yok. Üstad'ın dünyasına arkadaşlarını davet et!
              </p>
              <div className="max-w-xs mx-auto space-y-3">
                <div className="flex gap-2">
                  <input value={addUsername}
                    onChange={e => { setAddUsername(e.target.value); setAddMsg(null); }}
                    onKeyDown={e => e.key === 'Enter' && handleAddFriend()}
                    placeholder="kullanıcı_adı"
                    className="flex-1 px-4 py-2 bg-white/5 border border-white/[0.08] rounded-full
                      text-sm text-[#f5f2eb] placeholder:text-white/45 focus:outline-none focus:border-amber/30 transition-all font-mono" />
                  <button onClick={handleAddFriend} disabled={addBusy}
                    className="flex items-center gap-1.5 px-4 py-2 bg-amber text-[#120d0b] rounded-full text-[11px] font-bold uppercase tracking-wider
                      hover:bg-amber-400 transition-all disabled:opacity-40">
                    <UserPlus size={13} /> Ekle
                  </button>
                </div>
                {addMsg && (
                  <p className={`text-xs font-serif ${addMsg.ok ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {addMsg.text}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {/* Search + Add */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                  <input value={friendSearch} onChange={e => setFriendSearch(e.target.value)}
                    placeholder="Arkadaş Ara..."
                    className="w-full pl-8 pr-3 py-2 bg-white/5 border border-white/[0.08] rounded-full
                      text-sm text-[#f5f2eb] placeholder:text-white/45 focus:outline-none focus:border-amber/30 transition-all" />
                </div>
                <div className="flex gap-1.5">
                  <input value={addUsername}
                    onChange={e => { setAddUsername(e.target.value); setAddMsg(null); }}
                    onKeyDown={e => e.key === 'Enter' && handleAddFriend()}
                    placeholder="kullanıcı_adı"
                    className="w-24 sm:w-32 px-3 py-2 bg-white/5 border border-white/[0.08] rounded-full
                      text-sm text-[#f5f2eb] placeholder:text-white/45 focus:outline-none focus:border-amber/30 transition-all font-mono" />
                  <button onClick={handleAddFriend} disabled={addBusy}
                    className="flex items-center gap-1 px-3 py-2 bg-[#d4af37] text-[#120d0b] rounded-full text-[11px] font-bold
                      hover:bg-amber-400 transition-all disabled:opacity-40 shrink-0" title="Arkadaş Ekle">
                    <UserPlus size={13} />
                  </button>
                </div>
              </div>
              {addMsg && (
                <p className={`text-xs font-serif px-1 ${addMsg.ok ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {addMsg.text}
                </p>
              )}

              {/* Friend cards */}
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
                            ? <img src={f.avatar} alt={f.name} className="w-full h-full object-cover" referrerPolicy="no-referrer"
                                onError={() => onAvatarError(f.id)} />
                            : <span className="font-bold text-[11px] text-amber/60">{(f.username || f.name || '?')[0].toUpperCase()}</span>}
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-[13px] text-[#f5f2eb] truncate">{f.username || f.name}</p>
                          <p className="text-[12px] text-white/45 truncate">@{f.username}</p>
                        </div>

                        <button onClick={() => handleRemoveFriend(f.id)}
                          className="w-7 h-7 rounded-full flex items-center justify-center
                            text-white/30 hover:text-rose-400 hover:bg-rose-500/10 transition-all" title="Kaldır">
                          <Trash2 size={13} />
                        </button>
                      </motion.div>
                    ))}
                  </div>
                )}
              </AnimatePresence>
            </div>
          )}
        </motion.div>

        {/* ═══ AYARLAR KISAYOLLARI ═══ */}
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.40, ease: [0.16, 1, 0.3, 1] }}
          className="space-y-3">

          <div className="flex items-center gap-2.5 px-1">
            <Settings size={14} className="text-amber/50" />
            <p className="font-sans text-[11px] font-bold uppercase tracking-[0.25em] text-amber/50">
              Ayarlar
            </p>
          </div>

          <div className="rounded-2xl bg-[#1c1512]/90 border border-white/[0.06] overflow-hidden divide-y divide-white/[0.04]">
            {[
              { icon: Bell, label: 'Bildirimler', desc: 'Öneri ve istek bildirimleri',
                action: () => setNotifOpen(true) },
              { icon: Palette, label: 'Görünüm', desc: theme === 'dark' ? 'Aydınlık temaya geç' : 'Karanlık temaya geç',
                action: toggleTheme, badge: theme === 'dark' ? 'Karanlık' : 'Aydınlık' },
              { icon: Database, label: 'Verilerim', desc: 'Dışa aktar veya yedekle',
                action: async () => {
                  try {
                    const wl = await getWatchlist();
                    const blob = new Blob([JSON.stringify(wl, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url; a.download = 'sinemood-verilerim.json'; a.click();
                    URL.revokeObjectURL(url);
                  } catch { alert('Veri dışa aktarılamadı.'); }
                }},
              { icon: AlertTriangle, label: 'Hesabı Sil', desc: 'Tüm verileri kalıcı olarak sil', danger: true,
                action: async () => {
                  if (!window.confirm('Hesabınız ve tüm verileriniz kalıcı olarak silinecek. Bu işlem geri alınamaz. Emin misiniz?')) return;
                  try {
                    const token = window.__fc_user_token;
                    const res = await fetch(getApiUrl('/api/auth/account'), {
                      method: 'DELETE',
                      headers: { 'Authorization': `Bearer ${token}` },
                    });
                    if (res.ok) { logout(); navigate('/'); }
                    else alert('Hesap silinemedi. Lütfen tekrar deneyin.');
                  } catch { alert('Bir hata oluştu.'); }
                }},
            ].map(({ icon: Icon, label, desc, danger, action, badge }) => (
              <button key={label} onClick={action}
                className={`w-full flex items-center gap-3.5 px-5 py-4 text-left transition-all
                  ${danger ? 'hover:bg-rose-500/8' : 'hover:bg-white/[0.04]'}`}>
                <Icon size={17} className={danger ? 'text-rose-400/70' : 'text-ivory/65'} />
                <div className="flex-1 min-w-0">
                  <p className={`font-sans text-[14px] font-semibold ${danger ? 'text-rose-400/80' : 'text-ivory/80'}`}>
                    {label}
                  </p>
                  <p className="font-sans text-[12px] text-ivory/60 mt-0.5">{desc}</p>
                </div>
                {badge && (
                  <span className="px-2.5 py-1 rounded-full bg-amber/10 border border-amber/20 font-sans text-[11px] font-bold text-amber/70 uppercase tracking-wide shrink-0">
                    {badge}
                  </span>
                )}
                <ChevronRight size={14} className="text-ivory/60 shrink-0" />
              </button>
            ))}
          </div>
        </motion.div>

      </main>

      {/* Film detay modalı */}
      {detailMovie && (
        <FilmDetailModal
          movieId={detailMovie.id}
          initialMovie={detailMovie}
          onClose={() => setDetailMovie(null)}
        />
      )}

      {/* Profil düzenleme modalı */}
      {editProfileOpen && (
        <EditProfileModal
          onClose={() => setEditProfileOpen(false)}
          onSaved={() => {
            setEditProfileOpen(false);
            getMe().then((data) => updateUser(data)).catch(() => {});
          }}
        />
      )}
    </motion.div>
  );
}
