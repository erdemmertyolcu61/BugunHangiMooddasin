/**
 * MoodBadge — paper palette pill for moods.
 */
const MOOD_CONFIG = {
  'Melankolik 🍷': { color: 'mood-melancholic', icon: '🍷' },
  'Heyecanlı 🔥':  { color: 'mood-exciting',    icon: '🔥' },
  'Düşünceli 🧠':  { color: 'mood-thoughtful',   icon: '🧠' },
  'Neşeli ☀️':     { color: 'mood-joyful',       icon: '☀️' },
  'Gergin 🌑':     { color: 'mood-tense',        icon: '🌑' },
  'Bilinmiyor':    { color: 'mood-unknown',      icon: '❓' },
};

const HEX = {
  'Melankolik 🍷': '#818cf8',
  'Heyecanlı 🔥':  '#f87171',
  'Düşünceli 🧠':  '#c084fc',
  'Neşeli ☀️':     '#facc15',
  'Gergin 🌑':     '#94a3b8',
  'Bilinmiyor':    '#8A7F70',
};

import { memo } from 'react';

function MoodBadge({ mood, size = 'sm' }) {
  const config = MOOD_CONFIG[mood] || MOOD_CONFIG['Bilinmiyor'];
  const hex = HEX[mood] || HEX['Bilinmiyor'];
  const sizeClass = size === 'lg' ? 'px-3 py-1 text-xs' : 'px-2 py-0.5 text-[10px]';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-mono font-medium backdrop-blur-sm ${sizeClass}`}
      style={{
        borderColor: hex,
        color: hex,
        background: `color-mix(in srgb, ${hex} 14%, rgba(255,255,255,0.8))`,
      }}
    >
      <span className="text-[0.85em]">{config.icon}</span>
      {mood || 'Bilinmiyor'}
    </span>
  );
}

export default memo(MoodBadge);
