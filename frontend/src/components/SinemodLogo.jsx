import React from 'react';

const GOLD = '#ffbf00';
const GOLD_LIGHT = '#ffd700';

export default function SinemodLogo({ variant = 'logo', size = 'md', className = '' }) {
  const dimensions = {
    sm: { logo: 20, text: 'text-[10px]', gap: 1.5 },
    md: { logo: 28, text: 'text-xs', gap: 2 },
    lg: { logo: 40, text: 'text-sm', gap: 2.5 },
    xl: { logo: 72, text: 'text-lg', gap: 3 },
  };

  const d = dimensions[size] || dimensions.md;

  if (variant === 'brand') {
    return (
      <div className={`flex items-center gap-${d.gap} ${className}`}>
        <GoldenS size={d.logo} />
        <span className={`font-serif font-semibold tracking-wide text-amber ${d.text}`}
          style={{ textShadow: '0 0 20px rgba(255,191,0,0.2)' }}>
          Sinemod
        </span>
      </div>
    );
  }

  if (variant === 'square') {
    return (
      <div className={`inline-flex items-center justify-center bg-[#0d0b0a] border border-amber/20 rounded-lg shadow-lg ${className}`}
        style={{
          boxShadow: '0 0 30px rgba(255,191,0,0.08), inset 0 0 30px rgba(255,191,0,0.03)',
          padding: d.logo * 0.3,
        }}>
        <GoldenS size={d.logo} />
      </div>
    );
  }

  if (variant === 'glow') {
    return (
      <div className={`relative inline-flex items-center justify-center ${className}`}
        style={{ width: d.logo * 3, height: d.logo * 3 }}>
        <div className="absolute inset-0 rounded-full opacity-30 animate-pulse"
          style={{
            background: `radial-gradient(circle, ${GOLD}55 0%, transparent 70%)`,
            animation: 'goldenPulse 3s ease-in-out infinite',
          }}
        />
        <div className="relative bg-[#0d0b0a] rounded-xl border border-amber/20"
          style={{
            padding: d.logo * 0.25,
            boxShadow: '0 0 40px rgba(255,191,0,0.12)',
          }}>
          <GoldenS size={d.logo} />
        </div>
      </div>
    );
  }

  return <GoldenS size={d.logo} className={className} />;
}

function GoldenS({ size = 28, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={`shrink-0 ${className}`}
      style={{ filter: 'drop-shadow(0 0 6px rgba(255,191,0,0.35))' }}
      aria-label="Sinemod">
      <defs>
        <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={GOLD_LIGHT} />
          <stop offset="50%" stopColor={GOLD} />
          <stop offset="100%" stopColor="#e6a800" />
        </linearGradient>
      </defs>
      <path
        d="M28 18c0-5 3-9 9-10 4-.8 8 1.5 10 5l2 3-8 5-2-3c-1-1.5-2-2-3.5-1.5S33 19 33 22c0 4 3 6 10 10 8 5 13 10 13 18 0 8-5 14-12 16-8 2-15-1-19-7l-2-3 8-5 2 3c2 3 4 4.5 7 3.5s4-3.5 4-6.5c0-5-3-7-10-11-7.5-4.5-13-10-13-18 0-5 2-10 7-13Z"
        fill="url(#goldGrad)"
      />
    </svg>
  );
}
