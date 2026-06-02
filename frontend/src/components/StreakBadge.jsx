import { useMemo } from 'react';
import { Flame } from 'lucide-react';
import { getStreak, isStreakMilestone } from '../utils/streak';

/**
 * Günlük açılış serisini gösteren kompakt rozet (🔥 N).
 * minShow altındaki serilerde gizlenir (gün-1 kalabalığı olmasın).
 * recordStreakOpen() açılışta main.jsx'te çalıştığı için değer günceldir.
 */
export default function StreakBadge({ className = '', minShow = 2 }) {
  const streak = useMemo(() => getStreak(), []);
  const n = streak.current || 0;
  if (n < minShow) return null;
  const milestone = isStreakMilestone(n);
  return (
    <div
      title={`${n} günlük seri${streak.best > n ? ` · en iyi ${streak.best}` : ''}`}
      aria-label={`${n} günlük seri`}
      className={`inline-flex items-center gap-1 pl-2 pr-2.5 h-9 rounded-full bg-black/40 backdrop-blur-md border transition-colors ${
        milestone ? 'border-amber/60 shadow-[0_0_14px_rgba(255,191,0,0.35)]' : 'border-white/10'
      } ${className}`}
    >
      <Flame size={15} className="text-amber" />
      <span className="font-sans text-[12px] font-bold text-amber tabular-nums">{n}</span>
    </div>
  );
}
