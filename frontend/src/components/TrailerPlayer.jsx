import { useState } from 'react';
import { Play } from 'lucide-react';

/**
 * Fragman facade — afişin/banner'ın yerinde durur.
 * Kullanıcı "Oynat"a basana kadar YouTube'a HİÇBİR istek/çerez gitmez
 * (KVKK uyumu + performans). Tıklayınca youtube-nocookie iframe'i
 * /youtube.html proxy sayfası üzerinden yüklenir (Capacitor iOS Error 153 çözümü).
 *
 * Props:
 *   youtubeKey: TMDB'den gelen YouTube video ID'si (zorunlu — yoksa render edilmez)
 *   posterSrc:  facade arka planı (mevcut banner/poster URL'si)
 *   title:      erişilebilirlik etiketi
 */
export default function TrailerPlayer({ youtubeKey, posterSrc, title = 'Film', onPlayingChange }) {
  const [playing, setPlaying] = useState(false);

  if (!youtubeKey) return null;

  const startPlaying = () => {
    setPlaying(true);
    if (onPlayingChange) onPlayingChange(true);
  };

  if (playing) {
    return (
      <iframe
        src={`/youtube.html?v=${encodeURIComponent(youtubeKey)}`}
        title={`${title} — Fragman`}
        className="absolute inset-0 w-full h-full border-0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={startPlaying}
      aria-label={`${title} fragmanını oynat`}
      className="group absolute inset-0 w-full h-full focus:outline-none"
    >
      {posterSrc && (
        <img
          src={posterSrc}
          alt={title}
          className="w-full h-full object-cover object-[center_20%]"
          loading="eager"
        />
      )}
      {/* Oynat butonu — ortada, hafif koyulaştırma ile */}
      <span className="absolute inset-0 grid place-items-center bg-black/20 group-hover:bg-black/30 transition-colors">
        <span className="flex items-center gap-2.5 rounded-full bg-black/65 backdrop-blur-md px-5 py-3 border border-white/15 group-hover:scale-105 transition-transform">
          <Play size={20} className="text-amber fill-amber" />
          <span className="text-sm font-semibold tracking-wide text-ivory">Fragmanı Oynat</span>
        </span>
      </span>
    </button>
  );
}
