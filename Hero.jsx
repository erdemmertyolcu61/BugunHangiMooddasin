/**
 * Hero — weekly editor's pick spotlight.
 */
import MoodBadge from './MoodBadge';

export default function Hero({ movie, onOpen }) {
  if (!movie) return null;
  const today = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <section className="relative mb-12 overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-white/45 to-white/15 p-8">
      <div className="grid items-center gap-10 md:grid-cols-[280px_1fr]">
        <div
          onClick={() => onOpen(movie)}
          className="sleeve relative aspect-[2/3] w-[280px] cursor-pointer overflow-hidden rounded-[4px] transition-transform hover:-translate-y-1"
          style={{ transform: 'rotate(-1.5deg)' }}
        >
          {movie.poster_url ? (
            <img src={movie.poster_url} alt={movie.title} className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full w-full place-items-center bg-ink-soft text-4xl text-paper-cream">🎬</div>
          )}
          <span className="stamp absolute right-[-10px] top-3 bg-accent text-paper-warm" style={{ transform: 'rotate(-8deg)' }}>
            HAFTANIN<br/>SEÇİMİ
          </span>
        </div>

        <div>
          <div className="mb-3.5 flex items-center gap-3 font-mono text-[10px] tracking-[1.2px] text-ink-mute">
            <span className="font-semibold text-accent">PICK / 26-W19</span>
            <span className="h-px w-14 border-t border-dashed border-ink-mute" />
            <span>{today}</span>
          </div>

          <h1 className="mb-3.5 font-mono text-[clamp(36px,5vw,58px)] font-semibold leading-[1.05] tracking-[-1.5px] text-ink text-pretty">
            {movie.title}
          </h1>

          <div className="mb-4 flex flex-wrap items-center gap-2 font-mono text-[11px] tracking-[0.3px] text-ink-soft">
            {movie.release_date && <span>{movie.release_date.slice(0, 4)}</span>}
            {movie.runtime && <><span className="text-[6px] text-ink-mute">●</span><span>{movie.runtime} dk</span></>}
            {movie.director && <><span className="text-[6px] text-ink-mute">●</span><span>{movie.director}</span></>}
            {movie.genres?.length > 0 && <><span className="text-[6px] text-ink-mute">●</span><span>{movie.genres.join(' / ')}</span></>}
          </div>

          {movie.overview && (
            <p className="mb-5 max-w-[560px] text-[15px] italic leading-relaxed text-ink-soft">{movie.overview}</p>
          )}

          {movie.mood && movie.mood !== 'Bilinmiyor' && (
            <div className="mb-6"><MoodBadge mood={movie.mood} size="lg" /></div>
          )}

          <div className="flex flex-wrap items-center gap-3.5">
            <button
              onClick={() => onOpen(movie)}
              className="rounded-full bg-ink px-5 py-2.5 font-mono text-xs font-semibold tracking-[0.5px] text-paper-warm transition-transform hover:-translate-y-0.5 hover:shadow-[0_4px_0_var(--color-accent)]"
            >
              İncele →
            </button>
            <button className="rounded-full border border-line px-4 py-2.5 font-mono text-[11px] tracking-[0.5px] text-ink-soft hover:border-ink hover:text-ink">
              İzleme listesine ekle
            </button>
            {movie.vote_average != null && (
              <div className="ml-auto flex items-baseline gap-1 font-mono">
                <span className="text-3xl font-semibold text-accent">{movie.vote_average.toFixed(1)}</span>
                <span className="text-xs text-ink-mute">/ 10</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
