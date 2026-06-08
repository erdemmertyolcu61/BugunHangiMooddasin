import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const SPLASH_KEY = 'fc_splash_seen_v6';
const MARK_SRC   = '/sinemod-mark.png';
const MAX_MS     = 8000;
const FADE_MS    = 600;

export default function SplashScreen() {
  const [show, setShow] = useState(() => {
    if (sessionStorage.getItem(SPLASH_KEY)) return false;
    sessionStorage.setItem(SPLASH_KEY, '1');
    return true;
  });

  const videoRef = useRef(null);

  useEffect(() => {
    if (!show) return;
    const onEnd = () => setShow(false);
    const vid = videoRef.current;
    if (vid) {
      vid.addEventListener('ended', onEnd);
      vid.play().catch(() => {});
    }
    const fallback = setTimeout(() => setShow(false), MAX_MS);
    return () => {
      clearTimeout(fallback);
      if (vid) vid.removeEventListener('ended', onEnd);
    };
  }, [show]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="splash-video"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.02 }}
          transition={{ duration: FADE_MS / 1000, ease: [0.25, 1, 0.5, 1] }}
          className="fixed inset-0 z-[9999]"
          style={{ backgroundColor: '#0a0605' }}
        >
          <style>{`
            .splsh-video {
              position:absolute; inset:0; width:100%; height:100%;
              object-fit:cover;
            }
            .splsh-overlay {
              position:absolute; inset:0;
              background:linear-gradient(180deg,rgba(10,6,5,0.35) 0%,rgba(10,6,5,0.55) 50%,rgba(10,6,5,0.85) 100%);
            }
            .splsh-logo {
              position:absolute; left:50%; top:38%;
              width:min(38vmin,160px);
              transform:translate(-50%,-50%);
              z-index:6;
            }
            @media(min-width:900px){ .splsh-logo{top:40%;width:min(18vmin,180px)} }
            .splsh-mark {
              display:block; width:100%; height:auto;
              filter:drop-shadow(0 0 40px rgba(0,0,0,0.6));
              user-select:none; -webkit-user-select:none;
            }
            .splsh-wordmark {
              position:absolute; left:0; right:0; text-align:center; z-index:7;
              top:calc(38% + min(22vmin,110px));
            }
            @media(min-width:900px){ .splsh-wordmark{top:calc(40% + min(12vmin,130px))} }
            .splsh-name {
              font-family:'Cormorant Garamond',serif; font-weight:600;
              font-size:clamp(22px,5vmin,38px);
              letter-spacing:0.34em; padding-left:0.34em;
              color:#fbe7c0;
              text-shadow:0 2px 24px rgba(0,0,0,0.7);
            }
            .splsh-tag {
              margin-top:10px;
              font-family:'Cormorant Garamond',serif; font-style:italic;
              font-size:clamp(11px,1.5vmin,14px);
              letter-spacing:0.16em;
              color:rgba(251,231,192,0.6);
              text-shadow:0 2px 16px rgba(0,0,0,0.5);
            }
            @media(prefers-reduced-motion:reduce){
              .splsh-video{display:none}
            }
          `}</style>

          <video
            ref={videoRef}
            src="/splash/splash-video.mp4"
            autoPlay
            muted
            playsinline
            preload="auto"
            className="splsh-video"
          />

          <div className="splsh-overlay" />

          <div className="splsh-logo">
            <img className="splsh-mark" src={MARK_SRC} alt="Sinemood" draggable={false} />
          </div>

          <div className="splsh-wordmark">
            <div className="splsh-name">SINEMOOD</div>
            <div className="splsh-tag">bugün hangi mooddasın?</div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
