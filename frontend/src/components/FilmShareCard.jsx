import React, { useRef } from 'react';
import { Download, Share2, Star } from 'lucide-react';
import ShareButtons from './ShareButtons';
import { useShareableImage } from '../utils/useShareableImage';
import { CANONICAL_URL } from '../utils/apiConfig';
import { proxyImageUrl } from '../services/api';
import { track, EVENTS } from '../utils/analytics';

const IMG_LG = 'https://image.tmdb.org/t/p/w500';

const ratingOf = (m) => {
  if (m?.imdb_rating) { const n = parseFloat(m.imdb_rating); if (!isNaN(n) && n > 0) return n.toFixed(1); }
  const a = m?.vote_average;
  if (a && a > 0 && a <= 10) return a.toFixed(1);
  return null;
};

/**
 * Film paylaşım kartı — bir filmi Instagram/WhatsApp'a görsel olarak paylaş.
 * QuizShareCard deseni: off-screen kart + useShareableImage (iOS senkron + oklch sanitizasyon).
 */
export default function FilmShareCard({ movie }) {
  const cardRef = useRef(null);

  const poster = movie && proxyImageUrl(
    movie.poster_url || (movie.poster_path ? `${IMG_LG}${movie.poster_path}` : null)
  );
  const year = movie?.release_date?.split('-')[0] || '';
  const genres = (movie?.genres || []).slice(0, 3).join(' · ');
  const rating = ratingOf(movie);
  const note = (movie?.ai_analysis || '')
    .replace(/^Üstadın Notu:?\s*/i, '').trim();
  const noteShort = note ? (note.length > 150 ? note.slice(0, 147) + '…' : note) : (movie?.overview || '').slice(0, 150);

  const shareUrl = CANONICAL_URL;
  const shareText = `"${movie?.title}"${year ? ` (${year})` : ''} — Sinemood'da keşfettim. Sen de bak!`;
  const fileName = `sinemood-film-${movie?.id || movie?.tmdb_id || 'film'}.png`;

  const { share, download: handleDownload, sharing } = useShareableImage(cardRef, {
    fileName,
    shareText: `${shareText} ${shareUrl}`.trim(),
    backgroundColor: '#0c0a12',
    deps: [movie?.id || movie?.tmdb_id],
  });
  const handleShareImage = () => {
    track(EVENTS.SHARE_CLICK, { network: 'image', kind: 'film' });
    return share();
  };

  if (!movie) return null;

  return (
    <div className="space-y-4">
      {/* ── Capturable Card ── */}
      <div
        ref={cardRef}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1a1410] to-[#0c0a12] p-5 sm:p-6"
        style={{ minWidth: 320, maxWidth: 400 }}
      >
        <div className="absolute top-0 right-0 w-40 h-40 bg-amber-500/[0.08] rounded-full -translate-y-1/2 translate-x-1/3 blur-3xl" />

        <p className="relative z-10 text-[9px] font-bold uppercase tracking-[0.5em] text-amber/50 mb-4">Sinemood Keşfi</p>

        <div className="relative z-10 flex gap-4">
          {poster && (
            <img
              src={poster}
              alt={movie.title}
              crossOrigin="anonymous"
              className="w-24 sm:w-28 aspect-[2/3] rounded-lg object-cover shrink-0 shadow-lg"
            />
          )}
          <div className="min-w-0 flex flex-col justify-center">
            <h3 className="text-xl sm:text-2xl font-serif font-bold text-ivory leading-tight break-words">{movie.title}</h3>
            <div className="mt-1.5 flex items-center gap-2 text-[12px] text-ivory/50">
              {year && <span>{year}</span>}
              {rating && (
                <span className="flex items-center gap-1 text-amber font-bold">
                  <Star size={11} className="fill-amber" /> {rating}
                </span>
              )}
            </div>
            {genres && <p className="mt-1 text-[11px] uppercase tracking-wider text-ivory/35">{genres}</p>}
          </div>
        </div>

        {noteShort && (
          <p className="relative z-10 mt-5 text-[13px] font-serif italic text-ivory/65 leading-relaxed">
            &ldquo;{noteShort}&rdquo;
          </p>
        )}

        {/* Branding footer */}
        <div className="relative z-10 mt-5 pt-4 border-t border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-amber/90 flex items-center justify-center text-[9px] font-black text-[#120d0b]">S</div>
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber/60">Sinemood</span>
          </div>
          <span className="text-[9px] text-ivory/25">bug-n-hangi-mooddas-n.vercel.app</span>
        </div>
      </div>

      {/* ── Share Actions ── */}
      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-2">
          <button onClick={handleShareImage} disabled={sharing}
            className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-amber text-[#120d0b] text-[12px] font-bold uppercase tracking-wider hover:bg-amber-400 transition-all disabled:opacity-50">
            <Share2 size={13} /> {sharing ? 'Hazırlanıyor...' : 'Görseli Paylaş'}
          </button>
          <button onClick={handleDownload} disabled={sharing} title="İndir"
            className="w-10 h-10 flex items-center justify-center rounded-full bg-white/5 border border-white/15 text-ivory/70 hover:text-amber transition-all disabled:opacity-50">
            <Download size={16} />
          </button>
        </div>
        <ShareButtons url={shareUrl} text={shareText} compact />
      </div>
    </div>
  );
}
