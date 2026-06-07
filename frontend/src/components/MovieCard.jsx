import React, { memo } from 'react';
import { motion } from 'framer-motion';
import { Clapperboard, BookmarkPlus, Check, Eye, Star } from 'lucide-react';
import { proxyImageUrl } from '../services/api';
import OptimizedImage from './OptimizedImage';

const IMG_BASE = 'https://image.tmdb.org/t/p/w500';

const reliableRating = (movie) => {
  if (movie.imdb_rating) {
    const n = parseFloat(movie.imdb_rating);
    if (!isNaN(n) && n > 0) return n.toFixed(1);
  }
  const avg = movie.vote_average;
  if (avg == null || avg <= 0) return null;
  const count = movie.vote_count;
  if (count != null && count < 5) return null;
  return avg <= 10.0 ? avg.toFixed(1) : null;
};

function MovieCard({ movie, isSaved, isWatched, onQuickSave, onQuickWatched, onAnalyze }) {
  return (
    <div className="poster-container movie-grid-item group cursor-pointer relative" role="button" tabIndex={0} aria-label={`${movie.title} detaylarını aç`} onClick={() => onAnalyze(movie)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAnalyze(movie); } }}>
      <div className="ticket-card aspect-[2/3] group-hover:scale-[1.03] group-hover:-translate-y-4">
        {movie.poster_url || movie.poster_path
          ? <OptimizedImage
              src={movie.poster_url || `${IMG_BASE}${movie.poster_path}`}
              alt={movie.title}
              fallbackTitle={movie.title}
              aspect="poster"
              size="md"
              className="w-full h-full transition-transform duration-700 md:group-hover:scale-105"
            />
          : <div className="artistic-fallback w-full h-full p-12">
              <h3 className="text-2xl font-serif font-bold italic text-amber">{movie.title}</h3>
            </div>}

        {/* Üstad'ın Seçkisi Rozeti — solda, daima görünür */}
        {movie.mood_match_label === "Üstad'ın Seçkisi" && (
          <div className="absolute top-3 left-3 sm:top-6 sm:left-6 z-10 max-w-[90%]">
            <div className="px-3 py-1.5 bg-gradient-to-r from-amber-600/95 to-amber-500/95 sm:backdrop-blur-md rounded-full border border-amber-300/60 shadow-[0_0_12px_rgba(245,158,11,0.35)]">
              <p className="text-[8px] sm:text-[10px] font-bold uppercase tracking-widest text-black flex items-center gap-1.5">
                <Star size={9} className="fill-black" /> Üstad'ın Seçkisi
              </p>
            </div>
          </div>
        )}

        {/* Mood Uyum Overlay — sadece seçki olmayan kartlarda. Kişisel `match`
            (taste map) öncelikli; yoksa backend mood_score; ikisi de yoksa rozet
            gizlenir (artık sahte yüzde yok). */}
        {movie.mood_match_label !== "Üstad'ın Seçkisi" && (movie.match ?? movie.mood_score) != null && (
          <div className="absolute top-3 left-3 sm:top-6 sm:left-6 z-10 px-3 py-1.5 bg-black/75 sm:bg-black/60 sm:backdrop-blur-md rounded-full border border-white/10 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-500 sm:transform sm:translate-x-4 sm:group-hover:translate-x-0">
            <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-amber flex items-center gap-1.5 sm:gap-2">
              <Clapperboard size={10} /> %{movie.match ?? movie.mood_score}
            </p>
          </div>
        )}

        {/* Hızlı Eylem Butonları — web'de hover overlay, mobilde afiş altında */}
        <div className="hidden sm:flex absolute bottom-0 left-0 right-0 z-10 items-center gap-1.5 sm:gap-3 p-2 sm:p-3 opacity-0 sm:group-hover:opacity-100 transition-opacity duration-300 sm:translate-y-1 sm:group-hover:translate-y-0">
          <button
            onClick={(e) => { e.stopPropagation(); onQuickSave(movie); }}
            aria-label={isSaved ? `${movie.title} defterden çıkar` : `${movie.title} deftere ekle`}
            title="Deftere Ekle"
            className={`flex-1 flex items-center justify-center gap-1.5 sm:gap-2 px-4 sm:px-7 py-1 sm:py-1.5 rounded-full text-[9px] sm:text-[11px] font-bold uppercase tracking-wider sm:backdrop-blur-md border transition-colors duration-200 active:scale-95 min-w-0
              ${isSaved
                ? 'bg-amber/90 border-amber/60 text-black'
                : 'bg-black/70 border-white/20 text-white/80 hover:bg-amber/80 hover:text-black hover:border-amber/50'
              }`}
          >
            {isSaved
              ? <><Check size={13} className="shrink-0" /> Eklendi</>
              : <><BookmarkPlus size={13} className="shrink-0" /> Deftere</>
            }
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onQuickWatched(movie); }}
            aria-label={isWatched ? `${movie.title} izlenmedi olarak işaretle` : `${movie.title} izledim olarak işaretle`}
            title="İzledim"
            className={`flex-1 flex items-center justify-center gap-1.5 sm:gap-2 px-4 sm:px-7 py-1 sm:py-1.5 rounded-full text-[9px] sm:text-[11px] font-bold uppercase tracking-wider sm:backdrop-blur-md border transition-colors duration-200 active:scale-95 min-w-0
              ${isWatched
                ? 'bg-emerald-500/90 border-emerald-400/60 text-white'
                : 'bg-black/70 border-white/20 text-white/80 hover:bg-emerald-500/80 hover:text-white hover:border-emerald-400/50'
              }`}
          >
            {isWatched
              ? <><Check size={13} className="shrink-0" /> İzledim</>
              : <><Eye size={13} className="shrink-0" /> İzledim</>
            }
          </button>
        </div>
      </div>

      {/* Mobil: ikon ibareler — sadece ikon, yazı yok */}
      <div className="sm:hidden flex items-center gap-2 mt-2 px-1">
        <button
          onClick={(e) => { e.stopPropagation(); onQuickSave(movie); }}
          className={`w-9 h-9 flex items-center justify-center rounded-full border transition-colors duration-200 active:scale-90
            ${isSaved
              ? 'bg-amber/90 border-amber/60 text-black'
              : 'bg-black/70 border-white/20 text-white/70 hover:bg-amber/80 hover:text-black hover:border-amber/50'
            }`}
          title={isSaved ? 'Eklendi' : 'Deftere Ekle'}
        >
          {isSaved ? <Check size={14} /> : <BookmarkPlus size={14} />}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onQuickWatched(movie); }}
          className={`w-9 h-9 flex items-center justify-center rounded-full border transition-colors duration-200 active:scale-90
            ${isWatched
              ? 'bg-emerald-500/90 border-emerald-400/60 text-white'
              : 'bg-black/70 border-white/20 text-white/70 hover:bg-emerald-500/80 hover:text-white hover:border-emerald-400/50'
            }`}
          title={isWatched ? 'İzledim' : 'İzlemedim'}
        >
          {isWatched ? <Check size={14} /> : <Eye size={14} />}
        </button>
      </div>

      <div className="mt-2 sm:mt-5 px-1 sm:px-4">
        <h3 className="text-[15px] sm:text-lg font-sans font-semibold text-ivory leading-tight line-clamp-2 mb-1.5">
          {movie.title}
        </h3>
        <div className="flex items-center justify-between opacity-80 group-hover:opacity-100 transition-opacity duration-500">
          <span className="text-[10px] font-bold uppercase tracking-widest text-ivory/50">{movie.release_date?.split('-')[0]}</span>
          {reliableRating(movie) != null && (
            <div className="flex items-center gap-1.5">
              <Star size={10} className="fill-amber text-amber" />
              <span className="text-xs font-bold text-ivory/70">{reliableRating(movie)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(MovieCard);
