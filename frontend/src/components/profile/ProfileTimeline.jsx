import React from 'react';
import { motion } from 'framer-motion';
import { proxyImageUrl } from '../../services/api';

const MOOD_DOT_COLORS = {
  battaniye: '#f59e0b', gece: '#94a3b8', gozyasi: '#ec4899',
  askbahcesi: '#f43f5e', kahkaha: '#10b981', adrenalin: '#ef4444',
  yolculuk: '#10b981', zamanyolcusu: '#f59e0b', sessiz: '#a8a29e',
  zihin: '#8b5cf6', kalp: '#ec4899', karmakar: '#f97316',
  sipsak: '#d4af37', 'deep-chills': '#3b82f6',
  'kadraj-estetigi': '#a855f7', 'geceyarisi-itirafi': '#6366f1',
};

const formatDate = (iso) => {
  if (!iso) return '';
  try {
    const d = new Date(String(iso).trim().replace(' ', 'T'));
    if (isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
  } catch { return ''; }
};

const sanitize = (str) =>
  String(str ?? '').replace(/[<>{}$]/g, '').replace(/javascript:/gi, '').trim();

/**
 * Recent watched movies timeline.
 */
export default function ProfileTimeline({ recentWatched = [], topMoods = [] }) {
  if (recentWatched.length === 0) return null;

  return (
    <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-4">

      <p className="font-sans text-[13px] font-bold uppercase tracking-[0.2em] text-amber/50 px-1">
        Son İzlenenler
      </p>

      <div className="relative pl-6">
        <div className="absolute left-[11px] top-0 bottom-0 w-[2px] rounded-full"
          style={{
            background: 'linear-gradient(to bottom, rgba(255,191,0,0.3), rgba(255,191,0,0.05))',
          }} />

        <div className="space-y-1">
          {recentWatched.map((movie) => {
            const moodColor = (topMoods.length > 0 && MOOD_DOT_COLORS[topMoods[0]?.mood_id]) || '#d4af37';
            return (
              <div key={movie.tmdb_id} className="relative flex items-center gap-3 py-2.5">
                <div className="absolute -left-6 w-[6px] h-[6px] rounded-full"
                  style={{
                    backgroundColor: moodColor,
                    boxShadow: `0 0 8px ${moodColor}40`,
                  }} />

                {movie.poster_url && (
                  <div className="w-8 h-12 rounded-lg overflow-hidden shrink-0 bg-white/5">
                    <img src={proxyImageUrl(movie.poster_url)} alt="" className="w-full h-full object-cover" />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <p className="font-serif text-sm font-semibold text-ivory/85 truncate">
                    {sanitize(movie.title)}
                  </p>
                  <p className="font-sans text-[11px] text-ivory/45">
                    {formatDate(movie.added_at)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
