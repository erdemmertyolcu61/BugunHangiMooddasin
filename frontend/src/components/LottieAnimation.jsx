import React, { useRef, useEffect, memo } from 'react';
import lottie from 'lottie-web';

/**
 * Reusable Lottie Animation bileşeni.
 *
 * @param {string}  path       - /lottie/*.json dosya yolu (public klasöründen)
 * @param {object}  animationData - Inline JSON data (path yerine)
 * @param {boolean} loop       - Döngüde oynasın mı (default: true)
 * @param {boolean} autoplay   - Otomatik başlasın mı (default: true)
 * @param {string}  className  - Container CSS sınıfları
 * @param {object}  style      - Inline stil
 * @param {number}  speed      - Oynatma hızı (default: 1)
 * @param {string}  renderer   - 'svg' | 'canvas' | 'html' (default: 'svg')
 * @param {function} onComplete - Animasyon bittiğinde callback (loop=false ise)
 * @param {function} onLoopComplete - Her döngü sonunda callback
 * @param {function} onAnimRef - Lottie instance referansı callback (dışarıdan kontrol için)
 */
function LottieAnimation({
  path,
  animationData,
  loop = true,
  autoplay = true,
  className = '',
  style,
  speed = 1,
  renderer = 'svg',
  onComplete,
  onLoopComplete,
  onAnimRef,
}) {
  const containerRef = useRef(null);
  const animRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Mevcut animasyonu temizle
    if (animRef.current) {
      animRef.current.destroy();
      animRef.current = null;
    }

    const config = {
      container: containerRef.current,
      renderer,
      loop,
      autoplay,
      ...(animationData ? { animationData } : { path }),
    };

    const anim = lottie.loadAnimation(config);
    animRef.current = anim;

    anim.setSpeed(speed);

    if (onComplete) {
      anim.addEventListener('complete', onComplete);
    }
    if (onLoopComplete) {
      anim.addEventListener('loopComplete', onLoopComplete);
    }
    if (onAnimRef) {
      onAnimRef(anim);
    }

    // prefers-reduced-motion desteği
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mq.matches) {
      anim.goToAndStop(anim.totalFrames - 1, true);
    }

    return () => {
      anim.destroy();
      animRef.current = null;
    };
  }, [path, animationData, loop, autoplay, speed, renderer]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={style}
      aria-hidden="true"
      role="img"
    />
  );
}

export default memo(LottieAnimation);
