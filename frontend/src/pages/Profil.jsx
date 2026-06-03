/**
 * Profil Sayfası — Modüler, component-based yapı.
 *
 * Alt bileşenler:
 *  - ProfileHeader: Avatar, isim, username, katılım tarihi
 *  - ProfileStats: İzlendi/Kayıtlı/Bu Ay istatistikleri
 *  - ProfileTasteMap: Tür dağılımı, mood yüzdeleri, dönem, tempo, stil, süre profili
 *  - ProfileTimeline: Son izlenenler zaman çizgisi
 *  - ProfileSocial: Arkadaşlar / İstekler / Öneriler (tabbed)
 *  - ProfileSettings: Bildirim, tema, veri dışa aktarma, hesap silme
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LogOut, ChevronLeft, User, Share2, Link2, Brain, Users, Settings, Trophy } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import {
  getWatchlist, getTasteMap, getFriends, getFriendRequests,
  respondFriendRequest, removeFriend, sendFriendRequest,
  markSharesRead, getRecommendationHistory, retractRecommendation, getMe,
} from '../services/api';
import { resolveAvatarUrl, getApiUrl, getShareUrl } from '../utils/apiConfig';
import useDocumentMeta from '../utils/useDocumentMeta';
import { copyToClipboard } from '../utils/shareUtils';
import GoogleSignInButton from '../components/GoogleSignInButton';
import NotificationsBell from '../components/NotificationsBell';
import FilmDetailModal from '../components/FilmDetailModal';
import EditProfileModal from '../components/EditProfileModal';
import ShareButtons from '../components/ShareButtons';
import ProfileHeader from '../components/profile/ProfileHeader';
import ProfileStats from '../components/profile/ProfileStats';
import ProfileTimeline from '../components/profile/ProfileTimeline';
import ProfileSocial from '../components/profile/ProfileSocial';
import ProfileSettings from '../components/profile/ProfileSettings';
import ReferralCard from '../components/profile/ReferralCard';
import MilestonesStrip from '../components/MilestonesStrip';
import WeeklyReportCard from '../components/WeeklyReportCard';
import { useAchievements } from '../components/AchievementCelebration';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

const sanitize = (str) =>
  String(str ?? '').replace(/[<>{}$]/g, '').replace(/javascript:/gi, '').trim();

/* ═══════════════════════════════════════════════════════════════════
   PROFIL
   ═══════════════════════════════════════════════════════════════════ */
export default function Profil() {
  const navigate = useNavigate();
  const { user, logout, login, devLogin, emailLogin, emailRegister, updateUser } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { check: checkMilestones } = useAchievements();
  useDocumentMeta({
    title: 'Profilim — Zevk Haritam | Sinemood',
    description: 'Sinema zevk haritan, izleme listen ve davet ettiklerin. Profilini keşfet ve paylaş.',
  });

  /* ─── Auth ─────────────────────────────────────────────────────── */
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [notifOpen, setNotifOpen] = useState(false);

  // E-posta formu durumu
  const [emailMode, setEmailMode] = useState('login'); // 'login' | 'register'
  const [emailForm, setEmailForm] = useState({ email: '', password: '', name: '' });
  const handleEmailSubmit = useCallback(async (e) => {
    e?.preventDefault?.();
    const email = emailForm.email.trim().toLowerCase();
    const { password, name } = emailForm;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setAuthError('Geçerli bir e-posta gir.'); return; }
    if (password.length < 6) { setAuthError('Şifre en az 6 karakter olmalı.'); return; }
    setAuthBusy(true);
    setAuthError('');
    const r = emailMode === 'register'
      ? await emailRegister(email, password, name.trim())
      : await emailLogin(email, password);
    setAuthBusy(false);
    if (!r?.ok) setAuthError(r?.error || 'İşlem başarısız oldu.');
  }, [emailForm, emailMode, emailLogin, emailRegister]);

  const handleCredential = useCallback(async (cred) => {
    if (!cred) return;
    setAuthBusy(true);
    setAuthError('');
    const r = await login(cred);
    setAuthBusy(false);
    if (!r?.ok) setAuthError(r?.error || 'Giriş başarısız oldu.');
  }, [login]);

  // SADECE YEREL geliştirme — Google olmadan test girişi
  const handleDevLogin = useCallback(async () => {
    setAuthBusy(true);
    setAuthError('');
    const r = await devLogin();
    setAuthBusy(false);
    if (!r?.ok) setAuthError(r?.error || 'Dev giriş başarısız.');
  }, [devLogin]);

  /* ─── Stats + Taste ────────────────────────────────────────────── */
  const [savedMovies, setSavedMovies] = useState([]);
  const [savedCount, setSavedCount] = useState(0);
  const [watchedCount, setWatchedCount] = useState(0);
  const [thisMonthCount, setThisMonthCount] = useState(0);
  const [tasteMap, setTasteMap] = useState(null);
  const [loading, setLoading] = useState(true);

  /* ─── Social ───────────────────────────────────────────────────── */
  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState([]);
  const [socialLoading, setSocialLoading] = useState(true);
  const [socialError, setSocialError] = useState('');
  const [respondLoading, setRespondLoading] = useState(null);

  /* ─── Shares ───────────────────────────────────────────────────── */
  const [shares, setShares] = useState([]);
  const [sentShares, setSentShares] = useState([]);
  const [sharesLoading, setSharesLoading] = useState(true);
  const [detailMovie, setDetailMovie] = useState(null);
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [profileLinkCopied, setProfileLinkCopied] = useState(false);
  const [profileTab, setProfileTab] = useState('achievements');
  const pollRef = useRef(null);

  /* ─── Fetch social on mount ────────────────────────────────────── */
  useEffect(() => {
    if (!user) { setSocialLoading(false); setSharesLoading(false); return; }
    let alive = true;
    (async () => {
      try {
        setSocialError('');
        const [fr, rq, hist] = await Promise.all([
          getFriends().catch(() => ({ friends: [] })),
          getFriendRequests().catch(() => ({ requests: [] })),
          getRecommendationHistory().catch(() => ({ received: [], sent: [] })),
        ]);
        if (alive) {
          setFriends(fr.friends || []);
          setRequests(rq.requests || []);
          setShares(hist.received || []);
          setSentShares(hist.sent || []);
          // Rozeti sıfırla ama listeden silme (kalıcı görünür kalsın)
          if ((hist.received || []).some(s => !s.is_read)) markSharesRead().catch(() => {});
        }
      } finally {
        if (alive) { setSocialLoading(false); setSharesLoading(false); }
      }
    })();
    return () => { alive = false; };
  }, [user]);

  /* ─── 30s polling ──────────────────────────────────────────────── */
  useEffect(() => {
    if (!user) return;
    const poll = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        setSocialError('');
        const [fr, rq, hist] = await Promise.all([
          getFriends().catch(() => ({ friends: [] })),
          getFriendRequests().catch(() => ({ requests: [] })),
          getRecommendationHistory().catch(() => ({ received: [], sent: [] })),
        ]);
        setFriends(fr.friends || []);
        setRequests(rq.requests || []);
        setShares(hist.received || []);
        setSentShares(hist.sent || []);
        if ((hist.received || []).some(s => !s.is_read)) markSharesRead().catch(() => {});
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
    if (respondLoading) return;
    setRespondLoading(`${requestId}-${action}`);
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
    } finally {
      setRespondLoading(null);
    }
  }, [respondLoading]);

  const handleRemoveFriend = useCallback(async (friendId) => {
    try {
      setSocialError('');
      await removeFriend(friendId);
      setFriends(prev => prev.filter(f => f.id !== friendId));
    } catch (err) {
      setSocialError(err?.message || 'Arkadaş silinemedi.');
    }
  }, []);

  const handleRetractSent = useCallback((recId) => {
    // Anında kaldır (optimistik) — kullanıcı beklemez, hata mesajı görmez.
    setSentShares(prev => prev.filter(s => s.id !== recId));
    // Arka planda sil; cold-start'ta ilk istek tarayıcıda "failed to fetch"
    // verse de sunucuyu uyandırır → sessizce bir kez daha dene. Yine olmazsa
    // veri kaynağı sonraki profil yüklemesinde zaten doğruyu gösterir.
    retractRecommendation(recId).catch(() => {
      retractRecommendation(recId).catch(() => {});
    });
  }, []);

  const handleAddFriend = useCallback(async (username) => {
    const res = await sendFriendRequest(username);
    if (res.status === 'ACCEPTED') {
      const data = await getFriends().catch(() => ({ friends: [] }));
      setFriends(data.friends || []);
      return 'ACCEPTED';
    }
    // Background refetch after 5s
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
    return 'PENDING';
  }, []);

  /* ─── Fetch stats + taste map ──────────────────────────────────── */
  // Anonim kullanıcıda da çalışır: watchlist localStorage'dan gelir,
  // taste map backend ister (anonimde null döner — sorun değil).
  useEffect(() => {
    (async () => {
      try {
        const [wl, tm] = await Promise.all([
          getWatchlist().catch(() => ({ movies: [] })),
          user ? getTasteMap().catch(() => null) : Promise.resolve(null),
        ]);
        const movies = wl.movies || [];
        setSavedMovies(movies);
        setSavedCount(movies.length);
        setWatchedCount(movies.filter(m => m.watched).length);

        const now = new Date();
        setThisMonthCount(movies.filter(m => {
          if (!m.added_at) return false;
          const d = new Date(String(m.added_at).replace(' ', 'T'));
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        }).length);

        setTasteMap(tm);
      } finally { setLoading(false); }
    })();
  }, [user]);

  /* ─── Derived ──────────────────────────────────────────────────── */
  const displayName = user ? (sanitize(user.name) || sanitize(user.email) || 'Sinemasever') : 'Sinemasever';
  const rawAvatar = user?.picture || '';
  const avatar = resolveAvatarUrl(rawAvatar);
  const initials = displayName.slice(0, 1).toUpperCase();

  const recentWatched = useMemo(() =>
    savedMovies.filter(m => m.watched).slice(0, 4),
    [savedMovies]);

  const topMoods = tasteMap?.top_moods?.slice(0, 5) || [];

  /* ─── Başarımlar ───────────────────────────────────────────────── */
  const milestoneStats = useMemo(() => ({
    saved: savedMovies.length,
    watched: savedMovies.filter(m => m.watched).length,
    notes: savedMovies.filter(m => (m.personal_note || '').trim()).length,
  }), [savedMovies]);

  // Yükleme bitince senkronize et (yeni açılan başarım varsa global kutlama).
  useEffect(() => {
    if (loading) return;
    checkMilestones(milestoneStats);
  }, [milestoneStats, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ─── Public profile link ──────────────────────────────────────── */
  // Backend OG paylaşım ucu: crawler kişiye özel önizleme görür, insan SPA'ya yönlenir.
  const profileUrl = user?.username ? getShareUrl(`/share/u/${user.username}`) : '';

  const handleCopyProfileLink = async () => {
    if (!profileUrl) return;
    await copyToClipboard(profileUrl);
    setProfileLinkCopied(true);
    setTimeout(() => setProfileLinkCopied(false), 2000);
  };

  /* ═══ Sign-in CTA (anonim kullanıcıya gösterilir) ═══════════════════ */
  const SignInCTA = ({ compact = false }) => (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className={`w-full max-w-sm mx-auto text-center ${compact ? 'space-y-5 py-6' : 'space-y-8'}`}>
      {!compact && (
        <div className="w-20 h-20 rounded-full bg-amber/10 border border-amber/20 flex items-center justify-center mx-auto">
          <User size={30} className="text-amber/50" />
        </div>
      )}
      <div className="space-y-3">
        <h2 className="font-serif text-2xl sm:text-3xl font-bold text-ivory tracking-tight">
          {compact ? 'Arkadaşlarınla bağlan' : 'Giriş yap, her cihazda seni bekleyelim'}
        </h2>
        <p className="font-sans text-sm text-ivory/45 leading-relaxed">
          {compact
            ? 'Sosyal özellikler için giriş yapman gerek — arkadaş ekle, film paylaş, zevkini karşılaştır.'
            : 'Şu an kayıtların bu cihazda tutuluyor. Giriş yaparsan izleme geçmişin, notların ve listelerin her yerde seninle.'}
        </p>
      </div>
      <div className="space-y-3">
        {/* Google */}
        {GOOGLE_CLIENT_ID && (
          <div className={`flex justify-center transition-opacity ${authBusy ? 'opacity-40 pointer-events-none' : ''}`}>
            <GoogleSignInButton clientId={GOOGLE_CLIENT_ID} onCredential={handleCredential} width={280} />
          </div>
        )}

        {/* Ayraç */}
        <div className="flex items-center gap-3 max-w-[280px] mx-auto pt-1">
          <span className="h-px flex-1 bg-white/10" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-ivory/30 whitespace-nowrap">veya e-posta ile</span>
          <span className="h-px flex-1 bg-white/10" />
        </div>

        {/* E-posta + şifre formu */}
        <form onSubmit={handleEmailSubmit} className="space-y-2.5 max-w-[280px] mx-auto text-left">
          {emailMode === 'register' && (
            <input
              type="text" value={emailForm.name} autoComplete="name"
              onChange={(e) => setEmailForm((f) => ({ ...f, name: e.target.value.slice(0, 50) }))}
              placeholder="Adın"
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-[14px] text-ivory placeholder:text-ivory/35 focus:outline-none focus:border-amber/40 transition-all"
            />
          )}
          <input
            type="email" value={emailForm.email} autoComplete="email" inputMode="email"
            onChange={(e) => setEmailForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="E-posta"
            className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-[14px] text-ivory placeholder:text-ivory/35 focus:outline-none focus:border-amber/40 transition-all"
          />
          <input
            type="password" value={emailForm.password}
            autoComplete={emailMode === 'register' ? 'new-password' : 'current-password'}
            onChange={(e) => setEmailForm((f) => ({ ...f, password: e.target.value }))}
            placeholder="Şifre (en az 6 karakter)"
            className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-[14px] text-ivory placeholder:text-ivory/35 focus:outline-none focus:border-amber/40 transition-all"
          />
          <button
            type="submit" disabled={authBusy}
            className="w-full py-2.5 rounded-xl bg-amber text-[#120d0b] font-bold text-[13px] uppercase tracking-wider hover:bg-amber-400 transition-all disabled:opacity-40 active:scale-[0.98]">
            {authBusy ? 'Lütfen bekle...' : (emailMode === 'register' ? 'Kayıt Ol' : 'Giriş Yap')}
          </button>
        </form>

        <button
          type="button"
          onClick={() => { setEmailMode((m) => (m === 'login' ? 'register' : 'login')); setAuthError(''); }}
          className="text-[11px] font-semibold text-amber/60 hover:text-amber transition-colors">
          {emailMode === 'login' ? 'Hesabın yok mu? Kayıt ol' : 'Zaten hesabın var mı? Giriş yap'}
        </button>

        {authError && <p className="font-sans text-xs text-rose-400 max-w-xs mx-auto">{authError}</p>}

        {import.meta.env.DEV && (
          <button onClick={handleDevLogin} disabled={authBusy}
            className="mx-auto block text-[10px] font-bold uppercase tracking-[0.2em] text-amber/60 hover:text-amber border border-amber/20 hover:border-amber/40 rounded-full px-4 py-2 transition-colors disabled:opacity-40">
            Geliştirici Girişi (yerel)
          </button>
        )}
      </div>
    </motion.div>
  );

  /* ═══ PROFIL (anonim + giriş yapmış birleşik) ═══════════════════════ */
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen bg-[#120d0b] text-ivory font-sans relative">

      <div className="fixed inset-0 pointer-events-none z-[999] opacity-[0.03] mix-blend-overlay"
        style={{ backgroundImage: "url('https://www.transparenttextures.com/patterns/natural-paper.png')" }} />

      {/* ═══ HEADER ═══ */}
      <header className="sticky top-0 z-50 bg-[#120d0b]/98 backdrop-blur-sm border-b border-white/5 pt-safe">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <button onClick={() => navigate(-1)}
              className="w-10 h-10 shrink-0 flex items-center justify-center hover:bg-white/5 rounded-full border border-white/10 transition-all">
              <ChevronLeft size={20} />
            </button>
            <span className="font-sans text-[13px] font-bold uppercase tracking-[0.35em] text-amber/70"
              style={{ textShadow: '0 0 20px rgba(255,191,0,0.15)' }}>Profil</span>
          </div>
          <div className="flex items-center gap-1">
            {user && (
              <>
                <NotificationsBell open={notifOpen} onOpenChange={setNotifOpen} />
                <button onClick={() => { logout(); navigate('/'); }}
                  title="Çıkış Yap"
                  className="w-10 h-10 flex items-center justify-center hover:bg-white/5 rounded-full text-ivory/45 hover:text-red-400 transition-all">
                  <LogOut size={17} />
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8 pb-nav">

        {/* ─── Identity Hero ─── */}
        <ProfileHeader
          user={user}
          avatar={avatar}
          displayName={displayName}
          initials={initials}
          onEditProfile={user ? () => setEditProfileOpen(true) : null}
          isPublic={!user}
        />

        {/* ─── Anonim: giriş çağrısı ─── */}
        {!user && (
          <div className="rounded-2xl bg-amber/[0.06] border border-amber/15 px-5 py-6">
            <SignInCTA />
          </div>
        )}

        {/* ─── Public profile link ─── */}
        {profileUrl && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}
            className="flex items-center justify-center gap-3">
            <button
              onClick={handleCopyProfileLink}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-[11px] font-bold uppercase tracking-[0.15em] transition-all ${
                profileLinkCopied
                  ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
                  : 'bg-white/5 border border-white/10 text-ivory/50 hover:text-amber hover:border-amber/30'
              }`}>
              <Link2 size={12} />
              {profileLinkCopied ? 'Kopyalandı!' : 'Profil Linkini Kopyala'}
            </button>
            <ShareButtons
              url={profileUrl}
              text={`${displayName}'in Sinemood profili`}
              compact
            />
          </motion.div>
        )}

        {/* ─── Stats ─── */}
        <ProfileStats
          watchedCount={watchedCount}
          savedCount={savedCount}
          thisMonthCount={thisMonthCount}
          loading={loading}
        />

        {/* ─── Tab Navigation ─── */}
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}>
          <div className="flex gap-1 p-1 rounded-full bg-[#1c1512]/90 border border-white/[0.06]">
            {[
              { id: 'achievements', label: 'Başarımlar', short: 'Başarımlar', icon: Trophy },
              { id: 'social', label: 'Arkadaşlar', short: 'Arkadaşlar', icon: Users },
              { id: 'settings', label: 'Ayarlar', short: 'Ayarlar', icon: Settings },
            ].map(tab => (
              <button key={tab.id}
                onClick={() => setProfileTab(tab.id)}
                className={`flex-1 min-w-0 flex items-center justify-center gap-1.5 px-2 sm:px-3 py-2.5 rounded-full text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.12em] sm:tracking-[0.15em] transition-all ${
                  profileTab === tab.id
                    ? 'bg-amber/15 text-amber border border-amber/20'
                    : 'text-ivory/40 hover:text-ivory/60'
                }`}>
                <tab.icon size={13} className="shrink-0" />
                <span className="truncate sm:hidden">{tab.short}</span>
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>
        </motion.div>

        {/* ─── Tab Content ─── */}
        {profileTab === 'achievements' && (
          <div className="space-y-8">
            {!loading && <WeeklyReportCard movies={savedMovies} topMood={topMoods[0] || null} />}
            <MilestonesStrip stats={milestoneStats} />
            {!loading && <ProfileTimeline recentWatched={recentWatched} topMoods={topMoods} />}
          </div>
        )}

        {profileTab === 'social' && (
          user ? (
            <div className="space-y-6">
              <ReferralCard />
              <ProfileSocial
                friends={friends}
                requests={requests}
                shares={shares}
                sent={sentShares}
                socialLoading={socialLoading || sharesLoading}
                socialError={socialError}
                onRespondRequest={handleRespondRequest}
                onRemoveFriend={handleRemoveFriend}
                onAddFriend={handleAddFriend}
                onRetractSent={handleRetractSent}
                onDetailMovie={setDetailMovie}
                respondLoading={respondLoading}
              />
            </div>
          ) : (
            <SignInCTA compact />
          )
        )}

        {profileTab === 'settings' && (
          <ProfileSettings
            theme={theme}
            toggleTheme={toggleTheme}
            logout={logout}
            navigate={navigate}
            onNotifOpen={() => setNotifOpen(true)}
          />
        )}

      </main>

      {/* ─── Modals ─── */}
      {detailMovie && (
        <FilmDetailModal
          movieId={detailMovie.id}
          initialMovie={detailMovie}
          onClose={() => setDetailMovie(null)}
        />
      )}
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
