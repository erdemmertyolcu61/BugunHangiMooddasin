/**
 * MovieGrid — Hero + horizontal mood shelves + filtered grid view.
 */
import { useState, useEffect, useMemo } from 'react';
import { fetchMovies, fetchNowPlaying } from '../services/api';
import { moodSynth } from '../services/music';
import MovieCard from './MovieCard';
import FilmDetailModal from './FilmDetailModal';
import Loader from './Loader';
import MoodSelector from './MoodSelector';
import Hero from './Hero';
import Shelf from './Shelf';

const MOOD_ORDER = [
  { key: 'Eğlenceli',  color: '#7A8A5C', note: 'kafa dağıtmak için' },
  { key: 'Melankolik', color: '#3B5475', note: 'yağmurlu pazar için' },
  { key: 'Gergin',     color: '#A23E2C', note: 'uyumadan önce risk al' },
  { key: 'Çerezlik',   color: '#C76E2A', note: 'mısırla, telefonla, hafif' },
  { key: 'Ağır Dram',  color: '#2E2820', note: 'sessiz bir izleyici ol' },
  { key: 'Heyecanlı',  color: '#E8B84A', note: 'kalp atışlarını duy' },
];

export default function MovieGrid({ autoMusic }) {
  const [movies, setMovies] = useState([]);
  const [nowPlaying, setNowPlaying] = useState([]);
  const [activeMood, setActiveMood] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedMovie, setSelectedMovie] = useState(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true); setError(null);
      try {
        const [moviesData, nowPlayingData] = await Promise.all([fetchMovies(page), fetchNowPlaying()]);
        setMovies(moviesData.movies);
        setNowPlaying((nowPlayingData.movies || []).map(m => ({ ...m, tag: 'YENİ' })));
        setTotalPages(Math.min(moviesData.total_pages, 500));
      } catch (err) { setError(err.message); }
      finally { setLoading(false); }
    }
    loadData();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [page]);

  useEffect(() => {
    function handleKey(e) { if (e.key === 'Escape') setSelectedMovie(null); }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  // Auto-play music when a movie modal opens
  useEffect(() => {
    if (selectedMovie && autoMusic && selectedMovie.mood && selectedMovie.mood !== 'Bilinmiyor') {
      moodSynth.setMuted(false);
      moodSynth.play(selectedMovie.mood);
    }
  }, [selectedMovie, autoMusic]);

  // Auto-play when a mood filter is selected
  useEffect(() => {
    if (activeMood && autoMusic) {
      moodSynth.setMuted(false);
      moodSynth.play(activeMood);
    }
  }, [activeMood, autoMusic]);

  const heroMovie = useMemo(() => movies[0] || nowPlaying[0], [movies, nowPlaying]);
  const editorsPicks = useMemo(() => movies.slice(1, 9), [movies]);

  const moodShelves = useMemo(() =>
    MOOD_ORDER.map(m => ({ ...m, items: movies.filter(x => x.mood === m.key) })).filter(s => s.items.length > 0),
    [movies]
  );

  if (loading) return <section className="py-10"><Loader /></section>;

  if (error) return (
    <section className="flex flex-col items-center justify-center py-20 text-center">
      <div className="mb-4 text-4xl">🎬</div>
      <p className="font-mono text-lg font-medium text-accent">Bağlantı Hatası</p>
      <p className="mt-1 max-w-xs text-sm text-ink-soft">{error}</p>
      <button onClick={() => setPage(1)} className="mt-6 rounded-full bg-ink px-6 py-2.5 font-mono text-xs font-semibold text-paper-warm hover:opacity-90">
        Tekrar Dene
      </button>
    </section>
  );

  const filtered = activeMood ? movies.filter(m => m.mood === activeMood) : null;

  return (
    <>
      {/* Filter chips */}
      <section className="mb-9 rounded-2xl border border-dashed border-line bg-white/25 px-5 py-4">
        <MoodSelector activeMood={activeMood} onSelect={setActiveMood} />
      </section>

      {activeMood ? (
        // Filtered grid view
        <section>
          <div className="mb-5 flex items-baseline gap-3">
            <span className="font-mono text-[11px] font-semibold tracking-[1.5px] text-accent">QUERY</span>
            <h2 className="font-mono text-xl font-semibold tracking-[-0.3px] text-ink">{activeMood} — {filtered.length} kayıt</h2>
            <div className="dotted-line" />
          </div>
          {filtered.length > 0 ? (
            <div className="grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {filtered.map(m => <MovieCard key={m.id} movie={m} onClick={setSelectedMovie} width={undefined} />)}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-line py-16 text-center">
              <div className="inline-block rotate-[-3deg] rounded border-2 border-accent px-4 py-2 font-mono text-sm font-bold tracking-[2px] text-accent">RAF&nbsp;BOŞ</div>
              <p className="mx-auto mt-4 max-w-xs text-sm text-ink-soft">Bu mod için henüz kayıt yok.</p>
              <button onClick={() => setActiveMood(null)} className="mt-3 font-mono text-xs text-accent hover:underline">Tüm raflara dön</button>
            </div>
          )}
        </section>
      ) : (
        <>
          <Hero movie={heroMovie} onOpen={setSelectedMovie} />

          {nowPlaying.length > 0 && (
            <Shelf catalogNo="RAF / 01" title="Vizyondakiler" count={nowPlaying.length} color="var(--color-accent)">
              {nowPlaying.map(m => <MovieCard key={m.id} movie={m} onClick={setSelectedMovie} />)}
            </Shelf>
          )}

          {editorsPicks.length > 0 && (
            <Shelf catalogNo="RAF / 02" title="Editörün Seçimi · Bu Hafta" count={editorsPicks.length} color="#7A8A5C">
              {editorsPicks.map(m => <MovieCard key={m.id} movie={m} onClick={setSelectedMovie} />)}
            </Shelf>
          )}

          {moodShelves.map((shelf, i) => (
            <Shelf
              key={shelf.key}
              catalogNo={`MOD / ${String(i + 1).padStart(2, '0')}`}
              title={`${shelf.key} — ${shelf.note}`}
              count={shelf.items.length}
              color={shelf.color}
            >
              {shelf.items.map(m => <MovieCard key={m.id} movie={m} onClick={setSelectedMovie} />)}
            </Shelf>
          ))}

          {/* Pagination */}
          <div className="mt-14 flex items-center justify-center gap-3">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-full border border-line bg-white/40 px-5 py-2.5 font-mono text-xs font-semibold text-ink-soft transition-colors hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
            >← Önceki</button>
            <span className="rounded-full border border-line bg-white/40 px-4 py-2.5 font-mono text-xs font-semibold text-accent">
              {page} <span className="font-normal text-ink-mute">/ {totalPages}</span>
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded-full border border-line bg-white/40 px-5 py-2.5 font-mono text-xs font-semibold text-ink-soft transition-colors hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
            >Sonraki →</button>
          </div>
        </>
      )}

      {selectedMovie && (
        <FilmDetailModal
          movieId={selectedMovie.id || selectedMovie.tmdb_id}
          onClose={() => setSelectedMovie(null)}
        />
      )}
    </>
  );
}
