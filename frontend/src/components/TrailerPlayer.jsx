import { useEffect, useState, useCallback, useRef } from 'react';
import { Play, ExternalLink, RefreshCw } from 'lucide-react';
import { suspendMoodAudio, resumeMoodAudio } from '../utils/moodAudioManager';
import LottieAnimation from './LottieAnimation';

function isPWA() {
  return typeof window !== 'undefined' && (
    window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone
  );
}

export default function TrailerPlayer({ youtubeKey, posterSrc, title = 'Film', playing = false, onStart, onLoad, onError }) {
  const iframeRef = useRef(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [iframeFailed, setIframeFailed] = useState(false);
  const isMobilePWA = useRef(isPWA());

  useEffect(() => {
    if (!playing) return;
    suspendMoodAudio();
    return () => resumeMoodAudio();
  }, [playing]);

  useEffect(() => {
    if (!playing) {
      setIframeLoaded(false);
      setIframeFailed(false);
    }
  }, [playing]);

  const handleIframeLoad = useCallback(() => {
    setIframeLoaded(true);
    setIframeFailed(false);
    onLoad?.();
  }, [onLoad]);

  const handleIframeError = useCallback(() => {
    setIframeFailed(true);
    setIframeLoaded(false);
    onError?.();
  }, [onError]);

  const openInYouTube = useCallback(() => {
    window.open(`https://www.youtube.com/watch?v=${encodeURIComponent(youtubeKey)}`, '_blank');
  }, [youtubeKey]);

  if (!youtubeKey) return null;

  // ── PWA: iframe'i dene, başarısız olursa YouTube'da aç ──
  if (playing) {
    return (
      <div className="absolute inset-0 w-full h-full bg-black">
        {posterSrc && (
          <img src={posterSrc} alt=""
            className="absolute inset-0 w-full h-full object-cover object-[center_20%] pointer-events-none"
          />
        )}

        {/* Loading spinner — iframe yüklenene kadar */}
        {!iframeLoaded && !iframeFailed && (
          <div className="absolute inset-0 grid place-items-center z-10">
            <span className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          </div>
        )}

        {/* iframe — PWA'da da dene, başarısız olursa fallback göster */}
        <iframe
          ref={iframeRef}
          src={`/youtube.html?v=${encodeURIComponent(youtubeKey)}`}
          title={`${title} | Fragman`}
          className={`absolute inset-0 w-full h-full border-0 z-[5] ${iframeLoaded ? '' : 'opacity-0'}`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={handleIframeLoad}
          onError={handleIframeError}
        />

        {/* Hata durumu — poster üzerinde hata mesajı + art alan */}
        {iframeFailed && (
          <div className="absolute inset-0 grid place-items-center z-10 bg-black/60 backdrop-blur-sm">
            <div className="text-center space-y-3 px-6">
              <p className="text-sm text-rose/70 font-medium">Fragman yüklenemedi</p>
              <div className="flex gap-2.5 justify-center">
                <button onClick={() => { setIframeFailed(false); setIframeLoaded(false); iframeRef.current?.src && (iframeRef.current.src = iframeRef.current.src); }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white/10 border border-white/15 text-xs font-bold uppercase tracking-wider text-white/70 hover:bg-white/15 hover:text-white transition-all"
                >
                  <RefreshCw size={12} /> Tekrar Dene
                </button>
                <button onClick={openInYouTube}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-rose/15 border border-rose/30 text-xs font-bold uppercase tracking-wider text-rose/70 hover:bg-rose/20 hover:text-rose transition-all"
                >
                  <ExternalLink size={12} /> YouTube'da Aç
                </button>
              </div>
            </div>
          </div>
        )}

        {/* iframe yüklenene kadar poster üzerinde karartma (close button okunurluğu) */}
        {!iframeLoaded && !iframeFailed && (
          <div className="absolute inset-x-0 top-0 h-24 z-[6] pointer-events-none"
            style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, transparent 100%)' }}
          />
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onStart}
      aria-label={`${title} fragmanını oynat`}
      className="group absolute inset-0 w-full h-full focus:outline-none"
    >
      {posterSrc && (
        <img src={posterSrc} alt={title}
          className="w-full h-full object-cover object-[center_20%]"
          loading="eager"
        />
      )}
      <span className="absolute inset-0 grid place-items-center bg-black/10 group-hover:bg-black/20 transition-colors">
        <span className="flex items-center gap-2.5 rounded-full bg-black/30 backdrop-blur-md pl-2.5 pr-4 py-2 border border-white/25 shadow-[0_4px_20px_rgba(0,0,0,0.45)] group-hover:bg-black/40 group-hover:scale-105 transition-all">
          <span className="relative grid place-items-center w-9 h-9 rounded-full bg-white/15 border border-white/30 shrink-0">
            <Play size={16} className="text-white fill-white translate-x-[1px]" />
            <LottieAnimation
              path="/lottie/film-reel.json"
              className="absolute inset-0 w-full h-full opacity-30 pointer-events-none"
              speed={1}
            />
          </span>
          <span className="text-sm font-semibold tracking-wide text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
            Fragmanı Oynat
          </span>
        </span>
      </span>
    </button>
  );
}
