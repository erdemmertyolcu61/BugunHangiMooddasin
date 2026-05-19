import React from 'react';

/* Sinemod — Marka simgesi (logo).
 * Kullanım:
 *   <SinemodLogo />                      → sadece simge (md)
 *   <SinemodLogo variant="brand" />      → simge + "Sinemod" yazısı
 *   <SinemodLogo variant="glow" size="xl" />
 *
 * Simge görseli /public/sinemod-mark.png — Vite kökünden /sinemod-mark.png olarak servis edilir.
 * PNG'nin köşeleri zaten şeffaf; ek köşe yuvarlama/maske gerekmez. */

const MARK_SRC = '/sinemod-mark.png';

const SIZES = {
  sm: { mark: 22, text: 'text-[11px]', gap: 8 },
  md: { mark: 32, text: 'text-[13px]', gap: 10 },
  lg: { mark: 44, text: 'text-base',   gap: 12 },
  xl: { mark: 84, text: 'text-xl',     gap: 16 },
  '2xl': { mark: 140, text: 'text-2xl', gap: 22 },
};

export default function SinemodLogo({ variant = 'logo', size = 'md', className = '', alt = 'Sinemod' }) {
  const s = SIZES[size] || SIZES.md;

  const mark = (
    <img
      src={MARK_SRC}
      alt={alt}
      width={s.mark}
      height={s.mark}
      draggable={false}
      style={{
        width: s.mark, height: s.mark, display: 'block', userSelect: 'none',
        filter: 'drop-shadow(0 4px 14px rgba(255,178,80,0.18))',
      }}
    />
  );

  if (variant === 'brand') {
    return (
      <div className={`flex items-center ${className}`} style={{ gap: s.gap }}>
        {mark}
        <span
          className={`font-serif font-semibold tracking-wide text-amber ${s.text}`}
          style={{ textShadow: '0 0 20px rgba(255,191,0,0.2)' }}
        >
          Sinemod
        </span>
      </div>
    );
  }

  /* square ve glow eski varyantları korunuyor — artık ekstra çerçeveye gerek yok
   * çünkü PNG'nin kendi yuvarlak kenarı ve ışıması var. Yine de uyumluluk için
   * 'glow' küçük bir ambient halo ekliyor. */
  if (variant === 'glow') {
    return (
      <div className={`relative inline-flex items-center justify-center ${className}`}
           style={{ width: s.mark * 1.6, height: s.mark * 1.6 }}>
        <div
          aria-hidden="true"
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            background: 'radial-gradient(circle, rgba(255,178,80,0.22) 0%, transparent 65%)',
            animation: 'goldenPulse 3s ease-in-out infinite',
          }}
        />
        <div className="relative">{mark}</div>
      </div>
    );
  }

  /* default + 'square' aynı simgeyi döndürür */
  return <div className={className}>{mark}</div>;
}
