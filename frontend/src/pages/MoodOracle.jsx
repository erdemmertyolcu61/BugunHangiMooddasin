import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain, Trophy, Share2, Download, RefreshCw,
  ChevronLeft, Check, X, ArrowRight, Quote, Clock,
} from 'lucide-react';
import { MOODS } from '../context/MoodContext';
import { getMoodOracleRounds, proxyImageUrl } from '../services/api';
import { getOracleState, applyResult, rankFor } from '../utils/oracleRank';
import { captureAndShare, captureElementAsBlob, downloadBlob, shareToWhatsApp, shareToTelegram } from '../utils/shareUtils';
import { track, EVENTS } from '../utils/analytics';
import useDocumentMeta from '../utils/useDocumentMeta';

const TOTAL = 5;
const DAILY_KEY = 'fc_oracle_last_played'; // YYYY-MM-DD
const moodTitle = (id) => MOODS[id]?.title || id;

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function getSecondsUntilMidnight() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return Math.ceil((midnight - now) / 1000);
}

function formatCountdown(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function hasPlayedToday() {
  try { return localStorage.getItem(DAILY_KEY) === todayStr(); } catch { return false; }
}
function markPlayedToday() {
  try {
    localStorage.setItem(DAILY_KEY, todayStr());
    window.dispatchEvent(new Event('oracle-updated'));
  } catch {}
}

export default function MoodOracle() {
  const navigate = useNavigate();
  useDocumentMeta({
    title: 'Mood Kâhini — Filmin Ruhunu Oku | Sinemood',
    description: "Üstad bu filmi hangi ruh haline koydu? Filmlerin ruhunu okuyup Sinefil rütbeni yükselt. Sinemood'un mini oyunu.",
  });

  const [phase, setPhase] = useState('intro');   // intro | play | result
  const [rounds, setRounds] = useState([]);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [summary, setSummary] = useState(null);
  const [sharing, setSharing] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const cardRef = useRef(null);

  const state = getOracleState();
  const alreadyPlayed = hasPlayedToday();

  // Geri sayım — oyun oynandıysa güncelle
  useEffect(() => {
    if (!alreadyPlayed && phase !== 'result') return;
    setCountdown(getSecondsUntilMidnight());
    const id = setInterval(() => setCountdown(s => {
      if (s <= 1) { clearInterval(id); return 0; }
      return s - 1;
    }), 1000);
    return () => clearInterval(id);
  }, [alreadyPlayed, phase]);

  const start = useCallback(async () => {
    setLoading(true); setError(false);
    track(EVENTS.SURPRISE_VIEW, { kind: 'game_start' });
    try {
      const data = await getMoodOracleRounds(TOTAL);
      const rs = data.rounds || [];
      if (!rs.length) { setError(true); setLoading(false); return; }
      setRounds(rs); setIdx(0); setPicked(null); setResults([]); setSummary(null);
      setPhase('play'); setLoading(false);
    } catch {
      setError(true); setLoading(false);
    }
  }, []);

  const round = rounds[idx];
  const revealed = picked !== null;

  const pick = (moodId) => {
    if (revealed || !round) return;
    setPicked(moodId);
    setResults((prev) => [...prev, moodId === round.correct_mood]);
  };

  const next = () => {
    if (idx + 1 < rounds.length) {
      setIdx(idx + 1); setPicked(null);
    } else {
      setPhase('result');
      markPlayedToday();
    }
  };

  useEffect(() => {
    if (phase === 'result' && !summary) {
      const correct = results.filter(Boolean).length;
      const s = applyResult(correct, rounds.length || TOTAL);
      setSummary(s);
      track(EVENTS.SURPRISE_VIEW, { kind: 'game_result', correct });
    }
  }, [phase, summary, results, rounds.length]);

  const correctCount = results.filter(Boolean).length;
  const shareUrl = `${window.location.origin}/oyun`;
  const shareText = summary
    ? `Mood Kâhini'nde ${correctCount}/${rounds.length || TOTAL} bildim — Rütbem: ${summary.rank.name} 🎬\nSen de filmlerin ruhunu oku 👉`
    : '';

  const handleShareImage = async () => {
    if (!cardRef.current || sharing) return;
    setSharing(true);
    track(EVENTS.SHARE_CLICK, { network: 'image', kind: 'game' });
    try {
      await captureAndShare(cardRef.current, 'sinemood-mood-kahini.png', `${shareText} ${shareUrl}`.trim(), { backgroundColor: '#0c0906' });
    } finally { setSharing(false); }
  };
  const handleDownload = async () => {
    if (!cardRef.current || sharing) return;
    setSharing(true);
    try {
      const b = await captureElementAsBlob(cardRef.current, { backgroundColor: '#0c0906' });
      downloadBlob(b, 'sinemood-mood-kahini.png');
    } finally { setSharing(false); }
  };

  return (
    <div className="min-h-screen text-ivory font-sans">
      <header className="sticky top-0 z-40 backdrop-blur-md bg-[#120d0b]/70 border-b border-white/5 pt-safe">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <button onClick={() => navigate('/')}
            className="flex items-center gap-2 text-ivory/55 hover:text-ivory transition-colors group">
            <ChevronLeft size={18} className="group-hover:-translate-x-0.5 transition-transform" />
            <span className="text-[11px] font-bold uppercase tracking-widest">Ana Sayfa</span>
          </button>
          <div className="flex items-center gap-2 text-amber">
            <Trophy size={16} />
            <span className="text-[11px] font-bold uppercase tracking-[0.3em]">Mood Kâhini</span>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12 pb-nav">
        <AnimatePresence mode="wait">

          {/* ═══ INTRO ═══ */}
          {phase === 'intro' && (
            <motion.section key="intro"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
              className="text-center">
              <div className="w-16 h-16 mx-auto mb-6 rounded-3xl bg-amber/12 border border-amber/25 flex items-center justify-center">
                <Brain size={28} className="text-amber" />
              </div>
              <h1 className="text-3xl sm:text-5xl font-serif font-bold tracking-tight mb-4">
                Filmin <span className="italic text-amber">ruhunu</span> oku
              </h1>
              <p className="text-fg-muted font-serif italic text-lg leading-relaxed mb-8 max-w-md mx-auto">
                Üstad sana bir film gösterecek. Sen de onu hangi ruh haline koyduğunu bil.
                Doğru bildikçe Üstad'ın güveni — ve Sinefil rütben — yükselir.
              </p>

              <div className="inline-flex items-center gap-3 px-5 py-3 rounded-2xl bg-surface border border-default mb-8">
                <Trophy size={16} className="text-amber" />
                <span className="text-sm text-fg-muted">Rütben:</span>
                <span className="text-sm font-bold text-fg">{state.rank.name}</span>
              </div>

              {alreadyPlayed ? (
                <div className="space-y-4">
                  <div className="inline-flex flex-col items-center gap-2 px-8 py-5 rounded-2xl bg-fg/[0.04] border border-default">
                    <div className="flex items-center gap-2 text-fg-subtle text-[11px] font-bold uppercase tracking-[0.2em]">
                      <Clock size={14} /> Bugünkü oyun oynandı
                    </div>
                    <p className="font-mono text-2xl font-bold text-amber tabular-nums">
                      {formatCountdown(countdown)}
                    </p>
                    <p className="text-[11px] text-fg-subtle">Yarın tekrar açılır</p>
                  </div>
                </div>
              ) : (
                <div>
                  <button onClick={start} disabled={loading}
                    className="inline-flex items-center gap-3 px-10 py-5 rounded-full bg-amber text-bg text-xs font-bold uppercase tracking-[0.3em] hover:scale-[1.03] disabled:opacity-50 transition-transform shadow-[0_18px_45px_-12px_rgba(255,191,0,0.5)]">
                    {loading ? 'Hazırlanıyor...' : 'Oyna'}
                    {!loading && <ArrowRight size={16} />}
                  </button>
                </div>
              )}
              {error && <p className="text-rose-400 text-sm mt-5">Oyun yüklenemedi. Birazdan tekrar dene.</p>}
            </motion.section>
          )}

          {/* ═══ PLAY ═══ */}
          {phase === 'play' && round && (
            <motion.section key={`play-${idx}`}
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}>
              <div className="flex items-center justify-between mb-5">
                <span className="text-[10px] font-bold uppercase tracking-[0.4em] text-amber/60">
                  {idx + 1} / {rounds.length}
                </span>
                <div className="flex gap-1.5">
                  {rounds.map((_, i) => (
                    <div key={i} className={`w-5 h-1 rounded-full transition-colors ${
                      i < results.length ? (results[i] ? 'bg-emerald-500' : 'bg-rose-500') : i === idx ? 'bg-amber/60' : 'bg-fg-subtle/30'
                    }`} />
                  ))}
                </div>
              </div>

              <div className="flex gap-4 sm:gap-5 p-4 sm:p-5 rounded-3xl bg-surface border border-default mb-6">
                <div className="w-24 sm:w-28 shrink-0 aspect-[2/3] rounded-xl overflow-hidden bg-surface-2 ring-1 ring-white/10">
                  {round.film.poster_url
                    ? <img src={proxyImageUrl(round.film.poster_url)} alt={round.film.title} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-3xl opacity-30">🎬</div>}
                </div>
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <h2 className="text-xl sm:text-2xl font-serif font-bold tracking-tight leading-tight">{round.film.title}</h2>
                  {round.film.year && <p className="text-fg-subtle text-sm mt-1">{round.film.year}</p>}
                  <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.3em] text-amber/70">
                    Üstad bunu hangi ruh haline koydu?
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                {round.options.map((id) => {
                  const m = MOODS[id];
                  const Icon = m?.icon;
                  const accent = m?.auraColors?.[1] || '#ffbf00';
                  const isCorrect = id === round.correct_mood;
                  const isPicked = id === picked;
                  let cls = 'bg-surface-2 border-default text-fg-muted hover:border-accent';
                  if (revealed) {
                    if (isCorrect) cls = 'bg-emerald-500/15 border-emerald-500/50 text-fg';
                    else if (isPicked) cls = 'bg-rose-500/15 border-rose-500/50 text-fg';
                    else cls = 'bg-surface-2 border-default text-fg-subtle opacity-50';
                  }
                  return (
                    <button key={id} onClick={() => pick(id)} disabled={revealed}
                      className={`flex items-center gap-2.5 px-3.5 py-3.5 rounded-2xl border text-left transition-all active:scale-[0.98] ${cls}`}>
                      {Icon && <Icon size={17} style={{ color: revealed && !isCorrect && !isPicked ? undefined : accent }} className="shrink-0" />}
                      <span className="text-[13px] font-semibold leading-tight flex-1">{m?.title || id}</span>
                      {revealed && isCorrect && <Check size={16} className="text-emerald-400 shrink-0" />}
                      {revealed && isPicked && !isCorrect && <X size={16} className="text-rose-400 shrink-0" />}
                    </button>
                  );
                })}
              </div>

              <AnimatePresence>
                {revealed && (
                  <motion.div
                    initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                    className="mt-5 p-5 rounded-2xl bg-black/20 border border-amber/15 relative">
                    <Quote size={15} className="text-amber/40 absolute top-4 right-4" />
                    <p className={`text-[10px] font-bold uppercase tracking-[0.3em] mb-2 ${
                      results[idx] ? 'text-emerald-400/80' : 'text-rose-400/80'
                    }`}>
                      {results[idx] ? 'Üstad memnun' : 'Üstad iğneliyor'}
                    </p>
                    <p className="font-serif text-base sm:text-lg italic text-fg/90 leading-relaxed pr-6">
                      {results[idx] ? round.ustad_correct : round.ustad_wrong}
                    </p>
                    {!results[idx] && (
                      <p className="text-[13px] text-fg-muted mt-3">
                        Doğrusu: <span className="font-bold text-amber">{moodTitle(round.correct_mood)}</span> — {round.reason}
                      </p>
                    )}
                    {results[idx] && round.reason && (
                      <p className="text-[13px] text-fg-muted mt-3">{round.reason}</p>
                    )}
                    <button onClick={next}
                      className="mt-4 w-full py-3.5 rounded-full bg-amber text-bg text-[11px] font-bold uppercase tracking-[0.25em] hover:scale-[1.01] transition-transform flex items-center justify-center gap-2">
                      {idx + 1 < rounds.length ? 'Sonraki' : 'Sonucu Gör'} <ArrowRight size={14} />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.section>
          )}

          {/* ═══ RESULT ═══ */}
          {phase === 'result' && summary && (
            <motion.section key="result"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              className="text-center">
              {/* ── Paylaşılabilir kart — tüm renkler inline (html2canvas/oklch uyumu) ── */}
              <div className="max-w-sm mx-auto mb-6">
                <div
                  ref={cardRef}
                  style={{
                    background: 'linear-gradient(150deg, #231807 0%, #191207 50%, #0c0906 100%)',
                    border: '1px solid rgba(255,191,0,0.22)',
                    borderRadius: '1.5rem',
                    padding: '28px',
                    textAlign: 'center',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  {/* Arka plan aura */}
                  <div style={{
                    position: 'absolute', top: '-48px', left: '50%', transform: 'translateX(-50%)',
                    width: '160px', height: '160px', borderRadius: '50%',
                    background: 'rgba(255,191,0,0.12)', filter: 'blur(40px)', pointerEvents: 'none',
                  }} />
                  <div style={{ position: 'relative', zIndex: 1 }}>
                    <p style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.45em', textTransform: 'uppercase', color: 'rgba(255,191,0,0.6)', marginBottom: '16px' }}>
                      Mood Kâhini
                    </p>
                    <div style={{ marginBottom: '16px' }}>
                      <div style={{ fontSize: '32px', color: '#ffbf00', marginBottom: '8px' }}>🏆</div>
                      <p style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'rgba(245,242,235,0.4)', marginBottom: '4px' }}>
                        Sinefil Rütbesi
                      </p>
                      <p style={{ fontFamily: 'serif', fontSize: '28px', fontWeight: 700, color: '#ffbf00', lineHeight: 1.1 }}>
                        {summary.rank.name}
                      </p>
                    </div>
                    <p style={{ fontSize: '24px', fontWeight: 700, color: '#f5f2eb', letterSpacing: '-0.02em' }}>
                      {correctCount}/{rounds.length}
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginTop: '12px', fontSize: '18px' }}>
                      {results.map((r, i) => <span key={i}>{r ? '🟩' : '🟥'}</span>)}
                    </div>
                    <p style={{ marginTop: '16px', fontSize: '12px', fontFamily: 'serif', fontStyle: 'italic', color: 'rgba(245,242,235,0.55)' }}>
                      {summary.rank.blurb}
                    </p>
                    {/* Footer */}
                    <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '20px', height: '20px', borderRadius: '4px', background: 'rgba(255,191,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', fontWeight: 700, color: '#ffbf00' }}>S</div>
                        <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(245,242,235,0.4)' }}>Sinemood</span>
                      </div>
                      <span style={{ fontSize: '9px', color: 'rgba(245,242,235,0.25)' }}>sinemood.app/oyun</span>
                    </div>
                  </div>
                </div>

                {/* Güven çubuğu (kart dışında, indirmeye dahil değil) */}
                <div className="mt-4 px-1">
                  <div className="flex items-center justify-between text-[11px] mb-1.5">
                    <span className="text-fg-subtle flex items-center gap-1.5"><Trophy size={11} className="text-amber/60" /> Üstad'ın Güveni</span>
                    <span className="text-fg-muted tabular-nums">
                      {summary.before} → {summary.after}{' '}
                      <span className={summary.delta >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        ({summary.delta >= 0 ? '+' : ''}{summary.delta})
                      </span>
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-fg-subtle/20 overflow-hidden">
                    <motion.div initial={{ width: `${summary.before}%` }} animate={{ width: `${summary.after}%` }}
                      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                      className="h-full rounded-full bg-gradient-to-r from-amber/70 to-amber" />
                  </div>
                </div>
              </div>

              {/* Paylaş butonları */}
              <div className="flex flex-wrap items-center justify-center gap-2 mb-5">
                <button onClick={handleShareImage} disabled={sharing}
                  className="flex items-center gap-2 px-5 py-2.5 bg-white/10 hover:bg-white/15 border border-white/10 rounded-full text-[10px] font-bold uppercase tracking-[0.2em] text-ivory/70 hover:text-ivory transition-all disabled:opacity-50">
                  <Share2 size={13} /> {sharing ? 'Hazırlanıyor...' : 'Paylaş'}
                </button>
                <button onClick={() => { track(EVENTS.SHARE_CLICK, { network: 'whatsapp', kind: 'game' }); shareToWhatsApp(shareText, shareUrl); }}
                  className="px-4 py-2.5 bg-[#25D366]/15 border border-[#25D366]/25 text-[#25D366] rounded-full text-[10px] font-bold uppercase tracking-[0.1em] hover:bg-[#25D366]/25 transition-all">WhatsApp</button>
                <button onClick={() => { track(EVENTS.SHARE_CLICK, { network: 'telegram', kind: 'game' }); shareToTelegram(shareText, shareUrl); }}
                  className="px-4 py-2.5 bg-[#0088cc]/15 border border-[#0088cc]/25 text-[#0088cc] rounded-full text-[10px] font-bold uppercase tracking-[0.1em] hover:bg-[#0088cc]/25 transition-all">Telegram</button>
                <button onClick={handleDownload} disabled={sharing}
                  className="flex items-center justify-center w-10 h-10 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-ivory/50 hover:text-ivory transition-all disabled:opacity-50" title="İndir">
                  <Download size={14} />
                </button>
              </div>

              {/* Yarın geri gel countdown */}
              <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-fg/[0.04] border border-default mb-5">
                <Clock size={14} className="text-fg-subtle" />
                <span className="text-[12px] text-fg-muted">Yeni oyun: </span>
                <span className="font-mono text-[14px] font-bold text-amber tabular-nums">{formatCountdown(countdown)}</span>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button onClick={() => navigate('/')}
                  className="flex items-center justify-center gap-2 px-8 py-4 rounded-full border border-default text-fg-subtle text-[11px] font-bold uppercase tracking-[0.25em] hover:text-fg transition-colors">
                  Ana Sayfa
                </button>
              </div>
            </motion.section>
          )}

        </AnimatePresence>
      </main>
    </div>
  );
}
