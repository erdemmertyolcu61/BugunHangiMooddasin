import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { CalendarRange, Flame, Film, Trophy, BookMarked, Share2 } from 'lucide-react';
import { computeWeeklyReport, weeklyReportShareText } from '../utils/weeklyReport';
import { proxyImageUrl } from '../services/api';
import { getApiUrl } from '../utils/apiConfig';
import { track } from '../utils/analytics';

/**
 * "Bu Hafta" haftalık ilerleme kartı (Profil > Başarımlar üstünde).
 * Tema-bağımsız: bg-[#1c1512]/text-[#f5f2eb]/text-amber token'ları index.css
 * light override ile otomatik açık temaya uyar.
 */
export default function WeeklyReportCard({ movies, topMood }) {
  const report = useMemo(() => computeWeeklyReport(movies || [], { topMood }), [movies, topMood]);

  const handleShare = async () => {
    const text = weeklyReportShareText(report);
    const url = getApiUrl('/');
    track('weekly_report_share');
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Sinemood — Haftalık Karnem', text, url });
      } else {
        await navigator.clipboard.writeText(`${text} ${url}`);
      }
    } catch { /* iptal/sessiz */ }
  };

  const metrics = [
    { icon: BookMarked, label: 'Bu hafta', value: report.savedCount, accent: true },
    { icon: Flame, label: 'Seri', value: report.streak ? `${report.streak} gün` : '—' },
    { icon: Film, label: 'İzlenen', value: report.watchedTotal },
    { icon: Trophy, label: 'Başarım', value: `${report.milestones.unlocked}/${report.milestones.total}` },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-[2rem] sm:rounded-[3rem] border border-white/[0.08] relative overflow-hidden"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-purple-600/[0.05] via-transparent to-amber-500/[0.04]" />
      <div className="absolute top-0 left-0 w-72 h-72 bg-gradient-to-br from-amber-500/[0.06] to-transparent blur-[100px] rounded-full pointer-events-none" />

      {/* Header */}
      <div className="relative z-10 px-8 sm:px-12 pt-8 sm:pt-10 pb-6 border-b border-white/[0.05] flex items-center gap-4 sm:gap-5">
        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shadow-[0_4px_24px_rgba(245,158,11,0.25)]">
          <CalendarRange size={24} className="text-[#120d0b]" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl sm:text-2xl font-serif font-bold tracking-tight text-[#f5f2eb]">Bu Hafta</h2>
          <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.25em] text-amber/50 mt-0.5">{report.range}</p>
        </div>
        <button
          onClick={handleShare}
          title="Karneni paylaş"
          className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center text-amber/50 hover:text-amber hover:border-amber/30 transition-all shrink-0"
        >
          <Share2 size={16} />
        </button>
      </div>

      <div className="relative z-10 px-8 sm:px-12 py-8 sm:py-10 space-y-7">
        {/* Headline */}
        <p className="text-[15px] sm:text-[17px] font-serif italic text-[#f5f2eb]/75 leading-relaxed">
          &ldquo;{report.headline}&rdquo;
        </p>

        {/* Metrik ızgarası */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {metrics.map((m) => (
            <div
              key={m.label}
              className={`flex flex-col gap-1.5 p-4 rounded-2xl border ${
                m.accent ? 'bg-amber-500/[0.08] border-amber/20' : 'bg-white/[0.03] border-white/[0.06]'
              }`}
            >
              <m.icon size={15} className={m.accent ? 'text-amber' : 'text-[#f5f2eb]/40'} />
              <span className="text-xl sm:text-2xl font-bold text-[#f5f2eb] tabular-nums leading-none">{m.value}</span>
              <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#f5f2eb]/35">{m.label}</span>
            </div>
          ))}
        </div>

        {/* Bu hafta eklenen afişler */}
        {report.savedPosters.length > 0 && (
          <div className="space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#f5f2eb]/30">Bu hafta eklediklerin</p>
            <div className="flex gap-2.5">
              {report.savedPosters.map((p, i) => (
                <div key={i} className="w-12 sm:w-14 aspect-[2/3] rounded-lg overflow-hidden border border-white/10 shrink-0">
                  <img src={proxyImageUrl(p)} loading="lazy" alt="" className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          </div>
        )}

        {report.topMood && (
          <p className="text-[12px] text-[#f5f2eb]/45">
            Favori ruh halin: <span className="text-amber font-semibold">{report.topMood}</span>
          </p>
        )}
      </div>
    </motion.div>
  );
}
