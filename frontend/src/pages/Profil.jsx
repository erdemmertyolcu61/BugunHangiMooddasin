/**
 * Profil Sayfası — kullanıcıya özel kimlik + izleme istatistikleri.
 * Mevcut Google OAuth + JWT auth üzerine kuruludur (Supabase/Firebase yok).
 * Tema: koyu mod + buzlu cam (backdrop-blur-md bg-slate-900/80),
 * serif başlıklar + sans-serif veri tipografisi, Framer Motion fade-in.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronLeft, LogOut, Film, Eye, Clapperboard, Bookmark, CalendarDays, Mail, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getWatchlist, getTasteMap } from '../services/api';
import GoogleSignInButton from '../components/GoogleSignInButton';

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
  retro:        'Klasik sinemanın altın çağına özlem duyuyorsun.',
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
  const [ustadReview, setUstadReview] = useState('');
  const [loading, setLoading] = useState(true);

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

        // Only populate taste data if user has REAL defter interactions
        const totalSignals = tm?.signals?.watchlist_count || 0;
        if (totalSignals > 0 && tm?.top_moods?.length > 0) {
          setTopMoods(tm.top_moods.slice(0, 3));

          // Dynamic Üstad review based on primary mood
          const primaryMood = tm.top_moods[0]?.mood_id;
          setUstadReview(getUstadReview(primaryMood));
        } else {
          setTopMoods([]);
          setUstadReview('');
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
              <div className="sinemod-spinner" />
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-4">
                <StatCard icon={Bookmark} label="Deftere Kayıtlı" value={savedCount} accent="#fbbf24" />
                <StatCard icon={Eye} label="İzlenen Film" value={watchedCount} accent="#34d399" />

                {/* Favori Mod: yalnızca gerçek etkileşim varsa göster */}
                {(savedCount > 0 || watchedCount > 0) && topMoods.length > 0 ? (
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

              {/* Zevk Haritası: yalnızca defterde gerçek kayıt varsa göster */}
              {topMoods.length > 0 && (
                <div className="p-6 rounded-2xl bg-[#1c1512]/90 backdrop-blur-md border border-white/10 space-y-4">
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

                  {/* Üstad'ın kişisel yorumu */}
                  {ustadReview && (
                    <p className="font-serif text-sm italic leading-relaxed text-ivory/50 border-t border-white/5 pt-4">
                      "{ustadReview}"
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </motion.div>
      </main>
    </motion.div>
  );
}
