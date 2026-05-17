/**
 * Profil Sayfası — kullanıcıya özel kimlik + izleme istatistikleri.
 * Mevcut Google OAuth + JWT auth üzerine kuruludur (Supabase/Firebase yok).
 * Tema: koyu mod + buzlu cam (backdrop-blur-md bg-slate-900/80),
 * serif başlıklar + sans-serif veri tipografisi, Framer Motion fade-in.
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronLeft, LogOut, Film, Eye, Sparkles, CalendarDays, Mail, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getWatchlist, getTasteMap } from '../services/api';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

// XSS'e karşı: ekrana basılan kullanıcı kaynaklı metinleri sterilize et
const sanitize = (str) =>
  String(str ?? '').replace(/[<>{}$]/g, '').replace(/javascript:/gi, '').trim();

const formatDate = (iso) => {
  if (!iso) return 'Bilinmiyor';
  const d = new Date(iso.replace(' ', 'T'));
  if (isNaN(d)) return 'Bilinmiyor';
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
};

function StatCard({ icon: Icon, label, value, accent }) {
  return (
    <div className="flex-1 min-w-[140px] p-6 rounded-2xl bg-slate-900/80 backdrop-blur-md border border-white/10">
      <Icon size={20} style={{ color: accent }} className="mb-3" />
      <p className="font-sans text-3xl font-bold text-ivory tracking-tight">{value}</p>
      <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-ivory/40 mt-1">{label}</p>
    </div>
  );
}

export default function Profil() {
  const navigate = useNavigate();
  const { user, logout, login } = useAuth();

  // Google Sign-In callback
  useEffect(() => {
    window.handleGoogleCallback = async (response) => {
      if (response?.credential) await login(response.credential);
    };
    return () => { delete window.handleGoogleCallback; };
  }, [login]);
  const [savedCount, setSavedCount] = useState(0);
  const [watchedCount, setWatchedCount] = useState(0);
  const [topMoods, setTopMoods] = useState([]);
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
        if (tm?.top_moods) setTopMoods(tm.top_moods.slice(0, 3));
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
              <div className="space-y-4">
                <div
                  id="g_id_onload"
                  data-client_id={GOOGLE_CLIENT_ID}
                  data-callback="handleGoogleCallback"
                  data-auto_prompt="false"
                />
                <div
                  className="g_id_signin flex justify-center"
                  data-type="standard"
                  data-theme="filled_black"
                  data-text="signin_with"
                  data-shape="pill"
                  data-locale="tr"
                  data-width="280"
                />
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
          className="p-8 sm:p-12 rounded-[2.5rem] bg-slate-900/80 backdrop-blur-md border border-white/10 flex flex-col sm:flex-row items-center gap-8"
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
            <Sparkles size={20} className="text-amber" /> İzleme İstatistiklerin
          </h2>
          {loading ? (
            <p className="font-sans text-sm text-ivory/30 italic">İstatistikler hesaplanıyor...</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-4">
                <StatCard icon={Film} label="Deftere Kayıtlı" value={savedCount} accent="#fbbf24" />
                <StatCard icon={Eye} label="İzlenen Film" value={watchedCount} accent="#34d399" />
                <StatCard icon={Sparkles} label="Favori Mod" value={topMoods[0]?.title || '—'} accent="#a78bfa" />
              </div>
              {topMoods.length > 0 && (
                <div className="p-6 rounded-2xl bg-slate-900/80 backdrop-blur-md border border-white/10">
                  <p className="font-sans text-[11px] font-bold uppercase tracking-[0.18em] text-ivory/40 mb-4">
                    En Çok Tercih Ettiğin Modlar
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {topMoods.map((m) => (
                      <span key={m.mood_id}
                        className="flex items-center gap-2 px-4 py-2 rounded-full bg-amber/10 border border-amber/20 font-sans text-xs font-semibold text-amber">
                        <User size={12} /> {sanitize(m.title)}
                        <span className="text-amber/50">{m.score}p</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </motion.div>
      </main>
    </motion.div>
  );
}
