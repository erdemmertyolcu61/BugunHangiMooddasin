import React from 'react';

export default function SinemodLogo({ variant = 'logo', size = 'md', className = '' }) {
  const dims = {
    sm: { w: 22, text: 'text-[10px]', gap: 1.5 },
    md: { w: 30, text: 'text-xs', gap: 2 },
    lg: { w: 44, text: 'text-sm', gap: 2.5 },
    xl: { w: 72, text: 'text-lg', gap: 3 },
  };
  const d = dims[size] || dims.md;

  const mark = (
    <img
      src="/sinemod-mark.svg"
      alt="Sinemod"
      width={d.w}
      height={d.w}
      className={`shrink-0 ${className}`}
      style={{ borderRadius: d.w * 0.1875 }}
    />
  );

  if (variant === 'brand') {
    return (
      <div className={`flex items-center gap-${d.gap} ${className}`}>
        {mark}
        <span className={`font-serif font-semibold tracking-wide text-amber ${d.text}`}
          style={{ textShadow: '0 0 20px rgba(255,178,80,0.2)' }}>
          Sinemod
        </span>
      </div>
    );
  }

  if (variant === 'square') {
    return (
      <div
        className={`inline-flex items-center justify-center ${className}`}
        style={{
          background: '#0a0606',
          border: '1px solid rgba(255,178,80,0.15)',
          borderRadius: d.w * 0.3,
          padding: d.w * 0.3,
          boxShadow: '0 0 30px rgba(255,178,80,0.08), inset 0 0 30px rgba(255,178,80,0.03)',
        }}
      >
        <img
          src="/sinemod-mark.svg"
          alt="Sinemod"
          width={d.w}
          height={d.w}
          style={{ borderRadius: d.w * 0.1875 }}
        />
      </div>
    );
  }

  if (variant === 'glow') {
    return (
      <div
        className={`relative inline-flex items-center justify-center ${className}`}
        style={{ width: d.w * 3, height: d.w * 3 }}
      >
        <div
          className="absolute inset-0 rounded-full opacity-30"
          style={{
            background: 'radial-gradient(circle, rgba(255,178,80,0.33) 0%, transparent 70%)',
            animation: 'goldenPulse 3s ease-in-out infinite',
          }}
        />
        <div
          className="relative"
          style={{
            background: '#0a0606',
            borderRadius: d.w * 0.25,
            border: '1px solid rgba(255,178,80,0.15)',
            padding: d.w * 0.25,
            boxShadow: '0 0 40px rgba(255,178,80,0.12)',
          }}
        >
          <img
            src="/sinemod-mark.svg"
            alt="Sinemod"
            width={d.w}
            height={d.w}
            style={{ borderRadius: d.w * 0.1875 }}
          />
        </div>
      </div>
    );
  }

  // logo variant — bare mark
  return mark;
}
