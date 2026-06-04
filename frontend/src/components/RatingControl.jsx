import { ThumbsUp, ThumbsDown } from 'lucide-react';

/**
 * Film puanı (1-10) + beğeni (like/dislike) kontrolü.
 * 10 segmentli bar: N'e tıkla → 1..N dolu. Aynı değere tekrar tıkla → temizle.
 *
 * Props:
 *   value:    1-10 | null
 *   reaction: 'like' | 'dislike' | null
 *   onChange: ({ rating, reaction }) => void   (birleşik yeni durum)
 *   readOnly: salt-okunur gösterim (Defterim kartında küçük rozet gibi)
 *   compact:  daha küçük segmentler
 */
export default function RatingControl({ value = null, reaction = null, onChange, readOnly = false, compact = false }) {
  const emit = (next) => { if (!readOnly && onChange) onChange({ rating: value, reaction, ...next }); };

  const setRating = (n) => emit({ rating: value === n ? null : n });
  const setReaction = (r) => emit({ reaction: reaction === r ? null : r });

  const seg = compact ? 'h-1.5 w-3 sm:w-3.5' : 'h-2 w-4 sm:w-5';

  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 ${readOnly ? 'pointer-events-none' : ''}`}>
      {/* 1-10 segment bar */}
      <div className="flex items-center gap-1.5">
        <div className="flex items-center gap-[3px]">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
            const filled = value != null && n <= value;
            return (
              <button
                key={n}
                type="button"
                disabled={readOnly}
                onClick={() => setRating(n)}
                title={`${n}/10`}
                aria-label={`${n} puan ver`}
                className={`${seg} rounded-full transition-all ${readOnly ? '' : 'hover:scale-y-150 cursor-pointer'} ${
                  filled ? 'bg-amber' : 'bg-white/12'
                }`}
              />
            );
          })}
        </div>
        <span className={`tabular-nums font-bold ${compact ? 'text-[11px]' : 'text-sm'} ${value != null ? 'text-amber' : 'text-ivory/35'}`}>
          {value != null ? `${value}/10` : '–'}
        </span>
      </div>

      {/* Beğeni */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={readOnly}
          onClick={() => setReaction('like')}
          title="Beğendim"
          aria-label="Beğendim"
          className={`w-8 h-8 flex items-center justify-center rounded-full border transition-all ${readOnly ? '' : 'active:scale-90'} ${
            reaction === 'like'
              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
              : 'bg-white/5 border-white/12 text-ivory/45 hover:text-ivory/70'
          }`}
        >
          <ThumbsUp size={14} className={reaction === 'like' ? 'fill-emerald-400/30' : ''} />
        </button>
        <button
          type="button"
          disabled={readOnly}
          onClick={() => setReaction('dislike')}
          title="Beğenmedim"
          aria-label="Beğenmedim"
          className={`w-8 h-8 flex items-center justify-center rounded-full border transition-all ${readOnly ? '' : 'active:scale-90'} ${
            reaction === 'dislike'
              ? 'bg-rose-500/15 border-rose-400/40 text-rose-300'
              : 'bg-white/5 border-white/12 text-ivory/45 hover:text-ivory/70'
          }`}
        >
          <ThumbsDown size={14} className={reaction === 'dislike' ? 'fill-rose-300/30' : ''} />
        </button>
      </div>
    </div>
  );
}
