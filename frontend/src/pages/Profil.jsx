/**
 * Profil Sayfası — kullanıcıya özel kimlik + izleme istatistikleri.
 * Mevcut Google OAuth + JWT auth üzerine kuruludur (Supabase/Firebase yok).
 * Tema: koyu mod + buzlu cam (backdrop-blur-md bg-slate-900/80),
 * serif başlıklar + sans-serif veri tipografisi, Framer Motion fade-in.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, LogOut, Film, Eye, Clapperboard, Bookmark, CalendarDays, Mail, User, Activity, Users, Check, X, UserPlus, Search, Trash2, AtSign, Bell, Play, Star as StarIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getWatchlist, getTasteMap, getFriends, getFriendRequests, respondFriendRequest, removeFriend, sendFriendRequest, getShares, markSharesRead } from '../services/api';
import GoogleSignInButton from '../components/GoogleSignInButton';
import FilmDetailModal from '../components/FilmDetailModal';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

// XSS'e karşı: ekrana basılan kullanıcı kaynaklı metinleri sterilize et
const sanitize = (str) =>
  String(str ?? '').replace(/[<>{}$]/g, '').replace(/javascript:/gi, '').trim();

/**
 * ISO string → clean Turkish date: "20 Mayıs 2026"
 * Handles: "2026-05-20T15:40:05.435Z", "2026-05-20 15:40:05", "2026-05-20"
 * Never shows hours, timezones, or raw ISO characters.
 */
const formatDate = (iso) => {
  if (!iso) return 'Bilinmiyor';
  try {
    // Normalize: replace space separator with T, strip trailing non-date junk
    const normalized = String(iso).trim().replace(' ', 'T');
    const d = new Date(normalized);
    if (isNaN(d.getTime())) return 'Bilinmiyor';
    return new Intl.DateTimeFormat('tr-TR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(d);
  } catch {
    return 'Bilinmiyor';
  }
};

/**
 * Üstad'ın kişiselleştirilmiş yorumu — birincil mood'a göre.
 * Yalnızca defterde gerçek film kaydı varsa gösterilir.
 */
const USTAD_MOOD_REVIEWS = {
  battaniye:    'Sakin ve derinlikli hikayelere daha çok yaklaşıyorsun.',
  gece:         'Gecenin sessizliğinde parlayan, karanlık anlatılara çekiliyorsun.',
  gozyasi:      'Duygusal ve insani hikayelere kalbini açıyorsun.',
  askbahcesi:   'Romantikte sıcak, kırılgan ve gerçekçi hikayelere daha çok yaklaşıyorsun.',
  kahkaha:      'Hayatı hafifletmeyi seven, neşeli bir ruhun var.',
  adrenalin:    'Daha güncel ve modern tempolu filmlere yakın duruyorsun.',
  yolculuk:     'Sınırları zorlayan, ufuk açan yolculuklara düşkünsün.',
  zamanyolcusu: 'Geçmişle gelecek arasındaki köprülere ilgi duyuyorsun.',
  sessiz:       'Minimal ve sessiz anlatıların gücüne inanıyorsun.',
  zihin:        'Zihnin labirentlerinde dolaşmayı seviyorsun.',
  kalp:         'Festival sinemasının bağımsız ruhuna yakınsın.',
  karmakar:     'Türleri karıştıran cesur hikayelere açıksın.',
  sipsak:       'Kısa ve kompakt başyapıtlara ilgi duyuyorsun — zamanı verimli kullanan bir sinemaseversin.',
  'deep-chills':'Seni ürperten, derinden sarsan yapıtlara yöneliyorsun.',
};
const getUstadReview = (moodId) => USTAD_MOOD_REVIEWS[moodId] || '';

function StatCard({ icon: Icon, label, value, accent }) {
  return (
    <div className="flex-1 min-w-[140px] p-6 rounded-2xl bg-[#1c1512]/90 backdrop-blur-md border border-white/10">
      <Icon size={20} style={{ color: accent }} className="mb-3" />
      <p className="font-sans text-3xl font-bold text-ivory tracking-tight">{value}</p>
      <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-ivory/40 mt-1">{label}</p>
    </div>
  );
}

export default function Profil() {
  const navigate = useNavigate();
  const { user, logout, login } = useAuth();

  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const handleCredential = useCallback(async (cred) => {
    if (!cred) return;
    setAuthBusy(true);
    setAuthError('');
    const r = await login(cred);
    setAuthBusy(false);
    if (!r?.ok) setAuthError(r?.error || 'Giriş başarısız oldu.');
  }, [login]);
  const [savedCount, setSavedCount] = useState(0);
  const [watchedCount, setWatchedCount] = useState(0);
  const [topMoods, setTopMoods] = useState([]);
  const [moodPct, setMoodPct] = useState({});
  const [dynamicTitle, setDynamicTitle] = useState('');
  const [ustadReview, setUstadReview] = useState('');
  const [totalSignals, setTotalSignals] = useState(0);
  const [tasteStatus, setTasteStatus] = useState('empty'); // 'empty' | 'forming' | 'mature'
  const [summaryTexts, setSummaryTexts] = useState([]);
  const [loading, setLoading] = useState(true);

  // ─── Sosyal durum ────────────────────────────────────
  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState([]);
  const [socialLoading, setSocialLoading] = useState(true);
  const [addUsername, setAddUsername] = useState('');
  const [addMsg, setAddMsg] = useState(null);
  const [addBusy, setAddBusy] = useState(false);
  const [friendSearch, setFriendSearch] = useState('');

  // ─── Film önerileri (bildirimler) ─────────────────────
  const [shares, setShares] = useState([]);
  const [sharesLoading, setSharesLoading] = useState(true);
  const [detailMovie, setDetailMovie] = useState(null);
  const pollRef = useRef(null);

  // Sosyal veri çekme — mount'ta bir kez
  useEffect(() => {
    if (!user) { setSocialLoading(false); setSharesLoading(false); return; }
    let alive = true;
    (async () => {
      try {
        const [fr, rq, sh] = await Promise.all([
          getFriends().catch(() => ({ friends: [] })),
          getFriendRequests().catch(() => ({ requests: [] })),
          getShares().catch(() => ({ shares: [] })),
        ]);
        if (alive) {
          setFriends(fr.friends || []);
          setRequests(rq.requests || []);
          setShares(sh.shares || []);
          // İlk yüklemede shares okundu işaretle
          if ((sh.shares || []).length > 0) {
            markSharesRead().catch(() => {});
          }
        }
      } finally {
        if (alive) { setSocialLoading(false); setSharesLoading(false); }
      }
    })();
    return () => { alive = false; };
  }, [user]);

  // ─── 120sn Polling — sadece sayfa aktifken (Page Focus) ─────
  useEffect(() => {
    if (!user) return;

    const poll = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const [rq, sh] = await Promise.all([
          getFriendRequests().catch(() => ({ requests: [] })),
          getShares().catch(() => ({ shares: [] })),
        ]);
        setRequests(rq.requests || []);
        if ((sh.shares || []).length > 0) {
          setShares(sh.shares || []);
          markSharesRead().catch(() => {});
        }
      } catch { /* sessiz */ }
    };

    pollRef.current = setInterval(poll, 120000);
    return () => { clearInterval(pollRef.current); };
  }, [user]);

  const handleRespondRequest = useCallback(async (requestId, action) => {
    try {
      await respondFriendRequest(requestId, action);
      setRequests((prev) => prev.filter((r) => r.request_id !== requestId));
      if (action === 'ACCEPT') {
        // Arkadaş listesini tazele
        const data = await getFriends().catch(() => ({ friends: [] }));
        setFriends(data.friends || []);
      }
    } catch { /* sessiz */ }
  }, []);

  const handleRemoveFriend = useCallback(async (friendId) => {
    try {
      await removeFriend(friendId);
      setFriends((prev) => prev.filter((f) => f.id !== friendId));
    } catch { /* sessiz */ }
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
      }
      setAddUsername('');
    } catch (err) {
      setAddMsg({ ok: false, text: err.message || 'Gönderilemedi' });
    } finally {
      setAddBusy(false);
    }
  }, [addUsername, addBusy]);

  const filteredFriends = friendSearch.trim()
    ? friends.filter((f) =>
        (f.name || '').toLowerCase().includes(friendSearch.toLowerCase()) ||
        (f.username || '').toLowerCase().includes(friendSearch.toLowerCase())
      )
    : friends;

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const [wl, tm] = await Promise.all([
          getWatchlist().catch(() => ({ movies: [] })),
          getTasteMap().catch(() => null),
        ]);
        const movies = wl.movies || [];
        setSavedCount(movies.length);
        setWatchedCount(movies.filter((m) => m.watched).length);

        // Taste Matrix Progression Engine — 3-state system
        const signals = tm?.signals?.total_movies || 0;
        setTotalSignals(signals);

        if (signals === 0) {
          // State A: Empty — no defter interactions at all
          setTasteStatus('empty');
          setTopMoods([]);
          setMoodPct({});
          setDynamicTitle('');
          setUstadReview('');
          setSummaryTexts([]);
        } else if (signals <= 5) {
          // State B: Forming (Oluşuyor) — early interactions, show badge + counter
          setTasteStatus('forming');
          setDynamicTitle(tm?.dynamic_title || 'Sinema Ruhu');
          if (tm?.top_moods?.length > 0) {
            setTopMoods(tm.top_moods.slice(0, 3));
            setMoodPct(tm?.mood_pct || {});
            const primaryMood = tm.top_moods[0]?.mood_id;
            setUstadReview(getUstadReview(primaryMood));
          } else {
            setTopMoods([]);
            setMoodPct({});
            setUstadReview('');
          }
          // Use backend summary array for contextual Üstad notes
          setSummaryTexts(Array.isArray(tm?.summary) ? tm.summary : []);
        } else {
          // State C: Mature (Olgun) — full analytical matrix, no badge
          setTasteStatus('mature');
          setDynamicTitle(tm?.dynamic_title || 'Sinema Ruhu');
          if (tm?.top_moods?.length > 0) {
            setTopMoods(tm.top_moods.slice(0, 5));
            setMoodPct(tm?.mood_pct || {});
            const primaryMood = tm.top_moods[0]?.mood_id;
            setUstadReview(getUstadReview(primaryMood));
          } else {
            setTopMoods([]);
            setMoodPct({});
            setUstadReview('');
          }
          setSummaryTexts(Array.isArray(tm?.summary) ? tm.summary : []);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [user, navigate]);

  const displayName = user ? (sanitize(user.name) || sanitize(user.email) || 'Sinemasever') : '';
  const avatar = user?.picture || '';
  const initials = displayName.slice(0, 1).toUpperCase();

  if (!user) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="min-h-screen bg-[#120d0b] text-ivory font-sans relative flex flex-col"
      >
        <header className="sticky top-0 z-50 bg-[#120d0b]/98 border-b border-white/5 pt-safe">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 sm:py-8 flex items-center justify-between">
            <button onClick={() => navigate(-1)}
              className="w-12 h-12 flex items-center justify-center hover:bg-white/5 rounded-full border border-white/10 transition-all">
              <ChevronLeft size={22} />
            </button>
            <p className="font-sans text-[10px] font-bold uppercase tracking-[0.5em] text-amber/40">Profil</p>
            <div className="w-12 h-12" />
          </div>
        </header>

        <div className="flex-1 flex flex-col items-center justify-center px-6 pb-nav">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-sm text-center space-y-8"
          >
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
                  <GoogleSignInButton
                    clientId={GOOGLE_CLIENT_ID}
                    onCredential={handleCredential}
                    width={280}
                  />
                </div>
                {authBusy && (
                  <p className="font-sans text-xs text-amber/70 flex items-center justify-center gap-2">
                    <span className="w-3 h-3 rounded-full border-2 border-amber/30 border-t-amber animate-spin" />
                    Giriş yapılıyor...
                  </p>
                )}
                {authError && (
                  <p className="font-sans text-xs text-rose-400 leading-relaxed max-w-xs mx-auto">
                    {authError}
                  </p>
                )}
              </div>
            ) : (
              <p className="font-sans text-xs text-ivory/20">
                Google girişi henüz yapılandırılmamış.
              </p>
            )}

            <button onClick={() => navigate(-1)}
              className="font-sans text-xs text-ivory/25 hover:text-ivory/50 transition-colors underline underline-offset-4">
              Şimdi değil
            </button>
          </motion.div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen bg-[#120d0b] text-ivory font-sans relative"
    >
      <div className="fixed inset-0 pointer-events-none z-[999] opacity-[0.03] mix-blend-overlay"
           style={{ backgroundImage: "url('https://www.transparenttextures.com/patterns/natural-paper.png')" }} />

      <header className="sticky top-0 z-50 bg-[#120d0b]/98 border-b border-white/5 pt-safe">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 sm:py-8 flex items-center justify-between">
          <button onClick={() => navigate('/defterim')}
            className="w-12 h-12 flex items-center justify-center hover:bg-white/5 rounded-full border border-white/10 transition-all">
            <ChevronLeft size={22} />
          </button>
          <p className="font-sans text-[10px] font-bold uppercase tracking-[0.5em] text-amber/40">Profil</p>
          <button onClick={() => { logout(); navigate('/'); }}
            title="Çıkış Yap"
            className="w-12 h-12 flex items-center justify-center hover:bg-white/5 rounded-full border border-white/10 text-ivory/40 hover:text-red-400 hover:border-red-500/30 transition-all">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-16 space-y-10 pb-nav">
        {/* Kimlik kartı */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="p-8 sm:p-12 rounded-[2.5rem] bg-[#1c1512]/90 backdrop-blur-md border border-white/10 flex flex-col sm:flex-row items-center gap-8"
        >
          <div className="w-28 h-28 rounded-full overflow-hidden border-2 border-amber/30 shrink-0 bg-amber/10 flex items-center justify-center">
            {avatar
              ? <img src={avatar} alt={displayName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              : <span className="font-serif text-5xl font-bold text-amber">{initials}</span>}
          </div>
          <div className="text-center sm:text-left min-w-0">
            <h1 className="font-serif text-4xl sm:text-5xl font-bold tracking-tight text-ivory break-words">
              {displayName}
            </h1>
            {user.username && (
              <p className="flex items-center justify-center sm:justify-start gap-1.5 mt-1.5 font-mono text-sm text-[#d4af37]/70">
                <AtSign size={13} />{sanitize(user.username)}
              </p>
            )}
            <div className="mt-3 space-y-1.5 font-sans text-sm text-ivory/50">
              {user.email && (
                <p className="flex items-center justify-center sm:justify-start gap-2">
                  <Mail size={14} className="text-amber/40" /> {sanitize(user.email)}
                </p>
              )}
              <p className="flex items-center justify-center sm:justify-start gap-2">
                <CalendarDays size={14} className="text-amber/40" /> {formatDate(user.created_at)} tarihinde katıldı
              </p>
            </div>
          </div>
        </motion.div>

        {/* İzleme istatistikleri */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
          className="space-y-5"
        >
          <h2 className="font-serif text-2xl font-bold tracking-tight text-ivory/80 flex items-center gap-3">
            <Clapperboard size={20} className="text-amber" /> İzleme İstatistiklerin
          </h2>
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="sinemood-spinner" />
            </div>
          ) : (
            <>
              {/* Stat cards row */}
              <div className="flex flex-wrap gap-4">
                <StatCard icon={Bookmark} label="Deftere Kayıtlı" value={savedCount} accent="#fbbf24" />
                <StatCard icon={Eye} label="İzlenen Film" value={watchedCount} accent="#34d399" />

                {/* Favori Mod: show only when taste data exists */}
                {tasteStatus !== 'empty' && topMoods.length > 0 ? (
                  <StatCard icon={Film} label="Favori Mod" value={topMoods[0]?.title || '—'} accent="#a78bfa" />
                ) : (
                  <div className="flex-1 min-w-[140px] p-6 rounded-2xl bg-[#1c1512]/90 backdrop-blur-md border border-white/10 flex flex-col items-center justify-center text-center">
                    <Clapperboard size={22} className="text-amber/30 mb-3" />
                    <p className="font-serif text-sm italic leading-relaxed text-ivory/35">
                      Henüz defterine film eklememişsin evlat. İlk keşfini yap, zevk haritanı buraya nakşedeyim.
                    </p>
                  </div>
                )}
              </div>

              {/* ═══ Taste Matrix Progression ═══ */}

              {/* State A: Empty — no signals at all */}
              {tasteStatus === 'empty' && (
                <div className="p-6 rounded-2xl bg-[#1c1512]/90 backdrop-blur-md border border-white/10 text-center">
                  <Clapperboard size={28} className="text-amber/20 mx-auto mb-4" />
                  <p className="font-serif text-base italic leading-relaxed text-ivory/40">
                    Zevk haritanı çizmeye henüz başlayamadım evlat.<br />
                    Defterine birkaç film ekle, senin sinema ruhunu keşfedeyim.
                  </p>
                </div>
              )}

              {/* State B: Forming (Oluşuyor) — 1-5 signals */}
              {tasteStatus === 'forming' && (
                <div className="p-6 rounded-2xl bg-[#1c1512]/90 backdrop-blur-md border border-white/10 space-y-5">
                  {/* Status badge + signal counter */}
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-amber/15 border border-amber/25 font-sans text-xs font-bold uppercase tracking-[0.15em] text-amber">
                        <Activity size={12} /> Oluşuyor
                      </span>
                    </div>
                    <p className="font-sans text-xs font-semibold text-ivory/35 tracking-wide">
                      {totalSignals} film sinyali
                    </p>
                  </div>

                  {/* Dynamic Title */}
                  {dynamicTitle && (
                    <p className="font-serif text-lg font-bold tracking-tight text-amber/80">
                      {sanitize(dynamicTitle)}
                    </p>
                  )}

                  {/* Mood points if available */}
                  {topMoods.length > 0 && (
                    <>
                      <p className="font-sans text-[11px] font-bold uppercase tracking-[0.18em] text-ivory/40">
                        En Çok Tercih Ettiğin Modlar
                      </p>
                      <div className="flex flex-wrap gap-3">
                        {topMoods.map((m) => (
                          <span key={m.mood_id}
                            className="flex items-center gap-2 px-4 py-2 rounded-full bg-amber/10 border border-amber/20 font-sans text-xs font-semibold text-amber">
                            <Film size={12} /> {sanitize(m.title)}
                            <span className="text-amber/50">{Math.round(m.score)}p</span>
                          </span>
                        ))}
                      </div>
                    </>
                  )}

                  {/* Mood bars if available */}
                  {Object.keys(moodPct).length > 0 && (
                    <div className="space-y-2">
                      <p className="font-sans text-[11px] font-bold uppercase tracking-[0.18em] text-ivory/40">
                        Ruh Hali Dağılımı
                      </p>
                      {Object.entries(moodPct).slice(0, 5).map(([mid, pct]) => (
                        <div key={mid} className="flex items-center gap-3">
                          <span className="font-sans text-[11px] font-semibold text-ivory/50 w-24 truncate uppercase tracking-wide">
                            {mid.replace('-', ' ')}
                          </span>
                          <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300"
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                          <span className="font-sans text-[10px] font-bold text-amber/60 w-8 text-right">
                            %{Math.round(pct)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Üstad notes from backend summary OR fallback to mood-based review */}
                  {(summaryTexts.length > 0 || ustadReview) && (
                    <div className="border-t border-white/5 pt-4 space-y-2">
                      {summaryTexts.length > 0 ? (
                        summaryTexts.map((text, i) => (
                          <p key={i} className="font-serif text-sm italic leading-relaxed text-ivory/50">
                            "{sanitize(text)}"
                          </p>
                        ))
                      ) : ustadReview ? (
                        <p className="font-serif text-sm italic leading-relaxed text-ivory/50">
                          "{ustadReview}"
                        </p>
                      ) : null}
                    </div>
                  )}

                  {/* Progression hint */}
                  <p className="font-sans text-[10px] text-ivory/20 text-center pt-1">
                    Birkaç film daha ekle — zevk haritanın tam analizi açılsın.
                  </p>
                </div>
              )}

              {/* State C: Mature (Olgun) — >=5 signals, full analysis */}
              {tasteStatus === 'mature' && (
                <div className="p-6 rounded-2xl bg-[#1c1512]/90 backdrop-blur-md border border-white/10 space-y-5">
                  {/* Status badge + signal counter */}
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-emerald/15 border border-emerald/25 font-sans text-xs font-bold uppercase tracking-[0.15em] text-emerald">
                        <Activity size={12} /> Oluştu ✨
                      </span>
                    </div>
                    <p className="font-sans text-xs font-semibold text-ivory/35 tracking-wide">
                      {totalSignals} film sinyali
                    </p>
                  </div>

                  {/* Dynamic Title */}
                  {dynamicTitle && (
                    <p className="font-serif text-xl font-bold tracking-tight text-amber/90">
                      {sanitize(dynamicTitle)}
                    </p>
                  )}

                  {/* Mood bars with percentages */}
                  {Object.keys(moodPct).length > 0 && (
                    <div className="space-y-2.5">
                      <p className="font-sans text-[11px] font-bold uppercase tracking-[0.18em] text-ivory/40">
                        Ruh Hali Dağılımı
                      </p>
                      {Object.entries(moodPct).slice(0, 8).map(([mid, pct]) => {
                        const moodObj = topMoods.find(m => m.mood_id === mid);
                        const label = moodObj?.title || mid.replace('-', ' ');
                        return (
                          <div key={mid} className="flex items-center gap-3">
                            <span className="font-sans text-[11px] font-semibold text-ivory/50 w-28 truncate uppercase tracking-wide">
                              {label}
                            </span>
                            <div className="flex-1 h-3 rounded-full bg-white/5 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-amber-600 via-amber-500 to-amber-300 shadow-[0_0_8px_rgba(212,175,55,0.3)]"
                                style={{ width: `${Math.min(pct, 100)}%` }}
                              />
                            </div>
                            <span className="font-sans text-[11px] font-bold text-amber/60 w-10 text-right">
                              %{Math.round(pct)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Üstad's Özeti */}
                  {(summaryTexts.length > 0 || ustadReview) && (
                    <div className="border-t border-amber/10 pt-4 space-y-2">
                      <p className="font-sans text-[10px] font-bold uppercase tracking-[0.3em] text-amber/40">
                        Üstad'ın Özeti
                      </p>
                      {summaryTexts.length > 0 ? (
                        summaryTexts.map((text, i) => (
                          <p key={i} className="font-serif text-sm italic leading-relaxed text-ivory/60">
                            "{sanitize(text)}"
                          </p>
                        ))
                      ) : ustadReview ? (
                        <p className="font-serif text-sm italic leading-relaxed text-ivory/60">
                          "{ustadReview}"
                        </p>
                      ) : null}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </motion.div>

        {/* ═══ Sosyal Panel ═══ */}

        {/* Bildirimler boş durum */}
        {!socialLoading && !sharesLoading && requests.length === 0 && shares.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="p-8 rounded-2xl bg-[#1c1512]/90 backdrop-blur-md border border-white/10 text-center"
          >
            <span className="text-3xl opacity-30 block mb-3">🕊️</span>
            <p className="font-serif text-sm italic text-ivory/40 leading-relaxed">
              Henüz yeni bir bildirim yok.<br />
              Arkadaşlarından gelen istekler ve film önerileri burada görünecek.
            </p>
          </motion.div>
        )}

        {/* Gelen Arkadaşlık İstekleri */}
        <AnimatePresence>
          {requests.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.24, ease: [0.16, 1, 0.3, 1] }}
              className="space-y-4"
            >
              <h2 className="font-serif text-2xl font-bold tracking-tight text-ivory/80 flex items-center gap-3">
                <UserPlus size={20} className="text-[#d4af37]" /> Gelen İstekler
                <span className="ml-auto inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-full bg-[#d4af37]/20 text-[#d4af37] text-xs font-bold">
                  {requests.length}
                </span>
              </h2>
              <div className="space-y-2">
                {requests.map((r) => (
                  <motion.div
                    key={r.request_id}
                    layout
                    exit={{ opacity: 0, x: -40 }}
                    transition={{ duration: 0.3 }}
                    className="flex items-center gap-3 p-3 sm:p-4 rounded-2xl bg-[#1c1512]/90 backdrop-blur-md border border-white/10"
                  >
                    <div className="w-10 h-10 rounded-full overflow-hidden bg-amber/10 shrink-0 flex items-center justify-center">
                      {r.avatar ? (
                        <img src={r.avatar} alt={r.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <span className="font-bold text-amber/60">
                          {(r.name || r.username || '?')[0].toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-[#f5f2eb] truncate">{r.name || r.username}</p>
                      <p className="text-[11px] text-white/40 truncate">@{r.username}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleRespondRequest(r.request_id, 'ACCEPT')}
                        className="w-9 h-9 rounded-full bg-emerald-500/15 border border-emerald-500/30
                                   flex items-center justify-center hover:bg-emerald-500/25 transition-all"
                        title="Onayla"
                      >
                        <Check size={16} className="text-emerald-400" />
                      </button>
                      <button
                        onClick={() => handleRespondRequest(r.request_id, 'DECLINE')}
                        className="w-9 h-9 rounded-full bg-rose-500/15 border border-rose-500/30
                                   flex items-center justify-center hover:bg-rose-500/25 transition-all"
                        title="Reddet"
                      >
                        <X size={16} className="text-rose-400" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Gelen Film Önerileri */}
        <AnimatePresence>
          {shares.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.27, ease: [0.16, 1, 0.3, 1] }}
              className="space-y-4"
            >
              <h2 className="font-serif text-2xl font-bold tracking-tight text-ivory/80 flex items-center gap-3">
                <Bell size={20} className="text-[#d4af37]" /> Gelen Öneriler
                <span className="ml-auto inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-full bg-[#d4af37]/20 text-[#d4af37] text-xs font-bold">
                  {shares.length}
                </span>
              </h2>
              <div className="space-y-2">
                {shares.map((s) => (
                  <motion.div
                    key={s.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex gap-3 p-3 sm:p-4 rounded-2xl bg-[#1c1512]/90 backdrop-blur-md border border-white/10"
                  >
                    {/* Sol: Film afişi */}
                    <div className="w-14 sm:w-16 shrink-0 aspect-[2/3] rounded-xl overflow-hidden bg-white/5">
                      {s.poster_url ? (
                        <img src={s.poster_url} alt={s.movie_title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-2xl opacity-30">🎬</div>
                      )}
                    </div>
                    {/* Sağ: Gönderen + not + buton */}
                    <div className="flex-1 min-w-0 flex flex-col gap-1">
                      <div className="flex items-center gap-1.5">
                        {s.sender?.avatar && (
                          <img src={s.sender.avatar} alt="" className="w-4 h-4 rounded-full object-cover" referrerPolicy="no-referrer" />
                        )}
                        <span className="text-[11px] text-[#d4af37]/70 font-semibold truncate">
                          {s.sender?.name || s.sender?.username || 'Arkadaş'}
                        </span>
                      </div>
                      <h4 className="text-sm font-serif font-bold text-[#f5f2eb] line-clamp-1">
                        {s.movie_title || `Film #${s.movie_id}`}
                      </h4>
                      {s.vote_average > 0 && (
                        <span className="flex items-center gap-1 text-[10px] text-[#ffbf00] font-bold">
                          <StarIcon size={9} className="fill-[#ffbf00]" /> {s.vote_average.toFixed(1)}
                        </span>
                      )}
                      {s.user_note && (
                        <p className="text-[11px] font-serif italic text-white/50 line-clamp-2">
                          &ldquo;{sanitize(s.user_note)}&rdquo;
                        </p>
                      )}
                      <button
                        onClick={() => {
                          setDetailMovie({
                            id: s.movie_id,
                            title: s.movie_title,
                            poster_url: s.poster_url,
                            vote_average: s.vote_average,
                            release_date: s.release_date,
                          });
                        }}
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
            </motion.div>
          )}
        </AnimatePresence>

        {/* Sinema Arkadaşlarım */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.30, ease: [0.16, 1, 0.3, 1] }}
          className="space-y-5"
        >
          <h2 className="font-serif text-2xl font-bold tracking-tight text-ivory/80 flex items-center gap-3">
            <Users size={20} className="text-[#d4af37]" /> Sinema Arkadaşlarım
          </h2>

          {socialLoading ? (
            <div className="flex items-center justify-center py-10">
              <div className="flex gap-2">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: '#d4af37' }}
                    animate={{ opacity: [0.2, 1, 0.2] }}
                    transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.25 }}
                  />
                ))}
              </div>
            </div>
          ) : friends.length === 0 ? (
            /* Boş durum — arkadaş yok */
            <div className="p-8 rounded-2xl bg-[#1c1512]/90 backdrop-blur-md border border-white/10 text-center space-y-5">
              <div className="w-16 h-16 mx-auto rounded-full bg-amber/10 border border-amber/20 flex items-center justify-center">
                <Users size={26} className="text-amber/40" />
              </div>
              <div className="space-y-2">
                <p className="font-serif text-base italic text-ivory/45 leading-relaxed">
                  Henüz sinema arkadaşın yok.<br />
                  Üstad'ın dünyasına arkadaşlarını davet et!
                </p>
              </div>
              <div className="max-w-xs mx-auto space-y-3">
                <div className="flex gap-2">
                  <input
                    value={addUsername}
                    onChange={(e) => { setAddUsername(e.target.value); setAddMsg(null); }}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddFriend()}
                    placeholder="kullanıcı_adı"
                    className="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 rounded-full
                               text-sm text-[#f5f2eb] placeholder:text-white/25 focus:outline-none focus:border-amber/40 transition-all font-mono"
                  />
                  <button
                    onClick={handleAddFriend}
                    disabled={addBusy}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-[#d4af37] text-[#120d0b] rounded-full text-xs font-bold uppercase tracking-wider
                               hover:bg-amber-400 transition-all disabled:opacity-40"
                  >
                    <UserPlus size={14} /> Ekle
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
            /* Arkadaş listesi */
            <div className="space-y-3">
              {/* Arama + Arkadaş Ekle */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25" />
                  <input
                    value={friendSearch}
                    onChange={(e) => setFriendSearch(e.target.value)}
                    placeholder="Arkadaş Ara..."
                    className="w-full pl-9 pr-3 py-2.5 bg-white/5 border border-white/10 rounded-full
                               text-sm text-[#f5f2eb] placeholder:text-white/25 focus:outline-none focus:border-amber/40 transition-all"
                  />
                </div>
                <div className="flex gap-2">
                  <input
                    value={addUsername}
                    onChange={(e) => { setAddUsername(e.target.value); setAddMsg(null); }}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddFriend()}
                    placeholder="kullanıcı_adı"
                    className="w-28 sm:w-36 px-3 py-2.5 bg-white/5 border border-white/10 rounded-full
                               text-sm text-[#f5f2eb] placeholder:text-white/25 focus:outline-none focus:border-amber/40 transition-all font-mono"
                  />
                  <button
                    onClick={handleAddFriend}
                    disabled={addBusy}
                    className="flex items-center gap-1 px-3 py-2.5 bg-[#d4af37] text-[#120d0b] rounded-full text-xs font-bold
                               hover:bg-amber-400 transition-all disabled:opacity-40 shrink-0"
                    title="Arkadaş Ekle"
                  >
                    <UserPlus size={14} />
                  </button>
                </div>
              </div>
              {addMsg && (
                <p className={`text-xs font-serif px-1 ${addMsg.ok ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {addMsg.text}
                </p>
              )}

              {/* Arkadaş kartları */}
              <AnimatePresence>
                {filteredFriends.length === 0 ? (
                  <p className="text-center text-sm font-serif italic text-white/35 py-6">
                    &ldquo;{friendSearch}&rdquo; ile eşleşen arkadaş yok.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {filteredFriends.map((f) => (
                      <motion.div
                        key={f.id}
                        layout
                        exit={{ opacity: 0, x: -40 }}
                        transition={{ duration: 0.3 }}
                        className="flex items-center gap-3 p-3 sm:p-4 rounded-2xl bg-[#1c1512]/90 backdrop-blur-md border border-white/10 hover:border-white/20 transition-all"
                      >
                        <div className="w-10 h-10 rounded-full overflow-hidden bg-amber/10 shrink-0 flex items-center justify-center">
                          {f.avatar ? (
                            <img src={f.avatar} alt={f.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <span className="font-bold text-amber/60">
                              {(f.name || f.username || '?')[0].toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-[#f5f2eb] truncate">{f.name || f.username}</p>
                          <p className="text-[11px] text-white/40 truncate">@{f.username}</p>
                        </div>
                        <button
                          onClick={() => handleRemoveFriend(f.id)}
                          className="w-8 h-8 rounded-full flex items-center justify-center
                                     text-white/20 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                          title="Arkadaşlığı Kaldır"
                        >
                          <Trash2 size={14} />
                        </button>
                      </motion.div>
                    ))}
                  </div>
                )}
              </AnimatePresence>
            </div>
          )}
        </motion.div>
      </main>

      {/* Film detay modalı — gelen önerilerden açılır */}
      {detailMovie && (
        <FilmDetailModal
          movieId={detailMovie.id}
          initialMovie={detailMovie}
          onClose={() => setDetailMovie(null)}
        />
      )}
    </motion.div>
  );
}
