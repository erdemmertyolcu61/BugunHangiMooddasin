import React, { useRef, useState } from 'react';
import { Share2, Download } from 'lucide-react';
import { captureAndShare, captureElementAsBlob, downloadBlob } from '../utils/shareUtils';
import ShareButtons from './ShareButtons';

/**
 * "Zevk Haritam" — shareable taste map export card.
 *
 * Props:
 *  - tasteMap: { dynamic_title, top_moods, mood_pct, confidence, signals }
 *  - username: string
 */

const MOOD_COLORS = {
  battaniye: '#f59e0b', gece: '#94a3b8', gozyasi: '#ec4899',
  askbahcesi: '#f43f5e', kahkaha: '#10b981', adrenalin: '#ef4444',
  yolculuk: '#10b981', zamanyolcusu: '#f59e0b', sessiz: '#a8a29e',
  zihin: '#8b5cf6', kalp: '#ec4899', karmakar: '#f97316',
  sipsak: '#d4af37', 'deep-chills': '#3b82f6',
  'kadraj-estetigi': '#a855f7', 'geceyarisi-itirafi': '#6366f1',
};

export default function TasteMapCard({ tasteMap, username = '' }) {
  const cardRef = useRef(null);
  const [sharing, setSharing] = useState(false);

  if (!tasteMap || tasteMap.confidence === 'low') return null;

  const shareUrl = `${window.location.origin}`;
  const shareText = username
    ? `${username}'in Sinemood Zevk Haritası — Sen de sinema DNA'nı keşfet!`
    : 'Sinemood Zevk Haritam — Sen de sinema DNA\'nı keşfet!';

  const handleShareImage = async () => {
    if (!cardRef.current || sharing) return;
    setSharing(true);
    try {
      await captureAndShare(cardRef.current, 'sinemood-zevk-haritam.png', shareText);
    } finally {
      setSharing(false);
    }
  };

  const handleDownload = async () => {
    if (!cardRef.current || sharing) return;
    setSharing(true);
    try {
      const blob = await captureElementAsBlob(cardRef.current);
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
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1a1510] via-[#111111] to-[#0d0a14] p-6 sm:p-8 border border-amber/10"
        style={{ minWidth: 320, maxWidth: 440 }}
      >
        {/* Atmospheric glow */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-bl from-amber/[0.08] to-transparent blur-[80px] rounded-full pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-36 h-36 bg-gradient-to-tr from-purple-600/[0.05] to-transparent blur-[60px] rounded-full pointer-events-none" />

        {/* Header */}
        <div className="relative z-10 space-y-1">
          <p className="text-[9px] font-bold uppercase tracking-[0.5em] text-amber/40">Sinema DNA'm</p>
          {tasteMap.dynamic_title && (
            <h3 className="text-xl sm:text-2xl font-serif font-bold text-amber tracking-tight leading-snug">
              {tasteMap.dynamic_title}
            </h3>
          )}
          {username && (
            <p className="text-[11px] font-semibold text-white/30 mt-1">{username}</p>
          )}
        </div>

        {/* Mood bars */}
        {moodPctEntries.length > 0 && (
          <div className="relative z-10 mt-6 space-y-2.5">
            {moodPctEntries.map(([mid, pct]) => {
              const moodObj = tasteMap.top_moods?.find(m => m.mood_id === mid);
              const label = moodObj?.title || mid.replace('-', ' ');
              const barColor = MOOD_COLORS[mid] || '#d4af37';
              return (
                <div key={mid} className="flex items-center gap-3">
                  <span className="text-[11px] font-semibold text-white/50 w-24 text-right truncate capitalize">
                    {label}
                  </span>
                  <div className="flex-1 h-2.5 bg-white/[0.06] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ backgroundColor: barColor, width: `${Math.min(pct, 100)}%`, opacity: 0.8 }}
                    />
                  </div>
                  <span className="text-[11px] font-bold text-white/40 w-10 text-right tabular-nums">
                    %{Math.round(pct)}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Mood chips */}
        {tasteMap.top_moods && tasteMap.top_moods.length > 0 && (
          <div className="relative z-10 mt-5 flex flex-wrap gap-2">
            {tasteMap.top_moods.slice(0, 4).map(m => {
              const dotColor = MOOD_COLORS[m.mood_id] || '#d4af37';
              return (
                <span key={m.mood_id}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.05] border border-white/[0.08] text-[10px] font-semibold text-white/60">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: dotColor }} />
                  {m.title}
                </span>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div className="relative z-10 mt-6 pt-4 border-t border-white/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-amber/20 flex items-center justify-center text-[8px] font-bold text-amber">S</div>
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30">Sinemood</span>
          </div>
          <span className="text-[9px] text-white/20">{totalMovies} film sinyali</span>
        </div>
      </div>

      {/* ── Share Actions ── */}
      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={handleShareImage}
            disabled={sharing}
            className="flex items-center gap-2 px-5 py-2.5 bg-amber/10 hover:bg-amber/15 border border-amber/20 hover:border-amber/30 rounded-full text-[10px] font-bold uppercase tracking-[0.2em] text-amber/70 hover:text-amber transition-all disabled:opacity-50"
          >
            <Share2 size={13} />
            {sharing ? 'Hazırlanıyor...' : 'Zevk Haritamı Paylaş'}
          </button>
          <button
            onClick={handleDownload}
            disabled={sharing}
            className="flex items-center justify-center w-10 h-10 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-full text-white/40 hover:text-white/70 transition-all disabled:opacity-50"
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
