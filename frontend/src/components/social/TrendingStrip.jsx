import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Flame } from 'lucide-react';
import { getTrending, proxyImageUrl } from '../../services/api';
import { resolveAvatarUrl } from '../../utils/apiConfig';
import FilmDetailModal from '../FilmDetailModal';
import { track } from '../../utils/analytics';

/**
 * "Bu Hafta Toplulukta" — topluluk aktivitesinden türetilen trend şeridi.
 * Login GEREKTIRMEZ: yeni/anonim kullanıcının akışı boş kalmasın diye
 * her zaman içerik gösterir (soğuk başlangıç çözümü).
 */
export default function TrendingStrip({ title = 'Bu Hafta Toplulukta' }) {
  const [movies, setMovies] = useState(null);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const data = await getTrending(12);
      if (alive) setMovies(data.movies || []);
    })();
    return () => { alive = false; };
  }, []);

  if (movies === null) {
    return (
      <section>
        <Header title={title} />
        <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar -mx-2 px-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="shrink-0 w-[104px] sm:w-[120px]">
              <div className="aspect-[2/3] rounded-2xl bg-white/5 animate-pulse" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (movies.length === 0) return null;

  return (
    <section>
      <Header title={title} />
      <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar -mx-2 px-2">
        {movies.map((m, i) => (
          <motion.button
            key={m.id}
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            onClick={() => { track('trending_click', { movie_id: m.id }); setSelected(m); }}
            className="shrink-0 w-[104px] sm:w-[120px] text-left group"
          >
            <div className="relative aspect-[2/3] rounded-2xl overflow-hidden bg-white/5 border border-white/[0.06] group-hover:border-amber/30 transition-all">
              <img src={proxyImageUrl(m.poster_url)} alt={m.title}
                className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-500"
                loading="lazy" />
              {/* Önerici avatarları — sosyal kanıt */}
              {m.recommenders?.length > 0 && (
                <div className="absolute bottom-1.5 left-1.5 flex -space-x-2">
                  {m.recommenders.slice(0, 3).map((r, j) => (
                    <span key={j} className="w-5 h-5 rounded-full overflow-hidden border border-black/60 bg-[#1a1310]">
                      {r.avatar
                        ? <img src={resolveAvatarUrl(r.avatar)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        : <span className="w-full h-full flex items-center justify-center text-[8px] font-bold text-amber/80">{(r.username || '?')[0].toUpperCase()}</span>}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <p className="mt-1.5 text-[11px] font-serif font-semibold text-ivory/80 truncate group-hover:text-amber/90 transition-colors">
              {m.title}
            </p>
          </motion.button>
        ))}
      </div>

      {selected && (
        <FilmDetailModal
          movieId={selected.id}
          initialMovie={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  );
}

function Header({ title }) {
  return (
    <div className="flex items-center gap-2.5 px-1 mb-3">
      <p className="font-sans text-[11px] font-bold uppercase tracking-[0.25em] text-amber/50">{title}</p>
    </div>
  );
}
