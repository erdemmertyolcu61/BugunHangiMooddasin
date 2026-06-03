import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronLeft, Star, Share2, Download, CalendarDays, Play } from 'lucide-react';
import { getDailyFilm, proxyImageUrl } from '../services/api';
import { captureAndShare, captureElementAsBlob, downloadBlob, shareToWhatsApp, shareToTelegram } from '../utils/shareUtils';
import { track, EVENTS } from '../utils/analytics';
import FilmDetailModal from '../components/FilmDetailModal';
import useDocumentMeta from '../utils/useDocumentMeta';
import { useTheme } from '../context/ThemeContext';

/**
 * "Üstad'ın Bugünkü Filmi" — günlük tek film (gün boyu sabit).
 * Retention + dağıtım: paylaşılabilir kart + push hedef sayfası (/gunun-filmi).
 */
export default function DailyFilm() {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const cardRef = useRef(null);

  useDocumentMeta({
    title: 'Üstad’ın Bugünkü Filmi | Sinemood',
    description: 'Üstad’ın bugün için seçtiği film. Her gün yeni bir öneri — bugün ne izleyeceğini Sinemood söylesin.',
  });

  useEffect(() => {
    let alive = true;
    track(EVENTS.SURPRISE_VIEW, { kind: 'daily' });
    getDailyFilm()
      .then((d) => { if (alive) { setData(d); setLoading(false); } })
      .catch(() => { if (alive) { setError(true); setLoading(false); } });
    return () => { alive = false; };
  }, []);

  const movie = data?.movie;
  const shareUrl = `${window.location.origin}/gunun-filmi`;
  const dateLabel = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
  const shareText = movie
    ? `Üstad'ın bugünkü filmi: ${movie.title} 🎬\nSen de günün filmini keşfet 👉`
    : '';

  const handleShareImage = async () => {
    if (!cardRef.current || sharing) return;
    setSharing(true);
    track(EVENTS.SHARE_CLICK, { network: 'image', kind: 'daily' });
    try {
      await captureAndShare(cardRef.current, 'sinemood-gunun-filmi.png', `${shareText} ${shareUrl}`.trim(), { backgroundColor: isLight ? '#e7dabd' : '#0f0d0a' });
    } finally {
      setSharing(false);
    }
  };

  const handleDownload = async () => {
    if (!cardRef.current || sharing) return;
    setSharing(true);
    try {
      const blob = await captureElementAsBlob(cardRef.current, { backgroundColor: isLight ? '#e7dabd' : '#0f0d0a' });
      downloadBlob(blob, 'sinemood-gunun-filmi.png');
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="min-h-screen text-ivory font-sans">
      <header className="sticky top-0 z-40 backdrop-blur-md bg-[#120d0b]/70 border-b border-white/5 pt-safe">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-ivory/55 hover:text-ivory transition-colors group"
          >
            <ChevronLeft size={18} className="group-hover:-translate-x-0.5 transition-transform" />
            <span className="text-[11px] font-bold uppercase tracking-widest">Ana Sayfa</span>
          </button>
          <div className="flex items-center gap-2 text-amber">
            <CalendarDays size={16} />
            <span className="text-[11px] font-bold uppercase tracking-[0.3em]">Günün Filmi</span>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14 pb-nav">
        {loading ? (
          <div className="flex justify-center py-24">
            <div className="flex gap-2">
              {[0, 1, 2].map((i) => (
                <motion.div key={i} className="w-2.5 h-2.5 rounded-full bg-amber"
                  animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.25 }} />
              ))}
            </div>
          </div>
        ) : error || !movie ? (
          <div className="text-center py-24">
            <p className="font-serif italic text-lg text-ivory/50">Bugünün filmi henüz hazır değil. Birazdan tekrar dene.</p>
          </div>
        ) : (
          <>
            {/* ── Paylaşılabilir Kart ── */}
            <div
              ref={cardRef}
              className={`relative overflow-hidden rounded-3xl p-6 sm:p-8 ${
                isLight
                  ? 'bg-gradient-to-br from-[#f3ecdb] via-[#efe5cf] to-[#e7dabd] border-amber/20'
                  : 'bg-gradient-to-br from-[#1f1410] via-[#17100d] to-[#0a0807] border-amber/15'
              } border`}
            >
              <div className={`absolute top-0 right-0 w-48 h-48 rounded-full blur-3xl translate-x-1/3 -translate-y-1/3 ${isLight ? 'bg-amber/20' : 'bg-amber/10'}`} />

              <div className="relative z-10 flex items-center gap-2 mb-6">
                <p className="text-[9px] font-bold uppercase tracking-[0.4em] text-amber/60">
                  Üstad'ın {dateLabel} Filmi
                </p>
              </div>

              <div className="relative z-10 flex flex-col sm:flex-row gap-6">
                <div className={`w-40 sm:w-48 shrink-0 mx-auto sm:mx-0 aspect-[2/3] rounded-2xl overflow-hidden shadow-[0_20px_50px_-15px_rgba(0,0,0,0.7)] ${isLight ? 'ring-1 ring-black/5' : 'ring-1 ring-white/10'} bg-white/5`}>
                  {movie.poster_url ? (
                    <img src={proxyImageUrl(movie.poster_url)} alt={movie.title}
                      className="w-full h-full object-cover" crossOrigin="anonymous" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-4xl opacity-30">🎬</div>
                  )}
                </div>

                <div className="flex-1 min-w-0 text-center sm:text-left">
                  <h1 className="text-2xl sm:text-3xl font-serif font-bold tracking-tight leading-tight">{movie.title}</h1>
                  <div className="flex items-center justify-center sm:justify-start gap-3 mt-2 text-ivory/45 text-sm">
                    {movie.release_date && <span>{String(movie.release_date).slice(0, 4)}</span>}
                    {movie.vote_average > 0 && (
                      <span className="flex items-center gap-1 text-amber font-bold">
                        <Star size={12} className="fill-amber" />{Number(movie.vote_average).toFixed(1)}
                      </span>
                    )}
                  </div>
                  {data.ustad_line && (
                    <p className="mt-4 font-serif italic text-ivory/70 leading-relaxed text-[15px]">
                      &ldquo;{data.ustad_line}&rdquo;
                    </p>
                  )}
                </div>
              </div>

              <div className={`relative z-10 mt-6 pt-4 flex items-center justify-between ${isLight ? 'border-t border-black/10' : 'border-t border-white/10'}`}>
                <div className="flex items-center gap-2">
                  <div className={`w-5 h-5 rounded flex items-center justify-center text-[8px] font-bold text-amber ${isLight ? 'bg-amber/30' : 'bg-amber/20'}`}>S</div>
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-ivory/40">Sinemood</span>
                </div>
                <span className="text-[9px] text-ivory/25">sinemood.app/gunun-filmi</span>
              </div>
            </div>

            {/* ── Aksiyonlar ── */}
            <div className="flex flex-wrap items-center justify-center gap-2 mt-6">
              <button
                onClick={() => setShowDetail(true)}
                className="flex items-center gap-2 px-6 py-3 bg-amber text-bg rounded-full text-[11px] font-bold uppercase tracking-[0.2em] hover:scale-[1.02] transition-all"
              >
                <Play size={13} className="fill-bg" /> Detaylar
              </button>
              <button
                onClick={handleShareImage}
                disabled={sharing}
                className="flex items-center gap-2 px-5 py-3 bg-white/10 hover:bg-white/15 border border-white/10 rounded-full text-[10px] font-bold uppercase tracking-[0.2em] text-ivory/70 hover:text-ivory transition-all disabled:opacity-50"
              >
                <Share2 size={13} />
                {sharing ? 'Hazırlanıyor...' : 'Paylaş'}
              </button>
              <button
                onClick={() => { track(EVENTS.SHARE_CLICK, { network: 'whatsapp', kind: 'daily' }); shareToWhatsApp(shareText, shareUrl); }}
                className="px-4 py-3 bg-[#25D366]/15 border border-[#25D366]/25 text-[#25D366] rounded-full text-[10px] font-bold uppercase tracking-[0.1em] hover:bg-[#25D366]/25 transition-all"
              >
                WhatsApp
              </button>
              <button
                onClick={() => { track(EVENTS.SHARE_CLICK, { network: 'telegram', kind: 'daily' }); shareToTelegram(shareText, shareUrl); }}
                className="px-4 py-3 bg-[#0088cc]/15 border border-[#0088cc]/25 text-[#0088cc] rounded-full text-[10px] font-bold uppercase tracking-[0.1em] hover:bg-[#0088cc]/25 transition-all"
              >
                Telegram
              </button>
              <button
                onClick={handleDownload}
                disabled={sharing}
                className="flex items-center justify-center w-11 h-11 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-ivory/50 hover:text-ivory transition-all disabled:opacity-50"
                title="İndir"
              >
                <Download size={15} />
              </button>
            </div>
          </>
        )}
      </main>

      {showDetail && movie && (
        <FilmDetailModal
          movieId={movie.id || movie.tmdb_id}
          initialMovie={movie}
          onClose={() => setShowDetail(false)}
        />
      )}
    </div>
  );
}
