import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  BookMarked, Library, Crown, Eye, Film, PenLine, Feather,
  Trophy, Lock, Check,
} from 'lucide-react';
import { computeMilestones, milestoneSummary } from '../utils/milestones';

const ICONS = { BookMarked, Library, Crown, Eye, Film, PenLine, Feather };

/**
 * Defterim başarım şeridi — açılan rozetler vurgulu, kilitliler ilerleme ile.
 * "Bir sonraki" (en yakın kilitli) öne çıkarılır ("ne kadar yol kaldı").
 */
export default function MilestonesStrip({ stats }) {
  const items = useMemo(() => computeMilestones(stats), [stats]);
  const summary = useMemo(() => milestoneSummary(stats), [stats]);

  // Henüz hiç istatistik yoksa gösterme (boş defter zaten yönlendiriyor).
  if ((stats?.saved || 0) === 0) return null;

  // Bir sonraki hedef: tipine göre en düşük eşikli kilitli başarım.
  const next = items.find((m) => !m.achieved);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="rounded-[2rem] sm:rounded-[3rem] border border-white/[0.08] relative overflow-hidden"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-amber-500/[0.05] via-transparent to-amber-700/[0.02]" />
      <div className="absolute top-0 right-0 w-72 h-72 bg-gradient-to-bl from-amber-500/[0.06] to-transparent blur-[100px] rounded-full pointer-events-none" />

      {/* Header */}
      <div className="relative z-10 px-8 sm:px-12 pt-8 sm:pt-10 pb-6 border-b border-white/[0.05] flex items-center gap-4 sm:gap-5">
        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shadow-[0_4px_24px_rgba(245,158,11,0.25)]">
          <Trophy size={24} className="text-[#120d0b]" />
        </div>
        <div className="flex-1">
          <h2 className="text-xl sm:text-2xl font-serif font-bold tracking-tight text-[#f5f2eb]">Başarımların</h2>
          <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.25em] text-amber/50 mt-0.5">
            {summary.unlocked} / {summary.total} açıldı
          </p>
        </div>
      </div>

      <div className="relative z-10 px-8 sm:px-12 py-8 sm:py-10 space-y-7">
        {/* Bir sonraki hedef — "ne kadar yol kaldı" */}
        {next && (
          <div className="space-y-2.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#f5f2eb]/30">Sıradaki Hedef</p>
            <div className="flex items-center gap-3">
              <span className="text-[13px] font-semibold text-[#f5f2eb]/80 truncate">{next.title}</span>
              <span className="text-[11px] font-bold text-amber/60 tabular-nums shrink-0">
                {next.current} / {next.threshold} {next.label}
              </span>
            </div>
            <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${next.progress * 100}%` }}
                transition={{ duration: 1, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="h-full rounded-full bg-amber/75"
              />
            </div>
          </div>
        )}

        {/* Rozet ızgarası */}
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
          {items.map((m) => {
            const Icon = ICONS[m.icon] || Trophy;
            return (
              <div
                key={m.id}
                title={`${m.title} — ${m.blurb}${m.achieved ? '' : ` (${m.current}/${m.threshold})`}`}
                className={`relative flex flex-col items-center text-center gap-2 p-3 sm:p-4 rounded-2xl border transition-all ${
                  m.achieved
                    ? 'bg-amber-500/[0.08] border-amber/25'
                    : 'bg-white/[0.03] border-white/[0.06] opacity-55'
                }`}
              >
                <div
                  className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shrink-0 ${
                    m.achieved
                      ? 'bg-gradient-to-br from-amber-500 to-amber-700 text-[#120d0b] shadow-[0_2px_12px_rgba(245,158,11,0.3)]'
                      : 'bg-white/[0.05] text-[#f5f2eb]/30'
                  }`}
                >
                  {m.achieved ? <Icon size={20} /> : <Lock size={16} />}
                </div>
                <span className={`text-[10px] sm:text-[11px] font-bold leading-tight ${m.achieved ? 'text-[#f5f2eb]/85' : 'text-[#f5f2eb]/40'}`}>
                  {m.title}
                </span>
                {m.achieved && (
                  <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-emerald-500/90 flex items-center justify-center">
                    <Check size={10} className="text-[#120d0b]" />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
