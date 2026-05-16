/**
 * Shelf — horizontal scroll rail with catalog-style header.
 */
import { useRef } from 'react';

export default function Shelf({ catalogNo, title, count, color, children }) {
  const scrollRef = useRef(null);
  const scrollBy = (dir) => scrollRef.current?.scrollBy({ left: dir * 600, behavior: 'smooth' });

  return (
    <section className="mt-14">
      <div className="mb-4 flex items-center gap-4">
        <div className="flex items-baseline gap-3.5 flex-wrap">
          <span className="font-mono text-[11px] font-semibold tracking-[1.5px]" style={{ color: color || 'var(--color-accent)' }}>
            {catalogNo}
          </span>
          <h2 className="font-mono text-[22px] font-semibold tracking-[-0.3px] text-ink">{title}</h2>
          {count != null && <span className="font-mono text-[11px] text-ink-mute">— {count} kayıt</span>}
        </div>
        <div className="dotted-line" />
      </div>

      <div className="group relative">
        <button
          onClick={() => scrollBy(-1)}
          className="absolute left-[-10px] top-1/2 z-10 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full border border-line bg-paper-cream font-mono text-base text-ink opacity-0 shadow-[0_2px_8px_rgba(0,0,0,0.08)] transition-opacity hover:bg-ink hover:text-paper-warm group-hover:opacity-100"
        >←</button>
        <div ref={scrollRef} className="no-scrollbar flex gap-5 overflow-x-auto px-1 pb-6 pt-3" style={{ scrollSnapType: 'x mandatory' }}>
          {children}
        </div>
        <button
          onClick={() => scrollBy(1)}
          className="absolute right-[-10px] top-1/2 z-10 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full border border-line bg-paper-cream font-mono text-base text-ink opacity-0 shadow-[0_2px_8px_rgba(0,0,0,0.08)] transition-opacity hover:bg-ink hover:text-paper-warm group-hover:opacity-100"
        >→</button>
      </div>
    </section>
  );
}
