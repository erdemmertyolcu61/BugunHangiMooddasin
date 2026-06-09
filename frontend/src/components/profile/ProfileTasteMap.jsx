import React from 'react';
import { motion } from 'framer-motion';
import { Brain, Clock, Clapperboard, Gauge, Palette, Timer } from 'lucide-react';
import TasteMapCard from '../TasteMapCard';

const MOOD_COLORS = {
  battaniye: '#f59e0b', gece: '#94a3b8', gozyasi: '#ec4899',
  askbahcesi: '#f43f5e', kahkaha: '#10b981', adrenalin: '#ef4444',
  yolculuk: '#10b981', zamanyolcusu: '#f59e0b', sessiz: '#a8a29e',
  zihin: '#8b5cf6', kalp: '#ec4899', karmakar: '#f97316',
  sipsak: '#d4af37', 'deep-chills': '#3b82f6',
  'kadraj-estetigi': '#a855f7', 'geceyarisi-itirafi': '#6366f1',
};

// Backend era_preferences anahtarları (taste_map.py) ile birebir eşleşir.
const ERA_LABELS = {
  pre_1990: '1990 öncesi',
  '1991_2009': '1991 – 2009',
  '2010_plus': '2010 sonrası',
  recent_5_years: 'Son 5 yıl',
};
// Yalnız bu anahtarlar sayısal yüzde — diğerleri (year_range_*, mean_year,
// dynamic_era_*) bar olarak işlenmemeli (aksi halde %NaN sızıyordu).
const ERA_NUMERIC_KEYS = ['pre_1990', '1991_2009', '2010_plus', 'recent_5_years'];

/** Eşlenemeyen anahtarlar için güvenli Türkçeleştirme (ham snake_case sızmasın). */
const humanize = (k) =>
  String(k).replace(/_pct$/, '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function SectionLabel({ icon: Icon, children }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-fg-subtle flex items-center gap-2">
      {Icon && <Icon size={11} className="text-amber/70" />} {children}
    </p>
  );
}

/**
 * Zevk Haritası profil bölümü — moodlar, türler, dönem, tempo/stil/süre, Üstad analizi.
 * İki temaya da uyumlu (semantik token'lar). Props: tasteMap, loading, username, profileUrl.
 */
export default function ProfileTasteMap({ tasteMap, loading = false, username = '', profileUrl = '', hideAnalysis = false }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex gap-2">
          {[0, 1, 2].map(i => (
            <motion.div key={i} className="w-2.5 h-2.5 rounded-full bg-[#d4af37]"
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
        className="p-8 rounded-2xl bg-surface border border-default text-center space-y-3">
        <Brain size={28} className="text-amber/40 mx-auto" />
        <p className="font-serif text-sm italic text-fg-muted leading-relaxed max-w-md mx-auto">
          Zevk haritan henüz oluşuyor. Birkaç filmi defterine ekledikçe, not yazdıkça seni daha iyi tanıyacağız.
        </p>
      </motion.div>
    );
  }

  // Safety normalize mood_pct to sum to 100
  const rawMoodPct = tasteMap.mood_pct || {};
  const rawTotal = Object.values(rawMoodPct).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0);
  const normalizedMoodPct = rawTotal > 0
    ? Object.fromEntries(Object.entries(rawMoodPct).map(([k, v]) => [k, (v / rawTotal) * 100]))
    : rawMoodPct;

  const moodPctEntries = Object.keys(normalizedMoodPct).length > 0 ? Object.entries(normalizedMoodPct).slice(0, 5) : [];
  const topGenres = tasteMap.top_genres || [];
  const eraPref = tasteMap.era_preferences || {};
  const pacing = tasteMap.pacing_profile || {};
  const style = tasteMap.style_profile || {};
  const runtime = tasteMap.runtime_profile || {};

  const eraBars = ERA_NUMERIC_KEYS
    .filter((k) => typeof eraPref[k] === 'number' && eraPref[k] > 0)
    .map((k) => [k, eraPref[k]])
    .sort(([, a], [, b]) => b - a);

  // Safety normalize era bars to sum to 100 (backend should already normalize)
  if (eraBars.length > 0) {
    const eraTotal = eraBars.reduce((s, [, v]) => s + v, 0);
    if (eraTotal > 0 && eraTotal > 100.5) {
      eraBars.forEach(e => { e[1] = (e[1] / eraTotal) * 100; });
    }
  }

  const indiePct = Number(style.indie_pct) || 0;
  const mainPct = Number(style.mainstream_pct) || 0;
  const hasStyleSplit = indiePct > 0 || mainPct > 0;

  return (
    <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-6">

      {/* Section title */}
      <div className="flex items-center gap-2.5 px-1">
        <Brain size={15} className="text-amber/70" />
        <p className="font-sans text-[13px] font-bold uppercase tracking-[0.25em] text-amber/70">
          Zevk Haritam
        </p>
      </div>

      <div className="rounded-[2rem] border border-default bg-surface/60 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/[0.05] via-transparent to-purple-600/[0.03] pointer-events-none" />
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-amber-500/[0.07] to-transparent blur-[60px] sm:blur-[120px] rounded-full pointer-events-none" />

        <div className="relative z-10 p-5 sm:p-8 space-y-9">

          {/* ─── Dynamic title ─── */}
          {tasteMap.dynamic_title && (
            <div>
              <p className="text-2xl sm:text-3xl font-serif font-bold text-amber tracking-tight leading-snug">
                {tasteMap.dynamic_title}
              </p>
              <div className="w-16 h-[2px] bg-gradient-to-r from-amber/70 to-transparent mt-3 rounded-full" />
            </div>
          )}

          {/* ─── Mood DNA chips ─── */}
          {tasteMap.top_moods?.length > 0 && (
            <div className="space-y-3.5">
              <SectionLabel icon={Clapperboard}>Sinema DNA'n</SectionLabel>
              <div className="flex flex-wrap gap-2.5">
                {tasteMap.top_moods.slice(0, 5).map(m => {
                  const dotColor = MOOD_COLORS[m.mood_id] || '#d4af37';
                  const pct = normalizedMoodPct[m.mood_id];
                  return (
                    <span key={m.mood_id}
                      className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full
                        bg-surface-2 border border-default text-[13px] font-semibold text-fg transition-all hover:border-amber/40">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: dotColor, boxShadow: `0 0 8px ${dotColor}55` }} />
                      {m.title}
                      {pct != null && (
                        <span className="text-[11px] font-bold text-fg-subtle ml-0.5">%{Math.round(pct)}</span>
                      )}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* ─── Mood distribution bars ─── */}
          {moodPctEntries.length > 0 && (
            <div className="space-y-3">
              {moodPctEntries.map(([mid, pct]) => {
                const moodObj = tasteMap.top_moods?.find(m => m.mood_id === mid);
                const label = moodObj?.title || humanize(mid);
                const barColor = MOOD_COLORS[mid] || '#d4af37';
                return (
                  <div key={mid} className="flex items-center gap-3">
                    <span className="text-[12px] font-semibold text-fg-muted w-28 sm:w-32 shrink-0 min-w-0">{label}</span>
                    <div className="flex-1 h-2 rounded-full bg-fg-subtle/15 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(pct, 100)}%` }}
                        transition={{ duration: 1, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
                        className="h-full rounded-full"
                        style={{ backgroundColor: barColor }}
                      />
                    </div>
                    <span className="text-[12px] font-bold text-fg-subtle w-10 text-right tabular-nums">%{Math.round(pct)}</span>
                  </div>
                );
              })}
            </div>
          )}

          <div className="h-px bg-gradient-to-r from-transparent via-border-default to-transparent" />

          {/* ─── Favori türler ─── */}
          {topGenres.length > 0 && (
            <div className="space-y-3.5">
              <SectionLabel icon={Clapperboard}>Favori Türler</SectionLabel>
              <div className="flex flex-wrap gap-2">
                {topGenres.slice(0, 6).map((g, i) => {
                  const name = g.name || g.genre_name;
                  if (!name) return null;
                  return (
                    <span key={g.genre_id || i}
                      className="px-3.5 py-1.5 rounded-full bg-surface-2 border border-default text-[12px] font-semibold text-fg-muted">
                      {name}
                      {g.count != null && <span className="text-fg-subtle ml-1.5">{g.count}</span>}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* ─── Dönem tercihleri ─── */}
          {(eraBars.length > 0 || eraPref.dynamic_era_label) && (
            <div className="space-y-3.5">
              <SectionLabel icon={Clock}>Dönem Tercihleri</SectionLabel>
              {eraPref.dynamic_era_label && (
                <div className="rounded-2xl bg-surface-2 border border-default px-4 py-3">
                  <p className="text-[14px] font-serif font-bold text-fg">{eraPref.dynamic_era_label}</p>
                  {eraPref.dynamic_era_desc && (
                    <p className="text-[12px] text-fg-muted leading-relaxed mt-0.5">{eraPref.dynamic_era_desc}</p>
                  )}
                </div>
              )}
              {eraBars.length > 0 && (
                <div className="space-y-2">
                  {eraBars.map(([era, pct]) => (
                    <div key={era} className="flex items-center gap-3">
                      <span className="text-[12px] font-semibold text-fg-muted w-24 sm:w-28 shrink-0 min-w-0">{ERA_LABELS[era] || humanize(era)}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-fg-subtle/15 overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }} animate={{ width: `${Math.min(pct, 100)}%` }}
                          transition={{ duration: 0.8, delay: 0.5 }}
                          className="h-full rounded-full bg-amber/60" />
                      </div>
                      <span className="text-[11px] font-bold text-fg-subtle w-10 text-right tabular-nums">%{Math.round(pct)}</span>
                    </div>
                  ))}
                </div>
              )}
              {eraPref.year_range_min != null && eraPref.year_range_max != null && (
                <div className="flex items-center gap-2 text-[11px] text-fg-subtle font-mono pt-0.5">
                  <span>{eraPref.year_range_min}</span>
                  <span className="opacity-50">—</span>
                  <span>{eraPref.year_range_max}</span>
                  {eraPref.mean_year != null && <span className="ml-auto">ortalama {Math.round(eraPref.mean_year)}</span>}
                </div>
              )}
            </div>
          )}

          {/* ─── İmza: Tempo · Stil · Süre ─── */}
          {(pacing.label || style.label || runtime.label) && (
            <div className="space-y-3.5">
              <SectionLabel icon={Palette}>İmzan</SectionLabel>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Tempo */}
                {pacing.label && (
                  <div className="p-4 rounded-2xl bg-surface-2 border border-default space-y-2">
                    <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-amber/60 flex items-center gap-1.5">
                      <Gauge size={11} /> Tempo
                    </p>
                    <p className="text-[13px] font-bold text-fg leading-snug">{pacing.label}</p>
                    {pacing.description && <p className="text-[11px] text-fg-muted leading-relaxed">{pacing.description}</p>}
                  </div>
                )}
                {/* Stil */}
                {(style.label || hasStyleSplit) && (
                  <div className="p-4 rounded-2xl bg-surface-2 border border-default space-y-2.5">
                    <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-amber/60 flex items-center gap-1.5">
                      <Palette size={11} /> Stil
                    </p>
                    {style.label && <p className="text-[13px] font-bold text-fg leading-snug">{style.label}</p>}
                    {hasStyleSplit && (
                      <div className="space-y-1.5">
                        <div className="h-2 rounded-full overflow-hidden flex bg-fg-subtle/15">
                          <div className="h-full bg-amber/70" style={{ width: `${mainPct}%` }} />
                          <div className="h-full bg-purple-400/60" style={{ width: `${indiePct}%` }} />
                        </div>
                        <div className="flex items-center justify-between text-[11px] font-semibold text-fg-subtle">
                          <span>Ana akım %{mainPct}</span>
                          <span>Bağımsız %{indiePct}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {/* Süre */}
                {runtime.label && (
                  <div className="p-4 rounded-2xl bg-surface-2 border border-default space-y-2">
                    <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-amber/60 flex items-center gap-1.5">
                      <Timer size={11} /> Süre
                    </p>
                    <p className="text-[13px] font-bold text-fg leading-snug">{runtime.label}</p>
                    {runtime.avg_minutes != null && (
                      <p className="text-[11px] text-fg-muted">Ortalama <span className="text-fg font-semibold">{Math.round(runtime.avg_minutes)} dk</span></p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── Üstad'ın Analizi ─── */}
          {!hideAnalysis && tasteMap.summary?.length > 0 && (
            <div className="space-y-4">
              <div className="h-px bg-gradient-to-r from-transparent via-border-default to-transparent" />
              <SectionLabel icon={Brain}>Üstad'ın Analizi</SectionLabel>
              <div className="space-y-4 pl-4 border-l-2 border-amber/25">
                {tasteMap.summary.slice(0, 5).map((s, i) => (
                  <motion.p key={i}
                    initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 + i * 0.1 }}
                    className="text-[15px] sm:text-[16px] font-serif italic text-fg/90 leading-[1.75]">
                    &ldquo;{s}&rdquo;
                  </motion.p>
                ))}
              </div>
            </div>
          )}

          {/* ─── Confidence + total ─── */}
          <div className="flex items-center gap-3 flex-wrap pt-1">
            <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-[11px] font-bold uppercase tracking-[0.15em] ${
              tasteMap.confidence === 'high'
                ? 'bg-emerald-500/12 text-emerald-400 border border-emerald-500/25'
                : 'bg-amber/12 text-amber border border-amber/25'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${tasteMap.confidence === 'high' ? 'bg-emerald-400' : 'bg-amber'}`} />
              {tasteMap.confidence === 'high' ? 'Olgunlaştı' : 'Oluşuyor'}
            </span>
            <span className="text-[11px] font-bold text-fg-subtle uppercase tracking-wider">
              {tasteMap.signals?.total_movies || 0} film sinyali
            </span>
          </div>

          {/* ─── Share card ─── */}
          {!hideAnalysis && (
            <div className="pt-2">
              <TasteMapCard tasteMap={tasteMap} username={username} profileUrl={profileUrl} />
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
