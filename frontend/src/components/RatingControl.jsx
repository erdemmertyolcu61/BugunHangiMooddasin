import { ThumbsUp, ThumbsDown } from 'lucide-react';

export default function RatingControl({ reaction = null, onChange, readOnly = false }) {
  const setReaction = (r) => {
    if (!readOnly && onChange) onChange({ reaction: reaction === r ? null : r });
  };

  const btnClass = (r) =>
    `w-8 h-8 flex items-center justify-center rounded-full border transition-all ${readOnly ? '' : 'active:scale-90'} ${
      reaction === r
        ? r === 'like'
          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
          : 'bg-rose-500/15 border-rose-400/40 text-rose-300'
        : 'bg-white/5 border-white/12 text-ivory/45 hover:text-ivory/70'
    }`;

  return (
    <div className={`flex items-center gap-1.5 ${readOnly ? 'pointer-events-none' : ''}`}>
      <button type="button" disabled={readOnly} onClick={() => setReaction('like')} title="Beğendim" aria-label="Beğendim" className={btnClass('like')}>
        <ThumbsUp size={14} className={reaction === 'like' ? 'fill-emerald-400/30' : ''} />
      </button>
      <button type="button" disabled={readOnly} onClick={() => setReaction('dislike')} title="Beğenmedim" aria-label="Beğenmedim" className={btnClass('dislike')}>
        <ThumbsDown size={14} className={reaction === 'dislike' ? 'fill-rose-300/30' : ''} />
      </button>
    </div>
  );
}
