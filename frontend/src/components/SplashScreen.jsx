import { useEffect, useState, useRef } from 'react';
import '../styles/SplashScreen.css';
const sinemoodLogo = '/sinemod-mark.png';

const CSS_FADE_MS = 550;

function dismissHtmlSplash() {
  const el = document.getElementById('sinemood-splash');
  if (!el) return;

  // CSS fade-out class'ını ekle (#sinemood-splash splash-exit)
  el.classList.add('splash-exit');

  // Fade tamamlanınca DOM'dan kaldır + stil sayfasını temizle
  setTimeout(() => {
    el.remove();
    const style = document.getElementById('sinemood-splash-styles');
    if (style) style.remove();
  }, CSS_FADE_MS);
}

const SplashScreen = ({ onFinish }) => {
  const [isVisible, setIsVisible] = useState(true);
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    // HTML splash'ı yumuşakça kaldır (CSS fade-out + DOM cleanup)
    dismissHtmlSplash();

    // CSS animation (3.5s delay + 0.5s fade) ile senkron
    const timer = setTimeout(() => {
      setIsVisible(false);
      onFinish?.();
    }, 3500);

    return () => clearTimeout(timer);
  }, []); // Boş array — timer asla resetlenmez, onFinish referansından etkilenmez

  if (!isVisible) return null;

  const renderParticles = () =>
    Array.from({ length: 20 }).map((_, i) => (
      <div
        key={i}
        className="particle"
        style={{
          left: `${Math.random() * 100}%`,
          width: `${Math.random() * 2 + 1}px`,
          height: `${Math.random() * 2 + 1}px`,
          animationDelay: `${Math.random() * 6}s`,
          animationDuration: `${Math.random() * 5 + 5}s`,
        }}
      />
    ));

  return (
    <div className="splash-screen">
      <div className="liquid-wave-container">
        <div className="liquid-wave" />
      </div>
      {renderParticles()}
      <div className="splash-logo-wrapper">
        <img src={sinemoodLogo} alt="Sinemood" className="splash-logo" />
      </div>
      <div className="splash-text-wrapper">
        <h1 className="splash-title">SINEMOOD</h1>
        <p className="splash-subtitle">Premium Film Deneyimi</p>
      </div>
    </div>
  );
};

export default SplashScreen;
