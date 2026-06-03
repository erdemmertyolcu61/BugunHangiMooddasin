import React, { useRef, useState } from 'react';
import { Share2, Download } from 'lucide-react';
import { captureAndShare, captureElementAsBlob, downloadBlob } from '../utils/shareUtils';
import ShareButtons from './ShareButtons';
import { track, EVENTS } from '../utils/analytics';
import { useTheme } from '../context/ThemeContext';
import { CANONICAL_URL } from '../utils/apiConfig';

/**
 * "Zevk Haritam" — paylaşılabilir zevk haritası kartı.
 * Temaya duyarlı (Latte → krem kart, Espresso → koyu kart). Renkler html2canvas'ın
 * temiz yakalaması için doğrudan inline (override sheet'e bağlı değil), kontrast yüksek.
 *
 * Props: tasteMap { dynamic_title, top_moods, mood_pct, confidence, signals }, username, profileUrl
 */
const MOOD_COLORS = {
  battaniye: '#f59e0b', gece: '#94a3b8', gozyasi: '#ec4899',
  askbahcesi: '#f43f5e', kahkaha: '#10b981', adrenalin: '#ef4444',
  yolculuk: '#10b981', zamanyolcusu: '#f59e0b', sessiz: '#a8a29e',
  zihin: '#8b5cf6', kalp: '#ec4899', karmakar: '#f97316',
  sipsak: '#d4af37', 'deep-chills': '#3b82f6',
  'kadraj-estetigi': '#a855f7', 'geceyarisi-itirafi': '#6366f1',
};

const PALETTES = {
  dark: {
    bg: 'linear-gradient(150deg, #1c1611 0%, #131015 55%, #0c0a12 100%)',
    border: 'rgba(255,191,0,0.18)',
    glowA: 'rgba(255,191,0,0.10)', glowB: 'rgba(124,58,237,0.10)',
    eyebrow: '#d6a84f', title: '#ffbf00', sub: 'rgba(245,242,235,0.55)',
    label: 'rgba(245,242,235,0.88)', pct: 'rgba(245,242,235,0.65)',
    track: 'rgba(255,255,255,0.10)', divider: 'rgba(255,255,255,0.10)',
    chipBg: 'rgba(255,255,255,0.06)', chipBorder: 'rgba(255,255,255,0.14)', chipText: 'rgba(245,242,235,0.88)',
    badgeBg: 'rgba(255,191,0,0.22)', badgeText: '#ffd86b', foot: 'rgba(245,242,235,0.45)',
    captureBg: '#0c0a12',
  },
  light: {
    bg: 'linear-gradient(150deg, #fbf6ea 0%, #f3ecdb 55%, #ece2cd 100%)',
    border: 'rgba(138,94,8,0.28)',
    glowA: 'rgba(212,168,79,0.18)', glowB: 'rgba(160,90,40,0.10)',
    eyebrow: '#8a5e08', title: '#7a4f06', sub: 'rgba(42,32,23,0.58)',
    label: 'rgba(42,32,23,0.9)', pct: 'rgba(42,32,23,0.62)',
    track: 'rgba(42,32,23,0.12)', divider: 'rgba(42,32,23,0.14)',
    chipBg: 'rgba(42,32,23,0.05)', chipBorder: 'rgba(42,32,23,0.16)', chipText: 'rgba(42,32,23,0.82)',
    badgeBg: 'rgba(138,94,8,0.18)', badgeText: '#8a5e08', foot: 'rgba(42,32,23,0.5)',
    captureBg: '#f3ecdb',
  },
};

export default function TasteMapCard({ tasteMap, username = '', profileUrl = '' }) {
  const cardRef = useRef(null);
  const [sharing, setSharing] = useState(false);
  const { theme } = useTheme();
  const p = theme === 'light' ? PALETTES.light : PALETTES.dark;

  if (!tasteMap || tasteMap.confidence === 'low') return null;

  const shareUrl = profileUrl || CANONICAL_URL;
  const shareText = username
    ? `${username}'in Sinemood Zevk Haritası — Sen de sinema DNA'nı keşfet!`
    : 'Sinemood Zevk Haritam — Sen de sinema DNA\'nı keşfet!';

  const handleShareImage = async () => {
    if (!cardRef.current || sharing) return;
    setSharing(true);
    track(EVENTS.SHARE_CLICK, { network: 'image', kind: 'taste_map' });
    try {
      await captureAndShare(cardRef.current, 'sinemood-zevk-haritam.png', `${shareText} ${shareUrl}`.trim(), { backgroundColor: p.captureBg });
    } finally {
      setSharing(false);
    }
  };

  const handleDownload = async () => {
    if (!cardRef.current || sharing) return;
    setSharing(true);
    try {
      const blob = await captureElementAsBlob(cardRef.current, { backgroundColor: p.captureBg });
      downloadBlob(blob, 'sinemood-zevk-haritam.png');
    } finally {
      setSharing(false);
    }
  };

  const moodPctEntries = tasteMap.mood_pct ? Object.entries(tasteMap.mood_pct).slice(0, 5) : [];
  const totalMovies = tasteMap.signals?.total_movies || 0;

  return (
    <div className="space-y-4">
      {/* ── Capturable Card ── */}
      <div
        ref={cardRef}
        className="relative overflow-hidden rounded-[1.5rem] p-6 sm:p-8"
        style={{ minWidth: 320, maxWidth: 440, background: p.bg, border: `1px solid ${p.border}` }}
      >
        {/* Atmospheric glow */}
        <div className="absolute top-0 right-0 w-52 h-52 rounded-full pointer-events-none"
          style={{ background: `radial-gradient(circle, ${p.glowA} 0%, transparent 70%)` }} />
        <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full pointer-events-none"
          style={{ background: `radial-gradient(circle, ${p.glowB} 0%, transparent 70%)` }} />

        {/* Header */}
        <div className="relative z-10">
          <p className="text-[10px] font-bold uppercase tracking-[0.45em]" style={{ color: p.eyebrow }}>Sinema DNA'm</p>
          {tasteMap.dynamic_title && (
            <h3 className="text-2xl sm:text-[28px] font-serif font-bold tracking-tight leading-tight mt-1.5" style={{ color: p.title }}>
              {tasteMap.dynamic_title}
            </h3>
          )}
          {username && (
            <p className="text-[12px] font-semibold mt-1" style={{ color: p.sub }}>{username}</p>
          )}
        </div>

        {/* Mood bars — etiket barın ÜSTÜNDE (kırpılma/üst üste binme yok) */}
        {moodPctEntries.length > 0 && (
          <div className="relative z-10 mt-7 space-y-3.5">
            {moodPctEntries.map(([mid, pct]) => {
              const moodObj = tasteMap.top_moods?.find(m => m.mood_id === mid);
              const label = moodObj?.title || mid.replace('-', ' ');
              const barColor = MOOD_COLORS[mid] || '#d4af37';
              return (
                <div key={mid}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[12.5px] font-semibold capitalize" style={{ color: p.label }}>{label}</span>
                    <span className="text-[12px] font-bold tabular-nums" style={{ color: p.pct }}>%{Math.round(pct)}</span>
                  </div>
                  <div className="h-2.5 rounded-full overflow-hidden" style={{ background: p.track }}>
                    <div className="h-full rounded-full" style={{ backgroundColor: barColor, width: `${Math.min(pct, 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Mood chips */}
        {tasteMap.top_moods?.length > 0 && (
          <div className="relative z-10 mt-6 flex flex-wrap gap-2">
            {tasteMap.top_moods.slice(0, 4).map(m => {
              const dotColor = MOOD_COLORS[m.mood_id] || '#d4af37';
              return (
                <span key={m.mood_id}
                  className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[11px] font-semibold"
                  style={{ background: p.chipBg, border: `1px solid ${p.chipBorder}`, color: p.chipText }}>
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: dotColor }} />
                  {m.title}
                </span>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div className="relative z-10 mt-7 pt-4 flex items-center justify-between" style={{ borderTop: `1px solid ${p.divider}` }}>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold"
              style={{ background: p.badgeBg, color: p.badgeText }}>S</div>
            <span className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: p.foot }}>Sinemood</span>
          </div>
          <span className="text-[10px]" style={{ color: p.foot }}>{totalMovies} film sinyali</span>
        </div>
      </div>

      {/* ── Share Actions ── */}
      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={handleShareImage}
            disabled={sharing}
            className="flex items-center gap-2 px-5 py-2.5 bg-amber/10 hover:bg-amber/15 border border-amber/20 hover:border-amber/30 rounded-full text-[10px] font-bold uppercase tracking-[0.2em] text-amber/80 hover:text-amber transition-all disabled:opacity-50"
          >
            <Share2 size={13} />
            {sharing ? 'Hazırlanıyor...' : 'Zevk Haritamı Paylaş'}
          </button>
          <button
            onClick={handleDownload}
            disabled={sharing}
            className="flex items-center justify-center w-10 h-10 bg-fg/[0.05] hover:bg-fg/[0.1] border border-default rounded-full text-fg-subtle hover:text-fg transition-all disabled:opacity-50"
            title="İndir"
          >
            <Download size={14} />
          </button>
        </div>
        <ShareButtons url={shareUrl} text={shareText} compact />
      </div>
    </div>
  );
}
