/**
 * MovieModal — paper-tone detail card with vinyl catalog feel.
 */
import { useState, useEffect } from 'react';
import { analyzeMovie } from '../services/api';
import MoodBadge from './MoodBadge';

export default function MovieModal({ movie, onClose }) {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!movie) return;
    async function fetchA() {
      setLoading(true); setError(null);
      try { setAnalysis(await analyzeMovie(movie.id)); }
      catch (err) { setError(err.message); }
      finally { setLoading(false); }
    }
    fetchA();
  }, [movie]);

  if (!movie) return null;
  const data = analysis || movie;

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-ink/55 p-6 backdrop-blur-[8px] animate-fade-in" onClick={onClose}>
      <div
        className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-ink bg-paper-cream shadow-[0_30px_80px_rgba(0,0,0,0.4)] animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute right-4 top-4 z-10 grid h-8 w-8 place-items-center rounded-full bg-ink text-sm text-paper-warm hover:scale-105">✕</button>

        <div className="grid gap-8 p-8 md:grid-cols-[260px_1fr]">
          <div className="sleeve aspect-[2/3] w-[260px] overflow-hidden rounded">
            {data.poster_url ? (
              <img src={data.poster_url} alt={data.title} className="h-full w-full object-cover" />
            ) : (
              <div className="grid h-full w-full place-items-center bg-ink-soft text-4xl text-paper-cream">🎬</div>
            )}
          </div>

          <div>
            <div className="mb-1.5 font-mono text-[10px] font-semibold tracking-[1.5px] text-accent">
              KAT / {String(movie.id).padStart(5, '0')} · KAYIT
            </div>
            <h2 className="mb-2 font-mono text-[32px] font-semibold leading-[1.1] tracking-[-1px] text-ink">{data.title}</h2>
            <div className="mb-5 flex flex-wrap items-center gap-2 font-mono text-[11px] text-ink-mute">
              {data.release_date && <span>{data.release_date.slice(0, 4)}</span>}
              {data.runtime && <><span>·</span><span>{data.runtime} dk</span></>}
              {data.director && <><span>·</span><span>{data.director}</span></>}
            </div>

            {loading && (
              <div className="flex flex-col items-center gap-3 py-8">
                <div className="h-7 w-7 animate-spin rounded-full border-2 border-line border-t-accent" />
                <p className="font-mono text-xs tracking-[0.5px] text-ink-mute">GURME ANALİZ EDİYOR…</p>
              </div>
            )}

            {error && (
              <div className="rounded border border-accent/40 bg-accent/10 p-3 font-mono text-xs text-accent">{error}</div>
            )}

            {!loading && (
              <div className="mt-2">
                <div className="mb-2 font-mono text-[10px] tracking-[1.5px] text-ink-mute">GURMENİN YORUMU</div>
                <p className="border-l-2 border-accent bg-accent/5 px-4 py-3.5 text-sm italic leading-relaxed text-ink-soft">
                  {data.ai_analysis
                    ? `"${data.ai_analysis}"`
                    : `"Üstad bu başyapıt için notlarını hazırlıyor... Birazdan burada olacak."`}
                </p>
              </div>
            )}

            {data.mood && data.mood !== 'Bilinmiyor' && (
              <div className="mt-5">
                <div className="mb-2 font-mono text-[10px] tracking-[1.5px] text-ink-mute">MOD</div>
                <MoodBadge mood={data.mood} size="lg" />
              </div>
            )}

            {data.genres?.length > 0 && (
              <div className="mt-5">
                <div className="mb-2 font-mono text-[10px] tracking-[1.5px] text-ink-mute">TÜR</div>
                <div className="flex flex-wrap gap-2">
                  {data.genres.map(g => (
                    <span key={g} className="rounded border border-line px-2.5 py-1 font-mono text-[11px] text-ink-soft">{g}</span>
                  ))}
                </div>
              </div>
            )}

            {!loading && (data.imdb_rating || data.rotten_tomatoes || data.metacritic) && (
              <div className="mt-5 grid grid-cols-3 gap-3 border-t border-dashed border-line pt-4">
                {data.imdb_rating && <RatingBlock num={data.imdb_rating} label="IMDb / 10" />}
                {data.rotten_tomatoes && <RatingBlock num={data.rotten_tomatoes} label="ROTTEN TOMATOES" />}
                {data.metacritic && <RatingBlock num={data.metacritic} label="METACRITIC / 100" />}
              </div>
            )}

            {!loading && data.cast?.length > 0 && (
              <div className="mt-5">
                <div className="mb-2 font-mono text-[10px] tracking-[1.5px] text-ink-mute">OYUNCULAR</div>
                <div className="flex flex-wrap gap-2">
                  {data.cast.map(actor => (
                    <div key={actor.name} className="flex items-center gap-2 rounded border border-line bg-white/30 px-2.5 py-1.5">
                      {actor.profile_path ? (
                        <img src={actor.profile_path} alt={actor.name} className="h-7 w-7 rounded-full object-cover" />
                      ) : (
                        <div className="grid h-7 w-7 place-items-center rounded-full bg-ink-soft text-xs text-paper-cream">{actor.name.charAt(0)}</div>
                      )}
                      <div className="font-mono text-[11px] text-ink">{actor.name}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!loading && data.awards && data.awards !== 'N/A' && (
              <div className="mt-4 flex items-center gap-2 rounded border border-line bg-white/30 px-3 py-2 font-mono text-[11px] text-ink-soft">
                <span className="text-accent">🏆</span> {data.awards}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function RatingBlock({ num, label }) {
  return (
    <div className="text-center">
      <div className="font-mono text-[26px] font-semibold text-ink">{num}</div>
      <div className="mt-0.5 font-mono text-[9px] tracking-[1.2px] text-ink-mute">{label}</div>
    </div>
  );
}
