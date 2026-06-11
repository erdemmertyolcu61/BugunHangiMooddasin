import React, { useRef } from 'react';
import { Download, Share2 } from 'lucide-react';
import ShareButtons from './ShareButtons';
import { useShareableImage } from '../utils/useShareableImage';
import { CANONICAL_URL } from '../utils/apiConfig';

/**
 * MoodShareCard — Instagram Story uyumlu mood paylasim karti.
 * FilmShareCard ile ayni pattern: cardRef + useShareableImage.
 */
export default function MoodShareCard({ mood, onClose }) {
  const cardRef = useRef(null);

  if (!mood) return null;

  const MoodIcon = mood.icon;
  const color = mood.accentHex || '#d4af37';
  const shareUrl = CANONICAL_URL;
  const shareText = `Bugunku mood'um: ${mood.title} | Bana film oner! Sinemood'da kesif yap.`;
  const fileName = `sinemood-mood-${mood.id}.png`;

  const { share, download: handleDownload, sharing } = useShareableImage(cardRef, {
    fileName,
    shareText: `${shareText} ${shareUrl}`.trim(),
    backgroundColor: '#0c0a12',
    deps: [mood.id],
  });

  return (
    <div className="fixed inset-0 z-[1000] flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>

      {/* Gorsel kart (capture edilecek) */}
      <div ref={cardRef}
        className="w-[320px] rounded-3xl overflow-hidden shadow-2xl"
        style={{ background: `linear-gradient(160deg, #0c0a12 0%, ${color}22 50%, #0c0a12 100%)` }}
      >
        <div className="flex flex-col items-center justify-center px-8 py-12 text-center space-y-6">
          {/* Mood Icon */}
          <div className="w-20 h-20 rounded-full flex items-center justify-center"
            style={{ backgroundColor: `${color}20`, boxShadow: `0 0 40px ${color}30` }}>
            {MoodIcon && <MoodIcon size={36} style={{ color }} />}
          </div>

          {/* Mood Text */}
          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.35em] text-white/40">
              Bugunku mood'um
            </p>
            <h2 className="font-serif text-3xl font-bold" style={{ color }}>
              {mood.title}
            </h2>
          </div>

          {/* CTA */}
          <p className="font-serif text-[15px] italic text-amber/70">
            Bana film oner.
          </p>

          {/* Branding */}
          <div className="pt-4 border-t border-white/[0.08] w-full space-y-1">
            <p className="text-[13px] font-serif font-bold text-ivory/60">Sinemood</p>
            <p className="text-[10px] text-white/30 tracking-wider">Bugun Hangi Mooddasin?</p>
          </div>
        </div>
      </div>

      {/* Aksiyon butonlari */}
      <div className="flex items-center gap-3 mt-5">
        <button onClick={share} disabled={sharing}
          className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-amber/90 text-black text-xs font-bold uppercase tracking-wider
                     hover:bg-amber transition-all disabled:opacity-40">
          <Share2 size={14} /> Paylas
        </button>
        <button onClick={handleDownload} disabled={sharing}
          className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/10 text-ivory text-xs font-bold uppercase tracking-wider
                     hover:bg-white/15 transition-all disabled:opacity-40">
          <Download size={14} /> Indir
        </button>
      </div>

      {/* Platform paylasimlari */}
      <div className="mt-3">
        <ShareButtons url={shareUrl} text={shareText} compact />
      </div>
    </div>
  );
}
