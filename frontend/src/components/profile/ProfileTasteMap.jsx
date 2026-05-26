import React from 'react';
import { motion } from 'framer-motion';
import { Brain, Sparkles, Film, Clock, Clapperboard } from 'lucide-react';
import TasteMapCard from '../TasteMapCard';

const MOOD_COLORS = {
  battaniye: '#f59e0b', gece: '#94a3b8', gozyasi: '#ec4899',
  askbahcesi: '#f43f5e', kahkaha: '#10b981', adrenalin: '#ef4444',
  yolculuk: '#10b981', zamanyolcusu: '#f59e0b', sessiz: '#a8a29e',
  zihin: '#8b5cf6', kalp: '#ec4899', karmakar: '#f97316',
  sipsak: '#d4af37', 'deep-chills': '#3b82f6',
  'kadraj-estetigi': '#a855f7', 'geceyarisi-itirafi': '#6366f1',
};

const ERA_LABELS = {
  '2010_plus': '2010+',
  '2000s': "2000'ler",
  '1990s': "1990'lar", '1980s': "1980'ler",
  '1970s': "1970'ler", '1960s': "1960'lar", '1950s': "1950'ler",
};
const YEAR_STAT_KEYS = new Set(['year_range_min', 'year_range_max', 'mean_year']);

const PROFILE_SKIP = new Set(['label', 'description']);

const PROFILE_LABELS = {
  slow_pct: 'Yavaş', medium_pct: 'Orta', fast_pct: 'Hızlı',
  mainstream_pct: 'Ana Akım', indie_pct: 'Bağımsız',
  avg_minutes: 'Ort. Süre',
};

/**
 * Full taste map profile section — moods, genres, era, pacing, style, runtime.
 *
 * Props:
 *  - tasteMap: full backend response (top_moods, mood_pct, top_genres, era_preferences, pacing_profile, style_profile, runtime_profile, summary, confidence, signals)
 *  - loading: boolean
 *  - username: string (for share card)
 */
export default function ProfileTasteMap({ tasteMap, loading = false, username = '' }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex gap-2">
          {[0, 1, 2].map(i => (
            <motion.div key={i} className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#d4af37' }}
              animate={{ opacity: [0.2, 1, 0.2] }}
              transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.25 }} />
          ))}
        </div>
      </div>
    );
  }

  if (!tasteMap || tasteMap.confidence === 'low') {
    return (
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.15 }}
        className="p-8 rounded-2xl bg-[#1c1512]/90 border border-white/[0.06] text-center space-y-3">
        <Brain size={28} className="text-amber/30 mx-auto" />
        <p className="font-serif text-sm italic text-ivory/60 leading-relaxed max-w-md mx-auto">
          Zevk haritan henüz oluşuyor. Birkaç filmi defterine ekledikçe, not yazdıkça seni daha iyi tanıyacağız.
        </p>
      </motion.div>
    );
  }

  const moodPctEntries = tasteMap.mood_pct ? Object.entries(tasteMap.mood_pct).slice(0, 5) : [];
  const topGenres = tasteMap.top_genres || [];
  const eraPref = tasteMap.era_preferences || {};
  const pacingProfile = tasteMap.pacing_profile || {};
  const styleProfile = tasteMap.style_profile || {};
  const runtimeProfile = tasteMap.runtime_profile || {};

  return (
    <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-6">

      {/* Section title */}
      <div className="flex items-center gap-2.5 px-1">
        <Brain size={15} className="text-amber/60" />
        <p className="font-sans text-[13px] font-bold uppercase tracking-[0.25em] text-amber/60">
          Zevk Haritam
        </p>
      </div>

      <div className="rounded-[2rem] border border-white/[0.08] relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/[0.04] via-transparent to-purple-600/[0.03]" />
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-amber-500/[0.06] to-transparent blur-[120px] rounded-full pointer-events-none" />

        <div className="relative z-10 p-6 sm:p-8 space-y-8">

          {/* Dynamic title */}
          {tasteMap.dynamic_title && (
            <div>
              <p className="text-2xl sm:text-3xl font-serif font-bold text-amber tracking-tight leading-snug">
                {tasteMap.dynamic_title}
              </p>
              <div className="w-16 h-[2px] bg-gradient-to-r from-amber/60 to-transparent mt-3 rounded-full" />
            </div>
          )}

          {/* ─── Mood Chips ─── */}
          {tasteMap.top_moods?.length > 0 && (
            <div className="space-y-3 text-center">
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-ivory/30">Sinema DNA'n</p>
              <div className="flex flex-wrap gap-2.5 justify-center">
                {tasteMap.top_moods.slice(0, 5).map(m => {
                  const dotColor = MOOD_COLORS[m.mood_id] || '#d4af37';
                  const pct = tasteMap.mood_pct?.[m.mood_id];
                  return (
                    <span key={m.mood_id}
                      className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full
                        bg-white/[0.06] border border-white/[0.08] backdrop-blur-sm
                        text-[13px] font-semibold text-ivory/80 transition-all hover:border-white/15">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
                        style={{ backgroundColor: dotColor, boxShadow: `0 0 8px ${dotColor}40` }} />
                      {m.title}
                      {pct != null && (
                        <span className="text-[11px] font-bold text-ivory/40 ml-0.5">%{Math.round(pct)}</span>
                      )}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* ─── Mood Distribution Bars ─── */}
          {moodPctEntries.length > 0 && (
            <div className="space-y-2.5">
              {moodPctEntries.map(([mid, pct]) => {
                const moodObj = tasteMap.top_moods?.find(m => m.mood_id === mid);
                const label = moodObj?.title || mid.replace('-', ' ');
                const barColor = MOOD_COLORS[mid] || '#d4af37';
                return (
                  <div key={mid} className="flex items-center gap-3">
                    <span className="text-[12px] font-semibold text-ivory/60 w-28 truncate capitalize">{label}</span>
                    <div className="flex-1 h-2 rounded-full bg-white/[0.06] overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(pct, 100)}%` }}
                        transition={{ duration: 1, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
                        className="h-full rounded-full"
                        style={{ backgroundColor: barColor, opacity: 0.75 }}
                      />
                    </div>
                    <span className="text-[12px] font-bold text-ivory/50 w-10 text-right tabular-nums">%{Math.round(pct)}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* ─── Divider ─── */}
          <div className="h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />

          {/* ─── Top Genres ─── */}
          {topGenres.length > 0 && (
            <div className="space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-ivory/30 flex items-center gap-2">
                <Clapperboard size={11} /> Favori Türler
              </p>
              <div className="flex flex-wrap gap-2">
                {topGenres.slice(0, 6).map((g, i) => (
                  <span key={g.genre_id || i}
                    className="px-3.5 py-1.5 rounded-full bg-white/[0.05] border border-white/[0.08] text-[12px] font-semibold text-ivory/70">
                    {g.name || g.genre_name || `Tür #${g.genre_id}`}
                    {g.count != null && <span className="text-ivory/35 ml-1.5">({g.count})</span>}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ─── Era Preferences ─── */}
          {Object.keys(eraPref).length > 0 && (
            <div className="space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-ivory/30 flex items-center gap-2">
                <Clock size={11} /> Dönem Tercihleri
              </p>
              <div className="space-y-2">
                {Object.entries(eraPref)
                  .filter(([k]) => !YEAR_STAT_KEYS.has(k))
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 4)
                  .map(([era, pct]) => (
                    <div key={era} className="flex items-center gap-3">
                      <span className="text-[12px] font-semibold text-ivory/60 w-20">{ERA_LABELS[era] || era.replace('_', ' ')}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(pct, 100)}%` }}
                          transition={{ duration: 0.8, delay: 0.5 }}
                          className="h-full rounded-full bg-amber/50"
                        />
                      </div>
                      <span className="text-[11px] font-bold text-ivory/40 w-10 text-right">%{Math.round(pct)}</span>
                    </div>
                  ))}
                {eraPref.year_range_min != null && eraPref.year_range_max != null && (
                  <div className="flex items-center gap-2 pt-1 text-[11px] text-ivory/50 font-mono">
                    <span>{eraPref.year_range_min}</span>
                    <span className="text-ivory/20">—</span>
                    <span>{eraPref.year_range_max}</span>
                    {eraPref.mean_year != null && (
                      <span className="text-ivory/35 ml-auto">ort. {Math.round(eraPref.mean_year)}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── Pacing + Style + Runtime in a compact grid ─── */}
          {(Object.keys(pacingProfile).length > 0 || Object.keys(styleProfile).length > 0 || Object.keys(runtimeProfile).length > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Pacing */}
              {Object.keys(pacingProfile).length > 0 && (
                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] space-y-2">
                  <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-amber/40">Tempo</p>
                  {Object.entries(pacingProfile)
                    .filter(([k]) => !PROFILE_SKIP.has(k))
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 3)
                    .map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between">
                        <span className="text-[11px] text-ivory/60">{PROFILE_LABELS[k] || k.replace('_pct', '').replace('_', ' ')}</span>
                        <span className="text-[11px] font-bold text-ivory/40">%{Math.round(v)}</span>
                      </div>
                    ))}
                </div>
              )}

              {/* Style */}
              {Object.keys(styleProfile).length > 0 && (
                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] space-y-2">
                  <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-amber/40">Stil</p>
                  {Object.entries(styleProfile)
                    .filter(([k]) => !PROFILE_SKIP.has(k))
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 3)
                    .map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between">
                        <span className="text-[11px] text-ivory/60">{PROFILE_LABELS[k] || k.replace('_pct', '').replace('_', ' ')}</span>
                        <span className="text-[11px] font-bold text-ivory/40">%{Math.round(v)}</span>
                      </div>
                    ))}
                </div>
              )}

              {/* Runtime */}
              {Object.keys(runtimeProfile).length > 0 && (
                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] space-y-2">
                  <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-amber/40">Süre</p>
                  {Object.entries(runtimeProfile)
                    .filter(([k]) => !PROFILE_SKIP.has(k))
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 3)
                    .map(([k, v]) => {
                      const isMinutes = k === 'avg_minutes';
                      return (
                        <div key={k} className="flex items-center justify-between">
                          <span className="text-[11px] text-ivory/60">{PROFILE_LABELS[k] || k.replace('_pct', '').replace('_', ' ')}</span>
                          <span className="text-[11px] font-bold text-ivory/40">
                            {isMinutes ? `${Math.round(v)} dk` : `%${Math.round(v)}`}
                          </span>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          )}

          {/* ─── Üstad'ın Analizi ─── */}
          {tasteMap.summary?.length > 0 && (
            <div className="space-y-4">
              <div className="h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-amber/40 flex items-center gap-2">
                <Sparkles size={11} /> Üstad'ın Analizi
              </p>
              <div className="space-y-4 pl-4 border-l-2 border-amber/15">
                {tasteMap.summary.slice(0, 5).map((s, i) => (
                  <motion.p
                    key={i}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 + i * 0.1 }}
                    className="text-[15px] sm:text-[16px] font-serif italic text-ivory/80 leading-[1.75] tracking-wide"
                  >
                    &ldquo;{s}&rdquo;
                  </motion.p>
                ))}
              </div>
            </div>
          )}

          {/* ─── Confidence + Total ─── */}
          <div className="flex items-center gap-3 sm:gap-4 flex-wrap pt-2">
            <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-[11px] font-bold uppercase tracking-[0.15em] ${
              tasteMap.confidence === 'high'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : tasteMap.confidence === 'medium'
                ? 'bg-amber/10 text-amber border border-amber/20'
                : 'bg-white/5 text-ivory/30 border border-white/[0.06]'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${
                tasteMap.confidence === 'high' ? 'bg-emerald-400' :
                tasteMap.confidence === 'medium' ? 'bg-amber' : 'bg-white/30'
              }`} />
              {tasteMap.confidence === 'high' ? 'Oluştu' :
               tasteMap.confidence === 'medium' ? 'Oluşuyor' : 'Başlangıç'}
            </span>
            <span className="text-[11px] font-bold text-ivory/25 uppercase tracking-wider">
              {tasteMap.signals?.total_movies || 0} film sinyali
            </span>
          </div>

          {/* ─── Share Card ─── */}
          <div className="pt-4">
            <TasteMapCard tasteMap={tasteMap} username={username} />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
