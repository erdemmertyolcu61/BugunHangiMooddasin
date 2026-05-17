/**
 * MovieCard — vinyl sleeve aesthetic, uses real TMDB poster.
 */
import MoodBadge from './MoodBadge';

export default function MovieCard({ movie, onClick, width = 220 }) {
  return (
    <button
      onClick={() => onClick(movie)}
      style={{ width: `${width}px` }}
      className="group flex flex-shrink-0 flex-col gap-3 text-left transition-transform hover:-translate-y-1"
    >
      <div className="sleeve sleeve-hover relative aspect-[2/3] w-full overflow-hidden rounded-[3px] bg-ink-soft">
        {movie.poster_url ? (
          <img
            src={movie.poster_url}
            alt={movie.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="grid h-full w-full place-items-center bg-ink-soft text-2xl text-paper-cream">🎬</div>
        )}

        {/* Mood badge (top-left, replaces old top-right) */}
        {movie.mood && movie.mood !== 'Bilinmiyor' && (
          <div className="absolute left-2 top-2">
            <MoodBadge mood={movie.mood} size="sm" />
          </div>
        )}

        {/* Tag stamp top-right (when present, e.g. for "now playing") */}
        {movie.tag && (
          <span
            className={`stamp absolute right-[-6px] top-2 ${
              movie.tag === 'YENİ' ? 'bg-mustard text-ink' :
              movie.tag === 'GURME' ? 'bg-accent text-paper-warm' :
              'bg-olive text-paper-warm'
            }`}
          >
            {movie.tag}
          </span>
        )}
      </div>

      <div className="px-0.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-semibold tracking-tight text-ink leading-snug">
            {movie.title}
          </span>
          {movie.vote_average != null && (
            <span className="whitespace-nowrap text-xs font-medium text-accent">★ {movie.vote_average.toFixed(1)}</span>
          )}
        </div>
        <div className="mt-0.5 text-[11px] text-ink-mute">
          <span>{movie.release_date?.slice(0, 4) || '—'}</span>
        </div>
      </div>
    </button>
  );
}
