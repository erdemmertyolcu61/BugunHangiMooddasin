import React, { useRef } from 'react';
import { motion } from 'framer-motion';
import { Download, Share2 } from 'lucide-react';
import { MOOD_NAMES } from '../utils/moodQuiz';
import ShareButtons from './ShareButtons';
import { track, EVENTS } from '../utils/analytics';
import { useShareableImage } from '../utils/useShareableImage';
import { CANONICAL_URL } from '../utils/apiConfig';

/**
 * "Hangi Film Ruh Hali Seninki?" — shareable quiz result card.
 *
 * Props:
 *  - topMoods: [{ moodId, percentage }]
 *  - resultMessage: string
 */

const MOOD_EMOJIS = {
  battaniye: '🛋️', yolculuk: '🧭', gece: '🌙', kahkaha: '😂',
  gozyasi: '💧', adrenalin: '🔥', askbahcesi: '🌹', zamanyolcusu: '⏳',
  sessiz: '🤫', zihin: '🧠', kalp: '💜', karmakar: '🌀',
  sipsak: '⚡', 'deep-chills': '❄️', 'kadraj-estetigi': '🎬', 'geceyarisi-itirafi': '🕯️',
};

const MOOD_GRADIENTS = {
  battaniye: 'from-amber-600 to-orange-800',
  yolculuk: 'from-emerald-600 to-teal-800',
  gece: 'from-slate-600 to-indigo-900',
  kahkaha: 'from-emerald-500 to-lime-700',
  gozyasi: 'from-pink-600 to-rose-900',
  adrenalin: 'from-red-600 to-orange-800',
  askbahcesi: 'from-rose-500 to-pink-800',
  zamanyolcusu: 'from-amber-500 to-yellow-800',
  sessiz: 'from-stone-500 to-zinc-800',
  zihin: 'from-violet-600 to-purple-900',
  kalp: 'from-pink-500 to-fuchsia-800',
  karmakar: 'from-orange-500 to-red-800',
  sipsak: 'from-yellow-500 to-amber-800',
  'deep-chills': 'from-blue-500 to-cyan-900',
  'kadraj-estetigi': 'from-purple-500 to-violet-900',
  'geceyarisi-itirafi': 'from-indigo-500 to-blue-900',
};

export default function QuizShareCard({ topMoods = [], resultMessage = '' }) {
  const cardRef = useRef(null);

  const primary = topMoods && topMoods.length ? topMoods[0] : null;
  const primaryId = primary?.moodId;

  const moodName = primaryId ? (MOOD_NAMES[primaryId] || primaryId) : '';
  const emoji = primaryId ? (MOOD_EMOJIS[primaryId] || '🎬') : '🎬';
  const gradient = MOOD_GRADIENTS[primaryId] || 'from-amber-600 to-zinc-900';
  const shareUrl = CANONICAL_URL;
  const shareText = `Bu gece benim film ruh halim: ${moodName} ${emoji}\nSen hangi mooddasın? Sinemood'da keşfet!`;
  const fileName = `sinemood-${primaryId || 'mood'}.png`;

  // Hook'lar erken return'den ÖNCE (Rules of Hooks). iOS senkron paylaşım +
  // önceden capture + toast bu hook içinde merkezîleştirildi.
  const { share, download: handleDownload, sharing } = useShareableImage(cardRef, {
    fileName,
    shareText: `${shareText} ${shareUrl}`.trim(),
    backgroundColor: '#0c0a12',
    deps: [primaryId],
  });
  const handleShareImage = () => {
    track(EVENTS.SHARE_CLICK, { network: 'image', kind: 'quiz' });
    return share();
  };

  if (!primary) return null;

  return (
    <div className="space-y-4">
      {/* ── Capturable Card ── */}
      <div
        ref={cardRef}
        className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${gradient} p-6 sm:p-8`}
        style={{ minWidth: 320, maxWidth: 420 }}
      >
        {/* Decorative circles */}
        <div className="absolute top-0 right-0 w-40 h-40 bg-white/[0.06] rounded-full -translate-y-1/2 translate-x-1/3 blur-2xl" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-black/20 rounded-full translate-y-1/2 -translate-x-1/4 blur-2xl" />

        {/* Header */}
        <div className="relative z-10 text-center space-y-3">
          <p className="text-[9px] font-bold uppercase tracking-[0.5em] text-white/40">Bu Geceki Ruh Halim</p>
          <div className="text-5xl">{emoji}</div>
          <h3 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">{moodName}</h3>
        </div>

        {/* Mood bars */}
        <div className="relative z-10 mt-6 space-y-2.5">
          {topMoods.slice(0, 3).map((m) => (
            <div key={m.moodId} className="flex items-center gap-3">
              <span className="text-[11px] font-semibold text-white/60 w-24 text-right truncate">
                {MOOD_NAMES[m.moodId] || m.moodId}
              </span>
              <div className="flex-1 h-2 bg-black/20 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-white/70"
                  style={{ width: `${m.percentage}%` }}
                />
              </div>
              <span className="text-[11px] font-bold text-white/50 w-8">{m.percentage}%</span>
            </div>
          ))}
        </div>

        {/* Message */}
        {resultMessage && (
          <p className="relative z-10 mt-5 text-[12px] font-serif italic text-white/50 text-center leading-relaxed line-clamp-2">
            &ldquo;{resultMessage}&rdquo;
          </p>
        )}

        {/* Branding footer */}
        <div className="relative z-10 mt-6 pt-4 border-t border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-white/20 flex items-center justify-center text-[8px] font-bold text-white">S</div>
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Sinemood</span>
          </div>
          <span className="text-[9px] text-white/25">sinemood.app</span>
        </div>
      </div>

      {/* ── Share Actions ── */}
      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={handleShareImage}
            disabled={sharing}
            className="flex items-center gap-2 px-5 py-2.5 bg-white/10 hover:bg-white/15 border border-white/10 hover:border-white/20 rounded-full text-[10px] font-bold uppercase tracking-[0.2em] text-ivory/70 hover:text-ivory transition-all disabled:opacity-50"
          >
            <Share2 size={13} />
            {sharing ? 'Hazırlanıyor...' : 'Görseli Paylaş'}
          </button>
          <button
            onClick={handleDownload}
            disabled={sharing}
            className="flex items-center justify-center w-10 h-10 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-full text-ivory/50 hover:text-ivory transition-all disabled:opacity-50"
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
