/**
 * TasteMapCollision — "Zevk Çarpışması"
 * İki kullanıcının ruh hâllerini, veto türlerini ve izleme isteklerini
 * birleştirip ortak bir "uzlaşma filmi" bulan premium özellik.
 *
 * Tamamen kendi içinde çalışır (mock veri) — backend gerektirmez.
 * 4 adım: Oda Kurulumu → Tercih Sentezi → Çarpışma Animasyonu → Sonuçlar
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MOODS } from '../context/MoodContext';
import {
  Users, Plus, LogIn, Copy, Check, Swords, Star,
  Ban, RefreshCw, ChevronLeft, Clapperboard, Heart, Quote, Share2, Download,
} from 'lucide-react';
import { shareToWhatsApp, shareToTelegram } from '../utils/shareUtils';
import { useShareableImage } from '../utils/useShareableImage';
import { track, EVENTS } from '../utils/analytics';
import useDocumentMeta from '../utils/useDocumentMeta';
import { CANONICAL_URL } from '../utils/apiConfig';

/* ─── 8 Çekirdek Mood (gerçek MOODS'tan türetilir) ─── */
const CORE_MOOD_IDS = [
  'battaniye', 'adrenalin', 'zamanyolcusu', 'gece',
  'askbahcesi', 'kahkaha', 'zihin', 'kalp',
];
const CORE_MOODS = CORE_MOOD_IDS
  .filter((id) => MOODS[id])
  .map((id) => ({
    id,
    title: MOODS[id].title,
    Icon: MOODS[id].icon,
    accent: MOODS[id].auraColors?.[0] || '#d6a84f',
    glow: MOODS[id].auraColors?.[1] || '#ffbf00',
  }));

/* ─── Veto Türleri ─── */
const VETO_GENRES = [
  'Korku', 'Romantik', 'Komedi', 'Bilim Kurgu', 'Dram',
  'Aksiyon', 'Belgesel', 'Animasyon', 'Müzikal', 'Savaş',
];

/* ─── Mock Film Havuzu ─── */
const MOCK_MOVIES = [
  { title: 'Geçmişin Yankısı', year: 1998, imdb: 8.4, accent: ['#b45309', '#78350f'],
    moods: ['zamanyolcusu', 'kalp', 'gece'], genres: ['Dram'] },
  { title: 'Neon Kovalamaca', year: 2017, imdb: 7.9, accent: ['#be185d', '#4c1d95'],
    moods: ['adrenalin', 'gece'], genres: ['Aksiyon', 'Bilim Kurgu'] },
  { title: 'Sessiz Vadinin Şarkısı', year: 2011, imdb: 8.1, accent: ['#0c4a6e', '#1e3a5f'],
    moods: ['kalp', 'zamanyolcusu', 'battaniye'], genres: ['Dram'] },
  { title: 'Battaniye Altında Bir Kış', year: 2009, imdb: 7.6, accent: ['#92400e', '#fcd34d'],
    moods: ['battaniye', 'askbahcesi'], genres: ['Romantik', 'Komedi'] },
  { title: 'Zaman Hırsızları', year: 2014, imdb: 8.0, accent: ['#7c3aed', '#1e1b4b'],
    moods: ['zihin', 'adrenalin', 'zamanyolcusu'], genres: ['Bilim Kurgu'] },
  { title: 'İki Şehrin Aşkı', year: 2003, imdb: 7.8, accent: ['#e11d48', '#831843'],
    moods: ['askbahcesi', 'kalp'], genres: ['Romantik', 'Dram'] },
  { title: 'Kahkaha Treni', year: 2019, imdb: 7.4, accent: ['#059669', '#065f46'],
    moods: ['kahkaha', 'battaniye'], genres: ['Komedi'] },
  { title: 'Gece Yarısı Arşivi', year: 1986, imdb: 8.6, accent: ['#334155', '#0f172a'],
    moods: ['gece', 'zihin', 'zamanyolcusu'], genres: ['Dram', 'Savaş'] },
  { title: 'Son Tren Berlin\'e', year: 1995, imdb: 8.3, accent: ['#b45309', '#1e3a5f'],
    moods: ['zamanyolcusu', 'adrenalin', 'gece'], genres: ['Savaş', 'Dram'] },
  { title: 'Kalbin Pusulası', year: 2021, imdb: 7.7, accent: ['#db2777', '#9d174d'],
    moods: ['kalp', 'askbahcesi', 'battaniye'], genres: ['Dram', 'Romantik'] },
  { title: 'Adrenalin Sınırı', year: 2016, imdb: 7.5, accent: ['#dc2626', '#7f1d1d'],
    moods: ['adrenalin', 'gece'], genres: ['Aksiyon'] },
  { title: 'Rüyaların Mimarı', year: 2012, imdb: 8.5, accent: ['#6d28d9', '#312e81'],
    moods: ['zihin', 'kalp'], genres: ['Bilim Kurgu', 'Dram'] },
];

const moodTitle = (id) => CORE_MOODS.find((m) => m.id === id)?.title || id;

/* ─── Üstadın Hakem Notu üreteci ─── */
function buildVerdict(u1MoodId, u2MoodId, movie) {
  const a = moodTitle(u1MoodId);
  const b = moodTitle(u2MoodId);
  if (u1MoodId === u2MoodId) {
    return `Evlatlar, ikiniz de aynı telden çalıyorsunuz, "${a}" ruhuyla gelmişsiniz. ` +
      `Bu durumda iş kolay: "${movie.title}" tam da o ortak frekansın filmi. ` +
      `Işıkları kısın, Üstadınız bu seçimden gönül rahatlığıyla emin.`;
  }
  return `Evlatlar, biriniz "${a}" arıyor, diğeriniz "${b}" peşinde. ` +
    `Üstadınız ikinizin de gönlünü kırmadan ortasını buldu: ` +
    `"${movie.title}" hem o ${a.toLowerCase()} tadını taşıyor hem de ${b.toLowerCase()} dokusunu. ` +
    `İki ruhu aynı koltukta buluşturacak nadir yapımlardan.`;
}

/* ─── Çarpışma motoru: iki tercihten 3 kesişim filmi ─── */
function collide(u1MoodId, u2MoodId, vetoSet) {
  const scored = MOCK_MOVIES
    .filter((m) => !m.genres.some((g) => vetoSet.has(g)))
    .map((m) => {
      let score = 0;
      if (m.moods.includes(u1MoodId)) score += 3;
      if (m.moods.includes(u2MoodId)) score += 3;
      // Her iki ruhu da taşıyan film = kusursuz uzlaşma
      if (m.moods.includes(u1MoodId) && m.moods.includes(u2MoodId)) score += 4;
      score += m.imdb / 2;
      return { ...m, _score: score };
    })
    .sort((x, y) => y._score - x._score);

  const top = scored.slice(0, 3);
  // Hiç eşleşme yoksa en yüksek IMDb'li 3 film (asla boş dönme)
  const pool = top.length ? top : [...MOCK_MOVIES]
    .filter((m) => !m.genres.some((g) => vetoSet.has(g)))
    .sort((x, y) => y.imdb - x.imdb)
    .slice(0, 3);

  return pool.map((m) => ({ ...m, verdict: buildVerdict(u1MoodId, u2MoodId, m) }));
}

/* ─── Sinema Uyum Yüzdesi (iki ruh hâli arasındaki kesişim) ─── */
function matchPercent(u1MoodId, u2MoodId, vetoSet) {
  if (!u1MoodId || !u2MoodId) return 0;
  if (u1MoodId === u2MoodId) return 97;
  const pool = MOCK_MOVIES.filter((m) => !m.genres.some((g) => vetoSet.has(g)));
  const both = pool.filter((m) => m.moods.includes(u1MoodId) && m.moods.includes(u2MoodId)).length;
  const either = pool.filter((m) => m.moods.includes(u1MoodId) || m.moods.includes(u2MoodId)).length || 1;
  const base = 52 + Math.round((both / either) * 44);
  return Math.max(48, Math.min(96, base));
}

/* ─── Gradient Poster (mock — dış kaynak yok) ─── */
function PosterArt({ movie }) {
  const [c1, c2] = movie.accent;
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center"
      style={{ background: `linear-gradient(150deg, ${c1} 0%, ${c2} 70%, #0a0807 100%)` }}
    >
      <Clapperboard size={28} className="text-white/30 mb-3" />
      <p className="font-serif text-lg font-bold text-white/90 leading-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)]">
        {movie.title}
      </p>
      <p className="mt-1 text-[11px] font-sans uppercase tracking-[0.3em] text-white/45">
        {movie.year}
      </p>
    </div>
  );
}

/* ─── Hareketli İkili Aura ─── */
function CollisionAura({ merged }) {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden bg-bg">
      {/* User 1 glow */}
      <motion.div
        className="absolute rounded-full blur-[140px]"
        style={{ width: 460, height: 460, background: '#7c3aed' }}
        animate={merged
          ? { left: '50%', top: '45%', x: '-50%', y: '-50%', scale: 1.25, opacity: 0.5 }
          : { left: ['8%', '22%', '8%'], top: ['18%', '34%', '18%'], opacity: 0.32 }}
        transition={merged
          ? { duration: 1.4, ease: [0.16, 1, 0.3, 1] }
          : { duration: 14, repeat: Infinity, ease: 'easeInOut' }}
      />
      {/* User 2 glow */}
      <motion.div
        className="absolute rounded-full blur-[140px]"
        style={{ width: 460, height: 460, background: '#e11d48' }}
        animate={merged
          ? { right: '50%', bottom: '55%', x: '50%', y: '50%', scale: 1.25, opacity: 0.5 }
          : { right: ['8%', '20%', '8%'], bottom: ['16%', '30%', '16%'], opacity: 0.3 }}
        transition={merged
          ? { duration: 1.4, ease: [0.16, 1, 0.3, 1] }
          : { duration: 16, repeat: Infinity, ease: 'easeInOut' }}
      />
      {/* Birleşim parıltısı */}
      <AnimatePresence>
        {merged && (
          <motion.div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full blur-[120px]"
            style={{ width: 520, height: 520, background: '#ffbf00' }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 0.45 }}
            transition={{ duration: 1.6, delay: 0.3 }}
          />
        )}
      </AnimatePresence>
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, transparent 30%, rgba(10,8,7,0.85) 140%)' }} />
    </div>
  );
}

const genCode = () => {
  const L = 'ABCDEFGHJKLMNPRSTUVYZ';
  const a = L[Math.floor(Math.random() * L.length)];
  const n = Math.floor(1000 + Math.random() * 8999);
  return `USTAD-${a}${n}`;
};

export default function TasteMapCollision() {
  const navigate = useNavigate();
  useDocumentMeta({
    title: 'Zevk Çarpıştır | İki Kişiye Tek Film | Sinemood',
    description: 'Sevgilinle ya da dostunla film konusunda anlaşamıyor musun? Zevklerinizi çarpıştırın, Üstad ortak başyapıtı bulsun.',
  });
  const [step, setStep] = useState('setup');       // setup | prefs | colliding | results
  const [mode, setMode] = useState('create');      // create | join
  const [roomCode, setRoomCode] = useState('');
  const [joinInput, setJoinInput] = useState('');
  const [copied, setCopied] = useState(false);

  const [u1Mood, setU1Mood] = useState(null);
  const [u2Mood, setU2Mood] = useState(null);
  const [veto, setVeto] = useState(new Set());
  const [results, setResults] = useState([]);
  const [match, setMatch] = useState(0);
  const cardRef = useRef(null);

  const merged = step === 'colliding' || step === 'results';

  // ?oda=KOD ile gelindiyse otomatik "katıl" moduna geç ve kodu doldur
  useEffect(() => {
    try {
      const oda = new URLSearchParams(window.location.search).get('oda');
      if (oda && /^[A-Z0-9-]{4,16}$/i.test(oda)) {
        setMode('join');
        setJoinInput(oda.toUpperCase());
      }
    } catch { /* sessiz */ }
  }, []);

  // Davet linki — oluşturulan ya da girilen oda kodu üzerinden
  const activeCode = (mode === 'create' ? roomCode : joinInput).trim().toUpperCase();
  const inviteUrl = activeCode
    ? `${CANONICAL_URL}/carpistir?oda=${encodeURIComponent(activeCode)}`
    : `${CANONICAL_URL}/carpistir`;

  /* Oda oluştur */
  const createRoom = () => {
    setRoomCode(genCode());
    setMode('create');
  };

  const copyCode = useCallback(() => {
    try { navigator.clipboard.writeText(roomCode); } catch {}
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }, [roomCode]);

  const enterPrefs = () => setStep('prefs');

  const toggleVeto = (g) =>
    setVeto((prev) => {
      const n = new Set(prev);
      n.has(g) ? n.delete(g) : n.add(g);
      return n;
    });

  const canCollide = u1Mood && u2Mood;

  /* Çarpıştır */
  const startCollision = () => {
    if (!canCollide) return;
    setStep('colliding');
  };

  // Çarpışma animasyonu bitince sonuçları hesapla
  useEffect(() => {
    if (step !== 'colliding') return;
    const t = setTimeout(() => {
      setResults(collide(u1Mood, u2Mood, veto));
      setMatch(matchPercent(u1Mood, u2Mood, veto));
      setStep('results');
      track(EVENTS.SURPRISE_VIEW, { kind: 'collision' });
    }, 3000);
    return () => clearTimeout(t);
  }, [step, u1Mood, u2Mood, veto]);

  const reset = () => {
    setStep('setup'); setRoomCode(''); setJoinInput('');
    setU1Mood(null); setU2Mood(null); setVeto(new Set()); setResults([]); setMatch(0);
  };

  const shareText = `Sinema uyumumuz %${match}! "${moodTitle(u1Mood)}" ✕ "${moodTitle(u2Mood)}" çarpıştı. Sen de zevkini çarpıştır 👉`;

  const { share, download: handleDownload, sharing } = useShareableImage(cardRef, {
    fileName: 'sinemood-carpisma.png',
    shareText: `${shareText} ${inviteUrl}`.trim(),
    backgroundColor: '#0a0807',
    deps: [match, activeCode],
  });
  const handleShareImage = () => {
    track(EVENTS.SHARE_CLICK, { network: 'image', kind: 'collision' });
    return share();
  };

  const collidingPhrases = useMemo(() => [
    'Üstad iki ruhu tartıyor...',
    'Zevkler çarpışıyor...',
    'Ortak frekans aranıyor...',
    'Tozlu raflar taranıyor...',
  ], []);
  const [phraseIdx, setPhraseIdx] = useState(0);
  useEffect(() => {
    if (step !== 'colliding') return;
    setPhraseIdx(0);
    const i = setInterval(() => setPhraseIdx((p) => (p + 1) % collidingPhrases.length), 800);
    return () => clearInterval(i);
  }, [step, collidingPhrases.length]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="min-h-screen text-ivory font-sans relative">
      <CollisionAura merged={merged} />

      {/* Üst bar */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-[#120d0b]/70 border-b border-white/5 pt-safe">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <button
            onClick={() => (step === 'setup' ? navigate('/') : reset())}
            className="flex items-center gap-2 text-ivory/55 hover:text-ivory transition-colors group"
          >
            <ChevronLeft size={18} className="group-hover:-translate-x-0.5 transition-transform" />
            <span className="text-[11px] font-bold uppercase tracking-widest">
              {step === 'setup' ? 'Ana Sayfa' : 'Baştan Başla'}
            </span>
          </button>
          <div className="flex items-center gap-2 text-amber">
            <Swords size={16} />
            <span className="text-[11px] font-bold uppercase tracking-[0.3em]">Zevk Çarpışması</span>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-16 pb-nav">
        <AnimatePresence mode="wait">

          {/* ═══ ADIM 1 — ODA KURULUMU ═══ */}
          {step === 'setup' && (
            <motion.section
              key="setup"
              initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
              className="max-w-2xl mx-auto text-center"
            >
              <div className="w-16 h-16 mx-auto mb-7 rounded-3xl bg-amber/12 border border-amber/25 flex items-center justify-center">
                <Users size={28} className="text-amber" />
              </div>
              <h1 className="text-4xl sm:text-6xl font-serif font-bold tracking-tight leading-[1.05] mb-5">
                İki Ruh, <span className="italic text-amber">Tek Film</span>
              </h1>
              <p className="text-ivory/55 font-serif italic text-lg sm:text-xl leading-relaxed mb-12 max-w-lg mx-auto">
                Sevgilinle, dostunla ya da kardeşinle anlaşamıyor musun? Üstad
                ikinizin zevkini çarpıştırıp ortak başyapıtı bulsun.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center mb-10">
                <button
                  onClick={createRoom}
                  className={`flex items-center justify-center gap-3 px-8 py-5 rounded-2xl text-[11px] font-bold uppercase tracking-[0.25em] transition-all ${
                    mode === 'create'
                      ? 'bg-amber text-bg shadow-[0_20px_50px_-12px_rgba(255,191,0,0.4)]'
                      : 'bg-white/5 border border-white/10 text-ivory/70 hover:bg-white/10'
                  }`}
                >
                  <Plus size={16} /> Oda Oluştur
                </button>
                <button
                  onClick={() => { setMode('join'); setRoomCode(''); }}
                  className={`flex items-center justify-center gap-3 px-8 py-5 rounded-2xl text-[11px] font-bold uppercase tracking-[0.25em] transition-all ${
                    mode === 'join'
                      ? 'bg-amber text-bg shadow-[0_20px_50px_-12px_rgba(255,191,0,0.4)]'
                      : 'bg-white/5 border border-white/10 text-ivory/70 hover:bg-white/10'
                  }`}
                >
                  <LogIn size={16} /> Odaya Katıl
                </button>
              </div>

              {/* Oda oluştur — kod kartı */}
              <AnimatePresence mode="wait">
                {mode === 'create' && roomCode && (
                  <motion.div
                    key="code"
                    initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                    className="p-7 rounded-3xl bg-white/[0.04] border border-amber/20 backdrop-blur-md max-w-sm mx-auto"
                  >
                    <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-amber/60 mb-3">Oda Kodun</p>
                    <div className="flex items-center justify-center gap-3">
                      <span className="font-serif text-3xl sm:text-4xl font-bold tracking-wider text-ivory">{roomCode}</span>
                      <button
                        onClick={copyCode}
                        title="Kodu kopyala"
                        className="w-10 h-10 rounded-full bg-amber/10 border border-amber/30 flex items-center justify-center text-amber hover:bg-amber/20 transition-all active:scale-90"
                      >
                        {copied ? <Check size={16} /> : <Copy size={16} />}
                      </button>
                    </div>
                    <p className="text-ivory/40 text-xs font-sans mt-4 leading-relaxed">
                      Bu kodu eşine gönder. İkiniz hazır olunca devam edin.
                    </p>
                    <button
                      onClick={enterPrefs}
                      className="mt-6 w-full py-4 rounded-full bg-amber text-bg text-[11px] font-bold uppercase tracking-[0.25em] hover:scale-[1.02] transition-all"
                    >
                      Eşleştik, Devam
                    </button>
                  </motion.div>
                )}

                {mode === 'join' && (
                  <motion.div
                    key="join"
                    initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                    className="p-7 rounded-3xl bg-white/[0.04] border border-white/10 backdrop-blur-md max-w-sm mx-auto"
                  >
                    <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-ivory/40 mb-4">Oda Kodunu Gir</p>
                    <input
                      value={joinInput}
                      onChange={(e) => setJoinInput(e.target.value.toUpperCase())}
                      placeholder="USTAD-X982"
                      className="w-full bg-black/30 border border-white/15 rounded-2xl px-5 py-4 text-center font-serif text-2xl tracking-wider text-ivory placeholder:text-ivory/20 focus:outline-none focus:border-amber/50 transition-all"
                    />
                    <button
                      onClick={enterPrefs}
                      disabled={joinInput.trim().length < 4}
                      className="mt-6 w-full py-4 rounded-full bg-amber text-bg text-[11px] font-bold uppercase tracking-[0.25em] hover:scale-[1.02] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                      Odaya Gir
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.section>
          )}

          {/* ═══ ADIM 2 — TERCİH SENTEZİ ═══ */}
          {step === 'prefs' && (
            <motion.section
              key="prefs"
              initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
            >
              <div className="text-center mb-12">
                <h2 className="text-3xl sm:text-5xl font-serif font-bold tracking-tight mb-3">Tercih Sentezi</h2>
                <p className="text-ivory/50 font-serif italic text-lg">
                  Her ikiniz de ruh hâlinizi seçin, sonra asla izlemeyeceğiniz türleri eleyin.
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-5 mb-10">
                {[
                  { label: 'Kullanıcı 1', val: u1Mood, set: setU1Mood, ring: '#7c3aed' },
                  { label: 'Kullanıcı 2', val: u2Mood, set: setU2Mood, ring: '#e11d48' },
                ].map((u) => (
                  <div
                    key={u.label}
                    className="p-6 rounded-3xl bg-white/[0.03] border backdrop-blur-md"
                    style={{ borderColor: `${u.ring}40` }}
                  >
                    <div className="flex items-center gap-2 mb-5">
                      <span className="w-3 h-3 rounded-full" style={{ background: u.ring }} />
                      <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-ivory/60">{u.label}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      {CORE_MOODS.map((m) => {
                        const active = u.val === m.id;
                        const MoodIcon = m.Icon;
                        return (
                          <button
                            key={m.id}
                            onClick={() => u.set(m.id)}
                            className="flex items-center gap-2.5 px-3.5 py-3 rounded-xl border text-left transition-all active:scale-95"
                            style={{
                              background: active ? `${m.accent}26` : 'rgba(255,255,255,0.03)',
                              borderColor: active ? m.accent : 'rgba(255,255,255,0.08)',
                            }}
                          >
                            {MoodIcon && (
                              <MoodIcon size={16} style={{ color: active ? m.glow : '#9a8f80' }} className="shrink-0" />
                            )}
                            <span className={`text-[12px] font-semibold leading-tight ${active ? 'text-ivory' : 'text-ivory/55'}`}>
                              {m.title}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Veto türleri */}
              <div className="p-6 rounded-3xl bg-white/[0.03] border border-white/10 backdrop-blur-md mb-10">
                <div className="flex items-center gap-2 mb-5">
                  <Ban size={15} className="text-rose-400" />
                  <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-ivory/60">
                    Asla İzlemem (Ortak Veto)
                  </p>
                </div>
                <div className="flex flex-wrap gap-2.5">
                  {VETO_GENRES.map((g) => {
                    const on = veto.has(g);
                    return (
                      <button
                        key={g}
                        onClick={() => toggleVeto(g)}
                        className={`px-4 py-2.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all active:scale-95 ${
                          on
                            ? 'bg-rose-500/20 border border-rose-500/50 text-rose-300 line-through'
                            : 'bg-white/5 border border-white/10 text-ivory/55 hover:bg-white/10'
                        }`}
                      >
                        {g}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-center">
                <button
                  onClick={startCollision}
                  disabled={!canCollide}
                  className="group flex items-center gap-4 px-12 py-6 rounded-full bg-amber text-bg text-xs font-bold uppercase tracking-[0.35em] hover:scale-[1.03] disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-[0_25px_60px_-15px_rgba(255,191,0,0.5)]"
                >
                  <Swords size={18} className="group-hover:rotate-12 transition-transform" />
                  Çarpıştır
                </button>
              </div>
              {!canCollide && (
                <p className="text-center text-ivory/35 text-xs font-serif italic mt-5">
                  Devam etmek için her iki kullanıcı da bir ruh hâli seçmeli.
                </p>
              )}
            </motion.section>
          )}

          {/* ═══ ADIM 3 — ÇARPIŞMA ANİMASYONU ═══ */}
          {step === 'colliding' && (
            <motion.section
              key="colliding"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-24 sm:py-32"
            >
              <div className="relative w-56 h-56 mb-12">
                {/* Radar halkaları */}
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="absolute inset-0 rounded-full border border-amber/30"
                    initial={{ scale: 0.3, opacity: 0.8 }}
                    animate={{ scale: 1.6, opacity: 0 }}
                    transition={{ duration: 2, repeat: Infinity, delay: i * 0.6, ease: 'easeOut' }}
                  />
                ))}
                {/* Dönen çekirdek */}
                <motion.div
                  className="absolute inset-8 rounded-full"
                  style={{ background: 'conic-gradient(from 0deg, #7c3aed, #e11d48, #ffbf00, #7c3aed)' }}
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
                />
                <div className="absolute inset-[4.5rem] rounded-full bg-bg flex items-center justify-center">
                  <Swords size={28} className="text-amber" />
                </div>
                {/* Kıvılcımlar */}
                {[...Array(8)].map((_, i) => (
                  <motion.span
                    key={`s${i}`}
                    className="absolute left-1/2 top-1/2 w-1.5 h-1.5 rounded-full bg-amber"
                    animate={{
                      x: [0, Math.cos((i / 8) * 6.28) * 120],
                      y: [0, Math.sin((i / 8) * 6.28) * 120],
                      opacity: [1, 0],
                    }}
                    transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.12, ease: 'easeOut' }}
                  />
                ))}
              </div>

              <AnimatePresence mode="wait">
                <motion.p
                  key={phraseIdx}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                  className="font-serif italic text-2xl sm:text-3xl text-amber/85 text-center"
                >
                  {collidingPhrases[phraseIdx]}
                </motion.p>
              </AnimatePresence>
              <p className="mt-4 text-ivory/35 text-xs font-sans uppercase tracking-[0.3em]">
                {moodTitle(u1Mood)} <span className="text-amber">✕</span> {moodTitle(u2Mood)}
              </p>
            </motion.section>
          )}

          {/* ═══ ADIM 4 — SONUÇLAR ═══ */}
          {step === 'results' && (
            <motion.section
              key="results"
              initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            >
              <div className="text-center mb-12">
                <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-amber/60 mb-4">
                  Kesişim Filmleri
                </p>
                <h2 className="text-3xl sm:text-5xl font-serif font-bold tracking-tight mb-4">
                  Üstad Kararını Verdi
                </h2>
                <p className="text-ivory/50 font-serif italic text-lg max-w-xl mx-auto">
                  "{moodTitle(u1Mood)}" ve "{moodTitle(u2Mood)}" ruhlarının buluştuğu yer.
                </p>
              </div>

              {/* ── Paylaşılabilir Uyum Kartı ── */}
              <div className="max-w-md mx-auto mb-10 space-y-4">
                <div
                  ref={cardRef}
                  className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#2a1a3e] via-[#1a1228] to-[#0a0807] border border-amber/20 p-7 text-center"
                >
                  <div className="absolute top-0 left-0 w-40 h-40 rounded-full bg-[#7c3aed]/25 blur-3xl -translate-x-1/3 -translate-y-1/3" />
                  <div className="absolute bottom-0 right-0 w-40 h-40 rounded-full bg-[#e11d48]/25 blur-3xl translate-x-1/3 translate-y-1/3" />

                  <div className="relative z-10">
                    <p className="text-[9px] font-bold uppercase tracking-[0.45em] text-amber/50">Sinema Uyumumuz</p>
                    <div className="mt-3 flex items-center justify-center gap-2 text-[12px] font-semibold text-ivory/55">
                      <span>{moodTitle(u1Mood)}</span>
                      <Swords size={13} className="text-amber" />
                      <span>{moodTitle(u2Mood)}</span>
                    </div>
                    <div className="my-4 font-serif font-bold leading-none tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-amber via-[#ffbf00] to-rose-400 text-7xl">
                      %{match}
                    </div>
                    {results[0] && (
                      <p className="text-[12px] text-ivory/60">
                        Ortak başyapıt:{' '}
                        <span className="font-serif italic text-ivory/90">{results[0].title}</span>
                      </p>
                    )}
                    <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded bg-amber/20 flex items-center justify-center text-[8px] font-bold text-amber">S</div>
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-ivory/40">Sinemood</span>
                      </div>
                      <span className="text-[9px] text-ivory/25">sinemood.app/carpistir</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-2">
                  <button
                    onClick={handleShareImage}
                    disabled={sharing}
                    className="flex items-center gap-2 px-5 py-2.5 bg-white/10 hover:bg-white/15 border border-white/10 rounded-full text-[10px] font-bold uppercase tracking-[0.2em] text-ivory/70 hover:text-ivory transition-all disabled:opacity-50"
                  >
                    <Share2 size={13} />
                    {sharing ? 'Hazırlanıyor...' : 'Görseli Paylaş'}
                  </button>
                  <button
                    onClick={() => { track(EVENTS.SHARE_CLICK, { network: 'whatsapp', kind: 'collision' }); shareToWhatsApp(shareText, inviteUrl); }}
                    className="px-4 py-2.5 bg-[#25D366]/15 border border-[#25D366]/25 text-[#25D366] rounded-full text-[10px] font-bold uppercase tracking-[0.1em] hover:bg-[#25D366]/25 transition-all"
                  >
                    WhatsApp
                  </button>
                  <button
                    onClick={() => { track(EVENTS.SHARE_CLICK, { network: 'telegram', kind: 'collision' }); shareToTelegram(shareText, inviteUrl); }}
                    className="px-4 py-2.5 bg-[#0088cc]/15 border border-[#0088cc]/25 text-[#0088cc] rounded-full text-[10px] font-bold uppercase tracking-[0.1em] hover:bg-[#0088cc]/25 transition-all"
                  >
                    Telegram
                  </button>
                  <button
                    onClick={handleDownload}
                    disabled={sharing}
                    className="flex items-center justify-center w-10 h-10 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-ivory/50 hover:text-ivory transition-all disabled:opacity-50"
                    title="İndir"
                  >
                    <Download size={14} />
                  </button>
                </div>
              </div>

              <div className="space-y-6">
                {results.map((m, i) => (
                  <motion.article
                    key={m.title}
                    initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.14, duration: 0.5 }}
                    className="flex flex-col sm:flex-row gap-6 p-5 sm:p-7 rounded-3xl bg-white/[0.035] border border-white/10 backdrop-blur-md hover:border-amber/30 transition-all"
                  >
                    {/* Poster */}
                    <div className="w-full sm:w-44 shrink-0 aspect-[2/3] relative rounded-2xl overflow-hidden ring-1 ring-white/10 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.7)]">
                      <PosterArt movie={m} />
                      <div className="absolute top-3 left-3 w-9 h-9 rounded-full bg-black/65 backdrop-blur-sm flex items-center justify-center">
                        <span className="font-serif font-bold text-amber text-sm">{i + 1}</span>
                      </div>
                    </div>

                    {/* Bilgi */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <h3 className="text-2xl sm:text-3xl font-serif font-bold tracking-tight">{m.title}</h3>
                        <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber/10 border border-amber/25 text-amber text-sm font-bold shrink-0">
                          <Star size={13} className="fill-amber" /> {m.imdb.toFixed(1)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-2 text-ivory/40 font-serif italic text-sm">
                        <span>{m.year}</span>
                        <span className="w-1 h-1 rounded-full bg-white/20" />
                        <span>{m.genres.join(', ')}</span>
                      </div>

                      {/* Üstadın Hakem Notu */}
                      <div className="mt-5 p-5 rounded-2xl bg-black/30 border border-amber/15 relative">
                        <Quote size={16} className="text-amber/40 absolute top-4 right-4" />
                        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-amber/60 mb-3">
                          Üstadın Hakem Notu
                        </p>
                        <p className="font-serif text-base sm:text-lg leading-relaxed text-ivory/85 italic pr-6">
                          {m.verdict}
                        </p>
                      </div>
                    </div>
                  </motion.article>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row gap-4 justify-center mt-12">
                <button
                  onClick={() => setStep('prefs')}
                  className="flex items-center justify-center gap-2 px-8 py-4 rounded-full border border-white/10 text-ivory/60 text-[11px] font-bold uppercase tracking-[0.25em] hover:bg-white/5 transition-all"
                >
                  <RefreshCw size={14} /> Tercihleri Değiştir
                </button>
                <button
                  onClick={reset}
                  className="flex items-center justify-center gap-2 px-8 py-4 rounded-full bg-amber text-bg text-[11px] font-bold uppercase tracking-[0.25em] hover:scale-[1.02] transition-all"
                >
                  <Heart size={14} /> Yeni Çarpışma
                </button>
              </div>
            </motion.section>
          )}

        </AnimatePresence>
      </main>
    </motion.div>
  );
}
