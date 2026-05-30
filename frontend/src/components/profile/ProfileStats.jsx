import React from 'react';
import { motion } from 'framer-motion';
import { Eye, Bookmark, CalendarDays } from 'lucide-react';

/**
 * 3-stat grid — watched, saved, this month.
 */
export default function ProfileStats({ watchedCount = 0, savedCount = 0, thisMonthCount = 0, loading = false }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="sinemood-spinner" />
      </div>
    );
  }

  const stats = [
    { icon: Eye, label: 'İzlendi', value: watchedCount, color: '#34d399' },
    { icon: Bookmark, label: 'Kayıtlı', value: savedCount, color: '#fbbf24' },
    { icon: CalendarDays, label: 'Bu Ay', value: thisMonthCount, color: '#60a5fa' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
        {stats.map(({ icon: Icon, label, value, color }) => (
          <div key={label}
            className="p-4 sm:p-5 rounded-2xl bg-[#1c1512]/90 border border-white/[0.06] flex flex-col gap-2">
            <Icon size={16} style={{ color }} className="opacity-70" />
            <p className="font-sans text-2xl sm:text-3xl font-bold text-ivory tracking-tight leading-none">
              {value}
            </p>
            <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.15em] text-ivory/50">
              {label}
            </p>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
