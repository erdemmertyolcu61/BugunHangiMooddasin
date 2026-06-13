import { useState, useEffect } from 'react';
import { Zap } from 'lucide-react';
import { getTasteCompatibility } from '../../services/api';

const MOOD_NAMES = {
  kesfet: 'Keşfet', romantik: 'Romantik', gerilim: 'Gerilim', komedi: 'Komedi',
  dram: 'Dram', aksiyon: 'Aksiyon', korku: 'Korku', bilimkurgu: 'Bilim Kurgu',
  animasyon: 'Animasyon', belgesel: 'Belgesel', macera: 'Macera', fantastik: 'Fantastik',
  gizem: 'Gizem', muzik: 'Müzik', savas: 'Savaş', tarih: 'Tarih',
  aile: 'Aile', suç: 'Suç', western: 'Western', spor: 'Spor',
};

export default function TasteCompatibility({ friendId }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!friendId) return;
    getTasteCompatibility(friendId).then(setData).catch(() => {});
  }, [friendId]);

  if (!data || data.score === 0) return null;

  const color = data.score >= 70 ? 'text-green-400' : data.score >= 40 ? 'text-amber' : 'text-white/50';
  const label = data.score >= 70 ? 'Sinema İkizi!' : data.score >= 40 ? 'Benzer Zevkler' : 'Farklı Zevkler';

  return (
    <div className="rounded-2xl bg-gradient-to-br from-amber-900/10 to-transparent border border-amber/10 p-4">
      <div className="flex items-center gap-2.5 mb-3">
        <Zap size={16} className="text-amber" />
        <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-amber/50">Tat Uyumu</p>
      </div>

      <div className="flex items-center gap-4 mb-3">
        <div className="relative w-16 h-16">
          <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor"
              className="text-white/5" strokeWidth="3" />
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor"
              className={color} strokeWidth="3"
              strokeDasharray={`${data.score} ${100 - data.score}`}
              strokeLinecap="round" />
          </svg>
          <span className={`absolute inset-0 flex items-center justify-center text-[15px] font-bold ${color}`}>
            %{data.score}
          </span>
        </div>
        <div>
          <p className={`text-[14px] font-serif font-bold ${color}`}>{label}</p>
          <p className="text-[11px] text-white/35">Mood dağılımı benzerliği</p>
        </div>
      </div>

      {data.common_moods?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {data.common_moods.map((m) => (
            <span key={m.mood_id}
              className="px-2 py-1 rounded-full bg-amber/8 border border-amber/15 text-[10px] text-amber/70 font-medium">
              {MOOD_NAMES[m.mood_id] || m.mood_id}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
