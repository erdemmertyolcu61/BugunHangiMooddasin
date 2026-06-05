import { useRef, useEffect, useCallback } from 'react';
import lottie from 'lottie-web';

/**
 * Animasyonlu beğen / beğenme kontrolü (Lottie).
 *
 * Tek bir birleşik sahne (/lottie/reaction.json, 116x64) sol başparmak = beğenme,
 * sağ başparmak = beğeni içerir. Marker'lar:
 *   - "Like"    → frame 2-30  (konfeti ile)
 *   - "Dislike" → frame 31-51
 * Nötr (seçimsiz) durum frame 0'dır.
 *
 * Tıklama alanları şeffaf butonlarla overlay edilir (erişilebilirlik + sol/sağ).
 * `reaction` dışarıdan değişirse (örn. kayıtlı tepki yüklenince) statik frame'e
 * atlar; kullanıcı tıklayınca ilgili segment oynatılır.
 *
 * @param {'like'|'dislike'|null} reaction
 * @param {(next:{reaction:string|null})=>void} onChange
 * @param {boolean} readOnly
 */
const SEG = { like: [2, 30], dislike: [31, 51] };
const FRAME = { like: 30, dislike: 51, null: 0 };

export default function ReactionControl({ reaction = null, onChange, readOnly = false }) {
  const containerRef = useRef(null);
  const animRef = useRef(null);
  const userActing = useRef(false);
  const reduceMotion = useRef(false);

  const frameFor = (r) => FRAME[r] ?? 0;

  useEffect(() => {
    if (!containerRef.current) return;
    reduceMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const anim = lottie.loadAnimation({
      container: containerRef.current,
      renderer: 'svg',
      loop: false,
      autoplay: false,
      path: '/lottie/reaction.json',
    });
    animRef.current = anim;
    anim.addEventListener('DOMLoaded', () => {
      anim.goToAndStop(frameFor(reaction), true);
    });
    return () => {
      anim.destroy();
      animRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dışarıdan gelen reaction değişimini yansıt (kullanıcı tıklaması değilse).
  useEffect(() => {
    const anim = animRef.current;
    if (!anim) return;
    if (userActing.current) { userActing.current = false; return; }
    anim.goToAndStop(frameFor(reaction), true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reaction]);

  const pick = useCallback((r) => {
    if (readOnly) return;
    const anim = animRef.current;
    const next = reaction === r ? null : r;
    userActing.current = true;
    if (anim) {
      if (next && !reduceMotion.current) {
        anim.playSegments(SEG[next], true);
      } else {
        anim.goToAndStop(frameFor(next), true);
      }
    }
    onChange?.({ reaction: next });
  }, [reaction, onChange, readOnly]);

  return (
    <div className={`relative inline-block ${readOnly ? 'pointer-events-none' : ''}`} style={{ width: 116, height: 64 }}>
      <div ref={containerRef} className="absolute inset-0" aria-hidden="true" />
      {/* Sol yarı = beğenmedim, sağ yarı = beğendim (sahne düzeniyle hizalı) */}
      <button
        type="button"
        disabled={readOnly}
        onClick={() => pick('dislike')}
        aria-label="Beğenmedim"
        aria-pressed={reaction === 'dislike'}
        title="Beğenmedim"
        className="absolute left-0 top-0 h-full w-1/2 rounded-l-full active:scale-95 transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/40"
      />
      <button
        type="button"
        disabled={readOnly}
        onClick={() => pick('like')}
        aria-label="Beğendim"
        aria-pressed={reaction === 'like'}
        title="Beğendim"
        className="absolute right-0 top-0 h-full w-1/2 rounded-r-full active:scale-95 transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40"
      />
    </div>
  );
}
