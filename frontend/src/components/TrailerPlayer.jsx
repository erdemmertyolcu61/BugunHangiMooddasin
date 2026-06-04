import { useEffect } from 'react';
import { Play } from 'lucide-react';
import { suspendMoodAudio, resumeMoodAudio } from '../utils/moodAudioManager';
import LottieAnimation from './LottieAnimation';

/**
 * Fragman facade — afişin/banner'ın yerinde durur.
 * Kullanıcı "Oynat"a basana kadar YouTube'a HİÇBİR istek/çerez gitmez
 * (KVKK uyumu + performans). Tıklayınca youtube-nocookie iframe'i
 * /youtube.html proxy sayfası üzerinden yüklenir (Capacitor iOS Error 153 çözümü).
 *
 * Fragman oynarken mood müziği geçici durdurulur, kapanınca devam eder.
 * Oynatma durumu PARENT tarafından kontrol edilir (tek çarpı: modalın sağ üst
 * butonu oynarken önce fragmanı kapatır, sonraki basışta modalı kapatır).
 *
 * Props:
 *   youtubeKey: TMDB'den gelen YouTube video ID'si (zorunlu — yoksa render edilmez)
 *   posterSrc:  facade arka planı (mevcut banner/poster URL'si)
 *   title:      erişilebilirlik etiketi
 *   playing:    fragman oynuyor mu (parent state)
 *   onStart:    "Oynat"a basıldığında çağrılır
 */
export default function TrailerPlayer({ youtubeKey, posterSrc, title = 'Film', playing = false, onStart }) {
  // Fragman oynarken mood müziğini askıya al; kapanınca/unmount olunca devam ettir.
  useEffect(() => {
    if (!playing) return;
    suspendMoodAudio();
    return () => resumeMoodAudio();
  }, [playing]);

  if (!youtubeKey) return null;

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
      onClick={onStart}
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
      {/* Oynat afiş'i — saydam; klasik ▶ üçgeni + film makarası (lottie) + yazı.
          İki temada da afiş görseli üzerinde okunur (beyaz + gölge). */}
      <span className="absolute inset-0 grid place-items-center bg-black/10 group-hover:bg-black/20 transition-colors">
        <span className="flex items-center gap-2.5 rounded-full bg-black/30 backdrop-blur-md pl-2.5 pr-4 py-2 border border-white/25 shadow-[0_4px_20px_rgba(0,0,0,0.45)] group-hover:bg-black/40 group-hover:scale-105 transition-all">
          {/* Klasik başlat üçgeni — daire içinde */}
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
