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
  const shareText = `"${movie?.title}"${year ? ` (${year})` : ''} Sinemood'da keşfettim. Sen de bak!`;
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
      <div
        ref={cardRef}
        className="relative overflow-hidden rounded-2xl p-5 sm:p-6"
        style={{ minWidth: 320, maxWidth: 400, background: 'linear-gradient(135deg, #1a1410 0%, #0c0a12 100%)' }}
      >
        <div className="absolute top-0 right-0 w-40 h-40 rounded-full -translate-y-1/2 translate-x-1/3 blur-3xl" style={{ backgroundColor: 'rgba(217, 160, 56, 0.08)' }} />

        <p className="relative z-10 text-[9px] font-bold uppercase tracking-[0.5em] mb-4" style={{ color: 'rgba(217, 160, 56, 0.5)' }}>Sinemood Keşfi</p>

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
            <h3 className="text-xl sm:text-2xl font-serif font-bold leading-tight break-words" style={{ color: '#f5f2eb' }}>{movie.title}</h3>
            <div className="mt-1.5 flex items-center gap-2 text-[12px]" style={{ color: 'rgba(245, 242, 235, 0.5)' }}>
              {year && <span>{year}</span>}
              {rating && (
                <span className="flex items-center gap-1 font-bold" style={{ color: '#d9a038' }}>
                  <Star size={11} style={{ fill: '#d9a038' }} /> {rating}
                </span>
              )}
            </div>
            {genres && <p className="mt-1 text-[11px] uppercase tracking-wider" style={{ color: 'rgba(245, 242, 235, 0.35)' }}>{genres}</p>}
          </div>
        </div>

        {noteShort && (
          <p className="relative z-10 mt-5 text-[13px] font-serif italic leading-relaxed" style={{ color: 'rgba(245, 242, 235, 0.65)' }}>
            &ldquo;{noteShort}&rdquo;
          </p>
        )}

        <div className="relative z-10 mt-5 pt-4 flex items-center justify-between" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-black" style={{ backgroundColor: 'rgba(217, 160, 56, 0.9)', color: '#120d0b' }}>S</div>
            <span className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'rgba(217, 160, 56, 0.6)' }}>Sinemood</span>
          </div>
          <span className="text-[9px]" style={{ color: 'rgba(245, 242, 235, 0.25)' }}>bug-n-hangi-mooddas-n.vercel.app</span>
        </div>
      </div>

      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-2">
          <button onClick={handleShareImage} disabled={sharing}
            className="flex items-center gap-2 px-6 py-2.5 rounded-full text-[12px] font-bold uppercase tracking-wider transition-all disabled:opacity-50 active:scale-95"
            style={{ backgroundColor: '#d9a038', color: '#120d0b' }}>
            <Share2 size={13} /> {sharing ? 'Hazırlanıyor...' : 'Görseli Paylaş'}
          </button>
          <button onClick={handleDownload} disabled={sharing} title="İndir"
            className="w-10 h-10 flex items-center justify-center rounded-full transition-all disabled:opacity-50 active:scale-90"
            style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(245,242,235,0.7)' }}>
            <Download size={16} />
          </button>
        </div>
        <ShareButtons url={shareUrl} text={shareText} compact forceDark />
      </div>
    </div>
  );
}
